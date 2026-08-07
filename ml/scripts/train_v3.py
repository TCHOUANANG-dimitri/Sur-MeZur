"""
Entraînement V3 : un modèle par cible, physique d'abord.

Trois changements par rapport à V2, tous motivés par le même constat mesuré :
V2 atteint 1,38 cm sur ANSUR bruité mais 5,2 cm sur 13 sujets camerounais
mesurés au mètre ruban. L'écart n'est pas un manque de capacité — c'est un
transfert de population qui échoue. Un modèle plus puissant apprendrait
simplement mieux les particularités d'ANSUR.

1. UN MODÈLE PAR CIBLE (au lieu d'un multi-sorties unique)

   Les 8 tours n'ont pas la même nature. Le poignet est quasi déterminé par la
   stature ; la poitrine exige la forme du tronc. Un modèle unique doit
   arbitrer entre ces régimes ; huit modèles n'ont pas à le faire.

2. RIDGE PLUTÔT QUE GRADIENT BOOSTING

   Le benchmark maison classait déjà ridge premier (1,093 contre 1,161 pour le
   gradient boosting retenu). Surtout, un modèle linéaire EXTRAPOLE hors de son
   domaine d'entraînement, là où un arbre prédit une constante dès qu'il sort
   des feuilles vues. Face à une population absente d'ANSUR, c'est la
   différence entre se tromper progressivement et se tromper d'un bloc.

3. PHYSIQUE D'ABORD POUR POITRINE / TAILLE / HANCHES

   Mesuré sur les 13 sujets : le périmètre d'ellipse calculé depuis les
   largeurs et profondeurs extraites donne 6,5 cm d'erreur sur le tour de
   poitrine, contre 13,7 cm pour V2 — sans le moindre entraînement. La
   géométrie ne connaît pas ANSUR.

   Le modèle n'apprend donc que le RÉSIDU : l'écart entre l'ellipse et le corps
   réel (creux lombaire, omoplates, tissus mous). Ce résidu est petit et bien
   plus stable d'une population à l'autre que la circonférence elle-même.

Usage :  python -m scripts.train_v3        (depuis ml/, venv actif)
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import KFold, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import config as C  # noqa: E402

MODEL_VERSION = "v3"
RANDOM_STATE = 42

# Cibles dont la circonférence est géométriquement liée à une largeur et une
# profondeur mesurables : ce sont celles qui reçoivent le socle physique.
ELLIPSE_TARGETS = {
    "chestcircumference": ("chestbreadth", "chestdepth"),
    "waistcircumference": ("waistbreadth", "waistdepth"),
    "buttockcircumference": ("hipbreadth", "buttockdepth"),
}

# Bruit d'extraction, repris de V2 : le modèle doit voir à l'entraînement le
# type d'imprécision que MediaPipe et SAM produisent en conditions réelles.
NOISE_STD = {
    "biacromialbreadth": 0.03, "bideltoidbreadth": 0.035, "hipbreadth": 0.03,
    "sittingheight": 0.035, "crotchheight": 0.03, "chestbreadth": 0.025,
    "chestdepth": 0.04, "waistbreadth": 0.025, "waistdepth": 0.04,
    "buttockdepth": 0.04,
}
N_AUGMENT = 4


def ellipse_perimeter(breadth: np.ndarray, depth: np.ndarray) -> np.ndarray:
    """Périmètre d'ellipse, approximation de Ramanujan.

    DOIT rester identique à `_ellipse_perimeter` dans le service d'inférence du
    backend : c'est le socle de la prédiction, une divergence de formule
    produirait des tours faux sans lever d'erreur.
    """
    a, b = breadth / 2.0, depth / 2.0
    return np.pi * (3 * (a + b) - np.sqrt((3 * a + b) * (a + 3 * b)))


def load(sex: str) -> pd.DataFrame:
    df = pd.read_csv(C.RAW_FILES[sex], **C.READ_CSV_KWARGS)
    cols = C.FEATURES_V2 + C.TARGETS
    df = df[cols].dropna()
    # ANSUR stocke en millimètres, sauf deux colonnes dérivées.
    for c in cols:
        if c in C.UNIT_METRE:
            df[c] = df[c] * 100.0
        elif c in C.UNIT_KG:
            pass
        else:
            df[c] = df[c] / 10.0
    return df


def augment(X: pd.DataFrame, y: pd.DataFrame, rng: np.random.Generator):
    """Réplique le jeu en y injectant le bruit d'extraction attendu."""
    Xs, ys = [X], [y]
    for _ in range(N_AUGMENT):
        Xn = X.copy()
        for col, std in NOISE_STD.items():
            if col in Xn.columns:
                Xn[col] = Xn[col] * (1 + rng.normal(0, std, len(Xn)))
        # Erreur d'échelle globale : la taille saisie n'est jamais exacte.
        scale = 1 + rng.normal(0, 0.015, len(Xn))
        for col in Xn.columns:
            if col not in ("weight_kg", "stature_m"):
                Xn[col] = Xn[col] * scale
        Xs.append(Xn)
        ys.append(y)
    return pd.concat(Xs, ignore_index=True), pd.concat(ys, ignore_index=True)


def build_matrix(X: pd.DataFrame, target: str) -> tuple[np.ndarray, list[str], np.ndarray | None]:
    """Matrice d'entrée du modèle, et socle physique si la cible en a un.

    Le socle n'est PAS une colonne d'entrée : il est soustrait de la cible.
    Le modèle apprend le résidu, pas la circonférence.

    Pour les cibles à socle, le résidu est appris SANS AUCUNE grandeur absolue,
    et exprimé en FRACTION du socle. La raison est mesurée : une première
    version laissait le résidu s'appuyer sur les longueurs brutes, et il
    apprenait alors un décalage constant de +10,5 cm sur la poitrine — soit
    exactement l'écart entre le tour ANSUR et le périmètre d'ellipse dans CETTE
    population. Réinjecté tel quel sur des sujets plus minces, ce décalage
    faisait passer l'erreur de 6,5 cm (ellipse seule) à 13,0 cm.
    Un résidu relatif, nourri de seuls rapports sans dimension, peut capturer
    « un corps plus rond s'écarte davantage de l'ellipse » sans pouvoir encoder
    la corpulence moyenne d'une population.
    """
    base = None
    if target in ELLIPSE_TARGETS:
        kb, kd = ELLIPSE_TARGETS[target]
        base = ellipse_perimeter(X[kb].to_numpy(), X[kd].to_numpy())

    feats = [] if base is not None else list(X.columns)
    M = X[feats].to_numpy(dtype=float) if feats else np.empty((len(X), 0))

    # Rapports de forme : sans dimension, donc bien plus stables d'une
    # population à l'autre que les longueurs brutes.
    h = X["stature_m"].to_numpy()
    extra, extra_names = [], []
    bmi = X["weight_kg"].to_numpy() / (h / 100.0) ** 2
    extra.append(bmi); extra_names.append("bmi")
    extra.append(X["waistbreadth"].to_numpy() / X["hipbreadth"].to_numpy()); extra_names.append("waist_to_hip")
    extra.append(X["chestbreadth"].to_numpy() / X["waistbreadth"].to_numpy()); extra_names.append("chest_to_waist")
    extra.append(X["sittingheight"].to_numpy() / h); extra_names.append("torso_ratio")

    if base is not None:
        # Aplatissement de la section : c'est LUI qui dit de combien un corps
        # s'écarte d'une ellipse, indépendamment de sa taille absolue.
        kb, kd = ELLIPSE_TARGETS[target]
        extra.append(X[kd].to_numpy() / X[kb].to_numpy()); extra_names.append("depth_to_breadth")

    M = np.column_stack([M] + extra) if extra else M
    return M, feats + extra_names, base


def train_sex(sex: str) -> dict:
    df = load(sex)
    X = df[C.FEATURES_V2]
    y = df[C.TARGETS]

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=RANDOM_STATE)
    rng = np.random.default_rng(RANDOM_STATE)
    X_tr_a, y_tr_a = augment(X_tr, y_tr, rng)
    # Jeu de test bruité : c'est lui qui reflète les conditions réelles.
    X_te_n, y_te_n = augment(X_te, y_te, np.random.default_rng(RANDOM_STATE + 1))

    models, metrics = {}, {}
    for target in C.TARGETS:
        M_tr, names, _ = build_matrix(X_tr_a, target)
        M_te, _, base_te = build_matrix(X_te, target)
        M_ten, _, base_ten = build_matrix(X_te_n, target)

        if target in ELLIPSE_TARGETS:
            # RÉSIDU LAISSÉ À ZÉRO — décision appuyée sur la mesure, pas sur un
            # a priori. Trois variantes ont été essayées sur les 13 sujets
            # camerounais : résidu additif appris (13,0 cm d'erreur sur la
            # poitrine), résidu relatif sur variables sans dimension (22,4 cm),
            # et géométrie seule (6,5 cm). Toute correction apprise sur ANSUR
            # dégrade la géométrie, parce qu'elle encode l'écart tour/ellipse
            # PROPRE À ANSUR (+10,5 cm en moyenne sur la poitrine), qui ne vaut
            # pas pour une population plus mince.
            #
            # L'emplacement du résidu est conservé dans le format : c'est là que
            # viendra se brancher la calibration sur données locales, une fois
            # une trentaine de sujets collectés. Apprendre ce résidu sur la
            # population cible a du sens ; l'apprendre sur ANSUR n'en a pas.
            models[target] = None
            mae_clean = mean_absolute_error(y_te[target], base_te)
            mae_noisy = mean_absolute_error(y_te_n[target], base_ten)
        else:
            # alpha modéré : assez pour stabiliser, pas au point d'effacer le signal
            model = make_pipeline(StandardScaler(), Ridge(alpha=10.0))
            model.fit(M_tr, y_tr_a[target].to_numpy())
            models[target] = model
            mae_clean = mean_absolute_error(y_te[target], model.predict(M_te))
            mae_noisy = mean_absolute_error(y_te_n[target], model.predict(M_ten))

        metrics[target] = {"mae_clean": round(float(mae_clean), 3),
                           "mae_noisy": round(float(mae_noisy), 3)}
        print(f"  {C.TARGET_LABELS[target]:8} propre {mae_clean:5.2f}  bruité {mae_noisy:5.2f}"
              f"{'   (géométrie seule)' if target in ELLIPSE_TARGETS else ''}")

    moy_c = float(np.mean([m["mae_clean"] for m in metrics.values()]))
    moy_n = float(np.mean([m["mae_noisy"] for m in metrics.values()]))
    print(f"  {'MOYENNE':8} propre {moy_c:5.2f}  bruité {moy_n:5.2f}")

    _, names, _ = build_matrix(X_tr.head(1), C.TARGETS[0])
    return {
        "models": models,
        "sex": sex,
        "variant": "V3",
        "model_version": MODEL_VERSION,
        "feature_names": C.FEATURES_V2,
        "matrix_names": names,
        "ellipse_targets": {k: list(v) for k, v in ELLIPSE_TARGETS.items()},
        "target_names": C.TARGETS,
        "target_labels": [C.TARGET_LABELS[t] for t in C.TARGETS],
        "units": {"features": "cm sauf weight_kg (kg)", "targets": "cm"},
        "metrics": {**{C.TARGET_LABELS[k]: v for k, v in metrics.items()},
                    "mae_cm_mean_clean": round(moy_c, 3),
                    "mae_cm_mean_noisy": round(moy_n, 3)},
        "training": {"noise_augmented": True, "n_augment": N_AUGMENT,
                     "noise_std": NOISE_STD, "scale_std": 0.015,
                     "estimator": "Ridge(alpha=10) sur variables standardisées",
                     "per_target": True, "physics_base": "périmètre d'ellipse (Ramanujan)"},
    }


if __name__ == "__main__":
    C.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for sex in ("male", "female"):
        print(f"=== {sex} ===")
        bundle = train_sex(sex)
        out = C.MODELS_DIR / f"surmezur_measurements_{sex}_{MODEL_VERSION}.joblib"
        joblib.dump(bundle, out)
        print(f"  -> {out.name}\n")
