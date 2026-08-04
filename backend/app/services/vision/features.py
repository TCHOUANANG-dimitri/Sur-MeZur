"""
Assemblage des variables du modèle et des mesures géométriques.

Deux familles distinctes, à ne pas confondre :

  - **Entrées du modèle** (12) : ce qu'on donne au gradient boosting pour qu'il
    prédise les 8 tours de corps.
  - **Mesures géométriques** (4) : longueurs directement lisibles sur l'image,
    livrées au client sans passer par le modèle.

Les noms de variables suivent les colonnes ANSUR, car c'est sur elles que le
modèle a été entraîné — voir ml/scripts/config.py.
"""

from __future__ import annotations

import logging

from .pose import (
    LEFT_ANKLE,
    LEFT_ELBOW,
    LEFT_HIP,
    LEFT_KNEE,
    LEFT_SHOULDER,
    LEFT_WRIST,
    PoseResult,
    RIGHT_ANKLE,
    RIGHT_ELBOW,
    RIGHT_HIP,
    RIGHT_KNEE,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
)
from .scale import px_to_cm
from .silhouette import SilhouetteWidths

logger = logging.getLogger(__name__)

# Le squelette relie les centres articulaires : la largeur d'épaules réelle
# (bideltoid, muscle compris) dépasse la distance biacromiale d'environ 22 %.
BIDELTOID_FROM_BIACROMIAL = 1.22

# --- Calibration centre articulaire -> surface du corps ----------------------
# MediaPipe place ses points sur les CENTRES ARTICULAIRES, pas sur la peau.
# `dist(23,24)` mesure l'écartement des têtes fémorales, PAS la largeur du
# bassin : sur photo réelle on relève 21,8 cm là où ANSUR donne 34,6 cm.
# Sans ces facteurs, le modèle reçoit des largeurs sous-estimées de ~37 % et
# prédit un tour de taille de 72 cm là où la réalité est proche de 94 cm.
#
# Facteurs dérivés des ratios ANSUR (largeur ANSUR / distance squelettique
# observée). Ce sont des CONSTANTES DE POPULATION, pas une mesure par sujet :
# c'est un correctif provisoire. La vraie solution est SAM, qui mesure la
# largeur réelle sur la silhouette et rend cette calibration inutile.
JOINT_TO_BODY = {
    "hipbreadth": 1.58,        # 34,6 / 21,8
    "biacromialbreadth": 1.09,  # 41,6 / 38,2
    "crotchheight": 1.13,       # 84,6 / 75,0
}

# `sittingheight` ANSUR = fesses -> sommet du crâne. La longueur de tronc
# épaules->hanches en représente ~59 % (0,55 sur-estimait de 7 %).
TORSO_TO_SITTING_HEIGHT = 0.59

# Sans photo de profil, les profondeurs sont estimées depuis les largeurs par
# des ratios anthropométriques ANSUR. Approximation assumée : le modèle V2
# attend ces variables, et une estimation cohérente vaut mieux qu'un refus.
DEPTH_FROM_BREADTH = {
    "chestdepth": 0.88,    # 25,4 / 28,9 chez l'homme ANSUR
    "waistdepth": 0.73,    # 23,8 / 32,6
    "buttockdepth": 0.71,  # 24,6 / 34,6
}


def build_model_features(
    pose_front: PoseResult,
    cm_per_pixel: float,
    height_cm: float,
    weight_kg: float,
    front_widths: SilhouetteWidths | None = None,
    side_widths: SilhouetteWidths | None = None,
) -> dict[str, float] | None:
    """
    Construit les 12 entrées attendues par le modèle, en centimètres
    (le poids restant en kg).

    `front_widths` / `side_widths` viennent de SAM. En leur absence, les
    variables de silhouette sont dérivées du squelette : moins précis, mais le
    modèle reste utilisable.
    """
    if cm_per_pixel <= 0:
        return None

    def cm(px: float) -> float:
        return px_to_cm(px, cm_per_pixel)

    # --- Squelette (MediaPipe) --------------------------------------------
    # Chaque distance squelettique est ramenée vers la définition ANSUR
    # correspondante (voir JOINT_TO_BODY).
    biacromial = round(
        cm(pose_front.distance(LEFT_SHOULDER, RIGHT_SHOULDER)) * JOINT_TO_BODY["biacromialbreadth"], 1
    )
    hip_breadth = round(
        cm(pose_front.distance(LEFT_HIP, RIGHT_HIP)) * JOINT_TO_BODY["hipbreadth"], 1
    )

    shoulder_mid = pose_front.midpoint(LEFT_SHOULDER, RIGHT_SHOULDER)
    hip_mid = pose_front.midpoint(LEFT_HIP, RIGHT_HIP)
    torso_px = ((shoulder_mid[0] - hip_mid[0]) ** 2 + (shoulder_mid[1] - hip_mid[1]) ** 2) ** 0.5
    sitting_height = cm(torso_px / TORSO_TO_SITTING_HEIGHT)

    # Longueur de jambe : hanche -> genou -> cheville, du côté le mieux visible.
    left_leg = pose_front.path_length(LEFT_HIP, LEFT_KNEE, LEFT_ANKLE)
    right_leg = pose_front.path_length(RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE)
    leg_px = max(left_leg, right_leg)
    crotch_height = round(cm(leg_px) * JOINT_TO_BODY["crotchheight"], 1)

    features: dict[str, float] = {
        "stature_m": float(height_cm),          # déjà en cm malgré le nom de colonne
        "weight_kg": float(weight_kg),
        "biacromialbreadth": biacromial,
        "bideltoidbreadth": round(biacromial * BIDELTOID_FROM_BIACROMIAL, 1),
        "hipbreadth": hip_breadth,
        "sittingheight": sitting_height,
        "crotchheight": crotch_height,
    }

    # --- Silhouette (SAM) --------------------------------------------------
    if front_widths is not None:
        features["chestbreadth"] = cm(front_widths.chest_px)
        features["waistbreadth"] = cm(front_widths.waist_px)
        # La silhouette mesure la vraie largeur de hanches : plus fiable que la
        # distance entre centres articulaires, elle prime donc.
        features["hipbreadth"] = cm(front_widths.hip_px)
    else:
        # Repli : largeurs déduites du squelette.
        features["chestbreadth"] = round(biacromial * 0.70, 1)
        features["waistbreadth"] = round(hip_breadth * 0.94, 1)

    # `side_widths` (SAM sur la photo de profil) est délibérément IGNORÉ pour
    # l'instant, même quand SAM est disponible : les profondeurs retombent
    # toujours sur le ratio squelette. `side_widths` reste un paramètre de la
    # fonction pour permettre de le réactiver une fois le point ci-dessous
    # réglé.
    #
    # Testé sur photo réelle (02/08) : un bras qui pend naturellement le long
    # du corps couvre, en profil, exactement la même plage verticale que la
    # poitrine, la taille ET les hanches (épaule → poignet ≈ hauteur du
    # torse). Élargir ou rétrécir la bande d'exclusion du bras n'a quasiment
    # rien changé (−48 % d'écart ANSUR à −44 % en réduisant la bande de
    # moitié) : le problème n'est pas la largeur de la bande, c'est qu'elle
    # doit effacer une zone qui recouvre presque exactement la zone à
    # mesurer. Un seul sujet/pose ne suffit pas non plus pour valider un
    # correctif algorithmique sans risquer de le sur-ajuster à cette pose
    # précise — nécessite soit une consigne de prise de vue différente (bras
    # écarté du buste aussi de profil, pas seulement de face), soit un
    # algorithme plus fin, validé sur davantage de sujets.
    del side_widths  # non utilisé pour l'instant, voir ci-dessus
    features["chestdepth"] = round(features["chestbreadth"] * DEPTH_FROM_BREADTH["chestdepth"], 1)
    features["waistdepth"] = round(features["waistbreadth"] * DEPTH_FROM_BREADTH["waistdepth"], 1)
    features["buttockdepth"] = round(features["hipbreadth"] * DEPTH_FROM_BREADTH["buttockdepth"], 1)

    return features


def build_geometric_measurements(pose: PoseResult, cm_per_pixel: float) -> dict[str, float]:
    """
    Les 4 mesures lues directement sur l'image, sans modèle.

    Elles complètent les 8 tours prédits pour atteindre les 12 mesures livrées
    au client.
    """

    def cm(px: float) -> float:
        return px_to_cm(px, cm_per_pixel)

    # Manche : épaule -> coude -> poignet, côté le mieux visible.
    left_sleeve = pose.path_length(LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST)
    right_sleeve = pose.path_length(RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST)
    sleeve_px = max(left_sleeve, right_sleeve)

    # Entrejambe : milieu des hanches -> cheville.
    hip_mid = pose.midpoint(LEFT_HIP, RIGHT_HIP)
    ankle = pose.point(LEFT_ANKLE if pose.point(LEFT_ANKLE).visibility >= pose.point(RIGHT_ANKLE).visibility else RIGHT_ANKLE)
    inseam_px = ((hip_mid[0] - ankle.x) ** 2 + (hip_mid[1] - ankle.y) ** 2) ** 0.5

    # Longueur de dos : milieu des épaules -> milieu des hanches.
    shoulder_mid = pose.midpoint(LEFT_SHOULDER, RIGHT_SHOULDER)
    back_px = ((shoulder_mid[0] - hip_mid[0]) ** 2 + (shoulder_mid[1] - hip_mid[1]) ** 2) ** 0.5

    return {
        # Même calibration que la variable du modèle : c'est la largeur d'épaules
        # livrée au tailleur, elle ne peut pas contredire celle utilisée en interne.
        "shoulder": round(
            cm(pose.distance(LEFT_SHOULDER, RIGHT_SHOULDER)) * JOINT_TO_BODY["biacromialbreadth"], 1
        ),
        "sleeve_length": cm(sleeve_px),
        "inseam": cm(inseam_px),
        "back_length": cm(back_px),
    }
