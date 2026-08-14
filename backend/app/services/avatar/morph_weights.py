"""
Calcul des poids de morph targets à partir des mensurations — sans Blender.

Remplace l'ancien chemin (service.py -> blender_runner.run_blender, un
subprocess Blender par avatar, indisponible en production) par un calcul
Python pur, synchrone, de l'ordre de la milliseconde : les mêmes tables de
correspondance que generator.py (target_map.py) transforment les
mensurations en poids [0, 1] par nom de morph target. Le mobile applique
ensuite ces poids sur le maillage de base qu'il embarque déjà
(mobile/assets/avatar-base-{male,female}.glb, produits une fois par
export_base_mesh.py) — aucune génération par client, aucun fichier à
transférer, aucun risque de blocage a2wsgi/BackgroundTasks.
"""

from __future__ import annotations

from app.models.measurements import Measurement

from .body_params import measurements_to_avatar_params
from .target_map import compute_target_weights, estimate_reference_height_cm

NEUTRAL_HEIGHT_CM = 165.94  # doit rester identique à generator.py::BASE_HEIGHT_CM


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
    return {
        "gender": "female" if is_female else "male",
        "height_cm": params.height_cm,
        "reference_height_cm": estimate_reference_height_cm(params, NEUTRAL_HEIGHT_CM),
        "weights": compute_target_weights(params),
    }
