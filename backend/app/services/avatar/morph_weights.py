"""
Calcul des poids de morph targets à partir des mensurations — sans Blender.

Deux mécanismes coexistent :
  1. Optimisation par matrice de sensibilité (nouveau) : résout un petit
     problème d'optimisation qui fait correspondre les mesures virtuelles
     du maillage aux mesures réelles du client. Nécessite une matrice
     pré-calibrée (calibrate_sensitivity.py). Plus précis mais dépend
     de la qualité de la calibration.
  2. Fallback poids=|z| (ancien) : utilisé quand la matrice de calibration
     n'est pas disponible pour le sexe considéré.

Le choix est automatique : si la matrice existe, optimisation ; sinon, repli.
"""

from __future__ import annotations

import logging

from app.models.measurements import Measurement

from .body_params import measurements_to_avatar_params, AvatarParams
from .target_map import compute_target_weights, estimate_reference_height_cm
from .optimize_weights import load_sensitivity, optimize_weights

logger = logging.getLogger(__name__)

NEUTRAL_HEIGHT_CM = 165.94  # doit rester identique à generator.py::BASE_HEIGHT_CM

# Mesures utilisées pour l'optimisation (doivent exister dans la matrice)
_OPTIMIZATION_MEASURES = [
    "chest", "waist", "hips", "neck",
    "chestbreadth", "chestdepth",
    "waistbreadth", "waistdepth",
    "hipbreadth", "buttockdepth",
]


def _build_z_scores(params: AvatarParams) -> dict[str, float]:
    """
    Extrait les z-scores du AvatarParams pour chaque cible.

    Retourne un dict {param_name: z_score} avec le signe (+ pour incr,
    - pour decr).
    """
    z = {}
    # Circonférences
    for attr in ("chest_scale", "waist_scale", "hip_scale", "biceps_scale",
                 "thigh_scale", "neck_scale", "wrist_scale", "ankle_scale"):
        val = getattr(params, attr, 0.0)
        if abs(val) >= 0.02:
            z[attr] = val
    # Proportions
    for attr in ("shoulder_width", "sleeve_factor", "back_factor",
                 "torso_ratio", "leg_ratio"):
        val = getattr(params, attr, 0.0)
        if abs(val) >= 0.02:
            z[attr] = val
    # Fessiers (dérivé)
    if abs(params.buttock_scale) >= 0.02:
        z["buttock_scale"] = params.buttock_scale
    # Seins (femme)
    if abs(params.breast_size) >= 0.02:
        z["breast_size"] = params.breast_size
    # Largeurs/profondeurs (SAM)
    for attr in ("chest_breadth_scale", "chest_depth_scale",
                 "waist_breadth_scale", "waist_depth_scale",
                 "hip_breadth_scale", "buttock_depth_scale"):
        val = getattr(params, attr, 0.0)
        if abs(val) >= 0.02:
            z[attr] = val
    return z


def _build_measurements_dict(measurements: dict, features: dict | None) -> dict[str, float]:
    """
    Construit un dict unifié des mesures réelles du client,
    en merging measurements et features (pour les largeurs/profondeurs SAM).
    """
    m = dict(measurements)
    if features:
        for key in ("chestbreadth", "chestdepth", "waistbreadth", "waistdepth",
                     "hipbreadth", "buttockdepth"):
            if key in features and features[key] is not None:
                m[key] = features[key]
    return m


def compute_avatar_morphology(measurement: Measurement) -> dict | None:
    """
    Renvoie `{"gender", "height_cm", "reference_height_cm", "weights"}` à
    partir d'une mesure, ou None si la mesure n'a pas de données.

    `weights` est directement consommable côté mobile : chaque clé est le nom
    exact d'un morph target du GLB de base (voir `targetNames` dans le
    fichier), la valeur son influence dans [0, 1]. `reference_height_cm`
    n'est PAS la hauteur du maillage neutre : c'est une estimation de sa
    hauteur une fois `weights` appliqué (voir
    target_map.estimate_reference_height_cm) — le mobile doit s'en servir
    comme diviseur pour sa mise à l'échelle, jamais de la constante neutre
    directement, sous peine de rendre un avatar de quelques cm trop grand ou
    trop petit selon sa morphologie.
    """
    if not measurement.data:
        return None
    measurements = dict(measurement.data)
    if measurement.height_cm:
        measurements["height_total"] = measurement.height_cm
    if measurement.weight_kg:
        measurements["weight_kg"] = measurement.weight_kg

    features = getattr(measurement, "features", None) or None
    params = measurements_to_avatar_params(measurements, measurement.gender, features=features)

    is_female = (measurement.gender or "").lower().startswith("f")
    gender_str = "female" if is_female else "male"

    # Base TOUJOURS calculée en premier : c'est la seule fonction qui couvre
    # l'intégralité des cibles (directes, composites tronc, corpulence,
    # musculature, poitrine) avec les noms réels du maillage — voir sa
    # docstring. L'optimisation par matrice de sensibilité, quand elle
    # réussit, ne fait qu'affiner un sous-ensemble de ces poids (les cibles
    # à correspondance directe avec une mesure en cm — pas les composites
    # ni les facteurs globaux), jamais les remplacer entièrement.
    weights = compute_target_weights(params)
    method = "fallback_z_score"

    sensitivity = load_sensitivity(gender_str)
    if sensitivity is not None:
        z_scores = _build_z_scores(params)
        real_measurements = _build_measurements_dict(measurements, features)
        opt_measurements = {k: v for k, v in real_measurements.items()
                            if k in _OPTIMIZATION_MEASURES}

        if len(opt_measurements) >= 3 and len(z_scores) >= 1:
            logger.info("Optimisation par matrice de sensibilité (%s, %d mesures, %d cibles)",
                        gender_str, len(opt_measurements), len(z_scores))
            optimized = optimize_weights(opt_measurements, z_scores, sensitivity)
            if optimized:
                weights = {**weights, **optimized}
                method = "sensitivity_optimization"
            else:
                logger.info("Optimisation sans résultat — repli sur compute_target_weights")
        else:
            logger.info("Pas assez de données pour optimiser (%d mesures, %d cibles) — repli",
                        len(opt_measurements), len(z_scores))

        # Affinage itératif par mesure réelle du maillage généré (mesh_io +
        # mesh_measure, pur numpy, sans Blender) : contrairement à
        # l'optimisation ci-dessus, qui corrige contre une PRÉDICTION de la
        # matrice de sensibilité, cette étape vérifie et corrige contre le
        # maillage effectivement déformé — jamais fait jusqu'ici (voir
        # BRIEF_MODELE_CORPOREL_AVATAR.md §6). Best-effort : un échec ici
        # ne doit jamais empêcher l'envoi des poids déjà calculés au-dessus.
        try:
            from .refine_weights import refine_weights
            target_tours = {k: real_measurements[k] for k in ("chest", "waist", "hips", "neck")
                             if k in real_measurements}
            if target_tours:
                weights, refine_report = refine_weights(weights, gender_str, target_tours, sensitivity)
                if refine_report:
                    method = f"{method}+affinage_maillage"
        except Exception:
            logger.exception(
                "Affinage itératif par mesure du maillage en erreur — poids conservés tels quels"
            )

    return {
        "gender": gender_str,
        "height_cm": params.height_cm,
        "reference_height_cm": estimate_reference_height_cm(params, NEUTRAL_HEIGHT_CM),
        "weights": weights,
        "method": method,
    }
