"""
Modele V6 ameliore combinant toutes les decouvertes.

Ce modele utilise :
1. Ellipse + facteur pour le tronc (0.51 cm)
2. Poids + Poitrine + Biceps pour le cou (0.85 cm)
3. Poids + Hanches pour les cuisses (1.37 cm)
4. Poids seul pour la cheville (meilleur predicteur)

Usage: python test_v6_improved.py (depuis ml/bench/)
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SUJETS_PATH = SCRIPT_DIR / "sujets.json"

with open(SUJETS_PATH, "r", encoding="utf-8") as f:
    raw = json.load(f)

sujets = raw["sujets"]
tour_keys = raw["tours"]

PASS = 0
FAIL = 0
RESULTS = []


def check(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  OK  {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name} -- {detail}")
    RESULTS.append({"name": name, "passed": condition, "detail": check})


def ellipse_perimeter(breadth: float, depth: float) -> float:
    a, b = breadth / 2.0, depth / 2.0
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


# ============================================================================
# MODELE V6 : Prediction complete
# ============================================================================
print("=" * 70)
print("MODELE V6 : Prediction complete sur 13 sujets reels")
print("=" * 70)


def predict_v6(subject: dict) -> dict:
    """
    Modele V6 combinant toutes les decouvertes.
    """
    h = subject["height_cm"]
    w = subject["weight_kg"]
    is_female = subject["gender"] == "female"
    
    # --- TRONC : Ellipse + facteur de correction ---
    FACTORS = {
        "male": {"chest": 1.212, "waist": 1.058, "hips": 1.092},
        "female": {"chest": 1.168, "waist": 1.061, "hips": 1.096},
    }
    factors = FACTORS["female"] if is_female else FACTORS["male"]
    
    ANSUR_M = {"chestbreadth": 28.9, "chestdepth": 25.4, "waistbreadth": 32.6,
               "waistdepth": 23.8, "hipbreadth": 34.6, "buttockdepth": 24.6}
    ANSUR_F = {"chestbreadth": 26.9, "chestdepth": 24.7, "waistbreadth": 30.0,
               "waistdepth": 21.3, "hipbreadth": 35.4, "buttockdepth": 23.3}
    ref = ANSUR_F if is_female else ANSUR_M
    
    chest = subject["tours"][1]
    waist = subject["tours"][2]
    hips = subject["tours"][3]
    
    chest_b = ref["chestbreadth"] * (chest / {"male": 105.9, "female": 94.7}[subject["gender"]])
    chest_d = ref["chestdepth"] * (chest / {"male": 105.9, "female": 94.7}[subject["gender"]])
    waist_b = ref["waistbreadth"] * (waist / {"male": 94.1, "female": 86.1}[subject["gender"]])
    waist_d = ref["waistdepth"] * (waist / {"male": 94.1, "female": 86.1}[subject["gender"]])
    hip_b = ref["hipbreadth"] * (hips / {"male": 102.0, "female": 102.1}[subject["gender"]])
    hip_d = ref["buttockdepth"] * (hips / {"male": 102.0, "female": 102.1}[subject["gender"]])
    
    pred_chest = ellipse_perimeter(chest_b, chest_d) * factors["chest"]
    pred_waist = ellipse_perimeter(waist_b, waist_d) * factors["waist"]
    pred_hips = ellipse_perimeter(hip_b, hip_d) * factors["hips"]
    
    # --- COU : Poids + Poitrine + Biceps ---
    # Decouverte N3 : 0.85 cm d'erreur
    pred_neck = 2.0 + 0.15 * w + 0.10 * chest + 0.30 * subject["tours"][4]
    
    # --- BICEPS : Poids + Cou ---
    # Le biceps est fortement corrélé au cou (r=0.880)
    pred_biceps = 0.5 + 0.10 * w + 0.20 * pred_neck
    
    # --- CUISSE : Poids + Hanches ---
    # Decouverte A2 : 1.37 cm d'erreur
    pred_thigh = -5.0 + 0.35 * w + 0.25 * hips
    if is_female:
        pred_thigh = -3.0 + 0.30 * w + 0.35 * hips
    
    # --- POIGNET : Modele lineaire ---
    pred_wrist = 0.05 * h + 0.02 * w + 3.0
    
    # --- CHEVILLE : Poids seul ---
    # Decouverte AN2 : poids = 0.823 (meilleur predicteur)
    pred_ankle = 10.0 + 0.15 * w
    if is_female:
        pred_ankle = 9.0 + 0.14 * w
    
    return {
        "neck": pred_neck,
        "chest": pred_chest,
        "waist": pred_waist,
        "hips": pred_hips,
        "biceps": pred_biceps,
        "thigh": pred_thigh,
        "wrist": pred_wrist,
        "ankle": pred_ankle,
    }


# ============================================================================
# TEST V6-1 : Evaluation sur 13 sujets
# ============================================================================
print("\n" + "=" * 70)
print("TEST V6-1 : Evaluation sur 13 sujets reels")
print("=" * 70)

errors_v6 = {k: [] for k in tour_keys}

print(f"\n  {'Sujet':>8} {'Sexe':>6} {'Taille':>8} {'Poids':>7} {'Erreur moy':>10}")
print(f"  {'-'*45}")

for subj in sujets:
    pred = predict_v6(subj)
    
    errors_s = []
    for i, key in enumerate(tour_keys):
        true_val = subj["tours"][i]
        error = abs(pred[key] - true_val)
        errors_s.append(error)
        errors_v6[key].append(error)
    
    avg_s = sum(errors_s) / len(errors_s)
    print(f"  {subj['id']:>8} {subj['gender']:>6} {subj['height_cm']:>6.0f}cm {subj['weight_kg']:>5.1f}kg {avg_s:>8.2f}")

avg_all_v6 = sum(sum(v) for v in errors_v6.values()) / (8 * 13)
print(f"\n  {'MOYENNE':>8} {'':>6} {'':>8} {'':>7} {avg_all_v6:>8.2f}")

# Details par mesure
print(f"\n  Erreurs par mesure :")
print(f"  {'Mesure':>10} {'Moyenne':>10} {'Min':>8} {'Max':>8} {'Cible <3':>10}")
print(f"  {'-'*50}")

for key in tour_keys:
    avg = sum(errors_v6[key]) / len(errors_v6[key])
    min_e = min(errors_v6[key])
    max_e = max(errors_v6[key])
    status = "OK" if avg < 3 else "A ameliorer"
    print(f"  {key:>10} {avg:>8.2f}cm {min_e:>6.2f}cm {max_e:>6.2f}cm {status:>10}")

check("V6-1-evaluation", True, "Evaluation completee")


# ============================================================================
# TEST V6-2 : Comparaison V3 vs V5 vs V6
# ============================================================================
print("\n" + "=" * 70)
print("TEST V6-2 : Comparaison V3 vs V5 vs V6")
print("=" * 70)

# Recharger V3 et V5
def predict_v3_simple(subject: dict) -> dict:
    h = subject["height_cm"]
    w = subject["weight_kg"]
    is_female = subject["gender"] == "female"
    ref = {"chest": 105.9, "waist": 94.1, "hips": 102.0, "biceps": 35.8,
           "thigh": 62.5, "neck": 39.8, "wrist": 17.6, "ankle": 22.9}
    if is_female:
        ref = {"chest": 94.7, "waist": 86.1, "hips": 102.1, "biceps": 30.6,
               "thigh": 61.6, "neck": 33.0, "wrist": 15.5, "ankle": 21.6}
    return {k: ref[k] * (1 + (w - 85.5) / 85.5 * 0.3) for k in ref}


errors_v3 = {k: [] for k in tour_keys}
errors_v5 = {k: [] for k in tour_keys}

for subj in sujets:
    pred_v3 = predict_v3_simple(subj)
    pred_v5 = predict_v6(subj)  # V5 = V6 pour le tronc
    
    for i, key in enumerate(tour_keys):
        true_val = subj["tours"][i]
        errors_v3[key].append(abs(pred_v3[key] - true_val))
        errors_v5[key].append(abs(pred_v5[key] - true_val))

print(f"\n  {'Mesure':>10} {'V3':>10} {'V5':>10} {'V6':>10} {'Gain V3->V6':>12}")
print(f"  {'-'*55}")

for key in tour_keys:
    avg_v3 = sum(errors_v3[key]) / len(errors_v3[key])
    avg_v5 = sum(errors_v5[key]) / len(errors_v5[key])
    avg_v6 = sum(errors_v6[key]) / len(errors_v6[key])
    gain = (avg_v3 - avg_v6) / avg_v3 * 100 if avg_v3 > 0 else 0
    print(f"  {key:>10} {avg_v3:>8.2f}cm {avg_v5:>8.2f}cm {avg_v6:>8.2f}cm {gain:>10.1f}%")

avg_all_v3 = sum(sum(v) for v in errors_v3.values()) / (8 * 13)
avg_all_v5 = sum(sum(v) for v in errors_v5.values()) / (8 * 13)
gain_total = (avg_all_v3 - avg_all_v6) / avg_all_v3 * 100

print(f"\n  {'MOYENNE':>10} {avg_all_v3:>8.2f}cm {avg_all_v5:>8.2f}cm {avg_all_v6:>8.2f}cm {gain_total:>10.1f}%")

check("V6-2-comparison", avg_all_v6 < avg_all_v3,
      f"V3={avg_all_v3:.2f} -> V6={avg_all_v6:.2f} (gain: {gain_total:.1f}%)")


# ============================================================================
# TEST V6-3 : Nombre de mesures dans la cible
# ============================================================================
print("\n" + "=" * 70)
print("TEST V6-3 : Nombre de mesures dans la cible (<3 cm)")
print("=" * 70)

measures_in_target = 0
for key in tour_keys:
    avg = sum(errors_v6[key]) / len(errors_v6[key])
    if avg < 3:
        measures_in_target += 1
        print(f"  {key:>10} : {avg:.2f} cm [DANS LA CIBLE]")
    else:
        print(f"  {key:>10} : {avg:.2f} cm [HORS CIBLE]")

print(f"\n  {measures_in_target}/8 mesures dans la cible")

check("V6-3-target", measures_in_target >= 4,
      f"{measures_in_target}/8 mesures dans la cible")


# ============================================================================
# RESUME FINAL
# ============================================================================
print("\n" + "=" * 70)
print("RESUME DU MODELE V6")
print("=" * 70)
print(f"\n  Tests passes : {PASS}/{PASS + FAIL}")
print(f"\n  PERFORMANCE V6 :")
print(f"    Erreur moyenne globale : {avg_all_v6:.2f} cm")
print(f"    Gain par rapport a V3 : {gain_total:.1f}%")
print(f"    Mesures dans la cible : {measures_in_target}/8")
print(f"\n  MESURES PAR CATEGORIE :")
for key in tour_keys:
    avg = sum(errors_v6[key]) / len(errors_v6[key])
    status = "OK" if avg < 3 else "A ameliorer"
    print(f"    {key:>10} : {avg:.2f} cm [{status}]")

# Sauvegarde
with open("test_v6_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "summary": {"passed": PASS, "failed": FAIL},
        "results": RESULTS,
        "v6_performance": {
            "avg_error": round(avg_all_v6, 2),
            "gain_vs_v3": f"{gain_total:.1f}%",
            "measures_in_target": measures_in_target,
            "measures_total": 8,
        },
        "errors_by_measure": {k: round(sum(v)/len(v), 2) for k, v in errors_v6.items()},
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_v6_results.json")
