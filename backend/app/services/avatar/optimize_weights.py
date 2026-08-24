"""
Optimisation des poids de morph targets par client.

Remplace l'ancien mécanisme poids=|z| par un ajustement qui minimise
l'écart entre les mesures virtuelles du maillage (prédites par la matrice
de sensibilité) et les mesures réelles du client.

Ce module tourne côté serveur (Python pur, sans Blender), en millisecondes.
La matrice de sensibilité est pré-calibrée une fois (calibrate_sensitivity.py)
et embarquée en JSON statique.

Principe :
  La matrice S donne, pour chaque cible j et chaque mesure i,
  l'effet delta_ij(w) de la cible j à poids w sur la mesure i.

  Pour un client donné, on résout :
    min_w  Σ_i ( Σ_j delta_ij(w_j) + m_neutral_i - m_real_i )²
           + λ * Σ_j w_j²   (régularisation L2)
    sous contrainte : 0 ≤ w_j ≤ 1

  Le signe incr/decr est déterminé séparément (comme aujourd'hui) par
  le z-score, seul le dosage est optimisé.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

from .target_map import PARAM_TO_TARGET, BREAST_TARGET

logger = logging.getLogger(__name__)


def _target_name(param: str, sign: int) -> str | None:
    """
    Traduit un nom de paramètre interne (ex. "chest_scale") vers le nom de
    cible réel du maillage (ex. "measure-bust-circ-decr").

    Sans cette traduction, les poids produits ici ne correspondent à aucune
    clé de `mesh.morphTargetDictionary` côté mobile — l'échec est silencieux
    (voir Viewer3D.tsx::bakeMorphTargets, `if (!target) continue`), pas une
    erreur : chaque avatar rendrait alors le corps neutre, sans déformation,
    pour tout le monde. Retourne None si `param` n'a pas de cible directe
    connue (ex. une cible composite comme le tronc, jamais optimisée
    individuellement — voir PARAM_TO_TARGET).
    """
    if param == "breast_size":
        return f"{BREAST_TARGET[1]}-{'up' if sign > 0 else 'down'}"
    racine = PARAM_TO_TARGET.get(param)
    if racine is None:
        return None
    return f"{racine}-{'incr' if sign > 0 else 'decr'}"

# ---------------------------------------------------------------------------
# Chargement de la matrice de sensibilité
# ---------------------------------------------------------------------------

_SENSITIVITY_CACHE: dict | None = None
_SENSITIVITY_PATH: Path | None = None


def _find_sensitivity_file(gender: str) -> Path | None:
    """Cherche le fichier de calibration pour le sexe donné."""
    base = Path(__file__).resolve().parent
    candidates = [
        base / "sensitivity" / f"{gender}.json",
        base.parent / "avatar_store" / f"sensitivity_{gender}.json",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def load_sensitivity(gender: str) -> dict | None:
    """
    Charge la matrice de sensibilité pré-calibrée.

    Returns:
        dict avec keys "neutral_measurements", "sensitivity", "weight_levels"
        ou None si le fichier n'existe pas (fallback sur ancien mécanisme).
    """
    global _SENSITIVITY_CACHE, _SENSITIVITY_PATH

    path = _find_sensitivity_file(gender)
    if path is None:
        logger.warning("Matrice de sensibilité introuvable pour %s — fallback poids=|z|", gender)
        return None

    if _SENSITIVITY_CACHE is not None and _SENSITIVITY_PATH == path:
        return _SENSITIVITY_CACHE

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _SENSITIVITY_CACHE = data
        _SENSITIVITY_PATH = path
        logger.info("Matrice de sensibilité chargée : %s", path)
        return data
    except Exception:
        logger.exception("Erreur chargement matrice de sensibilité")
        return None


# ---------------------------------------------------------------------------
# Interpolation de la matrice de sensibilité
# ---------------------------------------------------------------------------

def _interpolate_sensitivity(sensitivity_data: dict, target_param: str,
                             weight: float) -> dict[str, float]:
    """
    Interpole linéairement l'effet d'une cible à un poids donné.

    La matrice stocke les mesures à poids 0.0, 0.25, 0.5, 0.75, 1.0.
    Cette fonction interpole linéairement entre ces niveaux.

    Returns:
        dict {measure_name: delta_cm} — différence par rapport au neutre
    """
    levels = sensitivity_data.get("weight_levels", [0.0, 0.25, 0.5, 0.75, 1.0])
    axis_data = sensitivity_data.get("sensitivity", {}).get(target_param, {})
    neutral = sensitivity_data.get("neutral_measurements", {})

    if not axis_data:
        return {}

    # Trouver les deux niveaux qui encadrent le poids demandé
    w = max(0.0, min(1.0, abs(weight)))
    idx_low = 0
    for i, lv in enumerate(levels):
        if lv <= w:
            idx_low = i
    idx_high = min(idx_low + 1, len(levels) - 1)

    if idx_low == idx_high:
        # Poids exact = un niveau calibré
        key = f"w{levels[idx_low]}"
        data_low = axis_data.get(key, {})
        return {k: data_low.get(k, neutral.get(k, 0)) - neutral.get(k, 0)
                for k in neutral}

    # Interpolation linéaire
    lv_low = levels[idx_low]
    lv_high = levels[idx_high]
    t = (w - lv_low) / (lv_high - lv_low) if lv_high > lv_low else 0.0

    key_low = f"w{lv_low}"
    key_high = f"w{lv_high}"
    data_low = axis_data.get(key_low, {})
    data_high = axis_data.get(key_high, {})

    result = {}
    for k in neutral:
        v_low = data_low.get(k, neutral.get(k, 0))
        v_high = data_high.get(k, neutral.get(k, 0))
        result[k] = v_low + t * (v_high - v_low) - neutral.get(k, 0)

    return result


def _build_sensitivity_matrix(sensitivity_data: dict,
                              active_targets: list[tuple[str, float]],
                              measure_names: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """
    Construit la matrice d'effet cumulé et le vecteur neutre.

    Args:
        sensitivity_data: matrice de calibration
        active_targets: liste de (nom_cible, signe) — le signe détermine
                        incr (+1) ou decr (-1)
        measure_names: noms des mesures à optimiser

    La matrice ne calibre empiriquement que le sens "-incr" (voir
    calibrate_sensitivity.py) ; pour signe=-1 (decr), l'effet est le miroir
    (même amplitude, signe opposé) de celui mesuré côté incr — approximation
    assumée, pas mesurée séparément.

    Returns:
        (S, m_neutral) où S[j,i] = effet de la cible j sur la mesure i,
        m_neutral[i] = mesure du maillage neutre
    """
    n_targets = len(active_targets)
    n_measures = len(measure_names)

    neutral = sensitivity_data.get("neutral_measurements", {})
    m_neutral = np.array([neutral.get(name, 0.0) for name in measure_names])

    # Construire la matrice S en évaluant l'effet de chaque cible à w=1.0
    S = np.zeros((n_targets, n_measures))
    for j, (target_name, sign) in enumerate(active_targets):
        deltas = _interpolate_sensitivity(sensitivity_data, target_name, 1.0)
        for i, name in enumerate(measure_names):
            S[j, i] = deltas.get(name, 0.0) * sign

    return S, m_neutral


# ---------------------------------------------------------------------------
# Optimisation
# ---------------------------------------------------------------------------

def optimize_weights(
    measurements_real: dict[str, float],
    z_scores: dict[str, float],
    sensitivity_data: dict,
    regularization: float = 0.1,
) -> dict[str, float]:
    """
    Résout pour les poids w qui minimisent l'écart entre mesures virtuelles
    et mesures réelles du client.

    Args:
        measurements_real: mesures réelles du client {nom: valeur_cm}
        z_scores: z-scores calculés (pour déterminer le signe incr/decr)
        sensitivity_data: matrice de calibration chargée
        regularization: poids de la régularisation L2 (λ)

    Returns:
        dict {nom_cible: poids} dans [0, 1], ou dict vide si insuffisant
    """
    # Déterminer les cibles actives (z-score != 0 et calibrée)
    active_targets = []
    for param, z in z_scores.items():
        if abs(z) < 0.02:
            continue
        # Vérifier que la cible existe dans la matrice
        if param in sensitivity_data.get("sensitivity", {}):
            sign = 1 if z > 0 else -1
            active_targets.append((param, sign))

    if not active_targets:
        logger.info("Aucune cible active — pas d'optimisation possible")
        return {}

    # Mesures à optimiser (intersection entre ce que le client a et ce qui est calibré)
    neutral = sensitivity_data.get("neutral_measurements", {})
    measure_names = [k for k in measurements_real if k in neutral]

    if len(measure_names) < 3:
        logger.info("Pas assez de mesures calibrées (%d) pour optimiser", len(measure_names))
        return {}

    # Vecteur des mesures réelles
    m_real = np.array([measurements_real[k] for k in measure_names])

    # Construire la matrice de sensibilité
    S, m_neutral = _build_sensitivity_matrix(sensitivity_data, active_targets, measure_names)

    # Optimisation L2 bornée
    n_targets = len(active_targets)
    w0 = np.array([abs(z_scores[t]) for t, _ in active_targets])
    w0 = np.clip(w0, 0.01, 0.99)  # éviter les bords exacts

    def objective(w):
        # Prédiction : mesures neutres + effets cumulés
        m_pred = m_neutral + S.T @ w
        # Erreur quadratique + régularisation
        error = np.sum((m_pred - m_real) ** 2)
        reg = regularization * np.sum(w ** 2)
        return error + reg

    bounds = [(0.0, 1.0)] * n_targets
    result = minimize(objective, w0, method="L-BFGS-B", bounds=bounds,
                      options={"maxiter": 100, "ftol": 1e-8})

    if not result.success:
        logger.warning("Optimisation non convergie : %s", result.message)

    # Construire le dictionnaire résultat — noms de cibles réels, pas les
    # noms de paramètres internes utilisés ci-dessus (voir _target_name).
    weights = {}
    for j, (param, sign) in enumerate(active_targets):
        w_j = float(result.x[j])
        if w_j < 0.02:
            continue  # seuil de bruit
        name = _target_name(param, sign)
        if name is None:
            logger.warning("Pas de cible connue pour le paramètre %s — ignoré", param)
            continue
        weights[name] = w_j

    # Erreur avant/après
    m_pred_before = m_neutral + S.T @ w0
    m_pred_after = m_neutral + S.T @ result.x
    err_before = float(np.sqrt(np.mean((m_pred_before - m_real) ** 2)))
    err_after = float(np.sqrt(np.mean((m_pred_after - m_real) ** 2)))
    logger.info("Optimisation : RMSE avant=%.1f cm, après=%.1f cm (%d cibles actives)",
                err_before, err_after, n_targets)

    return weights


# ---------------------------------------------------------------------------
# Fallback : ancien mécanisme poids=|z| (quand pas de matrice de calibration)
# ---------------------------------------------------------------------------

def fallback_weights(z_scores: dict[str, float]) -> dict[str, float]:
    """
    Ancien mécanisme poids=|z|, utilisé comme repli quand la matrice
    de sensibilité n'est pas disponible.

    Ne couvre que les cibles à correspondance directe (voir PARAM_TO_TARGET) —
    n'inclut PAS les cibles composites (torso-scale-horiz/depth) ni celles
    pilotées par un facteur global (corpulence, musculature). Pour un
    résultat complet, `morph_weights.py` utilise
    `target_map.compute_target_weights(params)` comme base, pas cette
    fonction — conservée pour compatibilité et pour les tests unitaires
    isolés de l'optimiseur.
    """
    weights = {}
    for param, z in z_scores.items():
        if abs(z) < 0.02:
            continue
        name = _target_name(param, 1 if z > 0 else -1)
        if name is None:
            continue
        weights[name] = abs(z)
    return weights
