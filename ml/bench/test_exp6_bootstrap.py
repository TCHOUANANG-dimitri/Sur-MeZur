#!/usr/bin/env python3
"""
EXPERIENCE 6: ANALYSE BOOTSTRAP
=================================
Calcule les intervalles de confiance des corrections par bootstrap.
Est-ce que les corrections sont stables ou dependantes des sujets?
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
print("BOOTSTRAP: STABILITE DES BIAIS (1000 resamples)")
print("=" * 80)
print()
print("Pour chaque mesure, calcule le biais moyen sur 1000 echantillons bootstraps")
print("et les intervalles de confiance a 95%")
print()

np.random.seed(42)
N_BOOT = 1000

print(f"  {'Mesure':20s}  {'Bias_moy':>9s}  {'IC95_low':>9s}  {'IC95_high':>10s}  {'Stable':>8s}")
print(f"  {'-'*20}  {'-'*9}  {'-'*9}  {'-'*10}  {'-'*8}")

for m in ALL_MEASURES:
    valid = [s for s in subjects if m in s["mesures"]]
    if len(valid) < 4:
        continue

    errors = np.array([s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"] for s in valid])
    n_valid = len(valid)

    boot_biases = []
    for _ in range(N_BOOT):
        idx = np.random.choice(n_valid, size=n_valid, replace=True)
        boot_biases.append(np.mean(errors[idx]))

    boot_biases = np.array(boot_biases)
    ci_low = np.percentile(boot_biases, 2.5)
    ci_high = np.percentile(boot_biases, 97.5)
    ci_width = ci_high - ci_low
    stable = "STABLE" if ci_width < 2.0 else "INSTABLE"

    print(f"  {m:20s}  {np.mean(errors):+9.2f}  {ci_low:+9.2f}  {ci_high:+10.2f}  {stable:>8s}")

# ====================================================================
print()
print("=" * 80)
print("BOOTSTRAP: STABILITE DES CORRECTIONS KNN (1000 resamples)")
print("  Pour k=3, combien de fois la correction est-elle utile?")
print("=" * 80)
print()

from test_exp1_knn import knn_predict, get_valid_subjects, build_X, PIPELINE_FEATURES

for m in ALL_MEASURES:
    valid = [s for s in subjects if m in s["mesures"]]
    if len(valid) < 6:
        continue

    X = build_X(valid, PIPELINE_FEATURES)
    y_pred = np.array([s["mesures"][m]["calcule"] for s in valid])
    y_true = np.array([s["mesures"][m]["attendu"] for s in valid])
    n_valid = len(valid)

    # Bootstrap LOO-CV
    boot_maes_raw = []
    boot_maes_knn = []
    for _ in range(N_BOOT):
        idx = np.random.choice(n_valid, size=n_valid, replace=True)
        # LOO on this bootstrap sample
        errs_raw = []
        errs_knn = []
        for i in range(n_valid):
            mask = idx != i
            if not np.any(mask):
                continue
            # Use bootstrap sample as train, left-out as test
            X_train = X[idx[mask]]
            y_train_pred = y_pred[idx[mask]]
            y_train_true = y_true[idx[mask]]

            # Raw error
            errs_raw.append(abs(y_pred[idx[i]] - y_true[idx[i]]))

            # KNN correction
            y_correction = y_train_true - y_train_pred
            correction = knn_predict(X_train, y_correction, X[idx[i]], k=3)
            corrected = y_pred[idx[i]] + correction
            errs_knn.append(abs(corrected - y_true[idx[i]]))

        if errs_raw and errs_knn:
            boot_maes_raw.append(np.mean(errs_raw))
            boot_maes_knn.append(np.mean(errs_knn))

    mae_raw_ci = (np.percentile(boot_maes_raw, 2.5), np.percentile(boot_maes_raw, 97.5))
    mae_knn_ci = (np.percentile(boot_maes_knn, 2.5), np.percentile(boot_maes_knn, 97.5))

    print(f"  {m:20s}:")
    print(f"    Brut:    {np.mean(boot_maes_raw):.2f} [{mae_raw_ci[0]:.2f}, {mae_raw_ci[1]:.2f}]")
    print(f"    KNN(3):  {np.mean(boot_maes_knn):.2f} [{mae_knn_ci[0]:.2f}, {mae_knn_ci[1]:.2f}]")
