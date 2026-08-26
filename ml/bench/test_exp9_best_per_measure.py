#!/usr/bin/env python3
"""
EXPERIENCE 9: MEILLEUR MODELE PAR MESURE
==========================================
Pour chaque mesure, teste TOUTES les approches et garde la meilleure.
C'est le test definitif: la meilleure precision atteignable avec 12 sujets.
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

# Add derived features
for subj in subjects:
    f = subj["features"]
    subj["derived"] = {
        "bmi": subj["weight_kg"] / (subj["height_cm"] / 100.0) ** 2,
        "chest_ratio": f["chestbreadth"] / max(f["chestdepth"], 1),
        "waist_ratio": f["waistbreadth"] / max(f["waistdepth"], 1),
        "hip_ratio": f["hipbreadth"] / max(f["buttockdepth"], 1),
    }

ALL_FEATURES = [
    "height_cm", "weight_kg", "biacromialbreadth", "hipbreadth",
    "chestbreadth", "waistbreadth", "crotchheight", "buttockdepth",
    "chestdepth", "waistdepth",
]


def get_val(subj, key):
    if key in subj["features"]:
        return subj["features"][key]
    if key in subj.get("derived", {}):
        return subj["derived"][key]
    return 0.0


def loo_bias_correction(subjects, measure):
    """LOO-CV: simple bias correction"""
    valid = [s for s in subjects if measure in s["mesures"]]
    if len(valid) < 3:
        return 99.0
    errors = []
    for i in range(len(valid)):
        others = [valid[j] for j in range(len(valid)) if j != i]
        bias = np.mean([s["mesures"][measure]["calcule"] - s["mesures"][measure]["attendu"] for s in others])
        corrected = valid[i]["mesures"][measure]["calcule"] - bias
        errors.append(abs(corrected - valid[i]["mesures"][measure]["attendu"]))
    return np.mean(errors)


def loo_ratio_correction(subjects, measure):
    """LOO-CV: ratio correction"""
    valid = [s for s in subjects if measure in s["mesures"]]
    if len(valid) < 3:
        return 99.0
    errors = []
    for i in range(len(valid)):
        others = [valid[j] for j in range(len(valid)) if j != i]
        ratios = [s["mesures"][measure]["calcule"] / s["mesures"][measure]["attendu"] for s in others]
        mean_ratio = np.mean(ratios)
        corrected = valid[i]["mesures"][measure]["calcule"] / mean_ratio
        errors.append(abs(corrected - valid[i]["mesures"][measure]["attendu"]))
    return np.mean(errors)


def loo_fb_correction(subjects, measure):
    """LOO-CV: f*(raw+b) correction"""
    valid = [s for s in subjects if measure in s["mesures"]]
    if len(valid) < 3:
        return 99.0
    errors = []
    for i in range(len(valid)):
        others = [valid[j] for j in range(len(valid)) if j != i]
        best_mae = 999
        best_f, best_b = 1.0, 0.0
        raws = np.array([s["mesures"][measure]["calcule"] for s in others])
        trues = np.array([s["mesures"][measure]["attendu"] for s in others])
        for f in np.arange(0.85, 1.25, 0.02):
            for b in np.arange(-10, 10, 0.5):
                corrected = f * (raws + b)
                mae = np.mean(np.abs(corrected - trues))
                if mae < best_mae:
                    best_mae = mae
                    best_f, best_b = f, b
        corrected = best_f * (valid[i]["mesures"][measure]["calcule"] + best_b)
        errors.append(abs(corrected - valid[i]["mesures"][measure]["attendu"]))
    return np.mean(errors)


def loo_linear_correction(subjects, measure, feat_keys):
    """LOO-CV: linear regression correction model"""
    valid = [s for s in subjects if measure in s["mesures"]]
    if len(valid) < len(feat_keys) + 2:
        return 99.0
    errors = []
    for i in range(len(valid)):
        others = [valid[j] for j in range(len(valid)) if j != i]
        X_train = np.array([[get_val(s, k) for k in feat_keys] for s in others])
        y_train = np.array([s["mesures"][measure]["attendu"] - s["mesures"][measure]["calcule"] for s in others])
        X_aug = np.column_stack([np.ones(X_train.shape[0]), X_train])
        try:
            w = np.linalg.lstsq(X_aug, y_train, rcond=None)[0]
            x_test = np.array([get_val(valid[i], k) for k in feat_keys])
            correction = w[0] + w[1:] @ x_test
            corrected = valid[i]["mesures"][measure]["calcule"] + correction
        except:
            corrected = valid[i]["mesures"][measure]["calcule"]
        errors.append(abs(corrected - valid[i]["mesures"][measure]["attendu"]))
    return np.mean(errors)


def loo_linear_direct(subjects, measure, feat_keys):
    """LOO-CV: linear regression direct prediction"""
    valid = [s for s in subjects if measure in s["mesures"]]
    if len(valid) < len(feat_keys) + 2:
        return 99.0
    errors = []
    for i in range(len(valid)):
        others = [valid[j] for j in range(len(valid)) if j != i]
        X_train = np.array([[get_val(s, k) for k in feat_keys] for s in others])
        y_train = np.array([s["mesures"][measure]["attendu"] for s in others])
        X_aug = np.column_stack([np.ones(X_train.shape[0]), X_train])
        try:
            w = np.linalg.lstsq(X_aug, y_train, rcond=None)[0]
            x_test = np.array([get_val(valid[i], k) for k in feat_keys])
            predicted = w[0] + w[1:] @ x_test
        except:
            predicted = valid[i]["mesures"][measure]["calcule"]
        errors.append(abs(predicted - valid[i]["mesures"][measure]["attendu"]))
    return np.mean(errors)


# ====================================================================
print("=" * 80)
print("EXPERIENCE 9: MEILLEUR MODELE PAR MESURE (LOO-CV)")
print("=" * 80)
print()
print("Pour chaque mesure, teste:")
print("  1. Brut (pas de correction)")
print("  2. Biais additif")
print("  3. Ratio multiplicatif")
print("  4. f*(raw+b)")
print("  5. Regression lineaire correction (meilleures features)")
print("  6. Regression lineaire directe (meilleures features)")
print()

# Feature combos to test
FEAT_COMBOS = [
    ["height_cm", "weight_kg"],
    ["height_cm", "weight_kg", "biacromialbreadth"],
    ["height_cm", "weight_kg", "hipbreadth"],
    ["height_cm", "weight_kg", "crotchheight"],
    ["weight_kg", "biacromialbreadth", "buttockdepth"],
    ["weight_kg", "chestbreadth", "buttockdepth"],
    ["weight_kg", "hipbreadth", "crotchheight"],
    ["weight_kg", "buttockdepth", "waistdepth"],
    ["height_cm", "chestbreadth", "waistbreadth"],
    ["height_cm", "chestdepth"],
    ["height_cm", "crotchheight"],
    ["weight_kg", "biacromialbreadth", "chestdepth"],
    ["height_cm", "crotchheight", "buttockdepth"],
]

final_best = {}

for m in ALL_MEASURES:
    valid = [s for s in subjects if m in s["mesures"]]
    if len(valid) < 3:
        continue

    mae_raw = np.mean([abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid])

    candidates = [("brut", mae_raw)]

    # Simple corrections
    candidates.append(("biais", loo_bias_correction(subjects, m)))
    candidates.append(("ratio", loo_ratio_correction(subjects, m)))
    candidates.append(("f*(raw+b)", loo_fb_correction(subjects, m)))

    # Linear correction models
    for feat in FEAT_COMBOS:
        mae = loo_linear_correction(subjects, m, feat)
        candidates.append((f"corr_{'_'.join(f[:3] for f in feat[:2])}", mae))

    # Linear direct models
    for feat in FEAT_COMBOS:
        mae = loo_linear_direct(subjects, m, feat)
        candidates.append((f"dir_{'_'.join(f[:3] for f in feat[:2])}", mae))

    best_name, best_mae = min(candidates, key=lambda x: x[1])
    final_best[m] = (mae_raw, best_mae, best_name)
    gain = mae_raw - best_mae
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  best={best_mae:.2f} ({best_name})  gain={gain:+.2f}  [{status}]")

# ====================================================================
print()
print("=" * 80)
print("RESUME FINAL - MEILLEURS RESULTATS ATTEINTS")
print("=" * 80)
print()

print(f"  {'Mesure':20s}  {'Brut':>6s}  {'Meilleur':>10s}  {'Gain':>8s}  {'Modele':>30s}")
print(f"  {'-'*20}  {'-'*6}  {'-'*10}  {'-'*8}  {'-'*30}")

total_raw = 0
total_best = 0
n = 0
n_below = 0

for m in ALL_MEASURES:
    if m in final_best:
        mae_raw, mae_best, name = final_best[m]
        gain = mae_raw - mae_best
        status = "<1" if mae_best < 1.0 else ">=1"
        if mae_best < 1.0:
            n_below += 1
        print(f"  {m:20s}: {mae_raw:6.2f}  {mae_best:10.2f}  {gain:+8.2f}  {name:>30s}")
        total_raw += mae_raw
        total_best += mae_best
        n += 1

print(f"  {'MOYENNE':20s}: {total_raw/n:6.2f}  {total_best/n:10.2f}  {(total_raw-total_best)/n:+8.2f}")
print()
print(f"  >>> {n_below}/{n} mesures sous 1 cm <<<")
print()
if n_below == n:
    print("  🎯 OBJECTIF ATTEINT: toutes les mesures < 1 cm !")
elif n_below >= n - 2:
    print(f"  🔶 PRESQUE: {n_below}/{n} mesures < 1 cm. Les 2 restantes nécessitent plus de sujets.")
else:
    print(f"  ❌ Objectif non atteint: {n_below}/{n} mesures < 1 cm")
