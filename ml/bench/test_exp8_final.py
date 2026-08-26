#!/usr/bin/env python3
"""
EXPERIENCE 8: MODELE FINAL COMBINE
=====================================
Utilise les meilleures features identifiees en Exp4 pour chaque mesure.
Teste en LOO-CV rigoureux.
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
    }


def get_val(subj, key):
    if key in subj["features"]:
        return subj["features"][key]
    if key in subj.get("derived", {}):
        return subj["derived"][key]
    return 0.0


def solve_ols(X, y):
    X_aug = np.column_stack([np.ones(X.shape[0]), X])
    try:
        w = np.linalg.lstsq(X_aug, y, rcond=None)[0]
        return w[0], w[1:]
    except:
        return 0.0, np.zeros(X.shape[1])


# Best features from Exp4 (correction model)
BEST_FEATURES = {
    "neck": ["weight_kg", "biacromialbreadth", "buttockdepth"],
    "chest": ["weight_kg", "biacromialbreadth", "buttockdepth"],
    "waist": ["weight_kg", "hipbreadth", "crotchheight"],
    "hips": ["height_cm", "crotchheight", "buttockdepth"],
    "biceps": ["weight_kg", "chestbreadth", "buttockdepth"],
    "thigh": ["weight_kg", "buttockdepth", "waistdepth"],
    "wrist": ["height_cm", "chestbreadth", "waistbreadth"],
    "ankle": ["height_cm", "chestdepth"],
    "shoulder": ["weight_kg", "biacromialbreadth", "chestdepth"],
    "sleeve_length": ["height_cm", "crotchheight", "buttockdepth"],
    "inseam": ["height_cm", "crotchheight"],
    "back_length": ["height_cm", "crotchheight"],
}


def loo_final(subjects, measure, feat_keys):
    """LOO-CV: correction model using best features"""
    valid = [s for s in subjects if measure in s["mesures"]]
    if len(valid) < len(feat_keys) + 2:
        return 99.0, []

    errors = []
    for i in range(len(valid)):
        train_idx = list(range(len(valid)))
        train_idx.remove(i)
        train = [valid[j] for j in train_idx]

        X_train = np.array([[get_val(s, k) for k in feat_keys] for s in train])
        y_train = np.array([s["mesures"][measure]["attendu"] - s["mesures"][measure]["calcule"]
                            for s in train])

        intercept, weights = solve_ols(X_train, y_train)

        x_test = np.array([get_val(valid[i], k) for k in feat_keys])
        prediction = intercept + weights @ x_test
        corrected = valid[i]["mesures"][measure]["calcule"] + prediction
        errors.append(abs(corrected - valid[i]["mesures"][measure]["attendu"]))
    return np.mean(errors), errors


# ====================================================================
print("=" * 80)
print("EXPERIENCE 8: MODELE FINAL COMBINE (LOO-CV)")
print("=" * 80)
print()

final_results = {}
for m in ALL_MEASURES:
    valid = [s for s in subjects if m in s["mesures"]]
    if len(valid) < 3:
        continue
    mae_raw = np.mean([abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid])
    feat = BEST_FEATURES.get(m, ["height_cm", "weight_kg"])
    mae_final, errors = loo_final(subjects, m, feat)
    final_results[m] = (mae_raw, mae_final)
    status = "<1" if mae_final < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  final={mae_final:.2f}  gain={mae_raw-mae_final:+.2f}  [{status}]")
    print(f"  {'':20s}  features={feat}")

# ====================================================================
print()
print("=" * 80)
print("RESUME FINAL - TOUTES LES MESURES")
print("=" * 80)
print()

print(f"  {'Mesure':20s}  {'Brut':>6s}  {'Final':>8s}  {'Gain':>8s}  {'<1cm':>6s}")
print(f"  {'-'*20}  {'-'*6}  {'-'*8}  {'-'*8}  {'-'*6}")

total_raw = 0
total_final = 0
n = 0
n_below = 0

for m in ALL_MEASURES:
    if m in final_results:
        mae_raw, mae_final = final_results[m]
        gain = mae_raw - mae_final
        status = "<1" if mae_final < 1.0 else ">=1"
        if mae_final < 1.0:
            n_below += 1
        print(f"  {m:20s}: {mae_raw:6.2f}  {mae_final:8.2f}  {gain:+8.2f}  {status:>6s}")
        total_raw += mae_raw
        total_final += mae_final
        n += 1

print(f"  {'MOYENNE':20s}: {total_raw/n:6.2f}  {total_final/n:8.2f}  {(total_raw-total_final)/n:+8.2f}")
print()
print(f"  {n_below}/{n} mesures sous 1 cm")

# ====================================================================
print()
print("=" * 80)
print("DETAIl PAR SUJET (MODELE FINAL)")
print("=" * 80)
print()

# Recompute per-subject errors
header = f"  {'Sujet':6s}"
for m in ALL_MEASURES:
    header += f"  {m[:8]:>8s}"
print(header)
print(f"  {'-'*6}", end="")
for _ in ALL_MEASURES:
    print(f"  {'-'*8}", end="")
print()

for subj in subjects:
    line = f"  {subj['id']:6d}"
    for m in ALL_MEASURES:
        if m in subj["mesures"]:
            valid = [s for s in subjects if m in s["mesures"]]
            feat = BEST_FEATURES.get(m, ["height_cm", "weight_kg"])
            if len(valid) >= len(feat) + 2:
                # Compute correction for this subject using all others
                X_train = np.array([[get_val(s, k) for k in feat] for s in valid if s["id"] != subj["id"]])
                y_train = np.array([s["mesures"][m]["attendu"] - s["mesures"][m]["calcule"]
                                    for s in valid if s["id"] != subj["id"]])
                intercept, weights = solve_ols(X_train, y_train)
                x_test = np.array([get_val(subj, k) for k in feat])
                correction = intercept + weights @ x_test
                corrected = subj["mesures"][m]["calcule"] + correction
                err = abs(corrected - subj["mesures"][m]["attendu"])
                line += f"  {err:8.2f}"
            else:
                line += f"  {'N/A':>8s}"
        else:
            line += f"  {'N/A':>8s}"
    print(line)
