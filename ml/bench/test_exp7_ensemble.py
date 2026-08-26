#!/usr/bin/env python3
"""
EXPERIENCE 7: APPROCHE ENSEMBLE
=================================
Combine les meilleures corrections de chaque methode pour chaque mesure.
Utilise un meta-apprenant (simple) pour ponderer les corrections.
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

# ====================================================================
print("=" * 80)
print("APPROCHE ENSEMBLE: COMBINAISON OPTIMALE DE CORRECTIONS")
print("=" * 80)
print()
print("Pour chaque mesure, genere N corrections (bias, ratio, f*(raw+b),")
print("KNN, regression, etc.) puis trouve les poids optimaux en LOO-CV.")
print()


def get_valid_subjects(measure):
    return [s for s in subjects if measure in s["mesures"]]


def compute_corrections(subj, measure, all_subjs):
    """Compute multiple correction candidates for a subject"""
    raw = subj["mesures"][measure]["calcule"]
    true = subj["mesures"][measure]["attendu"]
    gender = subj["gender"]
    weight = subj["weight_kg"]
    height = subj["height_cm"]

    corrections = {}

    # 1. Raw (no correction)
    corrections["raw"] = raw

    # 2. Bias correction (mean bias from all subjects)
    all_errors = [s["mesures"][measure]["calcule"] - s["mesures"][measure]["attendu"]
                  for s in all_subjs]
    bias = np.mean(all_errors)
    corrections["bias"] = raw - bias

    # 3. Ratio correction
    all_ratios = [s["mesures"][measure]["calcule"] / s["mesures"][measure]["attendu"]
                  for s in all_subjs]
    mean_ratio = np.mean(all_ratios)
    corrections["ratio"] = raw / mean_ratio

    # 4. f*(raw+b) correction (optimized)
    best_mae = 999
    best_f, best_b = 1.0, 0.0
    for f in np.arange(0.85, 1.25, 0.02):
        for b in np.arange(-10, 10, 0.5):
            corrected_all = [f * (s["mesures"][measure]["calcule"] + b) for s in all_subjs]
            mae = np.mean([abs(c - s["mesures"][measure]["attendu"]) for c, s in zip(corrected_all, all_subjs)])
            if mae < best_mae:
                best_mae = mae
                best_f, best_b = f, b
    corrections["fb"] = best_f * (raw + best_b)

    # 5. Sex-based bias
    same_gender = [s for s in all_subjs if s["gender"] == gender]
    if len(same_gender) > 1:
        gender_bias = np.mean([s["mesures"][measure]["calcule"] - s["mesures"][measure]["attendu"]
                               for s in same_gender])
        corrections["sex_bias"] = raw - gender_bias
    else:
        corrections["sex_bias"] = raw

    # 6. Weight-corrected
    all_weights = [s["weight_kg"] for s in all_subjs]
    all_errors_w = [s["mesures"][measure]["calcule"] - s["mesures"][measure]["attendu"]
                    for s in all_subjs]
    # Simple: correct by weight deviation from mean
    mean_w = np.mean(all_weights)
    mean_err = np.mean(all_errors_w)
    # Regression: error = a * weight + b
    try:
        coeffs = np.polyfit(all_weights, all_errors_w, 1)
        predicted_err = coeffs[0] * weight + coeffs[1]
        corrections["weight"] = raw - predicted_err
    except:
        corrections["weight"] = raw

    return corrections


# ====================================================================
# LOO-CV: for each left-out subject, compute all corrections from others
# Then find optimal weights
print()
print("=" * 80)
print("1. CORRECTIONS DISPONIBLES PAR MESURE")
print("=" * 80)
print()

for m in ALL_MEASURES:
    valid = get_valid_subjects(m)
    if len(valid) < 4:
        continue
    n_valid = len(valid)

    # Compute all corrections for each subject using LOO
    all_corrections = []  # list of dicts, one per subject
    for i in range(n_valid):
        others = [valid[j] for j in range(n_valid) if j != i]
        corrections = compute_corrections(valid[i], m, others)
        all_corrections.append(corrections)

    # Find best single correction
    mae_raw = np.mean([abs(valid[i]["mesures"][m]["calcule"] - valid[i]["mesures"][m]["attendu"])
                       for i in range(n_valid)])

    best_name = "raw"
    best_mae = mae_raw
    for name in ["bias", "ratio", "fb", "sex_bias", "weight"]:
        errs = [abs(all_corrections[i][name] - valid[i]["mesures"][m]["attendu"])
                for i in range(n_valid)]
        mae = np.mean(errs)
        if mae < best_mae:
            best_mae = mae
            best_name = name

    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  best_single={best_name}({best_mae:.2f})  [{status}]")

    # Show all correction MAEs
    for name in ["bias", "ratio", "fb", "sex_bias", "weight"]:
        errs = [abs(all_corrections[i][name] - valid[i]["mesures"][m]["attendu"])
                for i in range(n_valid)]
        mae = np.mean(errs)
        delta = mae_raw - mae
        print(f"  {'':20s}  {name:12s}: {mae:.2f} cm (gain={delta:+.2f})")

# ====================================================================
print()
print("=" * 80)
print("2. ENSEMBLE: PONDERATION OPTIMALE PAR MESURE")
print("  Apprend les poids w_i tel que: prediction = sum(w_i * correction_i)")
print("=" * 80)
print()

ensemble_results = {}

for m in ALL_MEASURES:
    valid = get_valid_subjects(m)
    if len(valid) < 5:
        continue
    n_valid = len(valid)

    # Compute all corrections in LOO
    correction_names = ["bias", "ratio", "fb", "sex_bias", "weight"]
    all_correction_arrays = {name: [] for name in correction_names}
    true_vals = []
    raw_vals = []

    for i in range(n_valid):
        others = [valid[j] for j in range(n_valid) if j != i]
        corrections = compute_corrections(valid[i], m, others)
        for name in correction_names:
            all_correction_arrays[name].append(corrections[name])
        true_vals.append(valid[i]["mesures"][m]["attendu"])
        raw_vals.append(valid[i]["mesures"][m]["calcule"])

    true_vals = np.array(true_vals)
    raw_vals = np.array(raw_vals)

    # Find optimal weights via grid search (simple, 5 corrections)
    best_mae = np.mean(np.abs(raw_vals - true_vals))
    best_weights = {name: 0.0 for name in correction_names}
    best_weights["raw"] = 1.0

    # Grid search: weights that sum to 1
    for w_bias in np.arange(0, 1.1, 0.1):
        for w_ratio in np.arange(0, 1.1 - w_bias, 0.1):
            for w_fb in np.arange(0, 1.1 - w_bias - w_ratio, 0.1):
                for w_sex in np.arange(0, 1.1 - w_bias - w_ratio - w_fb, 0.1):
                    w_weight = 1.0 - w_bias - w_ratio - w_fb - w_sex
                    if w_weight < -0.01:
                        continue
                    w_weight = max(0, w_weight)

                    ensemble = (w_bias * np.array(all_correction_arrays["bias"]) +
                                w_ratio * np.array(all_correction_arrays["ratio"]) +
                                w_fb * np.array(all_correction_arrays["fb"]) +
                                w_sex * np.array(all_correction_arrays["sex_bias"]) +
                                w_weight * np.array(all_correction_arrays["weight"]))

                    mae = np.mean(np.abs(ensemble - true_vals))
                    if mae < best_mae:
                        best_mae = mae
                        best_weights = {
                            "bias": w_bias, "ratio": w_ratio, "fb": w_fb,
                            "sex_bias": w_sex, "weight": w_weight
                        }

    ensemble_results[m] = (best_mae, best_weights)
    mae_raw = np.mean(np.abs(raw_vals - true_vals))
    gain = mae_raw - best_mae
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  ensemble={best_mae:.2f}  gain={gain:+.2f}  [{status}]")
    print(f"  {'':20s}  poids: bias={best_weights['bias']:.1f} ratio={best_weights['ratio']:.1f} "
          f"fb={best_weights['fb']:.1f} sex={best_weights['sex_bias']:.1f} weight={best_weights['weight']:.1f}")

# ====================================================================
print()
print("=" * 80)
print("3. RESUME FINAL ENSEMBLE")
print("=" * 80)
print()

print(f"  {'Mesure':20s}  {'Brut':>6s}  {'Ensemble':>10s}  {'Gain':>8s}  {'<1cm':>6s}")
print(f"  {'-'*20}  {'-'*6}  {'-'*10}  {'-'*8}  {'-'*6}")

total_raw = 0
total_ensemble = 0
n_measures = 0

for m in ALL_MEASURES:
    if m in ensemble_results:
        valid = get_valid_subjects(m)
        mae_raw = np.mean([abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid])
        mae_ens, _ = ensemble_results[m]
        gain = mae_raw - mae_ens
        status = "<1" if mae_ens < 1.0 else ">=1"
        print(f"  {m:20s}: {mae_raw:6.2f}  {mae_ens:10.2f}  {gain:+8.2f}  {status:>6s}")
        total_raw += mae_raw
        total_ensemble += mae_ens
        n_measures += 1

print(f"  {'MOYENNE':20s}: {total_raw/n_measures:6.2f}  {total_ensemble/n_measures:10.2f}  {(total_raw-total_ensemble)/n_measures:+8.2f}")
