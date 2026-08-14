"""
Segmentation de la silhouette (SAM) et mesure des largeurs / profondeurs.

MediaPipe donne un squelette : des distances entre articulations, pas la
véritable épaisseur du corps. SAM fournit le masque du corps, dont on mesure la
largeur réelle à une hauteur donnée — c'est ce qui distingue la V2 de la V1.

Deux photos sont nécessaires :
  - de **face**  -> largeurs (poitrine, taille, hanches)
  - de **profil** -> profondeurs (poitrine, taille, fessier)

SAM et torch sont des dépendances optionnelles et lourdes. Sans elles, ou sans
checkpoint configuré, ce module reste inactif et le pipeline se replie sur les
seules entrées squelettiques.

Installation :
    pip install torch torchvision segment-anything opencv-python-headless
    puis renseigner SAM_CHECKPOINT_PATH (ex. sam_vit_b_01ec64.pth)
"""

from __future__ import annotations

import logging
import math
import threading
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings

from .pose import (
    LEFT_ELBOW,
    LEFT_HIP,
    LEFT_SHOULDER,
    LEFT_WRIST,
    PoseResult,
    RIGHT_ELBOW,
    RIGHT_HIP,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
)

logger = logging.getLogger(__name__)

_predictor = None
_load_attempted = False
# Sans lui, deux requêtes arrivant avant la fin du premier chargement lisaient
# toutes deux `_load_attempted = False` et lançaient chacune leur propre
# import/chargement de SAM (plusieurs centaines de Mo) — même mécanisme que
# `_warm_up_lock` dans pipeline.py pour MediaPipe.
_load_lock = threading.Lock()


@dataclass(frozen=True)
class TorsoLevels:
    """Hauteurs des trois lignes de mesure, en fraction du torse.

    0 = ligne des épaules, 1 = ligne des hanches. Peut dépasser 1 : le tour de
    hanches se prend sous les articulations (voir `_HIP_SEARCH`).
    """

    chest: float
    waist: float
    hip: float


@dataclass(frozen=True)
class SilhouetteWidths:
    """Largeurs (photo de face) ou profondeurs (photo de profil), en pixels."""

    chest_px: float
    waist_px: float
    hip_px: float
    # Niveaux réellement employés. Détectés sur la photo de face, puis imposés
    # à la photo de profil : mesurer la profondeur à une autre hauteur que la
    # largeur donnerait une ellipse dont les deux axes ne décrivent pas la même
    # section du corps.
    levels: TorsoLevels | None = None
    # Largeur du torse sur toute sa hauteur, échantillonnée régulièrement entre
    # les épaules et les hanches. Sert au calcul du volume — voir
    # `resolve_clothing_thickness`.
    profile_px: tuple[float, ...] = ()
    torso_px: float = 0.0


def _sam_module_name() -> str:
    """"sam" -> segment_anything (précis, lourd) ; "mobile_sam" -> mobile_sam
    (distillé, même API, ~9x plus léger et rapide sur CPU)."""
    return "mobile_sam" if settings.sam_backend == "mobile_sam" else "segment_anything"


def is_available() -> bool:
    if not settings.sam_checkpoint_path:
        return False
    if not Path(settings.sam_checkpoint_path).exists():
        return False
    try:
        import torch  # noqa: F401
        import cv2  # noqa: F401
        __import__(_sam_module_name())
    except ImportError:
        return False
    return True


def unavailable_reason() -> str | None:
    if not settings.sam_checkpoint_path:
        return "SAM_CHECKPOINT_PATH non renseigné"
    if not Path(settings.sam_checkpoint_path).exists():
        return f"checkpoint introuvable: {settings.sam_checkpoint_path}"
    sam_module = _sam_module_name()
    sam_package = "mobile-sam (pip install git+https://github.com/ChaoningZhang/MobileSAM.git)" if sam_module == "mobile_sam" else "segment-anything"
    missing = []
    for module, package in (("torch", "torch"), ("cv2", "opencv-python-headless"), (sam_module, sam_package)):
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    return f"paquets absents: {', '.join(missing)}" if missing else None


def warm_up() -> bool:
    """Force le chargement des poids SAM (plusieurs centaines de Mo) au
    démarrage plutôt que sur la première requête d'un client."""
    return _get_predictor() is not None


def _get_predictor():
    """Charge SAM une seule fois : l'initialisation coûte plusieurs secondes."""
    global _predictor, _load_attempted
    if _load_attempted:
        return _predictor

    with _load_lock:
        # Revérifié sous verrou : une requête qui attendait pendant qu'une
        # autre chargeait ne doit pas relancer le chargement à son tour.
        if _load_attempted:
            return _predictor
        _load_attempted = True

        if not is_available():
            logger.info("SAM indisponible (%s)", unavailable_reason())
            return None

        try:
            import torch

            is_mobile = settings.sam_backend == "mobile_sam"
            if is_mobile:
                from mobile_sam import SamPredictor, sam_model_registry
                model_type = "vit_t"  # seule architecture fournie par MobileSAM
            else:
                from segment_anything import SamPredictor, sam_model_registry
                model_type = settings.sam_model_type

            device = "cuda" if torch.cuda.is_available() else "cpu"
            sam = sam_model_registry[model_type](checkpoint=settings.sam_checkpoint_path)
            sam.to(device)
            sam.eval()
            _predictor = SamPredictor(sam)
            logger.info("SAM chargé (%s, backend=%s, %s)", model_type, settings.sam_backend, device)
        except Exception:
            logger.exception("Échec du chargement de SAM — repli sur le squelette seul")
            _predictor = None

        return _predictor


def _body_mask(image_path: str | Path, pose: PoseResult):
    """Masque binaire du corps, guidé par les points du torse."""
    predictor = _get_predictor()
    if predictor is None:
        return None

    import cv2
    import numpy as np

    image = cv2.imread(str(image_path))
    if image is None:
        return None
    predictor.set_image(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

    # Amorces positives au centre du tronc : SAM segmente alors la personne
    # entière plutôt qu'un vêtement ou un membre isolé.
    shoulder_mid = pose.midpoint(LEFT_SHOULDER, RIGHT_SHOULDER)
    hip_mid = pose.midpoint(LEFT_HIP, RIGHT_HIP)
    chest_mid = ((shoulder_mid[0] + hip_mid[0]) / 2, (shoulder_mid[1] + hip_mid[1]) / 2)

    points = np.array([shoulder_mid, chest_mid, hip_mid], dtype=np.float32)
    labels = np.ones(len(points), dtype=np.int32)

    masks, scores, _ = predictor.predict(
        point_coords=points, point_labels=labels, multimask_output=True
    )
    return masks[int(np.argmax(scores))]


# Rayon d'exclusion des bras, en fraction de la largeur d'épaules mesurée sur
# CETTE photo. Deux valeurs distinctes, pas une seule :
#
#   - face   : on mesure une LARGEUR (gauche-droite). Le torse fait 35-40 cm à
#     cet endroit ; une bande de ~18 % de la largeur d'épaules suffit à retirer
#     le bras sans entamer le torse. Validé : chestbreadth passe de 58,9 cm
#     (bras inclus) à 28,8 cm (ANSUR : 28,9 cm).
#
#   - profil : on mesure une PROFONDEUR (avant-arrière), intrinsèquement bien
#     plus fine (~20-25 cm). Le bras y pend collé au torse ; réutiliser la
#     bande "face" mangeait une part disproportionnée du peu de silhouette
#     utile, sous-estimant les profondeurs de 32 à 48 %. Une bande nettement
#     plus fine est nécessaire pour ce cas précis.
_ARM_EXCLUSION_RATIO = {"front": 0.18, "side": 0.07}


def _mask_without_arms(mask, pose: PoseResult, orientation: str):
    """
    Efface du masque une bande autour de chaque bras (épaule→coude→poignet).

    Les bras sont **rattachés** au torse dans le masque : contrairement à un
    accessoire posé à côté, il n'y a pas de coupure entre bras et torse à
    effacer après coup — le simple fait de rester dans le segment contigu du
    centre du corps ne les exclut donc pas. Il faut les retirer du masque
    avant toute mesure, sans quoi des bras légèrement écartés (nos propres
    consignes de prise de vue, pour que MediaPipe voie bien coudes et
    poignets) faussent la silhouette.

    `orientation` sélectionne l'épaisseur de la bande — voir
    `_ARM_EXCLUSION_RATIO` : la largeur (face) et la profondeur (profil) ne
    tolèrent pas le même rayon.

    Un bras dont le coude ET le poignet sont sous le seuil de visibilité est
    laissé intact : de profil, le bras opposé est caché derrière le corps et
    MediaPipe lui invente des coordonnées (visibilité 0,00-0,01) qui descendent
    le long du torse. Tracer la bande dessus effaçait le torse lui-même, en
    plein sur les lignes de poitrine et de taille — mesuré sur photo réelle :
    profondeurs de poitrine et de taille identiques au pixel près (71 px),
    anatomiquement impossible. On ne masque pas ce qu'on n'a pas vu.
    """
    import cv2

    shoulder_width = pose.distance(LEFT_SHOULDER, RIGHT_SHOULDER)
    ratio = _ARM_EXCLUSION_RATIO.get(orientation, _ARM_EXCLUSION_RATIO["front"])
    radius = max(4, int(round(shoulder_width * ratio)))
    min_visibility = settings.pose_min_visibility

    out = mask.astype("uint8")
    for shoulder, elbow, wrist in (
        (LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST),
        (RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST),
    ):
        p1, p2, p3 = pose.point(shoulder), pose.point(elbow), pose.point(wrist)
        # L'épaule reste fiable même de profil : c'est le reste du bras qui
        # est deviné. Sans coude ni poignet crédibles, le tracé n'a plus de
        # support réel.
        if p2.visibility < min_visibility and p3.visibility < min_visibility:
            logger.debug(
                "Bras ignoré (non visible) : coude=%.2f poignet=%.2f",
                p2.visibility, p3.visibility,
            )
            continue
        segments = [(p1, p2)] if p3.visibility < min_visibility else [(p1, p2), (p2, p3)]
        for a, b in segments:
            cv2.line(out, (int(a.x), int(a.y)), (int(b.x), int(b.y)), 0, thickness=radius * 2)
    return out.astype(bool)


def _row_width_px(mask, y: float, center_x: float) -> float:
    """
    Largeur du segment CONTIGU du masque contenant `center_x`, sur la ligne y.

    Nos consignes de prise de vue demandent des bras légèrement écartés (pour
    que MediaPipe voie bien coudes et poignets). Un simple min/max des pixels
    blancs de la ligne inclurait alors les bras comme s'ils faisaient partie
    du torse : mesuré en conditions réelles, cela gonflait `chestbreadth` de
    28,9 cm (ANSUR) à 58,5 cm — rejeté par la garde de plausibilité. On se
    limite donc au segment continu qui contient le centre du corps.
    """
    import numpy as np

    y_i = int(max(0, min(mask.shape[0] - 1, round(y))))
    row = mask[y_i]
    cx = int(max(0, min(row.shape[0] - 1, round(center_x))))

    if not row[cx]:
        # Le centre exact n'est pas dans le masque (vêtement sombre, bord) :
        # on part du pixel blanc le plus proche horizontalement.
        idx = np.where(row)[0]
        if idx.size == 0:
            return 0.0
        cx = int(idx[np.argmin(np.abs(idx - cx))])

    left = cx
    while left > 0 and row[left - 1]:
        left -= 1
    right = cx
    while right < row.shape[0] - 1 and row[right + 1]:
        right += 1
    return float(right - left)


# Bande sur laquelle la poitrine est cherchée, en fraction du torse
# (0 = ligne d'épaules, 1 = ligne de hanches).
#
# Une ligne unique à 0,22 tombait en pleine aisselle, là où le deltoïde et le
# haut du bras se rattachent au thorax : le segment contigu mesuré englobait
# les épaules. Mesuré sur 13 sujets, la largeur de poitrine sortait alors
# jusqu'à 64 cm pour 32 attendus, et 4 sujets sur 13 étaient rejetés par la
# garde de plausibilité.
#
# On cherche désormais le minimum sur une bande située sous l'aisselle. Le
# minimum, plutôt qu'une ligne fixe, trouve naturellement le creux du thorax
# et encaisse un pli de vêtement ou un artefact ponctuel du masque.
# Résultats sur les mêmes 13 sujets : largeur de poitrine ramenée à 31,1 cm
# pour le pire cas, et 12 sujets sur 13 aboutissent.
_CHEST_BAND = (0.20, 0.38)
_CHEST_BAND_STEPS = 10

# --- Recherche anatomique de la taille et des hanches ------------------------
# Les hauteurs étaient fixées à 0,62 et 0,90 du torse. Un ratio fixe suppose
# que la taille et les fessiers tombent au même endroit chez tout le monde, ce
# que les 13 sujets démentent : le plus étroit du tronc est trouvé entre 0,45
# et 0,76, le plus fort des fessiers entre 0,93 et 1,25.
#
# On cherche donc les extrémums de largeur, comme un tailleur cherche le creux
# de la taille et la saillie des fessiers plutôt que de mesurer à hauteur fixe.
#
# Mesuré sur les 13 sujets : la détection SEULE ne rapporte presque rien
# (7,92 -> 7,91 cm), parce qu'un vêtement ample comble le creux de la taille et
# noie les repères. Combinée au retrait de l'épaisseur de vêtement, elle porte
# l'erreur du tronc de 5,38 à 4,87 cm et le nombre de mesures sous 3 cm de
# 17 à 20 sur 39. Les deux corrections ne valent que prises ensemble.
_WAIST_SEARCH = (0.45, 0.80)
_HIP_SEARCH = (0.85, 1.25)
_SEARCH_STEPS = 24

# Sous l'entrejambe, le masque se scinde en deux jambes : `_row_width_px` ne
# retient qu'un segment contigu, donc une seule jambe, dont la largeur est
# faible. La recherche du maximum ne peut donc pas dériver dans les cuisses —
# elle est bornée par l'anatomie, pas seulement par `_HIP_SEARCH`.

# Nombre de tranches horizontales du profil vertical du torse.
_PROFILE_STEPS = 50


# --- Retrait de l'épaisseur de vêtement --------------------------------------
# La silhouette segmentée est celle du corps HABILLÉ. Sur un périmètre, une
# épaisseur e de tissu ajoute environ 2*pi*e : 1,5 cm de pull font 9 cm de tour
# de taille. Mesuré sur les 13 sujets, la chaîne surestime le tronc de +6,67 cm
# en moyenne (poitrine +9,74, taille +7,36, hanches +2,91).
#
# Le poids saisi donne le volume réel du corps. On cherche donc l'épaisseur qui
# réconcilie le volume apparent de la silhouette avec ce volume réel : une
# inconnue, une contrainte, système déterminé. Rien n'est appris sur une
# population — e est résolu individuellement pour chaque sujet, à partir de son
# propre poids et de sa propre silhouette.
#
# C'est ce qui distingue cette correction d'un décalage calibré : le jour où la
# capture guidée imposera une tenue ajustée, elle trouvera e proche de zéro
# d'elle-même, là où un décalage appris sur des photos en vêtements libres
# resterait faux dans le mauvais sens.
#
# Mesuré : erreur du tronc 8,60 -> 6,18 cm à lignes fixes, 4,87 cm combiné à la
# détection anatomique. Épaisseurs résolues de -0,79 à +2,58 cm.
_BODY_DENSITY_KG_PER_L = 1.01
# Part du volume corporel attribuée au tronc (épaules -> hanches). Seule
# hypothèse de population de cette correction ; la régler par sexe a été testé
# et ne rapporte rien (5,08 contre 4,87 cm).
_TRUNK_VOLUME_FRACTION = 0.50
_THICKNESS_BOUNDS_CM = (-4.0, 8.0)


def resolve_clothing_thickness(
    front: SilhouetteWidths,
    side: SilhouetteWidths,
    front_cm_per_pixel: float,
    side_cm_per_pixel: float,
    weight_kg: float,
) -> float | None:
    """
    Épaisseur de vêtement, en cm, résolue par contrainte de volume.

    Renvoie None si l'une des deux silhouettes est trop incomplète pour que le
    volume ait un sens — l'appelant mesure alors sans correction plutôt que
    d'appliquer une épaisseur calculée sur du vide.
    """
    if front_cm_per_pixel <= 0 or side_cm_per_pixel <= 0 or weight_kg <= 0:
        return None
    if not front.profile_px or not side.profile_px or front.torso_px <= 0:
        return None

    slices = [
        (w * front_cm_per_pixel, d * side_cm_per_pixel)
        for w, d in zip(front.profile_px, side.profile_px)
        if w > 0 and d > 0
    ]
    if len(slices) < _PROFILE_STEPS // 2:
        logger.info("Profil du torse trop lacunaire (%d tranches) — pas de correction de vêtement", len(slices))
        return None

    torso_cm = front.torso_px * front_cm_per_pixel
    dh = torso_cm / (_PROFILE_STEPS - 1)

    import numpy as np

    _w = np.array([s[0] for s in slices], dtype=np.float64)
    _d = np.array([s[1] for s in slices], dtype=np.float64)
    _dh = dh

    def volume_litres(thickness: float) -> float:
        """Volume du torse, tranches elliptiques, silhouette rétrécie de e."""
        a = np.maximum(_w - 2.0 * thickness, 1.0) * 0.5
        b = np.maximum(_d - 2.0 * thickness, 1.0) * 0.5
        return float(np.sum(a * b) * math.pi * _dh / 1000.0)

    target = weight_kg / _BODY_DENSITY_KG_PER_L * _TRUNK_VOLUME_FRACTION
    lo, hi = _THICKNESS_BOUNDS_CM
    # Le volume décroît strictement avec l'épaisseur : dichotomie simple.
    # 20 itérations sur les 12 cm de _THICKNESS_BOUNDS_CM donnent déjà une
    # précision de l'ordre du micron, bien au-delà de ce que des mesures
    # quantifiées en pixels peuvent justifier — 60 ne faisait que brûler du
    # CPU pour une précision totalement illusoire.
    for _ in range(20):
        mid = (lo + hi) / 2.0
        if volume_litres(mid) > target:
            lo = mid
        else:
            hi = mid
    thickness = (lo + hi) / 2.0

    logger.info(
        "Épaisseur de vêtement résolue : %.2f cm (volume apparent %.1f L, attendu %.1f L)",
        thickness, volume_litres(0.0), target,
    )
    return thickness


def measure_widths(
    image_path: str | Path,
    pose: PoseResult,
    orientation: str = "front",
    levels: TorsoLevels | None = None,
) -> SilhouetteWidths | None:
    """
    Mesure la largeur du corps à trois hauteurs anatomiques.

    Sur une photo de face ce sont des largeurs, sur une photo de profil des
    profondeurs — la géométrie est identique, seule l'orientation change.
    `orientation` ("front" | "side") détermine l'épaisseur de la bande
    d'exclusion des bras, qui ne peut pas être la même dans les deux cas —
    voir `_ARM_EXCLUSION_RATIO`.

    `levels` impose les hauteurs au lieu de les chercher. L'appelant mesure la
    face d'abord, récupère `levels` du résultat, puis le passe pour le profil :
    largeur et profondeur décrivent alors la même section du corps. Sans cela,
    chaque vue choisirait ses propres extrémums et les deux axes de l'ellipse
    ne se rapporteraient plus au même endroit.
    """
    mask = _body_mask(image_path, pose)
    if mask is None:
        return None
    mask = _mask_without_arms(mask, pose, orientation)

    shoulder_mid = pose.midpoint(LEFT_SHOULDER, RIGHT_SHOULDER)
    hip_mid = pose.midpoint(LEFT_HIP, RIGHT_HIP)
    shoulder_y, hip_y = shoulder_mid[1], hip_mid[1]
    torso = hip_y - shoulder_y
    if torso <= 0:
        return None

    def center_x_at(frac: float) -> float:
        """Le corps n'est pas parfaitement vertical : interpole le centre
        entre épaules et hanches selon la hauteur, pour amorcer la marche de
        pixels au bon endroit même sur une posture légèrement penchée.

        Au-delà du torse (frac > 1), l'axe est prolongé verticalement plutôt
        qu'extrapolé : rien ne garantit que l'inclinaison observée entre
        épaules et hanches se poursuive plus bas.
        """
        t = max(0.0, min(1.0, frac))
        return shoulder_mid[0] + t * (hip_mid[0] - shoulder_mid[0])

    def width_at(frac: float) -> float:
        return _row_width_px(mask, shoulder_y + frac * torso, center_x_at(frac))

    def extremum(bounds: tuple[float, float], want_max: bool) -> tuple[float, float]:
        """Fraction et largeur de l'extrémum de largeur sur l'intervalle."""
        f0, f1 = bounds
        best_frac, best_w = (f0 + f1) / 2, 0.0
        for k in range(_SEARCH_STEPS):
            frac = f0 + (f1 - f0) * k / (_SEARCH_STEPS - 1)
            w = width_at(frac)
            if w <= 0:
                continue
            if best_w <= 0 or (w > best_w if want_max else w < best_w):
                best_frac, best_w = frac, w
        return best_frac, best_w

    if levels is None:
        # Photo de face : on cherche les repères anatomiques.
        chest_frac, chest_px = extremum(_CHEST_BAND, want_max=False)
        waist_frac, waist_px = extremum(_WAIST_SEARCH, want_max=False)
        hip_frac, hip_px = extremum(_HIP_SEARCH, want_max=True)
        used = TorsoLevels(chest=chest_frac, waist=waist_frac, hip=hip_frac)
    else:
        # Photo de profil : on relit aux hauteurs déjà retenues.
        used = levels
        chest_px = width_at(used.chest)
        waist_px = width_at(used.waist)
        hip_px = width_at(used.hip)

    if min(chest_px, waist_px, hip_px) <= 0:
        logger.info("Masque incomplet — largeurs inexploitables")
        return None

    profile = tuple(
        width_at(k / (_PROFILE_STEPS - 1)) for k in range(_PROFILE_STEPS)
    )

    logger.debug(
        "Lignes %s : poitrine %.2f, taille %.2f, hanches %.2f (fractions du torse)",
        orientation, used.chest, used.waist, used.hip,
    )
    return SilhouetteWidths(
        chest_px=chest_px,
        waist_px=waist_px,
        hip_px=hip_px,
        levels=used,
        profile_px=profile,
        torso_px=float(torso),
    )
