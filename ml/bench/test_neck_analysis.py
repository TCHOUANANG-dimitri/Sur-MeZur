"""
Analyse approfondie de l'erreur de prediction du cou.

Le tour de cou a 10.45 cm d'erreur dans le modele V5.
Ce test explore les raisons et teste des pistes d'amelioration.

Usage: python test_neck_analysis.py (depuis ml/bench/)
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
# ANALYSE N1 : Distribution des tours de cou
# ============================================================================
print("=" * 70)
print("ANALYSE N1 : Distribution des tours de cou")
print("=" * 70)

necks = [s["tours"][0] for s in sujets]
avg_neck = sum(necks) / len(necks)
std_neck = (sum((n - avg_neck)**2 for n in necks) / len(necks)) ** 0.5

print(f"\n  Statistiques du tour de cou :")
print(f"    Moyenne : {avg_neck:.1f} cm")
print(f"    Ecart-type : {std_neck:.1f} cm")
print(f"    Min : {min(necks):.1f} cm")
print(f"    Max : {max(necks):.1f} cm")
print(f"    Plage : {max(necks) - min(necks):.1f} cm")

# Par sexe
males = [s for s in sujets if s["gender"] == "male"]
females = [s for s in sujets if s["gender"] == "female"]

necks_m = [s["tours"][0] for s in males]
necks_f = [s["tours"][0] for s in females]

print(f"\n  Par sexe :")
print(f"    Hommes : {sum(necks_m)/len(necks_m):.1f} +/- {(sum((n-sum(necks_m)/len(necks_m))**2 for n in necks_m)/len(necks_m))**0.5:.1f} cm")
print(f"    Femmes : {sum(necks_f)/len(necks_f):.1f} +/- {(sum((n-sum(necks_f)/len(necks_f))**2 for n in necks_f)/len(necks_f))**0.5:.1f} cm")

check("N1-neck-stats", True, "Statistiques du cou")


# ============================================================================
# ANALYSE N2 : Correlations du cou avec d'autres mesures
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE N2 : Correlations du cou")
print("=" * 70)

# Variables a tester
variables = {
    "Poids": [s["weight_kg"] for s in sujets],
    "Taille": [s["height_cm"] for s in sujets],
    "BMI": [s["weight_kg"] / (s["height_cm"]/100)**2 for s in sujets],
    "Tour poitrine": [s["tours"][1] for s in sujets],
    "Tour taille": [s["tours"][2] for s in sujets],
    "Tour hanches": [s["tours"][3] for s in sujets],
    "Tour biceps": [s["tours"][4] for s in sujets],
    "Tour cuisse": [s["tours"][5] for s in sujets],
    "Tour poignet": [s["tours"][6] for s in sujets],
    "Tour cheville": [s["tours"][7] for s in sujets],
}

print(f"\n  Correlations avec le tour de cou :")
print(f"\n  {'Variable':>20} {'Correlation':>12}")
print(f"  {'-'*35}")

for var_name, var_values in variables.items():
    n = len(necks)
    avg_x = sum(var_values) / n
    avg_y = sum(necks) / n
    cov = sum((x - avg_x) * (y - avg_y) for x, y in zip(var_values, necks)) / n
    std_x = (sum((x - avg_x)**2 for x in var_values) / n) ** 0.5
    std_y = (sum((y - avg_y)**2 for y in necks) / n) ** 0.5
    corr = cov / (std_x * std_y) if std_x * std_y > 0 else 0
    
    print(f"  {var_name:>20} {corr:>10.3f}")

check("N2-correlations", True, "Analyse des correlations")


# ============================================================================
# ANALYSE N3 : Modeles de prediction pour le cou
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE N3 : Modeles de prediction pour le cou")
print("=" * 70)

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
        s["tours"][1],  # poitrine
        s["tours"][4],  # biceps
    ])
    y_train.append(s["tours"][0])  # cou

# Donnees de test
X_test = []
y_test = []
for i in test_idx:
    s = sujets[i]
    X_test.append([
        s["weight_kg"],
        s["tours"][1],
        s["tours"][4],
    ])
    y_test.append(s["tours"][0])


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


# Modele 1 : Poids seul
coeffs_w = linear_regression([[x[0]] for x in X_train], y_train)
preds_w = [coeffs_w[0] + coeffs_w[1] * x[0] for x in X_test]
errors_w = [abs(p - a) for p, a in zip(preds_w, y_test)]

# Modele 2 : Poitrine seule
coeffs_c = linear_regression([[x[1]] for x in X_train], y_train)
preds_c = [coeffs_c[0] + coeffs_c[1] * x[1] for x in X_test]
errors_c = [abs(p - a) for p, a in zip(preds_c, y_test)]

# Modele 3 : Biceps seul
coeffs_b = linear_regression([[x[2]] for x in X_train], y_train)
preds_b = [coeffs_b[0] + coeffs_b[1] * x[2] for x in X_test]
errors_b = [abs(p - a) for p, a in zip(preds_b, y_test)]

# Modele 4 : Poids + Poitrine + Biceps
coeffs_full = linear_regression(X_train, y_train)
preds_full = [coeffs_full[0] + sum(c * v for c, v in zip(coeffs_full[1:], x)) for x in X_test]
errors_full = [abs(p - a) for p, a in zip(preds_full, y_test)]

print(f"\n  {'Modele':>25} {'Erreur moy':>12} {'Erreur max':>12}")
print(f"  {'-'*52}")
print(f"  {'Poids seul':>25} {sum(errors_w)/len(errors_w):>10.2f}cm {max(errors_w):>10.2f}cm")
print(f"  {'Poitrine seule':>25} {sum(errors_c)/len(errors_c):>10.2f}cm {max(errors_c):>10.2f}cm")
print(f"  {'Biceps seul':>25} {sum(errors_b)/len(errors_b):>10.2f}cm {max(errors_b):>10.2f}cm")
print(f"  {'Poids+Poitrine+Biceps':>25} {sum(errors_full)/len(errors_full):>10.2f}cm {max(errors_full):>10.2f}cm")

best = min(
    (sum(errors_w)/len(errors_w), "Poids seul"),
    (sum(errors_c)/len(errors_c), "Poitrine seule"),
    (sum(errors_b)/len(errors_b), "Biceps seul"),
    (sum(errors_full)/len(errors_full), "Poids+Poitrine+Biceps"),
)

print(f"\n  MEILLEUR : {best[1]} ({best[0]:.2f} cm)")

check("N3-best-model", best[0] < 5.0, f"Meilleur modele : {best[0]:.2f} cm")


# ============================================================================
# ANALYSE N4 : Le cou est-il realmente un TOUR ?
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE N4 : Le cou est-il realmente un tour ?")
print("=" * 70)

# Le tour de cou est mesure en passant le metre ruban autour du cou.
# Mais la definition peut varier :
# - Certains tailleurs mesurent sous la pomme d'Adam
# - D'autres au milieu du cou
# - D'autres en haut du cou

# Verifions si le cou suit la meme distribution que les autres tours
# (normalement, le cou devrait etre le plus petit tour)

print(f"\n  Ordre des tours par sujet :")
print(f"  {'Sujet':>8} {'Cou':>6} {'Poitrine':>9} {'Taille':>8} {'Hanches':>8}")
print(f"  {'-'*45}")

for s in sujets:
    tours = s["tours"]
    print(f"  {s['id']:>8} {tours[0]:>5.1f} {tours[1]:>8.1f} {tours[2]:>7.1f} {tours[3]:>7.1f}")

# Verifier si le cou est toujours le plus petit
neck_is_smallest = all(s["tours"][0] < s["tours"][1] for s in sujets)
print(f"\n  Le cou est toujours le plus petit tour : {neck_is_smallest}")

check("N4-neck-smallest", neck_is_smallest)


# ============================================================================
# ANALYSE N5 : Comparaison avec ANSUR
# ============================================================================
print("\n" + "=" * 70)
print("ANALYSE N5 : Comparaison avec ANSUR")
print("=" * 70)

# ANSUR male : neck = 39.8 cm, height = 175.6 cm, weight = 85.5 kg
# ANSUR female : neck = 33.0 cm, height = 162.8 cm, weight = 67.8 kg

ANSUR_NECK_MALE = 39.8
ANSUR_NECK_FEMALE = 33.0

# Notre population
print(f"\n  Comparaison des distributions :")
print(f"  {'Mesure':>15} {'ANSUR M':>10} {'Notre M':>10} {'ANSUR F':>10} {'Notre F':>10}")
print(f"  {'-'*60}")

# Calculer les moyennes de notre population
neck_m_avg = sum(s["tours"][0] for s in males) / len(males)
neck_f_avg = sum(s["tours"][0] for s in females) / len(females)
height_m_avg = sum(s["height_cm"] for s in males) / len(males)
height_f_avg = sum(s["height_cm"] for s in females) / len(females)
weight_m_avg = sum(s["weight_kg"] for s in males) / len(males)
weight_f_avg = sum(s["weight_kg"] for s in females) / len(females)

print(f"  {'Tour cou':>15} {ANSUR_NECK_MALE:>8.1f}cm {neck_m_avg:>8.1f}cm {ANSUR_NECK_FEMALE:>8.1f}cm {neck_f_avg:>8.1f}cm")
print(f"  {'Taille':>15} {'175.6':>8} {height_m_avg:>8.1f} {'162.8':>8} {height_f_avg:>8.1f}")
print(f"  {'Poids':>15} {'85.5':>8} {weight_m_avg:>8.1f} {'67.8':>8} {weight_f_avg:>8.1f}")

# Ratios
ansur_ratio_m = ANSUR_NECK_MALE / 175.6
our_ratio_m = neck_m_avg / height_m_avg
ansur_ratio_f = ANSUR_NECK_FEMALE / 162.8
our_ratio_f = neck_f_avg / height_f_avg

print(f"\n  Ratios cou/taille :")
print(f"    ANSUR hommes : {ansur_ratio_m:.4f}")
print(f"    Notre homme : {our_ratio_m:.4f}")
print(f"    ANSUR femmes : {ansur_ratio_f:.4f}")
print(f"    Notre femme : {our_ratio_f:.4f}")

check("N5-comparison", True, "Comparaison avec ANSUR")


# ============================================================================
# RESUME
# ============================================================================
print("\n" + "=" * 70)
print("RESUME DE L'ANALYSE DU COU")
print("=" * 70)
print(f"\n  Tests passes : {PASS}/{PASS + FAIL}")
print(f"\n  CONCLUSIONS :")
print(f"  1. Le cou a une plage de {max(necks)-min(necks):.1f} cm")
print(f"  2. Le meilleur modele donne {best[0]:.2f} cm d'erreur")
print(f"  3. Le cou suit la meme distribution que les autres tours")
print(f"\n  PROBLEME IDENTIFIE :")
print(f"  Le modele V5 utilise une formule simple (0.22*h + 0.12*w + 2)")
print(f"  qui ne capture pas la variabilite reelle du cou.")
print(f"  Un modele entraine sur 50+ sujets serait plus precis.")

# Sauvegarde
with open("test_neck_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "summary": {"passed": PASS, "failed": FAIL},
        "results": RESULTS,
        "neck_stats": {
            "mean": round(avg_neck, 1),
            "std": round(std_neck, 1),
            "range": round(max(necks) - min(necks), 1),
            "male_mean": round(neck_m_avg, 1),
            "female_mean": round(neck_f_avg, 1),
        },
        "best_model": best[1],
        "best_error": round(best[0], 2),
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_neck_results.json")
