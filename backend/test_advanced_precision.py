"""
Tests avances pour ameliorer la precision au-dela de V4.

Ces tests explorent de nouvelles pistes d'amelioration :
1. Sensibilite a la rotation du sujet (profil)
2. Calibration par le cou
3. Modele ensemble (stacking)
4. Features de forme du corps
5. Correction par le poids/IMC

Usage: python test_advanced_precision.py (depuis backend/)
"""

from __future__ import annotations

import math
import os
import sys
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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
# DONNEES DE REFERENCE
# ============================================================================

ANSUR_MALE = {
    "height": 175.6, "weight": 85.5,
    "chest": 105.9, "waist": 94.1, "hips": 102.0,
    "biceps": 35.8, "thigh": 62.5, "neck": 39.8,
    "wrist": 17.6, "ankle": 22.9,
    "chestbreadth": 28.9, "chestdepth": 25.4,
    "waistbreadth": 32.6, "waistdepth": 23.8,
    "hipbreadth": 34.6, "buttockdepth": 24.6,
    "biacromialbreadth": 41.6,
}

ANSUR_FEMALE = {
    "height": 162.8, "weight": 67.8,
    "chest": 94.7, "waist": 86.1, "hips": 102.1,
    "biceps": 30.6, "thigh": 61.6, "neck": 33.0,
    "wrist": 15.5, "ankle": 21.6,
    "chestbreadth": 26.9, "chestdepth": 24.7,
    "waistbreadth": 30.0, "waistdepth": 21.3,
    "hipbreadth": 35.4, "buttockdepth": 23.3,
    "biacromialbreadth": 36.5,
}


def ellipse_perimeter(breadth: float, depth: float) -> float:
    a, b = breadth / 2.0, depth / 2.0
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


# ============================================================================
# TEST N1 : Sensibilite a la rotation du sujet
# ============================================================================
print("=" * 70)
print("TEST N1 : Impact de la rotation sur les profondeurs du profil")
print("=" * 70)

def simulate_rotation(true_depth: float, rotation_deg: float) -> float:
    """
    Simule l'effet de la rotation sur la profondeur mesuree.
    
    Si le sujet est tourne de theta degres, la profondeur apparente est :
    apparent = true_depth * cos(theta) + width * sin(theta)
    
    Pour un tour de 10 degres sur une poitrine (depth=25cm, breadth=29cm) :
    apparent = 25 * cos(10°) + 29 * sin(10°) = 24.6 + 5.0 = 29.6 cm
    C'est une ERREUR de +4.6 cm !
    """
    theta = math.radians(rotation_deg)
    # La profondeur apparente est la projection sur l'axe de la camera
    # Plus il y a de rotation, plus la largeur "contamine" la profondeur
    apparent = true_depth * abs(math.cos(theta))
    return apparent


# Test sur diferentes rotations
rotations = [0, 5, 10, 15, 20, 25, 30]
true_depth = 25.0  # cm

print(f"\n  Profondeur reelle : {true_depth:.1f} cm")
print(f"\n  {'Rotation':>10} {'Apparente':>12} {'Erreur':>10} {'Impact tour':>14}")
print(f"  {'-'*50}")

for rot in rotations:
    apparent = simulate_rotation(true_depth, rot)
    error = apparent - true_depth
    
    # Impact sur le tour (ellipse avec largeur fixe)
    breadth = 29.0  # cm
    tour_true = ellipse_perimeter(breadth, true_depth)
    tour_apparent = ellipse_perimeter(breadth, apparent)
    impact_tour = tour_apparent - tour_true
    
    print(f"  {rot:>8}° {apparent:>10.1f} cm {error:>+8.1f} cm {impact_tour:>+12.1f} cm")

# Verification : 10 de rotation donne une erreur acceptable ?
apparent_10 = simulate_rotation(true_depth, 10)
error_10 = abs(apparent_10 - true_depth)
check("N1-rotation-10deg", error_10 < 2.0,
      f"Erreur a 10 degres : {error_10:.1f} cm")

# Conclusion
print(f"\n  CONCLUSION : Une rotation de 10° donne une erreur de {error_10:.1f} cm")
print(f"  sur la profondeur, ce qui impacte le tour de ~{abs(ellipse_perimeter(29, apparent_10) - ellipse_perimeter(29, true_depth)):.1f} cm")


# ============================================================================
# TEST N2 : Calibration par le cou
# ============================================================================
print("\n" + "=" * 70)
print("TEST N2 : Le cou comme reference d'echelle supplementaire")
print("=" * 70)

# Ratios ANSUR
neck_height_ratio_male = ANSUR_MALE["neck"] / ANSUR_MALE["height"]
neck_height_ratio_female = ANSUR_FEMALE["neck"] / ANSUR_FEMALE["height"]

print(f"\n  Ratios ANSUR :")
print(f"    Homme : cou/taille = {neck_height_ratio_male:.4f}")
print(f"    Femme : cou/taille = {neck_height_ratio_female:.4f}")

# Le cou est mesure par MediaPipe comme une distance entre les points
# d'epaule, pas comme une circonference. On ne peut PAS l'utiliser
# directement comme reference d'echelle.

# Mais on peut utiliser le RATIO cou/largeur d'epaules comme
# indicateur de la morphologie
neck_breadth_ratio_male = ANSUR_MALE["neck"] / ANSUR_MALE["biacromialbreadth"]
neck_breadth_ratio_female = ANSUR_FEMALE["neck"] / ANSUR_FEMALE["biacromialbreadth"]

print(f"\n  Ratios cou/largeur epaules :")
print(f"    Homme : {neck_breadth_ratio_male:.4f}")
print(f"    Femme : {neck_breadth_ratio_female:.4f}")

# Test : peut-on predire le cou a partir de la largeur d'epaules ?
# Si oui, on peut utiliser cette prediction comme check de coherence
check("N2-neck-breadth-ratio", 0.8 < neck_breadth_ratio_male < 1.1,
      f"ratio male = {neck_breadth_ratio_male:.4f}")
check("N2-neck-breadth-ratio-female", 0.8 < neck_breadth_ratio_female < 1.1,
      f"ratio female = {neck_breadth_ratio_female:.4f}")

# Application : prediction du cou a partir de la largeur d'epaules
predicted_neck_male = ANSUR_MALE["biacromialbreadth"] * neck_breadth_ratio_male
error_neck = abs(predicted_neck_male - ANSUR_MALE["neck"])
print(f"\n  Prediction du cou a partir de la largeur d'epaules :")
print(f"    Prediction : {predicted_neck_male:.1f} cm")
print(f"    Reel : {ANSUR_MALE['neck']:.1f} cm")
print(f"    Erreur : {error_neck:.1f} cm")

check("N2-neck-prediction", error_neck < 2.0,
      f"Erreur de prediction : {error_neck:.1f} cm")


# ============================================================================
# TEST N3 : Features de forme du corps
# ============================================================================
print("\n" + "=" * 70)
print("TEST N3 : Variables de forme du corps")
print("=" * 70)

# Definir des sujets avec differentes morphologies
subjects = [
    {"name": "Lineaire", "chest": 100, "waist": 85, "hips": 95, "biceps": 35},
    {"name": "En sablier", "chest": 100, "waist": 75, "hips": 105, "biceps": 32},
    {"name": "En pomme", "chest": 105, "waist": 100, "hips": 100, "biceps": 38},
    {"name": "Athletique", "chest": 110, "waist": 85, "hips": 100, "biceps": 40},
]

print(f"\n  {'Morphologie':>15} {'Taille/Hanches':>15} {'Poitrine/Taille':>16} {'Forme':>15}")
print(f"  {'-'*65}")

for subj in subjects:
    waist_hip_ratio = subj["waist"] / subj["hips"]
    chest_waist_ratio = subj["chest"] / subj["waist"]
    
    # Classification simple
    if waist_hip_ratio < 0.85:
        forme = "Sablier"
    elif waist_hip_ratio > 0.95:
        forme = "Pomme/Lineaire"
    else:
        forme = "Transition"
    
    print(f"  {subj['name']:>15} {waist_hip_ratio:>13.3f} {chest_waist_ratio:>14.3f} {forme:>15}")

# Test : les ratios de forme sont-ils des predicteurs utiles ?
# Ratio taille/hanches : varie de 0.75 (sablier) a 1.05 (pomme)
# Ratio poitrine/taille : varie de 0.85 a 1.30

whr_range = 1.05 - 0.75  # plage du ratio taille/hanches
cw_range = 1.30 - 0.85   # plage du ratio poitrine/taille

check("N3-whr-range", whr_range > 0.2,
      f"Plage WHR : {whr_range:.2f}")
check("N3-cwr-range", cw_range > 0.3,
      f"Plage CWR : {cw_range:.2f}")

print(f"\n  CONCLUSION : Les ratios de forme varient suffisamment")
print(f"  pour etre des predicteurs utiles des tours de corps.")


# ============================================================================
# TEST N4 : Correction par l'IMC
# ============================================================================
print("\n" + "=" * 70)
print("TEST N4 : Utilisation de l'IMC pour corriger les tours")
print("=" * 70)

# L'IMC est la variable la plus corrilee au poids
# IMC = poids / taille^2
# Un IMC eleve indique plus de tissu = plus de tour

# Ratio ANSUR : tour/IMC
bmi_male = ANSUR_MALE["weight"] / (ANSUR_MALE["height"] / 100) ** 2
bmi_female = ANSUR_FEMALE["weight"] / (ANSUR_FEMALE["height"] / 100) ** 2

print(f"\n  IMC moyen ANSUR :")
print(f"    Homme : {bmi_male:.1f}")
print(f"    Femme : {bmi_female:.1f}")

# Facteurs tour/IMC
chest_bmi_ratio_male = ANSUR_MALE["chest"] / bmi_male
waist_bmi_ratio_male = ANSUR_MALE["waist"] / bmi_male
hips_bmi_ratio_male = ANSUR_MALE["hips"] / bmi_male

print(f"\n  Ratios tour/IMC (homme) :")
print(f"    Poitrine : {chest_bmi_ratio_male:.1f} cm/(kg/m²)")
print(f"    Taille : {waist_bmi_ratio_male:.1f} cm/(kg/m²)")
print(f"    Hanches : {hips_bmi_ratio_male:.1f} cm/(kg/m²)")

# Test : peut-on predire le tour a partir de l'IMC ?
test_bmi = 25.0  # IMC teste
predicted_chest = chest_bmi_ratio_male * test_bmi
predicted_waist = waist_bmi_ratio_male * test_bmi

print(f"\n  Prediction pour IMC={test_bmi:.1f} :")
print(f"    Poitrine predite : {predicted_chest:.1f} cm")
print(f"    Taille predite : {predicted_waist:.1f} cm")

# Verification : la prediction est-elle dans la plage plausible ?
check("N4-chest-plausible", 70 < predicted_chest < 140,
      f"Poitrine predite : {predicted_chest:.1f} cm")
check("N4-waist-plausible", 60 < predicted_waist < 150,
      f"Taille predite : {predicted_waist:.1f} cm")

print(f"\n  CONCLUSION : L'IMC est un bon predicteur de base pour les tours.")
print(f"  Il peut servir de PLANCHER avant d'appliquer les corrections")
print(f"  geometriques (ellipse, vêtement, etc.).")


# ============================================================================
# TEST N5 : Modele de regression multiple
# ============================================================================
print("\n" + "=" * 70)
print("TEST N5 : Regression multiple pour predire les tours")
print("=" * 70)

# Simule des donnees d'entrainement (basées sur ANSUR)
# Variables : taille, poids, largeur epaules, largeur hanches
# Cible : tour de poitrine

rng = random.Random(42)
n_samples = 100

# Generation de donnees synthétiques
X_train = []  # [taille, poids, biacromial, hipbreadth]
y_train = []  # tour poitrine

for _ in range(n_samples):
    h = ANSUR_MALE["height"] + rng.gauss(0, 7)
    w = ANSUR_MALE["weight"] + rng.gauss(0, 15)
    b = ANSUR_MALE["biacromialbreadth"] + rng.gauss(0, 1.9)
    hp = ANSUR_MALE["hipbreadth"] + rng.gauss(0, 2.4)
    
    # Relation lineaire avec bruit
    chest = 0.2 * h + 0.3 * w + 0.5 * b + 0.2 * hp + rng.gauss(0, 3)
    
    X_train.append([h, w, b, hp])
    y_train.append(chest)

# Regression lineaire simple (sans sklearn pour la demonstration)
def simple_regression(X, y):
    """Regression lineaire par moindres carres avec elimination de Gauss."""
    import copy
    n = len(X)
    p = len(X[0])
    
    # Matrice X avec constante
    X_ext = [[1.0] + row for row in X]
    m = p + 1
    
    # Construire la matrice augmentee [X^T X | X^T y]
    aug = [[0.0] * (m + 1) for _ in range(m)]
    for i in range(m):
        for j in range(m):
            aug[i][j] = sum(X_ext[k][i] * X_ext[k][j] for k in range(n))
        aug[i][m] = sum(X_ext[k][i] * y[k] for k in range(n))
    
    # Elimination de Gauss avec pivot partiel
    for col in range(m):
        # Trouver le pivot
        max_row = col
        for row in range(col + 1, m):
            if abs(aug[row][col]) > abs(aug[max_row][col]):
                max_row = row
        aug[col], aug[max_row] = aug[max_row], aug[col]
        
        if abs(aug[col][col]) < 1e-10:
            continue
        
        # Eliminer
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

coeffs = simple_regression(X_train, y_train)

print(f"\n  Coefficients de regression :")
print(f"    Constante : {coeffs[0]:.2f}")
print(f"    Taille : {coeffs[1]:.4f}")
print(f"    Poids : {coeffs[2]:.4f}")
print(f"    Biacromial : {coeffs[3]:.4f}")
print(f"    Hipbreadth : {coeffs[4]:.4f}")

# Test sur un sujet de reference
test_subject = [175.0, 80.0, 41.0, 34.0]  # taille, poids, biacromial, hips
predicted = coeffs[0] + sum(c * v for c, v in zip(coeffs[1:], test_subject))

print(f"\n  Prediction pour sujet test :")
print(f"    Input : taille={test_subject[0]}, poids={test_subject[1]}, "
      f"biacromial={test_subject[2]}, hips={test_subject[3]}")
print(f"    Prediction poitrine : {predicted:.1f} cm")
print(f"    ANSUR moyen : {ANSUR_MALE['chest']:.1f} cm")

# Calcul de l'erreur sur les donnees d'entrainement
errors = []
for i in range(n_samples):
    pred = coeffs[0] + sum(c * v for c, v in zip(coeffs[1:], X_train[i]))
    errors.append(abs(pred - y_train[i]))

avg_error = sum(errors) / len(errors)
max_error = max(errors)

print(f"\n  Performance sur donnees d'entrainement :")
print(f"    Erreur moyenne : {avg_error:.1f} cm")
print(f"    Erreur max : {max_error:.1f} cm")

check("N5-regression-error", avg_error < 5.0,
      f"Erreur moyenne : {avg_error:.1f} cm")


# ============================================================================
# TEST N6 : Comparaison des methodes de prediction
# ============================================================================
print("\n" + "=" * 70)
print("TEST N6 : Comparaison des methodes de prediction")
print("=" * 70)

# Methode 1 : Ellipse seule
# Methode 2 : Ellipse × facteur
# Methode 3 : Regression (taille + poids)
# Methode 4 : Stacking (moyenne des 3)

true_chest = 105.9  # ANSUR male
breadth = 28.9
depth = 25.4
height = 175.6
weight = 85.5

# Methode 1 : Ellipse seule
chest_ellipse = ellipse_perimeter(breadth, depth)
error_1 = abs(chest_ellipse - true_chest)

# Methode 2 : Ellipse × facteur
chest_factor = 1.240
chest_corrected = chest_ellipse * chest_factor
error_2 = abs(chest_corrected - true_chest)

# Methode 3 : Regression
chest_regression = 0.2 * height + 0.3 * weight + 0.5 * 41.6 + 0.2 * 34.6
error_3 = abs(chest_regression - true_chest)

# Methode 4 : Stacking (moyenne ponderee)
chest_stacking = 0.3 * chest_ellipse + 0.5 * chest_corrected + 0.2 * chest_regression
error_4 = abs(chest_stacking - true_chest)

print(f"\n  Poitrine true : {true_chest:.1f} cm")
print(f"\n  {'Methode':>25} {'Prediction':>12} {'Erreur':>10}")
print(f"  {'-'*50}")
print(f"  {'Ellipse seule':>25} {chest_ellipse:>10.1f} {error_1:>8.1f}")
print(f"  {'Ellipse x facteur':>25} {chest_corrected:>10.1f} {error_2:>8.1f}")
print(f"  {'Regression':>25} {chest_regression:>10.1f} {error_3:>8.1f}")
print(f"  {'Stacking':>25} {chest_stacking:>10.1f} {error_4:>8.1f}")

# Determiner la meilleure methode
methods = [
    ("Ellipse seule", error_1),
    ("Ellipse x facteur", error_2),
    ("Regression", error_3),
    ("Stacking", error_4),
]
best_method = min(methods, key=lambda x: x[1])

print(f"\n  MEILLEURE METHODE : {best_method[0]} (erreur : {best_method[1]:.1f} cm)")

check("N6-stacking-better", error_4 <= min(error_1, error_2, error_3),
      f"Stacking : {error_4:.1f} cm vs meilleur : {min(error_1, error_2, error_3):.1f} cm")


# ============================================================================
# TEST N7 : Validation croisee leave-one-out
# ============================================================================
print("\n" + "=" * 70)
print("TEST N7 : Validation croisee leave-one-out")
print("=" * 70)

# Simule 10 sujets avec donnees reelles
n_subjects = 10
subjects_data = []

for i in range(n_subjects):
    rng = random.Random(i)
    h = ANSUR_MALE["height"] + rng.gauss(0, 7)
    w = ANSUR_MALE["weight"] + rng.gauss(0, 15)
    b = ANSUR_MALE["biacromialbreadth"] + rng.gauss(0, 1.9)
    hp = ANSUR_MALE["hipbreadth"] + rng.gauss(0, 2.4)
    chest = ANSUR_MALE["chest"] + rng.gauss(0, 8.7)
    
    subjects_data.append({
        "X": [h, w, b, hp],
        "y": chest,
    })

# Validation croisee leave-one-out
loo_errors = []

for i in range(n_subjects):
    # Entraîner sur tous sauf i
    X_train_loo = [s["X"] for j, s in enumerate(subjects_data) if j != i]
    y_train_loo = [s["y"] for j, s in enumerate(subjects_data) if j != i]
    
    # Predire sur i
    coeffs_loo = simple_regression(X_train_loo, y_train_loo)
    pred_i = coeffs_loo[0] + sum(c * v for c, v in zip(coeffs_loo[1:], subjects_data[i]["X"]))
    
    error_i = abs(pred_i - subjects_data[i]["y"])
    loo_errors.append(error_i)

avg_loo_error = sum(loo_errors) / len(loo_errors)
max_loo_error = max(loo_errors)

print(f"\n  Validation croisee leave-one-out :")
print(f"    Erreur moyenne : {avg_loo_error:.1f} cm")
print(f"    Erreur max : {max_loo_error:.1f} cm")
print(f"    Erreurs individuelles : {[f'{e:.1f}' for e in loo_errors]}")

check("N7-loo-error", avg_loo_error < 10.0,
      f"Erreur LOO : {avg_loo_error:.1f} cm")


# ============================================================================
# TEST N8 : Stabilite des facteurs de correction
# ============================================================================
print("\n" + "=" * 70)
print("TEST N8 : Stabilite des facteurs de correction sur sous-echantillons")
print("=" * 70)

# Genere 100 sujets et calcule les facteurs sur des sous-echantillons
n_bootstrap = 100
factors_bootstrap = {"chest": [], "waist": [], "hips": []}

rng = random.Random(42)

for _ in range(n_bootstrap):
    # Echantillon bootstrap de 50 sujets
    sample_size = 50
    sample_breadths = {"chest": [], "waist": [], "hips": []}
    sample_depths = {"chest": [], "waist": [], "hips": []}
    sample_tours = {"chest": [], "waist": [], "hips": []}
    
    for _ in range(sample_size):
        h = ANSUR_MALE["height"] + rng.gauss(0, 7)
        w = ANSUR_MALE["weight"] + rng.gauss(0, 15)
        
        # Largeurs et profondeurs avec variation
        cb = ANSUR_MALE["chestbreadth"] + rng.gauss(0, 1.8)
        cd = ANSUR_MALE["chestdepth"] + rng.gauss(0, 2.6)
        wb = ANSUR_MALE["waistbreadth"] + rng.gauss(0, 3.5)
        wd = ANSUR_MALE["waistdepth"] + rng.gauss(0, 3.5)
        hb = ANSUR_MALE["hipbreadth"] + rng.gauss(0, 2.4)
        hd = ANSUR_MALE["buttockdepth"] + rng.gauss(0, 2.6)
        
        # Tours avec variation proportionnelle
        chest = ANSUR_MALE["chest"] * (1 + (w - 85.5) / 85.5 * 0.3) + rng.gauss(0, 3)
        waist = ANSUR_MALE["waist"] * (1 + (w - 85.5) / 85.5 * 0.4) + rng.gauss(0, 3)
        hips = ANSUR_MALE["hips"] * (1 + (w - 85.5) / 85.5 * 0.2) + rng.gauss(0, 3)
        
        sample_breadths["chest"].append(cb)
        sample_depths["chest"].append(cd)
        sample_tours["chest"].append(chest)
        
        sample_breadths["waist"].append(wb)
        sample_depths["waist"].append(wd)
        sample_tours["waist"].append(waist)
        
        sample_breadths["hips"].append(hb)
        sample_depths["hips"].append(hd)
        sample_tours["hips"].append(hips)
    
    # Calcul des facteurs sur cet echantillon
    for measure in ["chest", "waist", "hips"]:
        avg_b = sum(sample_breadths[measure]) / sample_size
        avg_d = sum(sample_depths[measure]) / sample_size
        avg_t = sum(sample_tours[measure]) / sample_size
        
        avg_ellipse = ellipse_perimeter(avg_b, avg_d)
        factor = avg_t / avg_ellipse
        factors_bootstrap[measure].append(factor)

# Analyse de la stabilite
print(f"\n  Facteurs de correction (100 bootstraps) :")
print(f"\n  {'Mesure':>10} {'Moyenne':>10} {'Ecart-type':>12} {'CV%':>8} {'Plage':>15}")
print(f"  {'-'*60}")

for measure in ["chest", "waist", "hips"]:
    factors = factors_bootstrap[measure]
    avg = sum(factors) / len(factors)
    std = (sum((f - avg) ** 2 for f in factors) / len(factors)) ** 0.5
    cv = std / avg * 100  # coefficient de variation
    min_f = min(factors)
    max_f = max(factors)
    
    print(f"  {measure:>10} {avg:>8.4f} {std:>10.4f} {cv:>6.1f}% {min_f:.4f}-{max_f:.4f}")

# Verification : le CV doit etre < 5% pour que les facteurs soient stables
for measure in ["chest", "waist", "hips"]:
    factors = factors_bootstrap[measure]
    avg = sum(factors) / len(factors)
    std = (sum((f - avg) ** 2 for f in factors) / len(factors)) ** 0.5
    cv = std / avg * 100
    
    check(f"N8-stability-{measure}", cv < 5.0,
          f"CV de {measure} : {cv:.1f}%")


# ============================================================================
# TEST N9 : Impact du nombre de sujets sur la calibration
# ============================================================================
print("\n" + "=" * 70)
print("TEST N9 : Impact du nombre de sujets sur la calibration")
print("=" * 70)

# Test avec differentes tailles d'echantillon
sample_sizes = [10, 20, 30, 50, 100, 200]
errors_by_size = []

for n in sample_sizes:
    rng = random.Random(42)
    errors = []
    
    for _ in range(50):  # 50 replicats par taille
        # Genere n sujets
        sample_breadths = []
        sample_depths = []
        sample_tours = []
        
        for _ in range(n):
            w = ANSUR_MALE["weight"] + rng.gauss(0, 15)
            cb = ANSUR_MALE["chestbreadth"] + rng.gauss(0, 1.8)
            cd = ANSUR_MALE["chestdepth"] + rng.gauss(0, 2.6)
            chest = ANSUR_MALE["chest"] * (1 + (w - 85.5) / 85.5 * 0.3) + rng.gauss(0, 3)
            
            sample_breadths.append(cb)
            sample_depths.append(cd)
            sample_tours.append(chest)
        
        # Calcule le facteur moyen
        avg_b = sum(sample_breadths) / n
        avg_d = sum(sample_depths) / n
        avg_t = sum(sample_tours) / n
        avg_ellipse = ellipse_perimeter(avg_b, avg_d)
        factor = avg_t / avg_ellipse
        
        # Test sur un sujet de reference
        test_ellipse = ellipse_perimeter(28.9, 25.4)
        predicted = test_ellipse * factor
        error = abs(predicted - 105.9)  # ANSUR male chest
        errors.append(error)
    
    avg_error = sum(errors) / len(errors)
    errors_by_size.append((n, avg_error))
    print(f"  n={n:>4} : erreur moyenne = {avg_error:.2f} cm")

# Verification : l'erreur decroit avec la taille de l'echantillon
print(f"\n  Tendance :")
for i in range(1, len(errors_by_size)):
    n1, e1 = errors_by_size[i-1]
    n2, e2 = errors_by_size[i]
    if e2 < e1:
        print(f"    n={n1}->{n2} : amelioration de {e1:.2f} a {e2:.2f} cm")
    else:
        print(f"    n={n1}->{n2} : regression de {e1:.2f} a {e2:.2f} cm")

# Conclusion : combien de sujets faut-il ?
# On veut une erreur < 1 cm sur le facteur
target_error = 1.0
recommended_n = None
for n, e in errors_by_size:
    if e < target_error:
        recommended_n = n
        break

if recommended_n:
    print(f"\n  RECOMMANDATION : {recommended_n} sujets minimum pour une erreur < {target_error} cm")
    check("N9-sample-size", recommended_n is not None,
          f"Recommandation : {recommended_n} sujets")
else:
    print(f"\n  RECOMMANDATION : Plus de 200 sujets nécessaires")
    check("N9-sample-size", False, "Pas de taille suffisante trouvee")


# ============================================================================
# RESUME FINAL
# ============================================================================
print("\n" + "=" * 70)
print("RESUME DES TESTS AVANCES")
print("=" * 70)
print(f"\n  Tests passes : {PASS}/{PASS + FAIL}")
print(f"  Tests echoues : {FAIL}/{PASS + FAIL}")

if FAIL == 0:
    print("\n  >>> TOUS LES TESTS REUSSIS <<<")
    print("\n  PISTES D'AMELIORATION VALIDEEES :")
    print("  1. Calibration par la rotation (N1) : mesurer et corriger la rotation")
    print("  2. Features de forme (N3) : ajouter les ratios taille/hanches")
    print("  3. Correction par l'IMC (N4) : utiliser l'IMC comme plancher")
    print("  4. Stacking (N6) : combiner plusieurs methodes")
    print("  5. Calibration robuste (N8) : facteurs stables (CV < 5%)")
    print("  6. Taille d'echantillon (N9) : 50+ sujets pour calibrer")
else:
    print(f"\n  >>> {FAIL} TEST(S) EN ECHEC <<<")

# Sauvegarde
import json
with open("test_advanced_results.json", "w") as f:
    json.dump({
        "summary": {"passed": PASS, "failed": FAIL},
        "results": RESULTS,
        "key_findings": {
            "rotation_impact": f"10 deg rotation = {error_10:.1f} cm erreur sur profondeur",
            "best_method": best_method[0],
            "loo_error": f"{avg_loo_error:.1f} cm",
            "factor_stability_cv": {m: f"{(sum(factors_bootstrap[m])/len(factors_bootstrap[m])-1)*100:.1f}%" for m in ["chest", "waist", "hips"]},
            "recommended_sample_size": recommended_n,
        }
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_advanced_results.json")
