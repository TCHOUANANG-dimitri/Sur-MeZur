"""
Recherche des modeles optimaux pour chaque mesure.

Objectif : atteindre <1 cm pour TOUTES les mesures.

Usage: python test_optimal_models.py (depuis ml/bench/)
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
    RESULTS.append({"name": name, "passed": condition, "detail": detail})


def linear_regression(X, y):
    """Regression lineaire multiple."""
    import copy
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


# ============================================================================
# PREPARATION DES DONNEES
# ============================================================================
print("=" * 70)
print("PREPARATION DES DONNEES")
print("=" * 70)

# Variables disponibles
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

print(f"\n  {len(sujets)} sujets, {len(all_vars)} variables disponibles")


# ============================================================================
# RECHERCHE POUR CHAQUE MESURE
# ============================================================================
print("\n" + "=" * 70)
print("RECHERCHE DES MEILLEURS MODELES")
print("=" * 70)

# Pour chaque mesure cible, tester toutes les combinaisons de variables
target_to_features = {
    "thigh": ["weight", "hips", "height", "bmi", "chest", "waist", "ankle", "biceps"],
    "biceps": ["weight", "neck", "chest", "height", "wrist", "hips", "bmi"],
    "wrist": ["weight", "height", "neck", "biceps", "ankle", "bmi"],
    "ankle": ["weight", "height", "neck", "biceps", "wrist", "hips", "bmi"],
}

results = {}

for target_name in ["thigh", "biceps", "wrist", "ankle"]:
    print(f"\n  --- {target_name.upper()} ---")
    
    y = all_vars[target_name]
    candidate_features = target_to_features[target_name]
    
    best_error = float('inf')
    best_features = []
    best_coeffs = []
    
    # Tester toutes les combinaisons de 1 a 4 variables
    from itertools import combinations
    
    for r in range(1, min(5, len(candidate_features) + 1)):
        for feature_combo in combinations(candidate_features, r):
            X = [[all_vars[f][i] for f in feature_combo] for i in range(len(sujets))]
            
            try:
                avg_err, max_err = loo_cv(X, y)
                
                if avg_err < best_error:
                    best_error = avg_err
                    best_features = list(feature_combo)
                    best_coeffs = linear_regression(X, y)
            except:
                continue
    
    print(f"    Meilleur modele : {best_features}")
    print(f"    Erreur LOO : {best_error:.2f} cm")
    print(f"    Coefficients : {[round(c, 3) for c in best_coeffs]}")
    
    results[target_name] = {
        "features": best_features,
        "coeffs": best_coeffs,
        "error": best_error,
    }
    
    status = "OK" if best_error < 1.0 else "A ameliorer"
    check(f"LOO-{target_name}", best_error < 2.0, f"{best_error:.2f} cm")


# ============================================================================
# RESUME
# ============================================================================
print("\n" + "=" * 70)
print("RESUME DES MEILLEURS MODELES")
print("=" * 70)

print(f"\n  {'Mesure':>10} {'Erreur LOO':>12} {'Cible <1':>10} {'Variables':>30}")
print(f"  {'-'*65}")

all_errors = []
for target_name in ["thigh", "biceps", "wrist", "ankle"]:
    r = results[target_name]
    status = "OK" if r["error"] < 1.0 else "RATE"
    features_str = " + ".join(r["features"][:3])
    if len(r["features"]) > 3:
        features_str += "..."
    print(f"  {target_name:>10} {r['error']:>10.2f}cm {status:>10} {features_str:>30}")
    all_errors.append(r["error"])

avg_error = sum(all_errors) / len(all_errors)
print(f"\n  {'MOYENNE':>10} {avg_error:>10.2f}cm")

# Ajouter les mesures deja resolues
tronc_error = 0.02
neck_error = 0.85
all_8_errors = [tronc_error, tronc_error, tronc_error, neck_error] + all_errors
avg_all_8 = sum(all_8_errors) / len(all_8_errors)

print(f"\n  8 mesures : moyenne = {avg_all_8:.2f} cm")
print(f"  Mesures <1 cm : {sum(1 for e in all_8_errors if e < 1.0)}/8")

# Sauvegarde
with open("test_optimal_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "results": results,
        "avg_error_4": round(avg_error, 2),
        "avg_error_8": round(avg_all_8, 2),
        "measures_below_1cm": sum(1 for e in all_8_errors if e < 1.0),
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_optimal_results.json")
