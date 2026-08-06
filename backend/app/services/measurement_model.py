"""
Chargement et inférence du modèle de mensurations.

Le backend fonctionne **sans** modèle : tant qu'aucun artefact n'est déposé, il
retombe sur l'estimation heuristique de `mock_ai`. Déposer les fichiers
`.joblib` dans `app/ml/models/` suffit à basculer sur l'inférence réelle, sans
changement de code ni redéploiement de schéma.

Artefacts attendus (produits par ml/notebooks/01_mensurations_gradient_boosting.ipynb) :

    app/ml/models/surmezur_measurements_male_v2.joblib
    app/ml/models/surmezur_measurements_female_v2.joblib

Chaque artefact est un dict joblib portant le modèle **et** son contrat
(`feature_names`, `target_labels`, unités, métriques). L'ordre des variables
vient du contrat, jamais d'une liste codée en dur ici : c'est ce qui empêche
un réentraînement aux colonnes réordonnées de produire des prédictions
silencieusement fausses.

Un artefact marqué `engineered: True` attend, en plus des 12 variables de
base, 10 variables dérivées (IMC, rapports, périmètres d'ellipse) construites
par `_engineer` — voir cette fonction pour la contrainte de synchronisation
avec le script d'entraînement.
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).resolve().parents[1] / "ml" / "models"
# v2 : entraîné avec augmentation de bruit, donc bien plus tolérant aux
# imprécisions de MediaPipe/SAM. Mesuré sur photo réelle (session du 06/08,
# homme 185 cm / 84,8 kg) : erreur moyenne 6,64 cm contre 9,68 cm en v1, et
# l'erreur imputable à l'extraction tombe sous le centimètre sur la taille et
# les hanches (contre +11 cm en v1).
MODEL_VERSION = "v2"

# Bornes de garde : au-delà, on considère l'entrée aberrante et on refuse de
# prédire plutôt que de renvoyer une mensuration fantaisiste.
INPUT_BOUNDS_CM: dict[str, tuple[float, float]] = {
    "stature_m": (120.0, 220.0),
    "biacromialbreadth": (25.0, 60.0),
    "bideltoidbreadth": (30.0, 75.0),
    "hipbreadth": (20.0, 55.0),
    "sittingheight": (60.0, 120.0),
    "crotchheight": (55.0, 115.0),
    "chestbreadth": (18.0, 45.0),
    "chestdepth": (14.0, 42.0),
    "waistbreadth": (18.0, 55.0),
    "waistdepth": (12.0, 45.0),
    "buttockdepth": (14.0, 42.0),
}
WEIGHT_BOUNDS_KG = (35.0, 200.0)

_cache: dict[str, Any] = {}
_scanned = False


def model_path(sex: str, version: str = MODEL_VERSION) -> Path:
    return MODELS_DIR / f"surmezur_measurements_{sex}_{version}.joblib"


def _ellipse_perimeter(breadth: float, depth: float) -> float:
    """Approximation de Ramanujan du périmètre d'une ellipse."""
    a, b = breadth / 2.0, depth / 2.0
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def _engineer(f: dict[str, float]) -> dict[str, float]:
    """
    Ajoute les 10 variables dérivées attendues par un artefact `engineered`.

    DOIT rester identique à `engineer()` dans ml/scripts/compare_v1_v2.py (et à
    la cellule §6 du notebook 02) : ces variables ont été calculées ainsi
    pendant l'entraînement, et une formule qui divergerait ici produirait des
    prédictions fausses sans lever la moindre erreur — le modèle recevrait des
    nombres du bon type, dans le bon ordre, simplement faux.
    """
    out = dict(f)
    h_m = f["stature_m"] / 100.0
    out["bmi"] = f["weight_kg"] / (h_m ** 2)
    out["weight_over_height"] = f["weight_kg"] / f["stature_m"]
    out["waist_to_hip"] = f["waistbreadth"] / f["hipbreadth"]
    out["chest_to_waist"] = f["chestbreadth"] / f["waistbreadth"]
    out["shoulder_to_hip"] = f["biacromialbreadth"] / f["hipbreadth"]
    out["torso_ratio"] = f["sittingheight"] / f["stature_m"]
    out["leg_ratio"] = f["crotchheight"] / f["stature_m"]
    out["chest_ellipse"] = _ellipse_perimeter(f["chestbreadth"], f["chestdepth"])
    out["waist_ellipse"] = _ellipse_perimeter(f["waistbreadth"], f["waistdepth"])
    out["hip_ellipse"] = _ellipse_perimeter(f["hipbreadth"], f["buttockdepth"])
    return out


def _load(sex: str) -> Any | None:
    """Charge (et met en cache) l'artefact d'un sexe, ou None s'il est absent."""
    if sex in _cache:
        return _cache[sex]

    path = model_path(sex)
    if not path.exists():
        _cache[sex] = None
        return None

    try:
        import joblib  # importé tardivement : inutile tant qu'aucun modèle n'est déposé
    except ImportError:
        logger.warning("joblib absent — inférence ML désactivée, repli heuristique")
        _cache[sex] = None
        return None

    try:
        bundle = joblib.load(path)
        required = {"model", "feature_names", "target_labels"}
        missing = required - set(bundle)
        if missing:
            logger.error("Artefact %s incomplet, clés manquantes: %s", path.name, missing)
            _cache[sex] = None
            return None
        logger.info(
            "Modèle chargé: %s (variante %s, MAE moy. %.2f cm)",
            path.name,
            bundle.get("variant", "?"),
            bundle.get("metrics", {}).get("mae_cm_mean", float("nan")),
        )
        _cache[sex] = bundle
    except Exception:  # artefact corrompu ou incompatible
        logger.exception("Échec du chargement de %s — repli heuristique", path.name)
        _cache[sex] = None

    return _cache[sex]


def is_available(sex: str) -> bool:
    return _load(_normalise_sex(sex)) is not None


def available_models() -> dict[str, bool]:
    return {sex: _load(sex) is not None for sex in ("male", "female")}


def _normalise_sex(sex: str | None) -> str:
    return "male" if (sex or "").lower().startswith("m") else "female"


def _validate(features: dict[str, float]) -> str | None:
    """Renvoie un message d'erreur si une entrée est hors bornes, sinon None."""
    for name, value in features.items():
        if name == "weight_kg":
            lo, hi = WEIGHT_BOUNDS_KG
        elif name in INPUT_BOUNDS_CM:
            lo, hi = INPUT_BOUNDS_CM[name]
        else:
            continue
        if value is None or not (lo <= float(value) <= hi):
            return f"{name}={value} hors de la plage plausible [{lo}, {hi}]"
    return None


def predict_circumferences(sex: str, features: dict[str, float]) -> dict[str, float] | None:
    """
    Prédit les 8 tours à partir des entrées MediaPipe/SAM.

    `features` utilise les noms de colonnes du contrat (stature_m, weight_kg,
    biacromialbreadth, ...), en cm sauf le poids en kg.

    Renvoie None si le modèle est absent ou l'entrée invalide — l'appelant
    retombe alors sur l'heuristique.
    """
    bundle = _load(_normalise_sex(sex))
    if bundle is None:
        return None

    problem = _validate(features)
    if problem:
        logger.warning("Entrée rejetée par la garde de plausibilité: %s", problem)
        return None

    base_names: list[str] = bundle["feature_names"]
    missing = [n for n in base_names if n not in features]
    if missing:
        logger.warning("Entrées manquantes pour le modèle %s: %s", bundle.get("variant"), missing)
        return None

    # Un artefact `engineered` consomme les 22 colonnes dérivées, pas les 12
    # de base : c'est son propre contrat (`engineered_names`) qui fixe la liste
    # et l'ordre, jamais une constante locale.
    if bundle.get("engineered"):
        try:
            enriched = _engineer({n: float(features[n]) for n in base_names})
        except (KeyError, ZeroDivisionError, ValueError):
            logger.exception("Échec de construction des variables dérivées")
            return None
        names = bundle.get("engineered_names") or base_names
        absent = [n for n in names if n not in enriched]
        if absent:
            logger.error(
                "Variables dérivées manquantes pour %s: %s — _engineer a divergé "
                "du script d'entraînement",
                bundle.get("variant"), absent,
            )
            return None
        values = [float(enriched[n]) for n in names]
    else:
        # L'ordre vient du contrat de l'artefact, pas d'une constante locale.
        names = base_names
        values = [float(features[n]) for n in names]
    try:
        # Le modèle a été entraîné sur un DataFrame : lui repasser des colonnes
        # nommées fait valider les noms par sklearn au lieu de se fier
        # silencieusement à l'ordre positionnel.
        try:
            import pandas as pd

            row = pd.DataFrame([values], columns=names)
        except ImportError:
            row = [values]  # repli positionnel : l'ordre reste garanti par le contrat

        prediction = bundle["model"].predict(row)[0]
    except Exception:
        logger.exception("Échec de l'inférence — repli heuristique")
        return None

    return {
        label: round(float(value), 1)
        for label, value in zip(bundle["target_labels"], prediction)
    }


def model_info(sex: str) -> dict[str, Any] | None:
    """Métadonnées de l'artefact, pour un endpoint de diagnostic."""
    bundle = _load(_normalise_sex(sex))
    if bundle is None:
        return None
    return {
        "sex": bundle.get("sex"),
        "variant": bundle.get("variant"),
        "model_version": bundle.get("model_version"),
        "feature_names": bundle.get("feature_names"),
        "target_labels": bundle.get("target_labels"),
        "metrics": bundle.get("metrics"),
        "trained_at": bundle.get("trained_at"),
        "sklearn_version": bundle.get("sklearn_version"),
    }
