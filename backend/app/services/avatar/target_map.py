"""
Correspondance entre nos paramètres morphologiques (body_params.AvatarParams)
et les cibles MakeHuman/MPFB2, en pur Python (aucune dépendance à `bpy`).

Module partagé par deux usages qui ne tournent JAMAIS dans le même processus :
  - generator.py / export_base_mesh.py, exécutés PAR Blender (bpy disponible),
    pour l'outillage de développement (régénérer les maillages de base) ;
  - morph_weights.py, exécuté par le backend FastAPI (bpy absent), pour
    calculer à la volée les poids de morph targets envoyés au mobile.

Garder ces tables ici, importées par les deux côtés plutôt que dupliquées,
évite qu'elles divergent : un nom de cible qui change d'un côté sans l'autre
casserait silencieusement soit l'outillage, soit la production (le morph
target visé n'existerait simplement pas sur le maillage chargé côté client).
"""

from __future__ import annotations

# --- Cibles à deux sens (fichiers -incr / -decr) -----------------------------
#   param -> (sous-dossier, racine du nom de cible)

MEASURE_TARGETS: dict[str, tuple[str, str]] = {
    "chest_scale":    ("torso", "measure-bust-circ"),
    "waist_scale":    ("torso", "measure-waist-circ"),
    "hip_scale":      ("torso", "measure-hips-circ"),
    "shoulder_width": ("torso", "measure-shoulder-dist"),
    "back_factor":    ("torso", "measure-napetowaist-dist"),
    "neck_scale":     ("neck",  "measure-neck-circ"),
    "biceps_scale":   ("arms",  "measure-upperarm-circ"),
    "wrist_scale":    ("hands", "measure-wrist-circ"),
    "thigh_scale":    ("legs",  "measure-thigh-circ"),
    "ankle_scale":    ("feet",  "measure-ankle-circ"),
    "sleeve_factor":  ("arms",  "measure-upperarm-length"),
    "leg_ratio":      ("legs",  "measure-upperleg-height"),
}

SHAPE_TARGETS: dict[str, tuple[str, str]] = {
    "buttock_scale": ("buttocks", "buttocks-volume"),
}

BREADTH_DEPTH_TARGETS: dict[str, tuple[str, str]] = {
    "hip_breadth_scale":   ("hip", "hip-scale-horiz"),
    "buttock_depth_scale": ("hip", "hip-scale-depth"),
}

PROPORTION_TARGETS: dict[str, tuple[str, str]] = {
    "torso_ratio": ("torso", "torso-scale-vert"),
}

TORSO_WIDTH_TARGET: tuple[str, str] = ("torso", "torso-scale-horiz")
TORSO_DEPTH_TARGET: tuple[str, str] = ("torso", "torso-scale-depth")

# Corpulence : un seul scalaire (weight_factor) pilote ces 5 cibles à la fois,
# chacune au même poids (poids_corps * FAT_TARGET_GAIN) — voir
# generator.py::_apply_morphology, historique de ce facteur 0.6.
FAT_TARGETS: list[tuple[str, str]] = [
    ("arms", "l-upperarm-fat"), ("arms", "r-upperarm-fat"),
    ("legs", "l-upperleg-fat"), ("legs", "r-upperleg-fat"),
    ("stomach", "stomach-pregnant"),
]
FAT_TARGET_GAIN = 0.6

# Musculature : idem, un seul scalaire (muscle_factor) pilote ces 2 cibles.
MUSCLE_TARGETS: list[tuple[str, str]] = [
    ("torso", "torso-muscle-pectoral"), ("torso", "torso-muscle-dorsi"),
]

# --- Cible à seuil, sans convention incr/decr --------------------------------
# MakeHuman nomme ses deux sens `-up`/`-down` ici, pas `-incr`/`-decr`.
BREAST_TARGET: tuple[str, str] = ("breast", "breast-volume-vert")

# --- Sensibilité de la hauteur du maillage aux axes de proportion -----------
#
# generator.py mesure la hauteur RÉELLE du maillage après application des
# cibles avant de choisir son facteur d'échelle (voir _apply_height et sa
# docstring : jusqu'à 7 cm d'erreur en partant d'une hauteur constante). Le
# mobile ne peut pas faire cette mesure — le blending des morph targets a
# lieu côté GPU, la géométrie CPU reste à la pose neutre — donc ce calibrage
# fait ici, une fois, ce que Blender ferait par la mesure directe.
#
# Mesuré avec calibrate_height.py (maillage neutre = 165,943 cm) : seuls les
# axes de PROPORTION verticale déplacent la hauteur globale. Les axes de
# circonférence (chest/waist/hip/shoulder_width) ont un effet nul, vérifié
# plutôt que supposé — absents de cette table à dessein.
#
#   axe -> (delta en cm à +1.0, delta en cm à -1.0)
HEIGHT_SENSITIVITY: dict[str, tuple[float, float]] = {
    "leg_ratio": (10.370, -7.500),
    "torso_ratio": (10.280, -4.310),
    "back_factor": (7.800, -4.650),
}


def estimate_reference_height_cm(params, base_height_cm: float) -> float:
    """
    Estime la hauteur du maillage APRÈS application des cibles de proportion,
    par interpolation linéaire des deltas mesurés à +1.0/-1.0 — c'est cette
    valeur, et non `base_height_cm`, qui doit servir de référence à l'échelle
    finale (hauteur demandée / hauteur de référence), sous peine de reproduire
    l'erreur déjà documentée dans generator.py::_apply_height.
    """
    height = base_height_cm
    for axis, (delta_plus, delta_minus) in HEIGHT_SENSITIVITY.items():
        v = float(getattr(params, axis, 0.0) or 0.0)
        if v > 0:
            height += delta_plus * v
        elif v < 0:
            height += delta_minus * (-v)
    return height


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


# Traduction paramètre -> racine de cible, pour les usages qui construisent
# un nom de cible sans passer par `compute_target_weights` (actuellement :
# optimize_weights.py, qui doit nommer ses poids optimisés avec les mêmes
# noms que le maillage attend). Volontairement limitée aux cibles à
# convention incr/decr directe (un paramètre -> une cible) — les cibles
# composites (torso-scale-horiz/depth, dérivées d'une moyenne de plusieurs
# paramètres) et `breast_size` (convention -up/-down séparée, voir
# BREAST_TARGET) n'y figurent pas volontairement.
PARAM_TO_TARGET: dict[str, str] = {
    **{p: racine for p, (_, racine) in MEASURE_TARGETS.items()},
    **{p: racine for p, (_, racine) in SHAPE_TARGETS.items()},
    **{p: racine for p, (_, racine) in BREADTH_DEPTH_TARGETS.items()},
    **{p: racine for p, (_, racine) in PROPORTION_TARGETS.items()},
}


def compute_target_weights(params) -> dict[str, float]:
    """
    Convertit un `AvatarParams` (voir body_params.py) en poids de morph
    targets, indexés par NOM DE FICHIER SANS EXTENSION (ex.
    "measure-waist-circ-decr") — c'est exactement le nom exporté comme morph
    target par export_base_mesh.py (`targetNames` dans le glTF).

    Ne renvoie que les cibles dont le poids dépasse le seuil de bruit
    (0.02, identique à generator.py::_load_target) : une absence de clé dans
    le résultat signifie poids 0, pas une erreur.
    """
    weights: dict[str, float] = {}

    def add_signed(sous: str, racine: str, valeur: float | None) -> None:
        v = float(valeur or 0.0)
        if abs(v) < 0.02:
            return
        sens = "incr" if v > 0 else "decr"
        weights[f"{racine}-{sens}"] = _clamp01(abs(v))

    for table in (MEASURE_TARGETS, SHAPE_TARGETS, BREADTH_DEPTH_TARGETS, PROPORTION_TARGETS):
        for param, (sous, racine) in table.items():
            add_signed(sous, racine, getattr(params, param, 0.0))

    # Largeur/profondeur du tronc : moyenne poitrine+taille (pas de cible
    # séparée par niveau côté MakeHuman) — même formule que generator.py.
    largeur = (float(getattr(params, "chest_breadth_scale", 0.0) or 0.0)
               + float(getattr(params, "waist_breadth_scale", 0.0) or 0.0)) / 2.0
    add_signed(*TORSO_WIDTH_TARGET, largeur)
    profondeur = (float(getattr(params, "chest_depth_scale", 0.0) or 0.0)
                  + float(getattr(params, "waist_depth_scale", 0.0) or 0.0)) / 2.0
    add_signed(*TORSO_DEPTH_TARGET, profondeur)

    # Volume mammaire (féminin uniquement, convention -up/-down).
    if float(getattr(params, "gender", 0.0) or 0.0) > 0.5:
        sein = float(getattr(params, "breast_size", 0.0) or 0.0)
        if abs(sein) >= 0.02:
            sens = "up" if sein > 0 else "down"
            weights[f"{BREAST_TARGET[1]}-{sens}"] = _clamp01(abs(sein))

    # Corpulence globale.
    poids_corps = float(getattr(params, "weight_factor", 0.0) or 0.0)
    if abs(poids_corps) >= 0.02:
        for sous, racine in FAT_TARGETS:
            add_signed(sous, racine, poids_corps * FAT_TARGET_GAIN)

    # Musculature.
    muscle = float(getattr(params, "muscle_factor", 0.0) or 0.0)
    if abs(muscle) >= 0.02:
        for sous, racine in MUSCLE_TARGETS:
            add_signed(sous, racine, muscle)

    return weights
