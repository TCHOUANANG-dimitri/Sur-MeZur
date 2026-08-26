#!/usr/bin/env python3
"""
EXPERIENCE 3: ANALYSE DE SENSIBILITE
======================================
Quel sujet contribue le plus a l'erreur?
Que se passe-t-il si on enleve les outliers?
Quels patterns d'erreur sont partages?
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
print("1. PROFIL D'ERREUR PAR SUJET")
print("  (quelle est l'erreur moyenne de chaque sujet sur toutes les mesures?)")
print("=" * 80)
print()

for subj in subjects:
    errs = []
    for m in ALL_MEASURES:
        if m in subj["mesures"]:
            errs.append(abs(subj["mesures"][m]["calcule"] - subj["mesures"][m]["attendu"]))
    avg_err = np.mean(errs)
    print(f"  Sujet {subj['id']:2d} ({subj['gender']}, {subj['height_cm']}cm, {subj['weight_kg']}kg): "
          f"erreur_moy={avg_err:.2f} cm  (n={len(errs)} mesures)")

# ====================================================================
print()
print("=" * 80)
print("2. ANALYSE PAR MESURE: sujets les plus problematiques")
print("=" * 80)
print()

for m in ALL_MEASURES:
    print(f"\n  --- {m} ---")
    errs = []
    for subj in subjects:
        if m in subj["mesures"]:
            err = subj["mesures"][m]["calcule"] - subj["mesures"][m]["attendu"]
            errs.append((subj["id"], subj["gender"], subj["weight_kg"], err))
    errs.sort(key=lambda x: abs(x[3]), reverse=True)
    for sid, gen, w, err in errs:
        flag = " <<<< OUTLIER" if abs(err) > 3 * np.std([e[3] for e in errs]) else ""
        print(f"    Sujet {sid:2d} ({gen}, {w:5.1f}kg): error={err:+7.2f} cm{flag}")

# ====================================================================
print()
print("=" * 80)
print("3. IMPACT DE LA SUPPRESSION D'UN SUJET (leave-one-out MAE)")
print("=" * 80)
print()
print(f"  {'Mesure':20s}  {'MAE_12':>8s}", end="")
for i in range(N):
    print(f"  {'-S%d' % subjects[i]['id']:>8s}", end="")
print(f"  {'BEST':>8s}  {'GAIN':>8s}")
print(f"  {'-'*20}  {'-'*8}", end="")
for _ in range(N + 2):
    print(f"  {'-'*8}", end="")
print()

for m in ALL_MEASURES:
    all_errs = []
    for subj in subjects:
        if m in subj["mesures"]:
            all_errs.append(abs(subj["mesures"][m]["calcule"] - subj["mesures"][m]["attendu"]))
    mae_all = np.mean(all_errs)
    print(f"  {m:20s}  {mae_all:8.2f}", end="")

    best_mae = mae_all
    best_removed = None
    for j, subj_j in enumerate(subjects):
        if m not in subj_j["mesures"]:
            print(f"  {'N/A':>8s}", end="")
            continue
        remaining = [abs(subj["mesures"][m]["calcule"] - subj["mesures"][m]["attendu"])
                     for subj in subjects if subj["id"] != subj_j["id"] and m in subj["mesures"]]
        if remaining:
            mae_loo = np.mean(remaining)
            print(f"  {mae_loo:8.2f}", end="")
            if mae_loo < best_mae:
                best_mae = mae_loo
                best_removed = subj_j["id"]

    gain = mae_all - best_mae
    removed_str = f"S{best_removed}" if best_removed else "none"
    print(f"  {best_mae:8.2f}  {gain:+7.2f} ({removed_str})")

# ====================================================================
print()
print("=" * 80)
print("4. SIMULATION: KNN AVEC SUJETS OUTLIERS EXCLUS")
print("  (exclure les sujets dont l'erreur > 2x median)")
print("=" * 80)
print()

# Find outliers per measure
outlier_threshold = {}
for m in ALL_MEASURES:
    errs = []
    for subj in subjects:
        if m in subj["mesures"]:
            errs.append(abs(subj["mesures"][m]["calcule"] - subj["mesures"][m]["attendu"]))
    median_err = np.median(errs)
    outlier_threshold[m] = 3 * median_err

for m in ALL_MEASURES:
    outliers = []
    for subj in subjects:
        if m in subj["mesures"]:
            err = abs(subj["mesures"][m]["calcule"] - subj["mesures"][m]["attendu"])
            if err > outlier_threshold[m]:
                outliers.append(subj["id"])
    print(f"  {m:20s}: outliers = {outliers if outliers else 'aucun'}")

# ====================================================================
print()
print("=" * 80)
print("5. PATTERNS CROISES: meme erreur sur plusieurs mesures?")
print("=" * 80)
print()

# Compute signed errors per subject per measure
signed_errors = {}
for m in ALL_MEASURES:
    signed_errors[m] = []
    for subj in subjects:
        if m in subj["mesures"]:
            err = subj["mesures"][m]["calcule"] - subj["mesures"][m]["attendu"]
            signed_errors[m].append((subj["id"], err))

# Correlation between signed errors across measures
print("  Matrice de correlation des erreurs signees:")
print(f"  {'':20s}", end="")
for m in ALL_MEASURES[:8]:
    print(f"  {m[:6]:>6s}", end="")
print()

for m1 in ALL_MEASURES[:8]:
    print(f"  {m1:20s}", end="")
    errs1 = np.array([e[1] for e in signed_errors[m1]])
    for m2 in ALL_MEASURES[:8]:
        errs2 = np.array([e[1] for e in signed_errors[m2]])
        min_len = min(len(errs1), len(errs2))
        if min_len > 2:
            r = np.corrcoef(errs1[:min_len], errs2[:min_len])[0, 1]
            print(f"  {r:+6.2f}", end="")
        else:
            print(f"  {'N/A':>6s}", end="")
    print()
