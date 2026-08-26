"""
Recherche de modeles <1 cm pour les 12 mesures.

Objectif : atteindre <1 cm pour TOUTES les mesures.

Usage: python test_all_below_1cm.py (depuis ml/bench/)
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
longueur_keys = raw["longueurs"]

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
        
        try:
            coeffs = linear_regression(X_train, y_train)
            pred = coeffs[0] + sum(c * v for c, v in zip(coeffs[1:], X_test[0]))
            errors.append(abs(pred - y_test[0]))
        except:
            errors.append(float('inf'))
    
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
    "shoulder": [s["longueurs"][0] for s in sujets],
    "sleeve": [s["longueurs"][1] for s in sujets],
    "inseam": [s["longueurs"][2] for s in sujets],
    "back": [s["longueurs"][3] for s in sujets],
}

# Variables derivees
all_vars["neck_chest_ratio"] = [all_vars["neck"][i] / all_vars["chest"][i] for i in range(len(sujets))]
all_vars["weight_height_ratio"] = [all_vars["weight"][i] / all_vars["height"][i] for i in range(len(sujets))]
all_vars["hips_waist_ratio"] = [all_vars["hips"][i] / all_vars["waist"][i] for i in range(len(sujets))]
all_vars["chest_waist_ratio"] = [all_vars["chest"][i] / all_vars["waist"][i] for i in range(len(sujets))]


# ============================================================================
# RECHERCHE POUR CHAQUE MESURE
# ============================================================================
print("=" * 70)
print("RECHERCHE DES MEILLEURS MODELES POUR 12 MESURES")
print("=" * 70)

# Toutes les mesures a predire
targets = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle",
           "shoulder", "sleeve", "inseam", "back"]

# Variables candidates pour chaque mesure
candidate_features_all = ["height", "weight", "bmi", "neck", "chest", "waist", "hips",
                          "biceps", "thigh", "wrist", "ankle", "shoulder", "sleeve", 
                          "inseam", "back", "neck_chest_ratio", "weight_height_ratio",
                          "hips_waist_ratio", "chest_waist_ratio"]

results = {}

for target_name in targets:
    print(f"\n  --- {target_name.upper()} ---")
    
    y = all_vars[target_name]
    
    # Exclure la variable cible des candidats
    candidate_features = [f for f in candidate_features_all if f != target_name]
    
    best_error = float('inf')
    best_features = []
    best_coeffs = []
    
    # Tester les combinaisons de 1 a 3 variables
    for r in range(1, min(4, len(candidate_features) + 1)):
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
    
    results[target_name] = {
        "features": best_features,
        "coeffs": best_coeffs,
        "error": best_error,
    }
    
    status = "OK" if best_error < 1.0 else "RATE"
    print(f"    Statut : {status}")


# ============================================================================
# RESUME FINAL
# ============================================================================
print("\n" + "=" * 70)
print("RESUME FINAL - 12 mesures")
print("=" * 70)

print(f"\n  {'Mesure':>10} {'Erreur LOO':>12} {'Cible <1':>10} {'Variables':>40}")
print(f"  {'-'*75}")

measures_below_1 = 0
all_errors = []

for target_name in targets:
    r = results[target_name]
    status = "OK" if r["error"] < 1.0 else "RATE"
    if r["error"] < 1.0:
        measures_below_1 += 1
    all_errors.append(r["error"])
    
    features_str = " + ".join(r["features"][:3])
    if len(r["features"]) > 3:
        features_str += "..."
    print(f"  {target_name:>10} {r['error']:>10.2f}cm {status:>10} {features_str:>40}")

avg_all = sum(all_errors) / len(all_errors)

print(f"\n  MOYENNE : {avg_all:.2f} cm")
print(f"  Mesures <1 cm : {measures_below_1}/12")

if measures_below_1 == 12:
    print(f"\n  >>> OBJECTIF ATTEINT : 12/12 mesures <1 cm <<<")
elif measures_below_1 >= 10:
    print(f"\n  >>> PRESQUE ATTEINT : {measures_below_1}/12 mesures <1 cm <<<")
else:
    print(f"\n  >>> OBJECTIF NON ATTEINT : {measures_below_1}/12 mesures <1 cm <<<")

# Identifier les mesures problematiques
print(f"\n  Mesures >1 cm :")
for target_name in targets:
    r = results[target_name]
    if r["error"] >= 1.0:
        print(f"    {target_name} : {r['error']:.2f} cm")

# Sauvegarde
with open("test_all_below_1cm_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "results": results,
        "avg_error": round(avg_all, 2),
        "measures_below_1cm": measures_below_1,
        "measures_total": 12,
        "objective_reached": measures_below_1 == 12,
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_all_below_1cm_results.json")
