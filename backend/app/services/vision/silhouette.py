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

from .pose import LEFT_HIP, LEFT_SHOULDER, PoseResult, RIGHT_HIP, RIGHT_SHOULDER

logger = logging.getLogger(__name__)

_predictor = None
_load_attempted = False


@dataclass(frozen=True)
class SilhouetteWidths:
    """Largeurs (photo de face) ou profondeurs (photo de profil), en pixels."""

    chest_px: float
    waist_px: float
    hip_px: float


def is_available() -> bool:
    if not settings.sam_checkpoint_path:
        return False
    if not Path(settings.sam_checkpoint_path).exists():
        return False
    try:
        import torch  # noqa: F401
        import cv2  # noqa: F401
        from segment_anything import SamPredictor  # noqa: F401
    except ImportError:
        return False
    return True


def unavailable_reason() -> str | None:
    if not settings.sam_checkpoint_path:
        return "SAM_CHECKPOINT_PATH non renseigné"
    if not Path(settings.sam_checkpoint_path).exists():
        return f"checkpoint introuvable: {settings.sam_checkpoint_path}"
    missing = []
    for module, package in (("torch", "torch"), ("cv2", "opencv-python-headless"),
                            ("segment_anything", "segment-anything")):
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    return f"paquets absents: {', '.join(missing)}" if missing else None


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
        from segment_anything import SamPredictor, sam_model_registry

        device = "cuda" if torch.cuda.is_available() else "cpu"
        sam = sam_model_registry[settings.sam_model_type](checkpoint=settings.sam_checkpoint_path)
        sam.to(device)
        _predictor = SamPredictor(sam)
        logger.info("SAM chargé (%s, %s)", settings.sam_model_type, device)
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


def _row_width_px(mask, y: int) -> float:
    """Largeur du masque sur une ligne horizontale, en pixels."""
    import numpy as np

    y = int(max(0, min(mask.shape[0] - 1, y)))
    row = np.where(mask[y])[0]
    if row.size == 0:
        return 0.0
    return float(row.max() - row.min())


def measure_widths(image_path: str | Path, pose: PoseResult) -> SilhouetteWidths | None:
    """
    Mesure la largeur du corps à trois hauteurs anatomiques.

    Sur une photo de face ce sont des largeurs, sur une photo de profil des
    profondeurs — la géométrie est identique, seule l'orientation change.
    """
    mask = _body_mask(image_path, pose)
    if mask is None:
        return None

    shoulder_y = pose.midpoint(LEFT_SHOULDER, RIGHT_SHOULDER)[1]
    hip_y = pose.midpoint(LEFT_HIP, RIGHT_HIP)[1]
    torso = hip_y - shoulder_y
    if torso <= 0:
        return None

    # Hauteurs exprimées en fraction du torse : robuste au cadrage et à la taille
    # du sujet dans l'image.
    chest_y = shoulder_y + 0.22 * torso   # ligne de poitrine
    waist_y = shoulder_y + 0.62 * torso   # ligne de taille naturelle
    hip_row_y = hip_y                      # ligne de hanches

    widths = SilhouetteWidths(
        chest_px=_row_width_px(mask, chest_y),
        waist_px=_row_width_px(mask, waist_y),
        hip_px=_row_width_px(mask, hip_row_y),
    )
    if min(widths.chest_px, widths.waist_px, widths.hip_px) <= 0:
        logger.info("Masque incomplet — largeurs inexploitables")
        return None
    return widths
