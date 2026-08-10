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

# Distance entre points d'épaule -> CARRURE (largeur entre les deux
# emmanchures), la mesure que le tailleur reporte sur son patron.
#
# À ne pas confondre avec JOINT_TO_BODY["biacromialbreadth"] ci-dessus, qui
# vise la largeur d'acromion à acromion attendue par le modèle. Les deux
# partaient du même facteur, ce qui affichait au tailleur une mesure
# d'anthropométrie ~7 cm trop large pour son usage.
#
# Calibré sur 12 sujets mesurés au mètre ruban ; validation croisée à 1,6 cm
# d'erreur résiduelle. Repose sur une seule personne mesurant : à revoir si
# d'autres tailleurs prennent la carrure autrement.
JOINT_TO_SHOULDER_WIDTH = 0.90

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

# Variables dont on produit aussi une version « corps nu », l'épaisseur de
# vêtement retirée. Elles alimentent UNIQUEMENT le socle géométrique des trois
# tours de tronc.
#
# Les entrées du régresseur restent volontairement inchangées : la correction
# n'a été mesurée que sur les tours de tronc, et rien ne dit ce qu'elle ferait
# aux cinq autres cibles. On ne déplace pas une variable dont l'effet n'a pas
# été mesuré là où elle irait.
BODY_SUFFIX = "_body"
CLOTHED_TO_BODY = (
    "chestbreadth", "chestdepth",
    "waistbreadth", "waistdepth",
    "hipbreadth", "buttockdepth",
)
# Planchers de sécurité après soustraction, en cm : une épaisseur aberrante ne
# doit pas produire une dimension nulle ou négative.
_MIN_BREADTH_CM = 5.0
_MIN_DEPTH_CM = 3.0

# --- Longueur de dos : correction par sexe -----------------------------------
# La longueur de dos est lue comme la corde milieu des épaules -> milieu des
# hanches. Le rapport entre cette corde et la mesure du tailleur n'est pas le
# même selon le sexe : mesuré sur 13 sujets, il vaut 1,003 ± 0,21 chez l'homme
# et 0,919 ± 0,02 chez la femme.
#
# Chez l'homme l'écart n'est pas significatif (+0,16 cm pour un écart-type de
# 2,14) : appliquer une correction y ajouterait du bruit, et le test l'a
# confirmé (1,54 -> 1,80 cm). Chez la femme il l'est nettement (-4,02 cm pour
# un écart-type de 0,98), et la correction ramène l'erreur de 4,02 à 1,05 cm.
#
# Un facteur plutôt qu'un décalage : il suit la taille du sujet, là où un
# décalage constant supposerait le même écart à 1,50 m et à 1,80 m. Les deux
# se valent sur cet échantillon (1,53 contre 1,51 cm) ; le facteur se défend
# mieux hors échantillon.
#
# Calibré sur 5 femmes. C'est peu : à revoir dès que l'échantillon grandit.
BACK_LENGTH_BY_SEX = {"male": 1.0, "female": 0.919}


def build_model_features(
    pose_front: PoseResult,
    cm_per_pixel: float,
    height_cm: float,
    weight_kg: float,
    front_widths: SilhouetteWidths | None = None,
    side_widths: SilhouetteWidths | None = None,
    side_cm_per_pixel: float | None = None,
    clothing_thickness_cm: float | None = None,
) -> dict[str, float] | None:
    """
    Construit les 12 entrées attendues par le modèle, en centimètres
    (le poids restant en kg).

    `front_widths` / `side_widths` viennent de SAM. En leur absence, les
    variables de silhouette sont dérivées du squelette : moins précis, mais le
    modèle reste utilisable.

    `clothing_thickness_cm`, quand il est fourni, ajoute six variables
    suffixées `_body` : les mêmes largeurs et profondeurs, l'épaisseur de
    vêtement retirée. Voir `CLOTHED_TO_BODY`.
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

    # --- Profondeurs (photo de profil) -------------------------------------
    # `side_widths` a longtemps été ignoré : le diagnostic de l'époque
    # attribuait l'échec à un bras pendant le long du corps, qui aurait couvert
    # la zone à mesurer. Ce diagnostic était faux. Le vrai coupable était un
    # bras FANTÔME : de profil, le bras opposé est caché derrière le corps et
    # MediaPipe lui inventait des coordonnées (visibilité 0,00-0,01)
    # descendant le long du torse ; la bande d'exclusion effaçait donc le
    # torse lui-même. Corrigé dans silhouette._mask_without_arms.
    #
    # Mesuré sur 13 sujets : les profondeurs issues du profil s'écartent en
    # moyenne de 5,7 cm de la valeur qu'impliquent les tours réels, contre
    # 6,9 cm pour les ratios fixes — et elles restent anatomiquement
    # plausibles là où le ratio dérapait (35,9 cm de profondeur de poitrine
    # pour un sujet de 60 kg).
    #
    # L'échelle du profil est calculée sur SA propre photo : le sujet n'y a
    # aucune raison d'occuper la même place que sur la photo de face, et
    # réutiliser l'échelle de face fausserait toutes les profondeurs.
    if side_widths is not None and side_cm_per_pixel and side_cm_per_pixel > 0:
        def side_cm(px: float) -> float:
            return px_to_cm(px, side_cm_per_pixel)

        features["chestdepth"] = round(side_cm(side_widths.chest_px), 1)
        features["waistdepth"] = round(side_cm(side_widths.waist_px), 1)
        features["buttockdepth"] = round(side_cm(side_widths.hip_px), 1)
    else:
        # Sans photo de profil exploitable : ratios anthropométriques ANSUR.
        features["chestdepth"] = round(features["chestbreadth"] * DEPTH_FROM_BREADTH["chestdepth"], 1)
        features["waistdepth"] = round(features["waistbreadth"] * DEPTH_FROM_BREADTH["waistdepth"], 1)
        features["buttockdepth"] = round(features["hipbreadth"] * DEPTH_FROM_BREADTH["buttockdepth"], 1)

    # --- Dimensions corps nu, pour le socle géométrique du tronc ------------
    # L'épaisseur se retire de chaque côté : une largeur perd 2e, pas e.
    if clothing_thickness_cm is not None:
        for name in CLOTHED_TO_BODY:
            floor = _MIN_DEPTH_CM if name.endswith("depth") else _MIN_BREADTH_CM
            features[name + BODY_SUFFIX] = round(
                max(features[name] - 2 * clothing_thickness_cm, floor), 1
            )

    return features


def _sleeve_length_cm(pose: PoseResult, cm_per_pixel: float) -> float:
    """
    Longueur de manche, en centimètres, mesurée en 3D quand c'est possible.

    Lue sur les points projetés, la manche est systématiquement raccourcie :
    un bras qui s'écarte du plan du capteur — ce que fait n'importe quel bras
    légèrement en avant — se projette plus court qu'il n'est. C'est la seule
    des quatre longueurs dont le tracé quitte franchement le plan frontal, et
    c'est la seule que le repère 3D améliore.
    #
    Mesuré sur 13 sujets : 3,66 -> 2,93 cm, et ce sont les pires cas qui se
    corrigent (7,6 -> 4,4 et 5,0 -> 2,2 cm). Les trois autres longueurs se
    dégradent en 3D — la profondeur reconstruite y est trop bruitée — et
    restent donc en 2D.
    """
    left_px = pose.path_length(LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST)
    right_px = pose.path_length(RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST)
    projected = px_to_cm(max(left_px, right_px), cm_per_pixel)

    scale = pose.world_scale(cm_per_pixel)
    if scale is None:
        return projected

    left_m = pose.path_length_3d(LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST)
    right_m = pose.path_length_3d(RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST)
    if left_m is None or right_m is None:
        return projected

    spatial = max(left_m, right_m) * scale
    # La projection est une borne inférieure de la longueur réelle : une valeur
    # 3D plus courte signale un repère 3D incohérent, pas un bras plus court.
    if spatial < projected:
        logger.debug("Manche 3D (%.1f cm) sous la projection (%.1f cm) — 2D conservée",
                     spatial, projected)
        return projected
    return spatial


def build_geometric_measurements(
    pose: PoseResult, cm_per_pixel: float, gender: str | None = None
) -> dict[str, float]:
    """
    Les 4 mesures lues directement sur l'image, sans modèle.

    Elles complètent les 8 tours prédits pour atteindre les 12 mesures livrées
    au client.

    `gender` ne sert qu'à la longueur de dos — voir `BACK_LENGTH_BY_SEX`.
    """

    def cm(px: float) -> float:
        return px_to_cm(px, cm_per_pixel)

    sleeve_cm = _sleeve_length_cm(pose, cm_per_pixel)

    # Entrejambe : milieu des hanches -> cheville.
    hip_mid = pose.midpoint(LEFT_HIP, RIGHT_HIP)
    ankle = pose.point(LEFT_ANKLE if pose.point(LEFT_ANKLE).visibility >= pose.point(RIGHT_ANKLE).visibility else RIGHT_ANKLE)
    inseam_px = ((hip_mid[0] - ankle.x) ** 2 + (hip_mid[1] - ankle.y) ** 2) ** 0.5

    # Longueur de dos : milieu des épaules -> milieu des hanches.
    shoulder_mid = pose.midpoint(LEFT_SHOULDER, RIGHT_SHOULDER)
    back_px = ((shoulder_mid[0] - hip_mid[0]) ** 2 + (shoulder_mid[1] - hip_mid[1]) ** 2) ** 0.5

    return {
        # CARRURE, pas largeur biacromiale — deux mesures distinctes, longtemps
        # confondues ici. Le commentaire précédent affirmait que la valeur
        # livrée au tailleur « ne peut pas contredire celle utilisée en
        # interne » ; c'était une erreur de raisonnement, parce que les deux
        # usages ne demandent pas la même mesure.
        #
        #   - le MODÈLE attend `biacromialbreadth` (acromion à acromion), la
        #     définition ANSUR sur laquelle il a été entraîné : ~40 cm pour un
        #     adulte de 1,80 m, et la chaîne la produit correctement (vérifié
        #     contre la distribution ANSUR : 42,1 ± 1,7 cm sur 175-185 cm).
        #   - le TAILLEUR reporte une CARRURE, mesurée entre les deux
        #     emmanchures : ~33 cm chez les mêmes sujets. Lui afficher 40 cm
        #     lui donnait une valeur inutilisable sur son patron.
        #
        # Les points d'épaule de MediaPipe tombent à l'articulation, donc à
        # l'emmanchure : la distance brute correspond à la carrure, au léger
        # débord latéral des points près. Facteur calibré sur 12 sujets mesurés
        # au mètre, en validation croisée (chacun évalué avec un facteur calculé
        # sans lui) : erreur ramenée de 6,7 à 1,6 cm.
        "shoulder": round(cm(pose.distance(LEFT_SHOULDER, RIGHT_SHOULDER)) * JOINT_TO_SHOULDER_WIDTH, 1),
        "sleeve_length": round(sleeve_cm, 1),
        "inseam": cm(inseam_px),
        # Correction par sexe : neutre chez l'homme, franche chez la femme.
        # Voir BACK_LENGTH_BY_SEX.
        "back_length": round(
            cm(back_px) * BACK_LENGTH_BY_SEX.get((gender or "").lower(), 1.0), 1
        ),
    }
