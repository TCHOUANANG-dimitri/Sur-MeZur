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


@dataclass(frozen=True)
class SilhouetteWidths:
    """Largeurs (photo de face) ou profondeurs (photo de profil), en pixels."""

    chest_px: float
    waist_px: float
    hip_px: float


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
_CHEST_BAND = (0.26, 0.34)
_CHEST_BAND_STEPS = 5


def measure_widths(
    image_path: str | Path, pose: PoseResult, orientation: str = "front"
) -> SilhouetteWidths | None:
    """
    Mesure la largeur du corps à trois hauteurs anatomiques.

    Sur une photo de face ce sont des largeurs, sur une photo de profil des
    profondeurs — la géométrie est identique, seule l'orientation change.
    `orientation` ("front" | "side") détermine l'épaisseur de la bande
    d'exclusion des bras, qui ne peut pas être la même dans les deux cas —
    voir `_ARM_EXCLUSION_RATIO`.
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

    def center_x_at(y: float) -> float:
        """Le corps n'est pas parfaitement vertical : interpole le centre
        entre épaules et hanches selon la hauteur, pour amorcer la marche de
        pixels au bon endroit même sur une posture légèrement penchée."""
        t = max(0.0, min(1.0, (y - shoulder_y) / torso))
        return shoulder_mid[0] + t * (hip_mid[0] - shoulder_mid[0])

    # Hauteurs exprimées en fraction du torse : robuste au cadrage et à la taille
    # du sujet dans l'image.
    waist_y = shoulder_y + 0.62 * torso   # ligne de taille naturelle
    hip_row_y = hip_y                      # ligne de hanches

    # Poitrine : minimum sur une bande, pas une ligne — voir _CHEST_BAND.
    f0, f1 = _CHEST_BAND
    chest_candidates = []
    for k in range(_CHEST_BAND_STEPS):
        frac = f0 + (f1 - f0) * k / (_CHEST_BAND_STEPS - 1)
        y = shoulder_y + frac * torso
        w = _row_width_px(mask, y, center_x_at(y))
        if w > 0:
            chest_candidates.append(w)

    widths = SilhouetteWidths(
        chest_px=min(chest_candidates) if chest_candidates else 0.0,
        waist_px=_row_width_px(mask, waist_y, center_x_at(waist_y)),
        hip_px=_row_width_px(mask, hip_row_y, center_x_at(hip_row_y)),
    )
    if min(widths.chest_px, widths.waist_px, widths.hip_px) <= 0:
        logger.info("Masque incomplet — largeurs inexploitables")
        return None
    return widths
