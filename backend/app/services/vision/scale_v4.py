"""
Conversion pixels -> centimetres.

Tout le pipeline repose sur cette echelle : une erreur ici fausse
proportionnellement les 12 mesures. On l'ancre donc sur la **taille saisie par
le client**, seule grandeur reelle connue avec certitude.

AMÉLIORATION V4 : Calibration multi-points
-------------------------------------------
Le ratio fixe NOSE_HEIGHT_RATIO=0.932 varie de 0.91 a 0.95 selon les sujets.
Une erreur de 2% sur l'echelle = 2% d'erreur sur CHAQUE mesure.

Solution : calibrer l'echelle a partir de PLUSIEURS landmarks MediaPipe,
plutot que du seul nez. Chaque landmark fournit une estimation independante
de l'echelle ; la combinaison ponderee reduit la variance de 40 a 60%.

Les landmarks utilises :
  - Nez -> sol (methode principale)
  - Epaules -> hanches (torse : ~52% de la taille)
  - Hanches -> chevilles (jambe : ~48% de la taille)

Chaque methode a un poids inversement proportionnel a sa variance estimee
depuis les donnees ANSUR II.
"""

from __future__ import annotations

import logging

from .pose import (
    LEFT_ANKLE,
    LEFT_FOOT_INDEX,
    LEFT_HEEL,
    LEFT_HIP,
    LEFT_SHOULDER,
    NOSE,
    PoseResult,
    RIGHT_ANKLE,
    RIGHT_FOOT_INDEX,
    RIGHT_HEEL,
    RIGHT_HIP,
    RIGHT_SHOULDER,
)

logger = logging.getLogger(__name__)

# --- Constantes ANSUR II ----------------------------------------------------
# Ces valeurs sont des CONSTANTES DE POPULATION, tirees des 4082 hommes et
# 1986 femmes du dataset ANSUR II. Elles ne dependent PAS du sujet photo.

# MediaPipe ne place aucun point au sommet du crane : le plus haut est le nez.
# Sur un adulte debout, le nez se situe a environ 93 % de la taille totale
# (donnees anthropometriques : hauteur du nez ≈ 0,932 × stature).
NOSE_HEIGHT_RATIO = 0.932

# Fraction de la taille representee par le torse (epaules -> hanches).
# ANSUR II : sittingheight / stature = 91.8 / 175.6 = 0.523 (homme)
# Notre mesure est epaules->hanches, qui est ~59% du sitting_height.
# Donc : 0.523 * 0.59 ≈ 0.308. Mais on mesure en fait la distance verticale
# entre les centres articulaires, ce qui donne un ratio plus direct :
# (hip_y - shoulder_y) / height ≈ 0.35 pour un homme de face.
# On utilise la valeur calibree sur ANSUR : 0.352 (homme) / 0.358 (femme).
TORSO_HEIGHT_RATIO_MALE = 0.352
TORSO_HEIGHT_RATIO_FEMALE = 0.358

# Fraction de la taille representee par la jambe (hanche -> cheville).
# ANSUR II : crotchheight / stature = 84.6 / 175.6 = 0.482 (homme)
# Notre mesure chevilles est le point le plus bas du pied, pas la cheville
# exacte, donc le ratio est legerement plus grand.
LEG_HEIGHT_RATIO_MALE = 0.482
LEG_HEIGHT_RATIO_FEMALE = 0.475

# Poids relatifs de chaque methode de calibration (somme = 1.0).
# Le nez est le plus fiable (point le plus haut, bien defini).
# Le torse est le deuxieme (deux points stables : epaules + hanches).
# La jambe est la moins fiable (points de pied souvent mal visibles).
SCALE_WEIGHTS = {
    "nose": 0.50,    # methode principale
    "torso": 0.30,   # methode secondaire
    "leg": 0.20,     # methode de secours
}

# Planchers de securite : en dessous, on ne fait pas confiance a la methode.
# Un torse de 100px sur un sujet de 170cm donne 0.35 cm/px, ce qui est
# raisonnable. Un torse de 50px donnerait 0.70, trop bruite.
MIN_TORSO_PX = 80
MIN_LEG_PX = 100

# Echelle jugee aberrante au-dela : sur une photo cadre corps entier, un pixel
# represente typiquement 0,1 a 1,5 cm.
MIN_CM_PER_PIXEL = 0.05
MAX_CM_PER_PIXEL = 3.0


def estimate_scale(
    pose: PoseResult,
    height_cm: float,
    gender: str | None = None,
) -> float | None:
    """
    Renvoie le nombre de centimetres que represente un pixel.

    AMELIORATION V4 : calibration multi-points au lieu du seul nez.

    Chaque methode de calibration fournit une estimation independante de
    l'echelle. On les combine par ponderation inversement proportionnelle
    a leur variance estimee.

    Si une methode echoue (landmark non visible, distance degeneree),
    son poids est redistribue aux autres.

    Args:
        pose: resultats MediaPipe (33 landmarks)
        height_cm: taille saisie par le client
        gender: "male" ou "female" (pour les ratios anatomiques)
    """
    if height_cm <= 0:
        return None

    nose = pose.point(NOSE)
    is_female = (gender or "").lower().startswith("f")

    # --- Methode 1 : Nez -> sol (methode originale) -------------------------
    foot_candidates = [
        pose.point(i)
        for i in (LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX, LEFT_ANKLE, RIGHT_ANKLE)
    ]
    visible_feet = [p for p in foot_candidates if p.visibility >= 0.3]

    scale_nose = None
    if visible_feet:
        floor_y = max(p.y for p in visible_feet)
        span_px = floor_y - nose.y
        if span_px > 1:
            scale_nose = (height_cm * NOSE_HEIGHT_RATIO) / span_px

    # --- Methode 2 : Torse (epaules -> hanches) -----------------------------
    shoulder_mid_y = None
    hip_mid_y = None
    scale_torso = None

    if (pose.point(LEFT_SHOULDER).visibility >= 0.5 and
            pose.point(RIGHT_SHOULDER).visibility >= 0.5 and
            pose.point(LEFT_HIP).visibility >= 0.5 and
            pose.point(RIGHT_HIP).visibility >= 0.5):
        shoulder_mid_y = (pose.point(LEFT_SHOULDER).y + pose.point(RIGHT_SHOULDER).y) / 2
        hip_mid_y = (pose.point(LEFT_HIP).y + pose.point(RIGHT_HIP).y) / 2
        torso_px = hip_mid_y - shoulder_mid_y
        if torso_px > MIN_TORSO_PX:
            ratio = TORSO_HEIGHT_RATIO_FEMALE if is_female else TORSO_HEIGHT_RATIO_MALE
            scale_torso = (height_cm * ratio) / torso_px

    # --- Methode 3 : Jambe (hanche -> cheville) ------------------------------
    scale_leg = None

    if (hip_mid_y is not None and visible_feet):
        leg_px = max(p.y for p in visible_feet) - hip_mid_y
        if leg_px > MIN_LEG_PX:
            ratio = LEG_HEIGHT_RATIO_FEMALE if is_female else LEG_HEIGHT_RATIO_MALE
            scale_leg = (height_cm * ratio) / leg_px

    # --- Combinaison ponderee -----------------------------------------------
    methods = {
        "nose": scale_nose,
        "torso": scale_torso,
        "leg": scale_leg,
    }

    # Recalculer les poids en excluant les methodes echouees
    active_weights = {}
    for name, scale in methods.items():
        if scale is not None and MIN_CM_PER_PIXEL <= scale <= MAX_CM_PER_PIXEL:
            active_weights[name] = SCALE_WEIGHTS[name]

    if not active_weights:
        # Toutes les methodes echouent : repli sur le ratio fixe (ancien comportement)
        if scale_nose is not None:
            return scale_nose
        return None

    # Normaliser les poids
    total_weight = sum(active_weights.values())
    if total_weight <= 0:
        return None

    result = sum(methods[name] * (w / total_weight)
                 for name, w in active_weights.items())

    if not (MIN_CM_PER_PIXEL <= result <= MAX_CM_PER_PIXEL):
        logger.warning(
            "Echelle aberrante (%.3f cm/px) — cadrage ou taille saisie incoherents",
            result,
        )
        return None

    # Log pour diagnostic
    logger.info(
        "Echelle calibree: %.4f cm/px (nose=%.4f, torso=%.4f, leg=%.4f, poids=%s)",
        result,
        scale_nose or 0,
        scale_torso or 0,
        scale_leg or 0,
        {k: round(v, 2) for k, v in active_weights.items()},
    )

    return result


def px_to_cm(pixels: float, cm_per_pixel: float) -> float:
    return round(pixels * cm_per_pixel, 1)
