"""
Extraction des 33 points de repère corporels via MediaPipe Pose.

MediaPipe est une dépendance optionnelle et lourde : ce module se charge sans
elle et signale simplement son indisponibilité. Le pipeline retombe alors sur
l'estimation heuristique, l'application reste fonctionnelle.

Installation :  pip install mediapipe opencv-python-headless
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# Indices MediaPipe Pose utilisés par le calcul des mensurations.
# Référence : https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
NOSE = 0
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_ELBOW, RIGHT_ELBOW = 13, 14
LEFT_WRIST, RIGHT_WRIST = 15, 16
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28
LEFT_HEEL, RIGHT_HEEL = 29, 30
LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX = 31, 32

LANDMARK_COUNT = 33


@dataclass(frozen=True)
class Landmark:
    """Point de repère. x/y en pixels, z en profondeur relative."""

    x: float
    y: float
    z: float
    visibility: float


@dataclass(frozen=True)
class PoseResult:
    landmarks: list[Landmark]
    image_width: int
    image_height: int

    def point(self, index: int) -> Landmark:
        return self.landmarks[index]

    def visible(self, *indices: int, threshold: float = 0.5) -> bool:
        return all(self.landmarks[i].visibility >= threshold for i in indices)

    def midpoint(self, a: int, b: int) -> tuple[float, float]:
        pa, pb = self.landmarks[a], self.landmarks[b]
        return ((pa.x + pb.x) / 2.0, (pa.y + pb.y) / 2.0)

    def distance(self, a: int, b: int) -> float:
        """Distance euclidienne en pixels entre deux points."""
        pa, pb = self.landmarks[a], self.landmarks[b]
        return ((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2) ** 0.5

    def path_length(self, *indices: int) -> float:
        """Longueur d'une chaîne de segments, ex. épaule -> coude -> poignet."""
        return sum(self.distance(indices[i], indices[i + 1]) for i in range(len(indices) - 1))


def is_available() -> bool:
    try:
        import mediapipe  # noqa: F401
        import cv2  # noqa: F401
    except ImportError:
        return False
    return True


def unavailable_reason() -> str | None:
    missing = []
    try:
        import mediapipe  # noqa: F401
    except ImportError:
        missing.append("mediapipe")
    try:
        import cv2  # noqa: F401
    except ImportError:
        missing.append("opencv-python-headless")
    return f"paquets absents: {', '.join(missing)}" if missing else None


def extract_pose(image_path: str | Path, min_detection_confidence: float = 0.5) -> PoseResult | None:
    """
    Détecte les 33 points sur une image.

    Renvoie None si MediaPipe est absent, si l'image est illisible ou si aucune
    silhouette humaine n'est détectée — l'appelant décide alors du repli.
    """
    if not is_available():
        logger.info("MediaPipe indisponible (%s)", unavailable_reason())
        return None

    import cv2
    import mediapipe as mp

    path = str(image_path)
    image = cv2.imread(path)
    if image is None:
        logger.warning("Image illisible: %s", path)
        return None

    height, width = image.shape[:2]
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    with mp.solutions.pose.Pose(
        static_image_mode=True,
        model_complexity=2,          # le plus précis : on traite une photo, pas un flux
        enable_segmentation=False,
        min_detection_confidence=min_detection_confidence,
    ) as pose:
        result = pose.process(rgb)

    if not result.pose_landmarks:
        logger.info("Aucune pose détectée dans %s", path)
        return None

    landmarks = [
        # MediaPipe renvoie des coordonnées normalisées : on repasse en pixels
        # car toutes les distances métier se calculent dans l'espace image.
        Landmark(x=lm.x * width, y=lm.y * height, z=lm.z * width, visibility=lm.visibility)
        for lm in result.pose_landmarks.landmark
    ]
    if len(landmarks) != LANDMARK_COUNT:
        logger.warning("Nombre de points inattendu: %d", len(landmarks))
        return None

    weak = [i for i, lm in enumerate(landmarks) if lm.visibility < 0.5]
    logger.info(
        "Pose détectée sur %s (%dx%d) : %d points, visibilité moyenne %.2f%s",
        Path(path).name,
        width,
        height,
        len(landmarks),
        sum(lm.visibility for lm in landmarks) / len(landmarks),
        f", {len(weak)} point(s) peu fiables {weak}" if weak else "",
    )

    return PoseResult(landmarks=landmarks, image_width=width, image_height=height)
