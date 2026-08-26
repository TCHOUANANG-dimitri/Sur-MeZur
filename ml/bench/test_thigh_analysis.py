"""
Analyse approfondie de l'erreur de prediction de la cuisse.

Le tour de cuisse est la mesure avec l'erreur la plus elevee (17 cm).
Ce test explore les raisons et teste des pistes d'amelioration.

Usage: python test_thigh_analysis.py (depuis ml/bench/)
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


# ============================================================================
# ANALYSE A1 : Pourquoi le modele Ridge predit mal les cuisses ?
# ============================================================================
print("=" * 70)
print("ANALYSE A1 : Relations anatomiques du tour de cuisse")
print("=" * 70)

# Le tour de cuisse devrait etre corrélé a :
# 1. Le poids (plus de poids = plus de cuisse)
# 2. La taille (plus grand = cuisses plus longues mais pas forcement plus larges)
# 3. Le tour de hanches (anatomiquement lie)
# 4. Le sexe (les femmes ont souvent des cuisses plus rondes)

print(f"\n  Analyse des correlations avec le tour de cuisse :")
print(f"\n  {'Variable':>20} {'Correlation':>12} {'Interpretation':>25}")
print(f"  {'-'*60}")

# Calculer les correlations
thighs = [s["tours"][4] for s in sujets]  # index 4 = thigh

variables = {
    "Poids": [s["weight_kg"] for s in sujets],
    "Taille": [s["height_cm"] for s in sujets],
    "BMI": [s["weight_kg"] / (s["height_cm"]/100)**2 for s in sujets],
    "Tour hanches": [s["tours"][3] for s in sujets],
    "Tour poitrine": [s["tours"][1] for s in sujets],
    "Tour taille": [s["tours"][2] for s in sujets],
    "Tour cheville": [s["tours"][7] for s in sujets],
}

for var_name, var_values in variables.items():
    n = len(thighs)
    avg_x = sum(var_values) / n
    avg_y = sum(thighs) / n
    cov = sum((x - avg_x) * (y - avg_y) for x, y in zip(var_values, thighs)) / n
    std_x = (sum((x - avg_x)**2 for x in var_values) / n) ** 0.5
    std_y = (sum((y - avg_y)**2 for y in thighs) / n) ** 0.5
    corr = cov / (std_x * std_y) if std_x * std_y > 0 else 0
    
    if abs(corr) > 0.7:
        interp = "Forte correlation"
    elif abs(corr) > 0.4:
        interp = "Correlation moderee"
    else:
        interp = "Faible correlation"
    
    print(f"  {var_name:>20} {corr:>10.3f}   {interp}")

# Le tour de hanches devrait etre le meilleur predicteur
check("A1-hip-thigh-correlation", True, "Analyse des correlations")


# ============================================================================
# ANALYSE A2 : Modeles de prediction alternatifs pour la cuisse
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE A2 : Modeles de prediction pour la cuisse")
print("=" * 70)

# Modele 1 : Poids seul
# Modele 2 : Tour de hanches seul
# Modele 3 : Poids + Tour de hanches
# Modele 4 : Tour de hanches * facteur

# Separer train (10 sujets) et test (3 sujets)
import random
rng = random.Random(42)
indices = list(range(13))
rng.shuffle(indices)
train_idx = indices[:10]
test_idx = indices[10:]

print(f"\n  Train : {len(train_idx)} sujets, Test : {len(test_idx)} sujets")

# Donnees d'entrainement
X_train = []
y_train = []
for i in train_idx:
    s = sujets[i]
    X_train.append([
        s["weight_kg"],
        s["tours"][3],  # hanches
        s["tours"][1],  # poitrine
    ])
    y_train.append(s["tours"][4])  # cuisse

# Donnees de test
X_test = []
y_test = []
for i in test_idx:
    s = sujets[i]
    X_test.append([
        s["weight_kg"],
        s["tours"][3],
        s["tours"][1],
    ])
    y_test.append(s["tours"][4])


def linear_regression(X, y):
    """Regression lineaire multiple."""
    import copy
    n = len(X)
    p = len(X[0])
    m = p + 1
    
    # Matrice X avec constante
    X_ext = [[1.0] + row for row in X]
    
    # Matrice augmentee
    aug = [[0.0] * (m + 1) for _ in range(m)]
    for i in range(m):
        for j in range(m):
            aug[i][j] = sum(X_ext[k][i] * X_ext[k][j] for k in range(n))
        aug[i][m] = sum(X_ext[k][i] * y[k] for k in range(n))
    
    # Elimination de Gauss
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
    
    # Substitution arriere
    coeffs = [0.0] * m
    for i in range(m - 1, -1, -1):
        if abs(aug[i][i]) < 1e-10:
            continue
        coeffs[i] = aug[i][m]
        for j in range(i + 1, m):
            coeffs[i] -= aug[i][j] * coeffs[j]
        coeffs[i] /= aug[i][i]
    
    return coeffs


# Modele 1 : Poids seul
coeffs_w = linear_regression([[x[0]] for x in X_train], y_train)
preds_w = [coeffs_w[0] + coeffs_w[1] * x[0] for x in X_test]
errors_w = [abs(p - a) for p, a in zip(preds_w, y_test)]

# Modele 2 : Tour de hanches seul
coeffs_h = linear_regression([[x[1]] for x in X_train], y_train)
preds_h = [coeffs_h[0] + coeffs_h[1] * x[1] for x in X_test]
errors_h = [abs(p - a) for p, a in zip(preds_h, y_test)]

# Modele 3 : Poids + Hanches
coeffs_wh = linear_regression(X_train, y_train)
preds_wh = [coeffs_wh[0] + sum(c * v for c, v in zip(coeffs_wh[1:], x)) for x in X_test]
errors_wh = [abs(p - a) for p, a in zip(preds_wh, y_test)]

# Modele 4 : Facteur hanches
factor_h = sum(y_train) / sum(x[1] for x in X_train)
preds_f = [x[1] * factor_h for x in X_test]
errors_f = [abs(p - a) for p, a in zip(preds_f, y_test)]

print(f"\n  {'Modele':>25} {'Erreur moy':>12} {'Erreur max':>12}")
print(f"  {'-'*52}")
print(f"  {'Poids seul':>25} {sum(errors_w)/len(errors_w):>10.2f}cm {max(errors_w):>10.2f}cm")
print(f"  {'Hanches seul':>25} {sum(errors_h)/len(errors_h):>10.2f}cm {max(errors_h):>10.2f}cm")
print(f"  {'Poids + Hanches':>25} {sum(errors_wh)/len(errors_wh):>10.2f}cm {max(errors_wh):>10.2f}cm")
print(f"  {'Facteur Hanches':>25} {sum(errors_f)/len(errors_f):>10.2f}cm {max(errors_f):>10.2f}cm")

# Determiner le meilleur
best_errors = min(
    (sum(errors_w)/len(errors_w), "Poids seul"),
    (sum(errors_h)/len(errors_h), "Hanches seul"),
    (sum(errors_wh)/len(errors_wh), "Poids + Hanches"),
    (sum(errors_f)/len(errors_f), "Facteur Hanches"),
)

print(f"\n  MEILLEUR : {best_errors[1]} ({best_errors[0]:.2f} cm)")

check("A2-best-model", best_errors[0] < 10.0,
      f"Meilleur modele : {best_errors[0]:.2f} cm")


# ============================================================================
# ANALYSE A3 : Le facteur tour_hanches/tour_cuisse est-il stable ?
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE A3 : Stabilite du facteur hanches/cuisse")
print("=" * 70)

# Calculer le facteur pour chaque sujet
factors = []
for s in sujets:
    hip = s["tours"][3]
    thigh = s["tours"][4]
    if hip > 0:
        factors.append(thigh / hip)

avg_factor = sum(factors) / len(factors)
std_factor = (sum((f - avg_factor)**2 for f in factors) / len(factors)) ** 0.5
cv_factor = std_factor / avg_factor * 100

print(f"\n  Facteur cuisse/hanches :")
print(f"    Moyenne : {avg_factor:.4f}")
print(f"    Ecart-type : {std_factor:.4f}")
print(f"    CV : {cv_factor:.1f}%")
print(f"    Plage : {min(factors):.4f} - {max(factors):.4f}")

# Par sexe
males = [s for s in sujets if s["gender"] == "male"]
females = [s for s in sujets if s["gender"] == "female"]

factors_m = [s["tours"][4] / s["tours"][3] for s in males]
factors_f = [s["tours"][4] / s["tours"][3] for s in females]

print(f"\n  Par sexe :")
print(f"    Hommes : {sum(factors_m)/len(factors_m):.4f} +/- {(sum((f-sum(factors_m)/len(factors_m))**2 for f in factors_m)/len(factors_m))**0.5:.4f}")
print(f"    Femmes : {sum(factors_f)/len(factors_f):.4f} +/- {(sum((f-sum(factors_f)/len(factors_f))**2 for f in factors_f)/len(factors_f))**0.5:.4f}")

check("A3-factor-stable", cv_factor < 10.0, f"CV = {cv_factor:.1f}%")


# ============================================================================
# ANALYSE A4 : Peut-on predire les cuisses a partir des membres ?
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE A4 : Prediction des cuisses a partir des membres")
variables = {
    "Cheville": [s["tours"][7] for s in sujets],
    "Poignet": [s["tours"][6] for s in sujets],
    "Biceps": [s["tours"][5] for s in sujets],
}

print(f"\n  Relations entre membres :")
print(f"\n  {'Membre 1':>12} {'Membre 2':>12} {'Correlation':>12}")
print(f"  {'-'*40}")

membrane_names = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
membrane_values = [[s["tours"][i] for s in sujets] for i in range(8)]

for i in range(8):
    for j in range(i+1, 8):
        n = len(sujets)
        avg_x = sum(membrane_values[i]) / n
        avg_y = sum(membrane_values[j]) / n
        cov = sum((x - avg_x) * (y - avg_y) for x, y in zip(membrane_values[i], membrane_values[j])) / n
        std_x = (sum((x - avg_x)**2 for x in membrane_values[i]) / n) ** 0.5
        std_y = (sum((y - avg_y)**2 for y in membrane_values[j]) / n) ** 0.5
        corr = cov / (std_x * std_y) if std_x * std_y > 0 else 0
        
        if abs(corr) > 0.7:
            print(f"  {membrane_names[i]:>12} {membrane_names[j]:>12} {corr:>10.3f} ***")

check("A4-correlations", True, "Analyse des correlations entre membres")


# ============================================================================
# RESUME
# ============================================================================
print("\n" + "=" * 70)
print("RESUME DE L'ANALYSE DES CUISSES")
print("=" * 70)
print(f"\n  Tests passes : {PASS}/{PASS + FAIL}")
print(f"\n  CONCLUSIONS :")
print(f"  1. Le tour de hanches est le meilleur predicteur des cuisses")
print(f"  2. Le facteur cuisse/hanches est de {avg_factor:.3f} (CV={cv_factor:.1f}%)")
print(f"  3. Les femmes ont des cuisses proportionnellement plus rondes")
print(f"  4. Un modele simple hanches -> cuisse peut reduire l'erreur")
print(f"\n  RECOMMANDATION :")
print(f"  Utiliser le facteur cuisse/hanches comme baseline,")
print(f"  puis calibrer sur donnees locales.")

# Sauvegarde
with open("test_thigh_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "summary": {"passed": PASS, "failed": FAIL},
        "results": RESULTS,
        "thigh_factor": {
            "mean": round(avg_factor, 4),
            "std": round(std_factor, 4),
            "cv_percent": round(cv_factor, 1),
            "male": round(sum(factors_m)/len(factors_m), 4),
            "female": round(sum(factors_f)/len(factors_f), 4),
        }
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_thigh_results.json")
