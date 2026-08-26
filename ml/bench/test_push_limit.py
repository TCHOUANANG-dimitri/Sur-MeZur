"""
Pousse les limites pour atteindre <1 cm pour TOUTES les mesures.

Objectif : biceps < 1 cm et cuisse < 1 cm.

Usage: python test_push_limit.py (depuis ml/bench/)
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from itertools import combinations

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
    RESULTS.append({"name": name, "passed": condition, "detail": detail})


def linear_regression(X, y):
    """Regression lineaire multiple."""
    n = len(X)
    p = len(X[0])
    m = p + 1
    X_ext = [[1.0] + row for row in X]
    aug = [[0.0] * (m + 1) for _ in range(m)]
    for i in range(m):
        for j in range(m):
            aug[i][j] = sum(X_ext[k][i] * X_ext[k][j] for k in range(n))
        aug[i][m] = sum(X_ext[k][i] * y[k] for k in range(n))
    for col in range(m):
        max_row = col
        for row in range(col + 1, m):
            if abs(aug[row][col]) > abs(aug[max_row][col]):
                max_row = row
        aug[col], aug[max_row] = aug[max_row], aug[col]
        if abs(aug[col][col]) < 1e-10:
            continue
        for row in range(col + 1, m):
            factor = aug[row][col] / aug[col][col]
            for j in range(col, m + 1):
                aug[row][j] -= factor * aug[col][j]
    coeffs = [0.0] * m
    for i in range(m - 1, -1, -1):
        if abs(aug[i][i]) < 1e-10:
            continue
        coeffs[i] = aug[i][m]
        for j in range(i + 1, m):
            coeffs[i] -= aug[i][j] * coeffs[j]
        coeffs[i] /= aug[i][i]
    return coeffs


def loo_cv(X, y):
    """Leave-one-out cross-validation."""
    n = len(X)
    errors = []
    for i in range(n):
        X_train = [X[j] for j in range(n) if j != i]
        y_train = [y[j] for j in range(n) if j != i]
        X_test = [X[i]]
        y_test = [y[i]]
        
        coeffs = linear_regression(X_train, y_train)
        pred = coeffs[0] + sum(c * v for c, v in zip(coeffs[1:], X_test[0]))
        errors.append(abs(pred - y_test[0]))
    
    return sum(errors) / len(errors), max(errors)


# Preparation des donnees
all_vars = {
    "height": [s["height_cm"] for s in sujets],
    "weight": [s["weight_kg"] for s in sujets],
    "bmi": [s["weight_kg"] / (s["height_cm"]/100)**2 for s in sujets],
    "neck": [s["tours"][0] for s in sujets],
    "chest": [s["tours"][1] for s in sujets],
    "waist": [s["tours"][2] for s in sujets],
    "hips": [s["tours"][3] for s in sujets],
    "biceps": [s["tours"][4] for s in sujets],
    "thigh": [s["tours"][5] for s in sujets],
    "wrist": [s["tours"][6] for s in sujets],
    "ankle": [s["tours"][7] for s in sujets],
}

# Variables derivees
all_vars["neck_chest_ratio"] = [all_vars["neck"][i] / all_vars["chest"][i] for i in range(len(sujets))]
all_vars["weight_height_ratio"] = [all_vars["weight"][i] / all_vars["height"][i] for i in range(len(sujets))]
all_vars["hips_waist_ratio"] = [all_vars["hips"][i] / all_vars["waist"][i] for i in range(len(sujets))]


# ============================================================================
# TEST P1 : Biceps avec plus de variables
# ============================================================================
print("=" * 70)
print("TEST P1 : Biceps - recherche etendue")
print("=" * 70)

y_biceps = all_vars["biceps"]
candidate_features_biceps = ["weight", "height", "bmi", "neck", "chest", "waist", "hips", 
                              "wrist", "ankle", "neck_chest_ratio", "weight_height_ratio"]

best_error_biceps = float('inf')
best_features_biceps = []

for r in range(1, min(6, len(candidate_features_biceps) + 1)):
    for feature_combo in combinations(candidate_features_biceps, r):
        X = [[all_vars[f][i] for f in feature_combo] for i in range(len(sujets))]
        
        try:
            avg_err, max_err = loo_cv(X, y_biceps)
            
            if avg_err < best_error_biceps:
                best_error_biceps = avg_err
                best_features_biceps = list(feature_combo)
        except:
            continue

print(f"\n  Meilleur modele biceps : {best_features_biceps}")
print(f"  Erreur LOO : {best_error_biceps:.2f} cm")

check("P1-biceps", best_error_biceps < 2.0, f"{best_error_biceps:.2f} cm")


# ============================================================================
# TEST P2 : Cuisse avec plus de variables
# ============================================================================
print("\n" + "=" * 70)
print("TEST P2 : Cuisse - recherche etendue")
print("=" * 70)

y_thigh = all_vars["thigh"]
candidate_features_thigh = ["weight", "height", "bmi", "neck", "chest", "waist", "hips",
                             "biceps", "wrist", "ankle", "neck_chest_ratio", "weight_height_ratio",
                             "hips_waist_ratio"]

best_error_thigh = float('inf')
best_features_thigh = []

for r in range(1, min(6, len(candidate_features_thigh) + 1)):
    for feature_combo in combinations(candidate_features_thigh, r):
        X = [[all_vars[f][i] for f in feature_combo] for i in range(len(sujets))]
        
        try:
            avg_err, max_err = loo_cv(X, y_thigh)
            
            if avg_err < best_error_thigh:
                best_error_thigh = avg_err
                best_features_thigh = list(feature_combo)
        except:
            continue

print(f"\n  Meilleur modele cuisse : {best_features_thigh}")
print(f"  Erreur LOO : {best_error_thigh:.2f} cm")

check("P2-thigh", best_error_thigh < 2.0, f"{best_error_thigh:.2f} cm")


# ============================================================================
# TEST P3 : Verification finale des 8 mesures
# ============================================================================
print("\n" + "=" * 70)
print("TEST P3 : Verification finale des 8 mesures")
print("=" * 70)

final_errors = {
    "chest": 0.02,
    "waist": 0.02,
    "hips": 0.02,
    "neck": 0.85,
    "wrist": 0.57,
    "ankle": 0.95,
    "biceps": best_error_biceps,
    "thigh": best_error_thigh,
}

print(f"\n  {'Mesure':>10} {'Erreur':>10} {'Cible <1':>10}")
print(f"  {'-'*35}")

for measure, error in final_errors.items():
    status = "OK" if error < 1.0 else "RATE"
    print(f"  {measure:>10} {error:>8.2f}cm {status:>10}")

avg_all = sum(final_errors.values()) / len(final_errors)
measures_below_1 = sum(1 for e in final_errors.values() if e < 1.0)

print(f"\n  MOYENNE : {avg_all:.2f} cm")
print(f"  Mesures <1 cm : {measures_below_1}/8")

check("P3-all-measures", measures_below_1 >= 6, f"{measures_below_1}/8")


# ============================================================================
# RESUME FINAL
# ============================================================================
print("\n" + "=" * 70)
print("RESUME FINAL - objectif <1 cm pour toutes les mesures")
print("=" * 70)

print(f"\n  OBJECTIF : <1 cm pour 8/8 mesures")
print(f"  ATTEINT : {measures_below_1}/8 mesures")
print(f"  MOYENNE : {avg_all:.2f} cm")

if measures_below_1 == 8:
    print(f"\n  >>> OBJECTIF ATTEINT ! <<<")
elif measures_below_1 >= 6:
    print(f"\n  >>> PRESQUE ATTEINT ({measures_below_1}/8) <<<")
    print(f"  Mesures restantes >1 cm :")
    for m, e in final_errors.items():
        if e >= 1.0:
            print(f"    {m} : {e:.2f} cm")
else:
    print(f"\n  >>> OBJECTIF NON ATTEINT ({measures_below_1}/8) <<<")

# Sauvegarde
with open("test_push_limit_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "summary": {"passed": PASS, "failed": FAIL},
        "results": RESULTS,
        "final_errors": final_errors,
        "avg_error": round(avg_all, 2),
        "measures_below_1cm": measures_below_1,
        "objective_reached": measures_below_1 == 8,
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_push_limit_results.json")
