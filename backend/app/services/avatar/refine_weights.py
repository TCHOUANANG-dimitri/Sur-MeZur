"""
Correction itérative des poids de morph targets par mesure réelle du
maillage généré — ferme la boucle laissée ouverte par optimize_weights.py.

`optimize_weights.py` résout un petit problème d'optimisation contre une
PRÉDICTION (la matrice de sensibilité pré-calibrée, interpolée linéairement
entre 5 niveaux de poids) — jamais vérifiée contre le maillage réellement
généré pour un client donné (voir BRIEF_MODELE_CORPOREL_AVATAR.md §6 :
"Aucun avatar n'a encore été... mesuré métriquement").

Ce module génère le maillage réel (mesh_io), le mesure (mesh_measure) sur
les 4 tours de tronc calibrés (chest/waist/hips/neck), et corrige les poids
si l'écart à la mesure du client dépasse une tolérance — par une petite
itération dont la PENTE (cm par unité de poids) vient de la matrice de
sensibilité déjà calibrée : celle-ci sert ici seulement de bonne direction
de correction, plus jamais de valeur de sortie non vérifiée.

Coût mesuré : quelques dizaines de ms pour 4 itérations sur les 4 tours
(mesure pure numpy, aucun Blender, aucun réseau de neurones — voir
mesh_measure.py). Compatible avec la contrainte CPU serveur sans GPU
documentée dans le brief (§2).
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Correspondance mesure de tour -> (paramètre interne, racine de cible glTF).
# Doit rester synchronisé avec target_map.py::MEASURE_TARGETS et
# calibrate_sensitivity.py::OUTPUT_NAMES — un nom qui diverge d'un côté
# casse silencieusement la correspondance (même piège déjà documenté à
# plusieurs endroits de ce module).
_PARAM_BY_MEASURE = {
    "chest": "chest_scale",
    "waist": "waist_scale",
    "hips": "hip_scale",
    "neck": "neck_scale",
}

_TARGET_ROOT_BY_MEASURE = {
    "chest": "measure-bust-circ",
    "waist": "measure-waist-circ",
    "hips": "measure-hips-circ",
    "neck": "measure-neck-circ",
}

_MIN_WEIGHT = 0.02  # seuil de bruit, identique à optimize_weights.py


def _signed_weight(weights: dict[str, float], root: str) -> float:
    incr = weights.get(f"{root}-incr")
    if incr:
        return incr
    decr = weights.get(f"{root}-decr")
    if decr:
        return -decr
    return 0.0


def _set_signed_weight(weights: dict[str, float], root: str, signed: float) -> None:
    weights.pop(f"{root}-incr", None)
    weights.pop(f"{root}-decr", None)
    if abs(signed) < _MIN_WEIGHT:
        return
    key = f"{root}-incr" if signed > 0 else f"{root}-decr"
    weights[key] = min(abs(signed), 1.0)


def _slope_cm_per_weight(sensitivity_data: dict, param: str, circ_key: str) -> float | None:
    """
    Pente approximative (cm par unité de poids, 0→1) pour `param`, estimée
    depuis la matrice de sensibilité déjà calibrée (sens "-incr" uniquement,
    voir calibrate_sensitivity.py). Sert de direction/magnitude de
    correction, pas de valeur de sortie — la valeur de sortie vient
    toujours de la mesure réelle du maillage (mesh_measure), jamais de
    cette pente seule.
    """
    axis_data = sensitivity_data.get("sensitivity", {}).get(param, {})
    neutral = sensitivity_data.get("neutral_measurements", {})
    w1 = axis_data.get("w1.0", {})
    if not w1 or circ_key not in neutral or circ_key not in w1:
        return None
    delta = w1[circ_key] - neutral[circ_key]
    if abs(delta) < 0.5:
        # Cible quasi insensible à cette mesure sur l'échantillon calibré —
        # pente trop peu fiable pour corriger dessus (risque de step énorme
        # pour un résidu minuscule).
        return None
    return delta


def refine_weights(
    weights: dict[str, float],
    gender: str,
    target_measurements: dict[str, float],
    sensitivity_data: dict | None,
    max_iter: int = 4,
    tol_cm: float = 0.4,
    damping: float = 0.7,
) -> tuple[dict[str, float], dict[str, dict]]:
    """
    Corrige `weights` en place (et les retourne) pour que le maillage réel,
    une fois mesuré, se rapproche de `target_measurements` (dict avec
    clés parmi "chest"/"waist"/"hips"/"neck", valeurs en cm).

    Args:
        weights: poids déjà calculés (compute_target_weights +
                 éventuellement optimize_weights), modifiés en place.
        gender: "male" ou "female" — détermine quel maillage de base charger.
        target_measurements: mesures réelles du client pour les tours calibrés.
        sensitivity_data: matrice chargée (load_sensitivity(gender)) — sert
                          uniquement à estimer la pente de correction ; si
                          None, l'affinage est un no-op (retourne weights
                          inchangés, report vide).

    Returns:
        (weights, report) — report: {mesure: {cible, mesure_avant,
        mesure_apres, iterations}}, vide si l'affinage n'a pas pu tourner
        (maillage introuvable, pas de mesures calibrées disponibles...).
        Ne lève jamais d'exception — un échec ici ne doit jamais empêcher
        l'envoi des poids déjà calculés par ailleurs.
    """
    if sensitivity_data is None:
        return weights, {}

    from . import mesh_io, mesh_measure

    try:
        base = mesh_io.load_base_mesh(gender)
    except Exception:
        logger.exception("Maillage de base introuvable pour l'affinage itératif — poids inchangés")
        return weights, {}

    neutral = sensitivity_data.get("neutral_measurements")
    relevant = {k: v for k, v in target_measurements.items() if k in _TARGET_ROOT_BY_MEASURE}
    if not relevant:
        return weights, {}

    measured_before: dict[str, float] = {}
    measured_after: dict[str, float] = {}
    iterations_used = 0

    for it in range(max_iter):
        iterations_used = it + 1
        verts = mesh_io.apply_weights(base, weights)
        measured = mesh_measure.measure_tours(verts, base.faces, neutral_measurements=neutral)
        if it == 0:
            measured_before = dict(measured)
        measured_after = dict(measured)

        max_residual = 0.0
        for measure_name, target_val in relevant.items():
            measured_val = measured.get(measure_name)
            if measured_val is None:
                continue
            residual = target_val - measured_val
            max_residual = max(max_residual, abs(residual))
            if abs(residual) <= tol_cm:
                continue

            param = _PARAM_BY_MEASURE[measure_name]
            root = _TARGET_ROOT_BY_MEASURE[measure_name]
            slope = _slope_cm_per_weight(sensitivity_data, param, measure_name)
            if slope is None:
                continue

            current_signed = _signed_weight(weights, root)
            new_signed = max(-1.0, min(1.0, current_signed + damping * residual / slope))
            _set_signed_weight(weights, root, new_signed)

        if max_residual <= tol_cm:
            break

    report = {
        name: {
            "cible": relevant[name],
            "mesure_avant": measured_before.get(name),
            "mesure_apres": measured_after.get(name),
            "iterations": iterations_used,
        }
        for name in relevant
    }
    logger.info("Affinage par mesure du maillage (%s, %d itération(s)) : %s",
                gender, iterations_used,
                {k: (round(v["mesure_avant"], 1) if v["mesure_avant"] is not None else None,
                     round(v["mesure_apres"], 1) if v["mesure_apres"] is not None else None,
                     round(v["cible"], 1))
                 for k, v in report.items()})
    return weights, report
