#!/usr/bin/env python3
"""
EXPERIENCE 2: ANALYSE DE L'EPAISSEUR DE VETEMENT
==================================================
Le pipeline estime l'epaisseur du vetement via volume corporel.
Teste: est-ce que l'erreur d'epaisseur est la cause principale des erreurs tronc?
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
print("ANALYSE DE L'EPAISSEUR DE VETEMENT ESTIMEE")
print("=" * 80)
print()
print("Le pipeline calcule clothing_thickness via la difference")
print("silhouette_habillee vs silhouette_corps_nu (volume = f(poids)).")
print()

# Compute clothing thickness from features
for subj in subjects:
    f = subj["features"]
    # Clothing thickness = (habille - body) / 2 pour chaque dimension
    chest_t = (f["chestbreadth"] - f["chestbreadth_body"]) / 2
    waist_t = (f["waistbreadth"] - f["waistbreadth_body"]) / 2
    hip_t = (f["hipbreadth"] - f["hipbreadth_body"]) / 2
    avg_t = (chest_t + waist_t + hip_t) / 3

    # Tronc errors
    chest_err = subj["mesures"]["chest"]["calcule"] - subj["mesures"]["chest"]["attendu"]
    waist_err = subj["mesures"]["waist"]["calcule"] - subj["mesures"]["waist"]["attendu"]
    hips_err = subj["mesures"]["hips"]["calcule"] - subj["mesures"]["hips"]["attendu"]

    subj["clothing"] = {
        "chest_thickness": chest_t,
        "waist_thickness": waist_t,
        "hip_thickness": hip_t,
        "avg_thickness": avg_t,
        "chest_error": chest_err,
        "waist_error": waist_err,
        "hip_error": hips_err,
    }

print(f"  {'Sujet':6s}  {'Chest_t':>8s}  {'Waist_t':>8s}  {'Hip_t':>8s}  {'Avg_t':>8s}  {'Chest_err':>10s}  {'Waist_err':>10s}  {'Hip_err':>10s}")
print(f"  {'-'*6}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*10}  {'-'*10}  {'-'*10}")

chest_t_vals, waist_t_vals, hip_t_vals = [], [], []
chest_errs, waist_errs, hips_errs = [], [], []
for subj in subjects:
    c = subj["clothing"]
    print(f"  {subj['id']:6d}  {c['chest_thickness']:8.2f}  {c['waist_thickness']:8.2f}  {c['hip_thickness']:8.2f}  {c['avg_thickness']:8.2f}  {c['chest_error']:+10.2f}  {c['waist_error']:+10.2f}  {c['hip_error']:+10.2f}")
    chest_t_vals.append(c["chest_thickness"])
    waist_t_vals.append(c["waist_thickness"])
    hip_t_vals.append(c["hip_thickness"])
    chest_errs.append(c["chest_error"])
    waist_errs.append(c["waist_error"])
    hips_errs.append(c["hip_error"])

chest_t_vals = np.array(chest_t_vals)
waist_t_vals = np.array(waist_t_vals)
hip_t_vals = np.array(hip_t_vals)
chest_errs = np.array(chest_errs)
waist_errs = np.array(waist_errs)
hips_errs = np.array(hips_errs)

# ====================================================================
print()
print("=" * 80)
print("CORRELATION: epaisseur vetement vs erreur de mesure")
print("=" * 80)
print()

for name, t_vals, errs in [("chest", chest_t_vals, chest_errs),
                            ("waist", waist_t_vals, waist_errs),
                            ("hips", hip_t_vals, hips_errs)]:
    if len(t_vals) > 2:
        r = np.corrcoef(t_vals, errs)[0, 1]
        print(f"  {name:8s}: r={r:+.3f} (n={len(t_vals)})  {'FORT' if abs(r) > 0.5 else 'FAIBLE'}")
    else:
        print(f"  {name:8s}: pas assez de donnees")

# ====================================================================
print()
print("=" * 80)
print("SIMULATION: que se passerait-il si on supprimait l'epaisseur de vetement?")
print("  (simulate: calcule = body_only, attendu = true)")
print("=" * 80)
print()

for subj in subjects:
    f = subj["features"]
    # Simulate: measurement from body dimensions only (no clothing)
    # Ellipse perimeter from body dimensions
    chest_body = np.pi * (3*(f["chestbreadth_body"]/2 + f["chestdepth_body"]/2) -
                          np.sqrt((3*f["chestbreadth_body"]/2 + f["chestdepth_body"]/2) *
                                  (f["chestbreadth_body"]/2 + 3*f["chestdepth_body"]/2)))
    waist_body = np.pi * (3*(f["waistbreadth_body"]/2 + f["waistdepth_body"]/2) -
                          np.sqrt((3*f["waistbreadth_body"]/2 + f["waistdepth_body"]/2) *
                                  (f["waistbreadth_body"]/2 + 3*f["waistdepth_body"]/2)))
    hip_body = np.pi * (3*(f["hipbreadth_body"]/2 + f["buttockdepth_body"]/2) -
                        np.sqrt((3*f["hipbreadth_body"]/2 + f["buttockdepth_body"]/2) *
                                (f["hipbreadth_body"]/2 + 3*f["buttockdepth_body"]/2)))

    subj["body_only"] = {
        "chest": chest_body,
        "waist": waist_body,
        "hips": hip_body,
    }

# Compute errors with body-only
body_errors = {m: [] for m in ["chest", "waist", "hips"]}
for subj in subjects:
    for m in ["chest", "waist", "hips"]:
        true_val = subj["mesures"][m]["attendu"]
        body_val = subj["body_only"][m]
        body_errors[m].append(abs(body_val - true_val))

for m in ["chest", "waist", "hips"]:
    errs = np.array(body_errors[m])
    mae_with_clothing = np.mean([abs(subj["mesures"][m]["calcule"] - subj["mesures"][m]["attendu"]) for subj in subjects])
    mae_body_only = np.mean(errs)
    print(f"  {m:8s}: MAE avec vetement={mae_with_clothing:.2f} cm  MAE body_only={mae_body_only:.2f} cm  gain={mae_with_clothing - mae_body_only:+.2f}")

# ====================================================================
print()
print("=" * 80)
print("SIMULATION: CORRECTION PAR ELLIPSE x FACTEUR (V4)")
print("  chest x 1.21, waist x 1.06, hips x 1.09")
print("=" * 80)
print()

FACTORS = {"chest": 1.21, "waist": 1.06, "hips": 1.09}

for m in ["chest", "waist", "hips"]:
    f = FACTORS[m]
    errs = []
    for subj in subjects:
        body_val = subj["body_only"][m]
        corrected = body_val * f
        true_val = subj["mesures"][m]["attendu"]
        errs.append(abs(corrected - true_val))
    mae = np.mean(errs)
    print(f"  {m:8s}: body*{f:.2f} -> MAE={mae:.2f} cm")

# ====================================================================
print()
print("=" * 80)
print("CALIBRATION DES FACTEURS SUR CE JEU DE DONNEES")
print("=" * 80)
print()

for m in ["chest", "waist", "hips"]:
    best_f = 1.0
    best_mae = 999
    for f in np.arange(0.8, 1.5, 0.005):
        errs = []
        for subj in subjects:
            body_val = subj["body_only"][m]
            corrected = body_val * f
            true_val = subj["mesures"][m]["attendu"]
            errs.append(abs(corrected - true_val))
        mae = np.mean(errs)
        if mae < best_mae:
            best_mae = mae
            best_f = f
    print(f"  {m:8s}: meilleur_f={best_f:.3f}  MAE={best_mae:.2f} cm")
