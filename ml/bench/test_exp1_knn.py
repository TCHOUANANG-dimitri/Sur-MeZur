#!/usr/bin/env python3
"""
EXPERIENCE 1: KNN Regression (non-linéaire, robuste avec peu de données)
=========================================================================
KNN ne fit pas de paramètres globaux, donc il est moins sujet au surapprentissage
que Ridge avec n=12. Teste k=2,3,4,5 avec LOO-CV.
"""
import json
import numpy as np
from pathlib import Path

BASE = Path(__file__).parent
RESULTS_FILE = BASE / "test_real_pipeline_results.json"
SUJETS_FILE = BASE / "sujets.json"

with open(RESULTS_FILE) as f:
    raw_results = json.load(f)
with open(SUJETS_FILE) as f:
    sujets_raw = json.load(f)

MEASURES_ORDER = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS_ORDER = ["shoulder", "sleeve_length", "inseam", "back_length"]
ALL_MEASURES = MEASURES_ORDER + LONGUEURS_ORDER

# Build data
subjects = []
sujets_map = {str(s["id"]): s for s in sujets_raw["sujets"]}
for d in raw_results["details_sujets"]:
    sid = str(d["id"])
    if sid not in sujets_map:
        continue
    s = sujets_map[sid]
    entry = {
        "id": d["id"], "gender": s["gender"],
        "height_cm": s["height_cm"], "weight_kg": s["weight_kg"],
        "features": d["features"], "mesures": {}
    }
    for i, m in enumerate(MEASURES_ORDER):
        entry["mesures"][m] = {"attendu": s["tours"][i], "calcule": d["mesures"][m]["calcule"]}
    for i, m in enumerate(LONGUEURS_ORDER):
        if m in d["mesures"]:
            entry["mesures"][m] = {"attendu": s["longueurs"][i], "calcule": d["mesures"][m]["calcule"]}
    subjects.append(entry)

subjects.sort(key=lambda x: x["id"])
N = len(subjects)
print(f"Sujets charges: {N}")

# Feature keys available from pipeline
PIPELINE_FEATURES = [
    "biacromialbreadth", "bideltoidbreadth", "hipbreadth", "sittingheight",
    "crotchheight", "chestbreadth", "waistbreadth", "chestdepth", "waistdepth",
    "buttockdepth", "stature_m", "weight_kg"
]

# Add derived features
for subj in subjects:
    f = subj["features"]
    subj["derived"] = {
        "bmi": subj["weight_kg"] / (subj["height_cm"] / 100.0) ** 2,
        "chest_ratio": f["chestbreadth"] / max(f["chestdepth"], 1),
        "waist_ratio": f["waistbreadth"] / max(f["waistdepth"], 1),
        "hip_ratio": f["hipbreadth"] / max(f["buttockdepth"], 1),
        "trunk_width_diff": f["chestbreadth"] - f["waistbreadth"],
        "trunk_depth_diff": f["chestdepth"] - f["waistdepth"],
        "height_weight_ratio": subj["height_cm"] / max(subj["weight_kg"], 1),
        "sitting_ratio": f["sittingheight"] / max(subj["height_cm"], 1),
        "crotch_ratio": f["crotchheight"] / max(subj["height_cm"], 1),
    }

ALL_FEATURES = PIPELINE_FEATURES + list(subjects[0]["derived"].keys())
BASIC_FEATURES = ["height_cm", "weight_kg", "biacromialbreadth", "hipbreadth",
                  "chestbreadth", "waistbreadth", "crotchheight"]

def get_valid_subjects(measure):
    return [s for s in subjects if measure in s["mesures"]]

def build_X(subs, feat_keys):
    X = []
    for s in subs:
        row = []
        for k in feat_keys:
            if k in s["features"]:
                row.append(s["features"][k])
            elif k in s["derived"]:
                row.append(s["derived"][k])
            else:
                row.append(0.0)
        X.append(row)
    return np.array(X)

def knn_predict(X_train, y_train, x_test, k=3, weighted=False):
    """KNN regression with optional distance weighting"""
    dists = np.sqrt(np.sum((X_train - x_test) ** 2, axis=1))
    idx = np.argsort(dists)[:k]
    if weighted:
        weights = 1.0 / (dists[idx] + 1e-10)
        return np.average(y_train[idx], weights=weights)
    return np.mean(y_train[idx])


def loo_knn(measure, feat_keys, k=3, weighted=False, target="error"):
    """
    LOO-CV for KNN.
    target="error": predict error = true - predicted, then correct = predicted + error
    target="direct": predict true measurement directly from features
    """
    valid = get_valid_subjects(measure)
    if len(valid) < k + 2:
        return 99.0
    X = build_X(valid, feat_keys)
    y_pred = np.array([s["mesures"][measure]["calcule"] for s in valid])
    y_true = np.array([s["mesures"][measure]["attendu"] for s in valid])

    errors = []
    for i in range(len(valid)):
        mask = np.arange(len(valid)) != i
        X_train, y_train_pred = X[mask], y_pred[mask]
        y_train_true = y_true[mask]

        if target == "error":
            y_correction = y_train_true - y_train_pred
            correction = knn_predict(X_train, y_correction, X[i], k, weighted)
            corrected = y_pred[i] + correction
        else:
            corrected = knn_predict(X_train, y_train_true, X[i], k, weighted)

        errors.append(abs(corrected - y_true[i]))
    return np.mean(errors)


# ====================================================================
print()
print("=" * 80)
print("EXPERIENCE 1: KNN REGRESSION (non-lineaire)")
print("=" * 80)
print()
print("Teste KNN avec k=2,3,4,5, weighted et non-weighted")
print("Deux strategies: corriger l'erreur vs predire directement")
print()

print(f"  {'Mesure':20s}  {'Brut':>6s}", end="")
for k in [2, 3, 4, 5]:
    print(f"  {'k=%d_err' % k:>9s}  {'k=%d_dir' % k:>9s}  {'k=%dW_err' % k:>9s}  {'k=%dW_dir' % k:>9s}", end="")
print()
print(f"  {'-'*20}  {'-'*6}", end="")
for _ in range(4):
    print(f"  {'-'*9}  {'-'*9}  {'-'*9}  {'-'*9}", end="")
print()

knn_results = {}
for m in ALL_MEASURES:
    valid = get_valid_subjects(m)
    if len(valid) < 4:
        print(f"  {m:20s}: skip (n={len(valid)})")
        continue

    errors_raw = [abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid]
    mae_raw = np.mean(errors_raw)
    knn_results[m] = {"raw": mae_raw}

    print(f"  {m:20s}  {mae_raw:6.2f}", end="")
    best = mae_raw
    for k in [2, 3, 4, 5]:
        for feat_set_name, feat_set in [("pipeline", PIPELINE_FEATURES), ("basic", BASIC_FEATURES)]:
            for weighted in [False, True]:
                mae = loo_knn(m, feat_set if feat_set_name == "pipeline" else BASIC_FEATURES, k, weighted)
                tag = f"k{k}{'W' if weighted else ''}"
                if mae < best:
                    best = mae
                    best_tag = tag
                    best_feats = feat_set_name
                suffix = "e" if "err" in "" else "d"  # just for display
                print(f"  {mae:9.2f}", end="")
        print(f"  {99.0:9.2f}", end="")  # placeholder for direct
    print(f"  BEST={best:.2f}")

# ====================================================================
print()
print("=" * 80)
print("EXPERIENCE 1B: KNN OPTIMISE - meilleur k, meilleure feat, meilleur target")
print("=" * 80)
print()

best_knn = {}
for m in ALL_MEASURES:
    valid = get_valid_subjects(m)
    if len(valid) < 4:
        continue
    mae_raw = np.mean([abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid])

    best_mae = mae_raw
    best_config = "brut"

    for feat_name, feats in [("basic", BASIC_FEATURES), ("pipeline", PIPELINE_FEATURES)]:
        for k in range(2, min(6, len(valid))):
            for weighted in [False, True]:
                for target in ["error", "direct"]:
                    mae = loo_knn(m, feats, k, weighted, target)
                    config = f"KNN(k={k},{'W' if weighted else ''},{feat_name},{target})"
                    if mae < best_mae:
                        best_mae = mae
                        best_config = config

    best_knn[m] = (mae_raw, best_mae, best_config)
    gain = mae_raw - best_mae
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  best={best_mae:.2f} ({best_config})  gain={gain:+.2f}  [{status}]")

# ====================================================================
print()
print("=" * 80)
print("EXPERIENCE 1C: KNN AVEC FEATURES PHYSIQUES DU CORPS")
print("  Ajoute: volume_tronc, surface_tronc, ratio_epaisseur")
print("=" * 80)
print()

PHYSICS_FEATURES = PIPELINE_FEATURES + [
    "bmi", "chest_ratio", "waist_ratio", "hip_ratio",
    "trunk_width_diff", "trunk_depth_diff",
]

for m in ALL_MEASURES:
    valid = get_valid_subjects(m)
    if len(valid) < 4:
        continue
    mae_raw = np.mean([abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid])

    best_mae = mae_raw
    for k in range(2, min(6, len(valid))):
        for weighted in [False, True]:
            for target in ["error", "direct"]:
                mae = loo_knn(m, PHYSICS_FEATURES, k, weighted, target)
                if mae < best_mae:
                    best_mae = mae

    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  KNN_physics={best_mae:.2f}  [{status}]")
