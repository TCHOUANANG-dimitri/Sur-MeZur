"""
Orchestrateur de la chaîne de mesure par vision.

    photos + (taille, poids, sexe)
        -> MediaPipe : 33 points
        -> échelle pixel/cm ancrée sur la taille saisie
        -> SAM : largeurs et profondeurs de silhouette
        -> 12 variables -> modèle du sexe correspondant -> 8 tours
        -> + 4 mesures géométriques
        = 12 mesures livrées

Chaque étape peut échouer sans casser la chaîne : `run()` renvoie None et
l'appelant retombe sur l'estimation heuristique. C'est délibéré — le service de
mesure ne doit jamais empêcher un client de poursuivre sa commande.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import settings
from app.services import measurement_model

from . import pose as pose_mod
from . import silhouette as silhouette_mod
from .features import build_geometric_measurements, build_model_features
from .scale import estimate_scale

logger = logging.getLogger(__name__)


@dataclass
class VisionResult:
    """Mesures produites et traçabilité de la façon dont elles l'ont été."""

    data: dict[str, float]
    confidence: dict[str, float]
    source: str                       # "vision_sam" | "vision_pose"
    features: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


# Confiance indicative par origine de la mesure.
CONFIDENCE_PREDICTED_SAM = 0.88
CONFIDENCE_PREDICTED_POSE = 0.74
CONFIDENCE_GEOMETRIC = 0.82


_warm_up_lock = threading.Lock()
_warm_up_started = False


def warm_up() -> None:
    """
    Paie le coût d'initialisation de MediaPipe/SAM.

    Sans cela, le premier client à mesurer ses mensurations après chaque
    redémarrage paie ce coût lui-même — mesuré entre 10 et plus de 90 s selon
    la charge, contre ~2 s en régime établi. Le budget d'attente du mobile ne
    peut pas absorber cet écart, donc ce premier client voit systématiquement
    "Échec de l'analyse" alors que le calcul aboutit quelques instants plus
    tard, en arrière-plan.

    Ne doit jamais bloquer ni faire échouer l'appelant : passer par
    `warm_up_async()` plutôt que d'appeler cette fonction directement depuis
    une route.
    """
    if not settings.vision_enabled:
        return
    try:
        ok_pose = pose_mod.warm_up()
        ok_sam = silhouette_mod.warm_up()
        logger.info("Préchauffage vision terminé (mediapipe=%s, sam=%s)", ok_pose, ok_sam)
    except Exception:
        logger.exception("Préchauffage vision en échec (non bloquant)")


def warm_up_async() -> None:
    """
    Déclenche le préchauffage en tâche de fond, au plus une fois par processus.

    Appelé à la connexion d'un utilisateur plutôt qu'au démarrage du serveur :
    charger MediaPipe et SAM (~40 Mo de poids) pendant le boot entre en
    concurrence avec l'ouverture du port, ce qui sur un hébergement contraint
    retarde les toutes premières réponses — au point de dépasser le budget
    d'attente du mobile. Déclenché à la connexion, le chargement se fait
    pendant que l'utilisateur navigue, bien avant qu'il n'atteigne l'écran de
    prise de mesure.

    Le verrou est indispensable : sans lui, plusieurs connexions simultanées
    lanceraient chacune un chargement complet des modèles en parallèle, ce qui
    saturerait la mémoire d'un petit hébergement.
    """
    global _warm_up_started
    if not settings.vision_enabled:
        return
    with _warm_up_lock:
        if _warm_up_started:
            return
        _warm_up_started = True
    threading.Thread(target=warm_up, daemon=True, name="vision-warmup").start()


def capabilities() -> dict[str, object]:
    """État de la chaîne, pour un endpoint de diagnostic."""
    return {
        "vision_enabled": settings.vision_enabled,
        "mediapipe": {
            "available": pose_mod.is_available(),
            "reason": pose_mod.unavailable_reason(),
        },
        "sam": {
            "available": silhouette_mod.is_available(),
            "reason": silhouette_mod.unavailable_reason(),
        },
        "models": measurement_model.available_models(),
    }


def analyze_debug(
    front_photo: str | Path | None,
    side_photo: str | Path | None,
    height_cm: float,
    weight_kg: float,
    gender: str,
) -> dict:
    """
    Exécute la chaîne en exposant **chaque étape intermédiaire**.

    Contrairement à `run()`, ne renonce jamais : chaque étape ratée est
    signalée dans la réponse. C'est l'outil qui permet de confronter les
    estimations MediaPipe à de vraies mensurations et d'en déduire le bruit
    réel — la donnée qui manque pour calibrer l'augmentation à l'entraînement.
    """
    out: dict = {
        "capabilities": capabilities(),
        "input": {"height_cm": height_cm, "weight_kg": weight_kg, "gender": gender},
        "steps": {},
    }

    if not front_photo:
        out["steps"]["pose_front"] = {"ok": False, "reason": "photo de face illisible ou absente"}
        return out

    # 1. Points de repère
    pose_front = pose_mod.extract_pose(front_photo, settings.pose_min_detection_confidence)
    if pose_front is None:
        out["steps"]["pose_front"] = {
            "ok": False,
            "reason": "aucune pose détectée" if pose_mod.is_available() else pose_mod.unavailable_reason(),
        }
        return out

    out["steps"]["pose_front"] = {
        "ok": True,
        "image_size": [pose_front.image_width, pose_front.image_height],
        "landmarks": [
            {"i": i, "x": round(lm.x, 1), "y": round(lm.y, 1),
             "z": round(lm.z, 1), "visibility": round(lm.visibility, 3)}
            for i, lm in enumerate(pose_front.landmarks)
        ],
        "low_visibility": [
            i for i, lm in enumerate(pose_front.landmarks)
            if lm.visibility < settings.pose_min_visibility
        ],
    }

    # 2. Échelle
    cm_per_pixel = estimate_scale(pose_front, height_cm)
    out["steps"]["scale"] = (
        {"ok": True, "cm_per_pixel": round(cm_per_pixel, 4)}
        if cm_per_pixel
        else {"ok": False, "reason": "échelle hors bornes ou pieds non visibles"}
    )
    if cm_per_pixel is None:
        return out

    # 3. Silhouette
    front_widths = silhouette_mod.measure_widths(front_photo, pose_front, orientation="front")
    side_widths = None
    pose_side = pose_mod.extract_pose(side_photo, settings.pose_min_detection_confidence) if side_photo else None
    if pose_side is not None:
        side_widths = silhouette_mod.measure_widths(side_photo, pose_side, orientation="side")
    out["steps"]["silhouette"] = {
        "ok": front_widths is not None or side_widths is not None,
        "reason": silhouette_mod.unavailable_reason(),
        "front_px": vars(front_widths) if front_widths else None,
        "side_px": vars(side_widths) if side_widths else None,
        "side_pose_detected": pose_side is not None,
    }

    # 4. Variables du modèle
    features = build_model_features(
        pose_front=pose_front, cm_per_pixel=cm_per_pixel, height_cm=height_cm,
        weight_kg=weight_kg, front_widths=front_widths, side_widths=side_widths,
    )
    out["steps"]["features"] = {"ok": features is not None, "values_cm": features}
    if features is None:
        return out

    # 5. Prédiction
    circumferences = measurement_model.predict_circumferences(gender, features)
    out["steps"]["prediction"] = {
        "ok": circumferences is not None,
        "reason": None if circumferences else "modèle absent ou entrée hors bornes",
        "circumferences_cm": circumferences,
        "model": measurement_model.model_info(gender),
    }

    # 6. Géométrie
    out["steps"]["geometric"] = {"ok": True, "values_cm": build_geometric_measurements(pose_front, cm_per_pixel)}

    if circumferences:
        out["final"] = {
            **circumferences,
            **out["steps"]["geometric"]["values_cm"],
            "height_total": round(height_cm, 1),
        }
    return out


def run(
    front_photo: str | Path,
    side_photo: str | Path | None,
    height_cm: float,
    weight_kg: float,
    gender: str,
) -> VisionResult | None:
    """Exécute la chaîne complète. None si une étape indispensable échoue."""
    if not settings.vision_enabled:
        return None

    notes: list[str] = []

    # 1. Points de repère sur la photo de face — étape indispensable.
    pose_front = pose_mod.extract_pose(front_photo, settings.pose_min_detection_confidence)
    if pose_front is None:
        logger.info("Pose non détectée sur la photo de face — repli heuristique")
        return None

    # 2. Échelle pixel -> cm, ancrée sur la taille saisie.
    cm_per_pixel = estimate_scale(pose_front, height_cm)
    if cm_per_pixel is None:
        logger.info("Échelle non calculable — repli heuristique")
        return None

    # 3. Silhouette (optionnelle) : c'est elle qui fait la précision V2.
    #
    # Les deux photos sont envoyées à SAM (MobileSAM, léger : ce calcul
    # coûtait ~35-40 s de trop par image avec le SAM classique, d'où le choix
    # précédent de sauter la photo de profil — n'a plus lieu d'être ici).
    #
    # ATTENTION : `side_widths` est calculé mais `build_model_features`
    # (features.py) l'ignore TOUJOURS pour les profondeurs, quel que soit le
    # backend SAM utilisé. La raison n'a rien à voir avec la vitesse : sur la
    # photo de profil, un bras qui pend naturellement le long du corps couvre
    # la même plage verticale que la poitrine, la taille et les hanches — la
    # bande qu'on efface pour retirer le bras du masque mange alors une
    # bonne part de ce qu'il y a à mesurer, quel que soit le modèle qui a
    # produit ce masque. Passer à MobileSAM règle la latence, pas ce
    # problème-là. Voir §3.9 du rapport de projet.
    front_widths = silhouette_mod.measure_widths(front_photo, pose_front, orientation="front")
    side_widths = None
    if side_photo:
        pose_side = pose_mod.extract_pose(side_photo, settings.pose_min_detection_confidence)
        if pose_side is not None:
            side_widths = silhouette_mod.measure_widths(side_photo, pose_side, orientation="side")
        else:
            notes.append("pose non détectée sur la photo de profil")

    used_sam = front_widths is not None or side_widths is not None
    if not used_sam:
        notes.append("silhouette indisponible : largeurs estimées depuis le squelette")

    # 4. Variables du modèle.
    features = build_model_features(
        pose_front=pose_front,
        cm_per_pixel=cm_per_pixel,
        height_cm=height_cm,
        weight_kg=weight_kg,
        front_widths=front_widths,
        side_widths=side_widths,
    )
    if features is None:
        return None

    # Trace des variables réellement envoyées au modèle : c'est ce qu'il faut
    # confronter à un mètre ruban pour estimer le bruit réel de la chaîne.
    logger.info(
        "Échelle %.4f cm/px | variables: %s",
        cm_per_pixel,
        ", ".join(f"{k}={v}" for k, v in features.items()),
    )

    # 5. Prédiction des 8 tours.
    circumferences = measurement_model.predict_circumferences(gender, features)
    if circumferences is None:
        logger.info("Modèle indisponible ou entrée rejetée — repli heuristique")
        return None

    # 6. Les 4 longueurs géométriques.
    geometric = build_geometric_measurements(pose_front, cm_per_pixel)

    data: dict[str, float] = {**circumferences, **geometric, "height_total": round(height_cm, 1)}

    base_conf = CONFIDENCE_PREDICTED_SAM if used_sam else CONFIDENCE_PREDICTED_POSE
    confidence = {key: base_conf for key in circumferences}
    confidence.update({key: CONFIDENCE_GEOMETRIC for key in geometric})
    confidence["height_total"] = 1.0  # saisie par le client

    return VisionResult(
        data=data,
        confidence=confidence,
        source="vision_sam" if used_sam else "vision_pose",
        features=features,
        notes=notes,
    )
