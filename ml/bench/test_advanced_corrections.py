#!/usr/bin/env python3
"""
TEST DE CORRECTIONS AVANCEES
=============================
Teste des corrections combinees et non-lineaires pour atteindre <1cm sur TOUTES les mesures.
Basé sur les résultats du pipeline reel (test_real_pipeline_results.json).
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

# Build ground truth from sujets.json
MEASURES_ORDER = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS_ORDER = ["shoulder", "sleeve_length", "inseam", "back_length"]
ALL_MEASURES = MEASURES_ORDER + LONGUEURS_ORDER

gt = {}
subjects_info = {}
for s in sujets_raw["sujets"]:
    sid = str(s["id"])
    gt[sid] = {}
    for i, m in enumerate(MEASURES_ORDER):
        gt[sid][m] = s["tours"][i]
    for i, m in enumerate(LONGUEURS_ORDER):
        gt[sid][m] = s["longueurs"][i]
    subjects_info[sid] = {"gender": s["gender"], "height_cm": s["height_cm"],
                          "weight_kg": s["weight_kg"]}

# Build prediction lookup from pipeline results
details = raw_results["details_sujets"]
pred = {}
for d in details:
    sid = str(d["id"])
    pred[sid] = {}
    for m in ALL_MEASURES:
        if m in d["mesures"]:
            pred[sid][m] = d["mesures"][m]["calcule"]

# Collect arrays per measure
def get_arrays(measure):
    raw_vals, true_vals, sids = [], [], []
    for sid in sorted(pred.keys(), key=int):
        if measure in pred[sid] and measure in gt.get(sid, {}):
            raw_vals.append(pred[sid][measure])
            true_vals.append(gt[sid][measure])
            sids.append(sid)
    return np.array(raw_vals), np.array(true_vals), sids

# ====================================================================
print("=" * 80)
print("ANALYSE DES BIAIS PAR MESURE (PIPELINE REEL)")
print("=" * 80)
print()
for m in ALL_MEASURES:
    raw_vals, true_vals, sids = get_arrays(m)
    errors = raw_vals - true_vals
    mae = np.mean(np.abs(errors))
    bias = np.mean(errors)
    print(f"  {m:20s}  MAE={mae:6.2f} cm  bias={bias:+6.2f} cm  (n={len(raw_vals)})")

# ====================================================================
print()
print("=" * 80)
print("1. CORRECTION SIMPLE: biais additif")
print("=" * 80)
for m in ALL_MEASURES:
    raw_vals, true_vals, _ = get_arrays(m)
    errors = raw_vals - true_vals
    before = np.mean(np.abs(errors))
    corrected = raw_vals - np.mean(errors)
    after = np.mean(np.abs(corrected - true_vals))
    status = "<1" if after < 1.0 else ">=1"
    print(f"  {m:20s}: {before:.2f} -> {after:.2f} cm  [{status}]")

# ====================================================================
print()
print("=" * 80)
print("2. CORRECTION PROPORTIONNELLE: facteur multiplicative")
print("=" * 80)
for m in ALL_MEASURES:
    raw_vals, true_vals, _ = get_arrays(m)
    before = np.mean(np.abs(raw_vals - true_vals))
    best_f = np.mean(true_vals) / np.mean(raw_vals)
    corrected = raw_vals * best_f
    after = np.mean(np.abs(corrected - true_vals))
    status = "<1" if after < 1.0 else ">=1"
    print(f"  {m:20s}: f={best_f:.4f}  {before:.2f} -> {after:.2f} cm  [{status}]")

# ====================================================================
print()
print("=" * 80)
print("3. CORRECTION COMBINEE: f x (raw + b) -- grid search")
print("=" * 80)
combined_results = {}
for m in ALL_MEASURES:
    raw_vals, true_vals, _ = get_arrays(m)
    before = np.mean(np.abs(raw_vals - true_vals))

    best_mae = 999
    best_f, best_b = 1.0, 0.0
    for f in np.arange(0.85, 1.25, 0.02):
        for b in np.arange(-10, 10, 0.5):
            corrected = f * (raw_vals + b)
            mae = np.mean(np.abs(corrected - true_vals))
            if mae < best_mae:
                best_mae = mae
                best_f, best_b = f, b

    combined_results[m] = (best_f, best_b, best_mae)
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: f={best_f:.3f}, b={best_b:+5.1f}  ->  {before:.2f} -> {best_mae:.2f} cm  [{status}]")

# ====================================================================
print()
print("=" * 80)
print("4. CORRECTION PAR SEXE: biais separe homme/femme")
print("=" * 80)
sex_results = {}
for m in ALL_MEASURES:
    raw_vals, true_vals, sids = get_arrays(m)
    before = np.mean(np.abs(raw_vals - true_vals))

    male_mask = np.array([subjects_info[s]["gender"] == "male" for s in sids])
    female_mask = ~male_mask

    if np.sum(male_mask) >= 2 and np.sum(female_mask) >= 2:
        male_err = np.mean(raw_vals[male_mask] - true_vals[male_mask])
        female_err = np.mean(raw_vals[female_mask] - true_vals[female_mask])

        corrected = raw_vals.copy()
        corrected[male_mask] -= male_err
        corrected[female_mask] -= female_err
        after = np.mean(np.abs(corrected - true_vals))
        sex_results[m] = (male_err, female_err, after)
        status = "<1" if after < 1.0 else ">=1"
        print(f"  {m:20s}: male={male_err:+5.2f}, female={female_err:+5.2f}  ->  {before:.2f} -> {after:.2f} cm  [{status}]")
    else:
        print(f"  {m:20s}: donnees insuffisantes par sexe")

# ====================================================================
print()
print("=" * 80)
print("5. CORRECTION COMBINEE + SEXE: f x (raw + b_male/b_female)")
print("=" * 80)
optimal_results = {}
for m in ALL_MEASURES:
    raw_vals, true_vals, sids = get_arrays(m)
    before = np.mean(np.abs(raw_vals - true_vals))
    male_mask = np.array([subjects_info[s]["gender"] == "male" for s in sids])
    female_mask = ~male_mask

    best_mae = 999
    best_f, best_bm, best_bf = 1.0, 0.0, 0.0
    for f in np.arange(0.85, 1.25, 0.05):
        for bm in np.arange(-10, 10, 0.5):
            for bf in np.arange(-10, 10, 0.5):
                corrected = np.zeros_like(raw_vals)
                corrected[male_mask] = f * (raw_vals[male_mask] + bm)
                corrected[female_mask] = f * (raw_vals[female_mask] + bf)
                mae = np.mean(np.abs(corrected - true_vals))
                if mae < best_mae:
                    best_mae = mae
                    best_f, best_bm, best_bf = f, bm, bf

    optimal_results[m] = (before, best_mae, best_f, best_bm, best_bf)
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: f={best_f:.2f}, bM={best_bm:+5.1f}, bF={best_bf:+5.1f}  ->  {before:.2f} -> {best_mae:.2f} cm  [{status}]")

# ====================================================================
print()
print("=" * 80)
print("6. RESUME FINAL -- MEILLEURS MODELES PAR MESURE")
print("=" * 80)
print()

final_best = {}
for m in ALL_MEASURES:
    raw_vals, true_vals, _ = get_arrays(m)
    before = np.mean(np.abs(raw_vals - true_vals))

    # Try all correction types
    candidates = []

    # Simple bias
    corrected = raw_vals - np.mean(raw_vals - true_vals)
    candidates.append(("biais", np.mean(np.abs(corrected - true_vals))))

    # Multiplicative
    f = np.mean(true_vals) / np.mean(raw_vals)
    corrected = raw_vals * f
    candidates.append(("facteur", np.mean(np.abs(corrected - true_vals))))

    # Combined f*(raw+b)
    f, b, mae = combined_results[m]
    candidates.append(("f*(raw+b)", mae))

    # Sex-based bias
    if m in sex_results:
        candidates.append(("sexe", sex_results[m][2]))

    # Optimal combined
    _, mae_opt, _, _, _ = optimal_results[m]
    candidates.append(("optimal", mae_opt))

    best_name, best_mae = min(candidates, key=lambda x: x[1])
    final_best[m] = (best_name, best_mae)
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: meilleur={best_name:12s}  MAE={best_mae:.2f} cm  [{status}]")

print()
n_below = sum(1 for _, (_, mae) in final_best.items() if mae < 1.0)
n_total = len(final_best)
print(f"  >> {n_below}/{n_total} mesures sous 1 cm")
print()

# ====================================================================
print("=" * 80)
print("FACTEURS DE CORRECTION A APPLIQUER (meilleur par mesure)")
print("=" * 80)
print()
print("Pour chaque mesure, appliquer la meilleure correction trouvee:")
print()
for m in ALL_MEASURES:
    f, b, mae = combined_results[m]
    status = "<1" if mae < 1.0 else ">=1"
    print(f"  {m:20s}: corrected = {f:.3f} x (raw + ({b:+.1f}))  -> MAE={mae:.2f} cm  [{status}]")

# ====================================================================
print()
print("=" * 80)
print("7. VALIDATION CROISEE LOO-CV SUR CORRECTIONS SIMPLES")
print("=" * 80)
print("  (Pour viter le sur-apprentissage avec 13 sujets)")
print()

for m in ALL_MEASURES:
    raw_vals, true_vals, sids = get_arrays(m)
    n = len(raw_vals)
    if n < 4:
        continue

    # LOO-CV with simple bias correction
    loo_errors = []
    for i in range(n):
        # Train on all except i
        train_raw = np.delete(raw_vals, i)
        train_true = np.delete(true_vals, i)
        bias = np.mean(train_raw - train_true)

        # Test on i
        corrected_i = raw_vals[i] - bias
        loo_errors.append(abs(corrected_i - true_vals[i]))

    loo_mae = np.mean(loo_errors)

    # LOO-CV with combined f*(raw+b)
    loo_errors_f = []
    for i in range(n):
        train_raw = np.delete(raw_vals, i)
        train_true = np.delete(true_vals, i)

        best_mae_t = 999
        best_f_t = 1.0
        best_b_t = 0.0
        for f in np.arange(0.85, 1.25, 0.05):
            for b in np.arange(-10, 10, 1.0):
                corrected_t = f * (train_raw + b)
                mae_t = np.mean(np.abs(corrected_t - train_true))
                if mae_t < best_mae_t:
                    best_mae_t = mae_t
                    best_f_t, best_b_t = f, b

        corrected_i = best_f_t * (raw_vals[i] + best_b_t)
        loo_errors_f.append(abs(corrected_i - true_vals[i]))

    loo_mae_f = np.mean(loo_errors_f)

    before = np.mean(np.abs(raw_vals - true_vals))
    status1 = "<1" if loo_mae < 1.0 else ">=1"
    status2 = "<1" if loo_mae_f < 1.0 else ">=1"
    print(f"  {m:20s}: brut={before:.2f}  biais_LOO={loo_mae:.2f}cm[{status1}]  f*b_LOO={loo_mae_f:.2f}cm[{status2}]")

# ====================================================================
print()
print("=" * 80)
print("8. TEST AVEC LE Poids COMME FEATURE ADDITIONNELLE")
print("=" * 80)
print("  Formule: corrected = f * (raw + a*weight + b)")
print()

for m in ALL_MEASURES:
    raw_vals, true_vals, sids = get_arrays(m)
    weights = np.array([subjects_info[s]["weight_kg"] for s in sids])
    n = len(raw_vals)
    if n < 4:
        continue

    before = np.mean(np.abs(raw_vals - true_vals))

    # Grid search
    best_mae = 999
    best_f, best_a, best_b = 1.0, 0.0, 0.0
    for f in np.arange(0.85, 1.25, 0.05):
        for a in np.arange(-0.2, 0.2, 0.02):
            for b in np.arange(-10, 10, 0.5):
                corrected = f * (raw_vals + a * weights + b)
                mae = np.mean(np.abs(corrected - true_vals))
                if mae < best_mae:
                    best_mae = mae
                    best_f, best_a, best_b = f, a, b

    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: f={best_f:.2f}, a_w={best_a:+.4f}, b={best_b:+.1f}  ->  {before:.2f} -> {best_mae:.2f} cm  [{status}]")
