#!/usr/bin/env python3
"""
EXPERIENCE 4: SELECTION DE FEATURES OPTIMALES
================================================
Teste toutes les combinaisons de 2-4 features pour trouver les meilleures
par mesure en LOO-CV. Utilise la regression lineaire simple (2-3 features).
"""
import json
import numpy as np
from itertools import combinations
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

# Candidate features
CANDIDATE_FEATURES = [
    "height_cm", "weight_kg", "biacromialbreadth", "bideltoidbreadth",
    "hipbreadth", "sittingheight", "crotchheight",
    "chestbreadth", "waistbreadth", "chestdepth", "waistdepth", "buttockdepth",
    "bmi", "chest_ratio", "waist_ratio", "hip_ratio",
    "trunk_width_diff", "trunk_depth_diff",
    "chestbreadth_body", "chestdepth_body",
    "waistbreadth_body", "waistdepth_body",
    "hipbreadth_body", "buttockdepth_body",
]

# Add derived
for subj in subjects:
    f = subj["features"]
    subj["derived"] = {
        "bmi": subj["weight_kg"] / (subj["height_cm"] / 100.0) ** 2,
        "chest_ratio": f["chestbreadth"] / max(f["chestdepth"], 1),
        "waist_ratio": f["waistbreadth"] / max(f["waistdepth"], 1),
        "hip_ratio": f["hipbreadth"] / max(f["buttockdepth"], 1),
        "trunk_width_diff": f["chestbreadth"] - f["waistbreadth"],
        "trunk_depth_diff": f["chestdepth"] - f["waistdepth"],
    }

def get_val(subj, key):
    if key in subj["features"]:
        return subj["features"][key]
    if key in subj.get("derived", {}):
        return subj["derived"][key]
    return 0.0


def solve_ols(X, y):
    """Solve OLS with intercept: y = b + w @ X"""
    X_aug = np.column_stack([np.ones(X.shape[0]), X])
    try:
        w = np.linalg.lstsq(X_aug, y, rcond=None)[0]
        return w[0], w[1:]
    except:
        return 0.0, np.zeros(X.shape[1])


def loo_linear(subjects, measure, feat_keys, use_correction=True):
    """LOO-CV for linear model. use_correction: predict error vs predict directly"""
    valid = [s for s in subjects if measure in s["mesures"]]
    if len(valid) < len(feat_keys) + 2:
        return 99.0

    errors = []
    for i in range(len(valid)):
        train_idx = list(range(len(valid)))
        train_idx.remove(i)
        train = [valid[j] for j in train_idx]

        X_train = np.array([[get_val(s, k) for k in feat_keys] for s in train])
        if use_correction:
            y_train = np.array([s["mesures"][measure]["attendu"] - s["mesures"][measure]["calcule"]
                                for s in train])
        else:
            y_train = np.array([s["mesures"][measure]["attendu"] for s in train])

        intercept, weights = solve_ols(X_train, y_train)

        x_test = np.array([get_val(valid[i], k) for k in feat_keys])
        prediction = intercept + weights @ x_test

        if use_correction:
            corrected = valid[i]["mesures"][measure]["calcule"] + prediction
        else:
            corrected = prediction

        errors.append(abs(corrected - valid[i]["mesures"][measure]["attendu"]))
    return np.mean(errors)


# ====================================================================
print("=" * 80)
print("EXPERIENCE 4: SELECTION DE FEATURES OPTIMALES")
print("  Teste combinaisons de 2-4 features en LOO-CV")
print("  Deux strategies: corriger erreur vs predire directement")
print("=" * 80)
print()

results_summary = {}

for m in ALL_MEASURES:
    valid = [s for s in subjects if m in s["mesures"]]
    if len(valid) < 4:
        continue
    n_valid = len(valid)
    mae_raw = np.mean([abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid])

    best_mae = mae_raw
    best_config = "brut"
    best_feats = []
    tested = 0

    # Test combinations of 2, 3 features (skip 4 to save time)
    for n_feat in [2, 3]:
        if n_feat >= n_valid - 1:
            continue
        # Only test a subset of the most promising features
        priority = ["height_cm", "weight_kg", "biacromialbreadth", "hipbreadth",
                    "chestbreadth", "waistbreadth", "crotchheight", "buttockdepth",
                    "chestdepth", "waistdepth"]
        for feat_combo in combinations(priority, n_feat):
            for use_correction in [True, False]:
                mae = loo_linear(subjects, m, feat_combo, use_correction)
                tested += 1
                if mae < best_mae:
                    best_mae = mae
                    best_config = f"{'corr' if use_correction else 'pred'}({n_feat}f)"
                    best_feats = list(feat_combo)

    results_summary[m] = (mae_raw, best_mae, best_config, best_feats)
    gain = mae_raw - best_mae
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  best={best_mae:.2f}  gain={gain:+.2f}  [{status}]")
    print(f"  {'':20s}  config={best_config}  features={best_feats[:4]}")
    print(f"  {'':20s}  ({tested} combinaisons testees)")

# ====================================================================
print()
print("=" * 80)
print("RESUME: MEILLEURES FEATURES PAR MESURE")
print("=" * 80)
print()

for m in ALL_MEASURES:
    if m not in results_summary:
        continue
    mae_raw, best_mae, best_config, best_feats = results_summary[m]
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: {best_feats}  -> {best_mae:.2f} cm  [{status}]")
