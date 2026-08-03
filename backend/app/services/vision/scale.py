"""
Conversion pixels → centimètres.

Tout le pipeline repose sur cette échelle : une erreur ici fausse
proportionnellement les 12 mesures. On l'ancre donc sur la **taille saisie par
le client**, seule grandeur réelle connue avec certitude.
"""

from __future__ import annotations

import logging

from .pose import (
    LEFT_ANKLE,
    LEFT_FOOT_INDEX,
    LEFT_HEEL,
    NOSE,
    PoseResult,
    RIGHT_ANKLE,
    RIGHT_FOOT_INDEX,
    RIGHT_HEEL,
)

logger = logging.getLogger(__name__)

# MediaPipe ne place aucun point au sommet du crâne : le plus haut est le nez.
# Sur un adulte debout, le nez se situe à environ 93 % de la taille totale
# (données anthropométriques : hauteur du nez ≈ 0,932 × stature).
NOSE_HEIGHT_RATIO = 0.932

# Échelle jugée aberrante au-delà : sur une photo cadrée corps entier, un pixel
# représente typiquement 0,1 à 1,5 cm.
MIN_CM_PER_PIXEL = 0.05
MAX_CM_PER_PIXEL = 3.0


def estimate_scale(pose: PoseResult, height_cm: float) -> float | None:
    """
    Renvoie le nombre de centimètres que représente un pixel.

    On mesure la distance verticale nez → sol en pixels, on la rapporte à la
    fraction de taille correspondante, et on en déduit l'échelle.
    """
    if height_cm <= 0:
        return None

    nose = pose.point(NOSE)

    # Point le plus bas réellement détecté : on prend le maximum sur les
    # candidats du pied, car selon la pose l'un ou l'autre est mieux visible.
    foot_candidates = [
        pose.point(i)
        for i in (LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX, LEFT_ANKLE, RIGHT_ANKLE)
    ]
    visible_feet = [p for p in foot_candidates if p.visibility >= 0.3]
    if not visible_feet:
        logger.info("Aucun point de pied visible — échelle non calculable")
        return None

    floor_y = max(p.y for p in visible_feet)
    span_px = floor_y - nose.y
    if span_px <= 1:
        logger.info("Amplitude verticale nulle — cadrage inexploitable")
        return None

    # span_px couvre NOSE_HEIGHT_RATIO de la stature.
    cm_per_pixel = (height_cm * NOSE_HEIGHT_RATIO) / span_px

    if not (MIN_CM_PER_PIXEL <= cm_per_pixel <= MAX_CM_PER_PIXEL):
        logger.warning(
            "Échelle aberrante (%.3f cm/px) — cadrage ou taille saisie incohérents",
            cm_per_pixel,
        )
        return None

    return cm_per_pixel


def px_to_cm(pixels: float, cm_per_pixel: float) -> float:
    return round(pixels * cm_per_pixel, 1)
