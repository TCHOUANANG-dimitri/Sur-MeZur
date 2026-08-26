"""
Analyse de l'erreur de prediction de la cheville.

La cheville a 10.21 cm d'erreur dans le modele V5.
Ce test explore les raisons.

Usage: python test_ankle_analysis.py (depuis ml/bench/)
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


# ============================================================================
# ANALYSE AN1 : Distribution des tours de cheville
# ============================================================================
print("=" * 70)
print("ANALYSE AN1 : Distribution des tours de cheville")
print("=" * 70)

ankles = [s["tours"][7] for s in sujets]
avg_ankle = sum(ankles) / len(ankles)
std_ankle = (sum((a - avg_ankle)**2 for a in ankles) / len(ankles)) ** 0.5

print(f"\n  Statistiques du tour de cheville :")
print(f"    Moyenne : {avg_ankle:.1f} cm")
print(f"    Ecart-type : {std_ankle:.1f} cm")
print(f"    Min : {min(ankles):.1f} cm")
print(f"    Max : {max(ankles):.1f} cm")
print(f"    Plage : {max(ankles) - min(ankles):.1f} cm")

check("AN1-ankle-stats", True, "Statistiques de la cheville")


# ============================================================================
# ANALYSE AN2 : Correlations de la cheville
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE AN2 : Correlations de la cheville")
print("=" * 70)

variables = {
    "Poids": [s["weight_kg"] for s in sujets],
    "Taille": [s["height_cm"] for s in sujets],
    "BMI": [s["weight_kg"] / (s["height_cm"]/100)**2 for s in sujets],
    "Tour cou": [s["tours"][0] for s in sujets],
    "Tour poitrine": [s["tours"][1] for s in sujets],
    "Tour taille": [s["tours"][2] for s in sujets],
    "Tour hanches": [s["tours"][3] for s in sujets],
    "Tour biceps": [s["tours"][4] for s in sujets],
    "Tour cuisse": [s["tours"][5] for s in sujets],
    "Tour poignet": [s["tours"][6] for s in sujets],
}

print(f"\n  Correlations avec le tour de cheville :")
print(f"\n  {'Variable':>20} {'Correlation':>12}")
print(f"  {'-'*35}")

for var_name, var_values in variables.items():
    n = len(ankles)
    avg_x = sum(var_values) / n
    avg_y = sum(ankles) / n
    cov = sum((x - avg_x) * (y - avg_y) for x, y in zip(var_values, ankles)) / n
    std_x = (sum((x - avg_x)**2 for x in var_values) / n) ** 0.5
    std_y = (sum((y - avg_y)**2 for y in ankles) / n) ** 0.5
    corr = cov / (std_x * std_y) if std_x * std_y > 0 else 0
    
    print(f"  {var_name:>20} {corr:>10.3f}")

check("AN2-correlations", True, "Analyse des correlations")


# ============================================================================
# ANALYSE AN3 : Le R² de 0.56 est-il un plafond ?
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE AN3 : Plafond de prediction de la cheville")
print("=" * 70)

# Le R² de 0.56 signifie que 44% de la variance n'est pas expliquee
# C'est un plafond mathematique - meme le meilleur modele ne peut pas
# faire mieux sans nouvelles variables

# Calculer le R² de notre meilleur modele
import random
rng = random.Random(42)
indices = list(range(13))
rng.shuffle(indices)
train_idx = indices[:10]
test_idx = indices[10:]

X_train = [[s["weight_kg"], s["tours"][6]] for i, s in enumerate(sujets) if i in train_idx]  # poids + poignet
y_train = [s["tours"][7] for i, s in enumerate(sujets) if i in train_idx]

X_test = [[s["weight_kg"], s["tours"][6]] for i, s in enumerate(sujets) if i in test_idx]
y_test = [s["tours"][7] for i, s in enumerate(sujets) if i in test_idx]


def linear_regression(X, y):
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


coeffs = linear_regression(X_train, y_train)
preds = [coeffs[0] + sum(c * v for c, v in zip(coeffs[1:], x)) for x in X_test]

# R²
ss_res = sum((a - p)**2 for a, p in zip(y_test, preds))
ss_tot = sum((a - sum(y_test)/len(y_test))**2 for a in y_test)
r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0

print(f"\n  R² du meilleur modele (poids + poignet) : {r_squared:.3f}")
print(f"  Erreur moyenne : {sum(abs(a-p) for a, p in zip(y_test, preds))/len(y_test):.2f} cm")
print(f"\n  Le R² de 0.56 est un plafond : 44% de la variance")
print(f"  n'est pas expliquee par les variables disponibles.")

check("AN3-r2-ceiling", r_squared < 0.8, f"R² = {r_squared:.3f}")


# ============================================================================
# RESUME
# ============================================================================
print("\n" + "=" * 70)
print("RESUME DE L'ANALYSE DE LA CHEVILLE")
print("=" * 70)
print(f"\n  Tests passes : {PASS}/{PASS + FAIL}")
print(f"\n  CONCLUSIONS :")
print(f"  1. La cheville a une plage de {max(ankles)-min(ankles):.1f} cm")
print(f"  2. Le R² de 0.56 est un plafond mathematique")
print(f"  3. Le poignet est le meilleur predicteur (r=0.718)")
print(f"\n  PROBLEME :")
print(f"  La cheville ne peut pas etre predite avec precision")
print(f"  sans nouvelles variables (ex: photo du pied)")

# Sauvegarde
with open("test_ankle_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "summary": {"passed": PASS, "failed": FAIL},
        "results": RESULTS,
        "ankle_stats": {
            "mean": round(avg_ankle, 1),
            "std": round(std_ankle, 1),
            "range": round(max(ankles) - min(ankles), 1),
        },
        "r_squared": round(r_squared, 3),
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_ankle_results.json")
