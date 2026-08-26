#!/usr/bin/env python3
"""
EXPERIENCE 5: ANALYSE DE L'ECHELLE (cm_per_pixel)
====================================================
La calibration de l'echelle est la base de toutes les mesures.
Teste: quelle est l'erreur d'echelle, et que se passe-t-il si on la corrige?
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
    subjects.append(entry)
subjects.sort(key=lambda x: x["id"])

# ====================================================================
print("=" * 80)
print("ANALYSE DE L'ECHELLE")
print("=" * 80)
print()
print("Le pipeline calcule cm_per_pixel depuis la pose MediaPipe.")
print("La calibration utilise: nose_y * NOSE_HEIGHT_RATIO / height_cm")
print()

# For each subject, compute the implied cm_per_pixel from each measurement
# If we knew the true measurement, we could compute the true cm_per_pixel
# from the pixel distance and the true value.

print(f"  {'Sujet':6s}  {'Taille':>6s}  {'Poids':>6s}", end="")
for m in MEASURES_ORDER:
    print(f"  {m[:6]:>6s}", end="")
print()
print(f"  {'-'*6}  {'-'*6}  {'-'*6}", end="")
for _ in MEASURES_ORDER:
    print(f"  {'-'*6}", end="")
print()

# For each subject, compute the ratio: calcule / attendu
# This tells us how much the pipeline over/under-estimates each measurement
print("\n  RATIO calcule/attendu (1.00 = parfait):")
print(f"  {'Sujet':6s}  {'Taille':>6s}  {'Poids':>6s}", end="")
for m in MEASURES_ORDER:
    print(f"  {m[:6]:>6s}", end="")
print()
print(f"  {'-'*6}  {'-'*6}  {'-'*6}", end="")
for _ in MEASURES_ORDER:
    print(f"  {'-'*6}", end="")
print()

ratios = {m: [] for m in MEASURES_ORDER}
for subj in subjects:
    print(f"  {subj['id']:6d}  {subj['height_cm']:6.0f}  {subj['weight_kg']:6.1f}", end="")
    for m in MEASURES_ORDER:
        if m in subj["mesures"]:
            ratio = subj["mesures"][m]["calcule"] / subj["mesures"][m]["attendu"]
            ratios[m].append(ratio)
            print(f"  {ratio:6.3f}", end="")
        else:
            print(f"  {'N/A':>6s}", end="")
    print()

# Summary
print("\n  Statistiques des ratios:")
print(f"  {'Mesure':20s}  {'Moyen':>8s}  {'Mediane':>8s}  {'Ecart':>8s}  {'Min':>8s}  {'Max':>8s}")
print(f"  {'-'*20}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*8}")

for m in MEASURES_ORDER:
    if ratios[m]:
        arr = np.array(ratios[m])
        print(f"  {m:20s}  {np.mean(arr):8.3f}  {np.median(arr):8.3f}  {np.std(arr):8.3f}  {np.min(arr):8.3f}  {np.max(arr):8.3f}")

# ====================================================================
print()
print("=" * 80)
print("SIMULATION: CORRECTION PAR RATIO MOYEN")
print("  corrected = calcule / ratio_moyen")
print("=" * 80)
print()

for m in MEASURES_ORDER:
    if not ratios[m]:
        continue
    arr = np.array(ratios[m])
    mean_ratio = np.mean(arr)
    median_ratio = np.median(arr)

    # Mean ratio correction
    errs_mean = []
    errs_median = []
    for subj in subjects:
        if m in subj["mesures"]:
            calc = subj["mesures"][m]["calcule"]
            true = subj["mesures"][m]["attendu"]
            corrected_mean = calc / mean_ratio
            corrected_median = calc / median_ratio
            errs_mean.append(abs(corrected_mean - true))
            errs_median.append(abs(corrected_median - true))

    mae_raw = np.mean([abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in subjects if m in s["mesures"]])
    mae_mean = np.mean(errs_mean)
    mae_median = np.mean(errs_median)

    print(f"  {m:20s}: ratio_mean={mean_ratio:.3f}  ratio_med={median_ratio:.3f}  "
          f"MAE: brut={mae_raw:.2f}  mean_corr={mae_mean:.2f}  med_corr={mae_median:.2f}")

# ====================================================================
print()
print("=" * 80)
print("SIMULATION: OPTIMISATION DU RATIO PAR SUJET (chacun a le sien)")
print("  Si on avait le bon ratio par sujet, quelle serait l'erreur?")
print("=" * 80)
print()

# For each subject, compute the optimal ratio that minimizes error for that subject
# Then use that ratio for all OTHER subjects (LOO)
print(f"  {'Mesure':20s}  {'Brut':>8s}  {'LOO_ratio':>10s}  {'Gain':>8s}")
print(f"  {'-'*20}  {'-'*8}  {'-'*10}  {'-'*8}")

for m in MEASURES_ORDER:
    valid = [s for s in subjects if m in s["mesures"]]
    if len(valid) < 3:
        continue

    mae_raw = np.mean([abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid])

    # LOO: for each subject, find best ratio from others, apply to left-out
    loo_errors = []
    for i in range(len(valid)):
        # Find best ratio for subject i using ALL OTHER subjects
        # Actually, we want to predict the ratio for subject i
        # Use simple: ratio_i = calc_i / true_i, but we don't know true_i
        # Instead: use the mean ratio from others
        other_ratios = []
        for j in range(len(valid)):
            if j != i:
                other_ratios.append(valid[j]["mesures"][m]["calcule"] / valid[j]["mesures"][m]["attendu"])
        mean_ratio = np.mean(other_ratios)

        corrected = valid[i]["mesures"][m]["calcule"] / mean_ratio
        loo_errors.append(abs(corrected - valid[i]["mesures"][m]["attendu"]))

    mae_loo = np.mean(loo_errors)
    print(f"  {m:20s}: {mae_raw:8.2f}  {mae_loo:10.2f}  {mae_raw - mae_loo:+8.2f}")
