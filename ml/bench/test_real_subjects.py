"""
Tests sur les 13 sujets reels avec verite terrain.

Ce fichier utilise les donnees reelles du fichier sujets.json :
- 13 adultes photographies (face + profil)
- Mesures au metre ruban (verite terrain)
- C'est le SEUL jeu de donnees qui permette de chiffrer
  la precision reelle de la chaine de mesure.

Usage: python test_real_subjects.py (depuis ml/bench/)
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

# ============================================================================
# CHARGEMENT DES DONNEES
# ============================================================================

SCRIPT_DIR = Path(__file__).resolve().parent
SUJETS_PATH = SCRIPT_DIR / "sujets.json"

with open(SUJETS_PATH, "r", encoding="utf-8") as f:
    raw = json.load(f)

# Extraire les sujets (ignorer _lisez_moi, tours, longueurs, photos)
sujets = raw["sujets"]
tour_keys = raw["tours"]
longueur_keys = raw["longueurs"]

print(f"Charge {len(sujets)} sujets depuis {SUJETS_PATH.name}")
print(f"  Tours : {tour_keys}")
print(f"  Longueurs : {longueur_keys}")


# ============================================================================
# FONCTIONS UTILITAIRES
# ============================================================================

def ellipse_perimeter(breadth: float, depth: float) -> float:
    """Perimetre d'ellipse, approximation de Ramanujan."""
    a, b = breadth / 2.0, depth / 2.0
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def mean_absolute_error(predicted: list[float], actual: list[float]) -> float:
    """Erreur absolue moyenne."""
    return sum(abs(p - a) for p, a in zip(predicted, actual)) / len(actual)


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
# TEST R1 : Statistiques descriptives des 13 sujets
# ============================================================================
print("\n" + "=" * 70)
print("TEST R1 : Statistiques descriptives des 13 sujets")
print("=" * 70)

# Separer par sexe
males = [s for s in sujets if s["gender"] == "male"]
females = [s for s in sujets if s["gender"] == "female"]

print(f"\n  Population : {len(males)} hommes, {len(females)} femmes")
print(f"\n  {'Mesure':>15} {'Hommes':>15} {'Femmes':>15} {'Tous':>15}")
print(f"  {'-'*65}")

# Stats pour chaque mesure
for i, key in enumerate(tour_keys + longueur_keys):
    if i < len(tour_keys):
        vals_m = [s["tours"][i] for s in males]
        vals_f = [s["tours"][i] for s in females]
        vals_all = [s["tours"][i] for s in sujets]
    else:
        j = i - len(tour_keys)
        vals_m = [s["longueurs"][j] for s in males]
        vals_f = [s["longueurs"][j] for s in females]
        vals_all = [s["longueurs"][j] for s in sujets]
    
    avg_m = sum(vals_m) / len(vals_m)
    avg_f = sum(vals_f) / len(vals_f) if vals_f else 0
    avg_all = sum(vals_all) / len(vals_all)
    
    std_m = (sum((v - avg_m)**2 for v in vals_m) / len(vals_m)) ** 0.5
    std_f = (sum((v - avg_f)**2 for v in vals_f) / len(vals_f)) ** 0.5 if vals_f else 0
    std_all = (sum((v - avg_all)**2 for v in vals_all) / len(vals_all)) ** 0.5
    
    print(f"  {key:>15} {avg_m:>7.1f} +/- {std_m:<5.1f} {avg_f:>7.1f} +/- {std_f:<5.1f} {avg_all:>7.1f} +/- {std_all:<5.1f}")

# Verification : les donnees sont-elles coherentes ?
check("R1-nb-sujets", len(sujets) == 13, f"nb={len(sujets)}")
check("R1-nb-males", len(males) == 11, f"nb={len(males)}")
check("R1-nb-females", len(females) == 2, f"nb={len(females)}")
check("R1-all-have-tours", all(len(s["tours"]) == 8 for s in sujets))
check("R1-all-have-longueurs", all(len(s["longueurs"]) == 4 for s in sujets))


# ============================================================================
# TEST R2 : Modele V3 (Ridge) sur les donnees reelles
# ============================================================================
print("\n" + "=" * 70)
print("TEST R2 : Simulation du pipeline V3 sur les 13 sujets")
print("=" * 70)

# Le pipeline V3 predit les 8 tours a partir de 12 variables
# On simule les features a partir des donnees reelles
# (en realite, les features viennent de MediaPipe/SAM)

# ANSUR male reference (pour les facteurs de calibration)
ANSUR_MALE = {
    "chest": 105.9, "waist": 94.1, "hips": 102.0,
    "biceps": 35.8, "thigh": 62.5, "neck": 39.8,
    "wrist": 17.6, "ankle": 22.9,
    "chestbreadth": 28.9, "chestdepth": 25.4,
    "waistbreadth": 32.6, "waistdepth": 23.8,
    "hipbreadth": 34.6, "buttockdepth": 24.6,
    "biacromialbreadth": 41.6,
}

ANSUR_FEMALE = {
    "chest": 94.7, "waist": 86.1, "hips": 102.1,
    "biceps": 30.6, "thigh": 61.6, "neck": 33.0,
    "wrist": 15.5, "ankle": 21.6,
    "chestbreadth": 26.9, "chestdepth": 24.7,
    "waistbreadth": 30.0, "waistdepth": 21.3,
    "hipbreadth": 35.4, "buttockdepth": 23.3,
    "biacromialbreadth": 36.5,
}


def simulate_v3_prediction(subject: dict) -> dict:
    """
    Simule la prediction V3 du pipeline.
    
    En realite, les features viennent de MediaPipe/SAM.
    Ici, on les approxime a partir des donnees reelles
    pour estimer la precision du modele lui-meme.
    """
    h = subject["height_cm"]
    w = subject["weight_kg"]
    is_female = subject["gender"] == "female"
    
    ref = ANSUR_FEMALE if is_female else ANSUR_MALE
    
    # Approximation des features a partir des tours reels
    # (en realite, MediaPipe donne les largeurs, pas les tours)
    chest = subject["tours"][1]
    waist = subject["tours"][2]
    hips = subject["tours"][3]
    
    # Estimation des largeurs/profondeurs depuis les tours
    # (approximation inverse de l'ellipse)
    chest_breadth = ref["chestbreadth"] * (chest / ref["chest"])
    chest_depth = ref["chestdepth"] * (chest / ref["chest"])
    waist_breadth = ref["waistbreadth"] * (waist / ref["waist"])
    waist_depth = ref["waistdepth"] * (waist / ref["waist"])
    hip_breadth = ref["hipbreadth"] * (hips / ref["hips"])
    hip_depth = ref["buttockdepth"] * (hips / ref["hips"])
    
    # Prediction V3 : Ridge pour tout
    # Modele simplifie (basé sur correlations ANSUR)
    pred_neck = 0.15 * h + 0.12 * w + 5.0 + ref["biacromialbreadth"] * 0.2
    pred_chest = 0.25 * h + 0.35 * w + chest_breadth * 1.5
    pred_waist = 0.20 * h + 0.40 * w + waist_breadth * 1.2
    pred_hips = 0.22 * h + 0.30 * w + hip_breadth * 1.3
    pred_biceps = 0.08 * h + 0.15 * w + chest_breadth * 0.5
    pred_thigh = 0.18 * h + 0.25 * w + hip_breadth * 0.8
    pred_wrist = 0.05 * h + 0.02 * w + 3.0
    pred_ankle = 0.06 * h + 0.03 * w + 2.0
    
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


def simulate_v4_prediction(subject: dict) -> dict:
    """
    Simule la prediction V4 (ellipse corrigee pour le tronc).
    """
    h = subject["height_cm"]
    w = subject["weight_kg"]
    is_female = subject["gender"] == "female"
    
    ref = ANSUR_FEMALE if is_female else ANSUR_MALE
    
    # Approximation des features
    chest = subject["tours"][1]
    waist = subject["tours"][2]
    hips = subject["tours"][3]
    
    chest_breadth = ref["chestbreadth"] * (chest / ref["chest"])
    chest_depth = ref["chestdepth"] * (chest / ref["chest"])
    waist_breadth = ref["waistbreadth"] * (waist / ref["waist"])
    waist_depth = ref["waistdepth"] * (waist / ref["waist"])
    hip_breadth = ref["hipbreadth"] * (hips / ref["hips"])
    hip_depth = ref["buttockdepth"] * (hips / ref["hips"])
    
    # Facteurs de correction ellipse
    CHEST_FACTOR = 1.240 if not is_female else 1.168
    WAIST_FACTOR = 1.056 if not is_female else 1.061
    HIP_FACTOR = 1.089 if not is_female else 1.096
    
    # TRONC : geometrie avec facteur de correction
    chest_ellipse = ellipse_perimeter(chest_breadth, chest_depth)
    waist_ellipse = ellipse_perimeter(waist_breadth, waist_depth)
    hip_ellipse = ellipse_perimeter(hip_breadth, hip_depth)
    
    pred_chest = chest_ellipse * CHEST_FACTOR
    pred_waist = waist_ellipse * WAIST_FACTOR
    pred_hips = hip_ellipse * HIP_FACTOR
    
    # MEMBRES : meme modele que V3
    pred_neck = 0.15 * h + 0.12 * w + 5.0 + ref["biacromialbreadth"] * 0.2
    pred_biceps = 0.08 * h + 0.15 * w + chest_breadth * 0.5
    pred_thigh = 0.18 * h + 0.25 * w + hip_breadth * 0.8
    pred_wrist = 0.05 * h + 0.02 * w + 3.0
    pred_ankle = 0.06 * h + 0.03 * w + 2.0
    
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


# Calcul des erreurs V3
errors_v3 = {k: [] for k in tour_keys}
errors_v4 = {k: [] for k in tour_keys}

for subj in sujets:
    pred_v3 = simulate_v3_prediction(subj)
    pred_v4 = simulate_v4_prediction(subj)
    
    for i, key in enumerate(tour_keys):
        true_val = subj["tours"][i]
        errors_v3[key].append(abs(pred_v3[key] - true_val))
        errors_v4[key].append(abs(pred_v4[key] - true_val))

print(f"\n  {'Mesure':>10} {'V3 moy (cm)':>12} {'V4 moy (cm)':>12} {'Gain':>8}")
print(f"  {'-'*45}")

for key in tour_keys:
    avg_v3 = sum(errors_v3[key]) / len(errors_v3[key])
    avg_v4 = sum(errors_v4[key]) / len(errors_v4[key])
    gain = (avg_v3 - avg_v4) / avg_v3 * 100 if avg_v3 > 0 else 0
    print(f"  {key:>10} {avg_v3:>10.2f} {avg_v4:>10.2f} {gain:>7.1f}%")

avg_all_v3 = sum(sum(v) for v in errors_v3.values()) / (8 * 13)
avg_all_v4 = sum(sum(v) for v in errors_v4.values()) / (8 * 13)
total_gain = (avg_all_v3 - avg_all_v4) / avg_all_v3 * 100

print(f"\n  {'MOYENNE':>10} {avg_all_v3:>10.2f} {avg_all_v4:>10.2f} {total_gain:>7.1f}%")

check("R2-v3-has-errors", avg_all_v3 > 0, f"V3 avg={avg_all_v3:.2f}")
check("R2-v4-improvement", avg_all_v4 < avg_all_v3,
      f"V3={avg_all_v3:.2f} -> V4={avg_all_v4:.2f} (gain: {total_gain:.1f}%)")


# ============================================================================
# TEST R3 : Analyse detaillee par sujet
# ============================================================================
print("\n" + "=" * 70)
print("TEST R3 : Erreurs detaillees par sujet (V4)")
print("=" * 70)

print(f"\n  {'Sujet':>8} {'Sexe':>6} {'Taille':>8} {'Poids':>7} {'V3 moy':>8} {'V4 moy':>8}")
print(f"  {'-'*50}")

for subj in sujets:
    pred_v3 = simulate_v3_prediction(subj)
    pred_v4 = simulate_v4_prediction(subj)
    
    errors_s = []
    for i, key in enumerate(tour_keys):
        true_val = subj["tours"][i]
        errors_s.append(abs(pred_v4[key] - true_val))
    
    avg_s = sum(errors_s) / len(errors_s)
    
    errors_s_v3 = []
    for i, key in enumerate(tour_keys):
        true_val = subj["tours"][i]
        errors_s_v3.append(abs(pred_v3[key] - true_val))
    avg_s_v3 = sum(errors_s_v3) / len(errors_s_v3)
    
    print(f"  {subj['id']:>8} {subj['gender']:>6} {subj['height_cm']:>6.0f}cm {subj['weight_kg']:>5.1f}kg {avg_s_v3:>6.2f} {avg_s:>6.2f}")

# Identification du meilleur et pire sujet
best_subj = None
worst_subj = None
best_avg = float('inf')
worst_avg = 0

for subj in sujets:
    pred_v4 = simulate_v4_prediction(subj)
    errors_s = [abs(pred_v4[key] - subj["tours"][i]) for i, key in enumerate(tour_keys)]
    avg_s = sum(errors_s) / len(errors_s)
    
    if avg_s < best_avg:
        best_avg = avg_s
        best_subj = subj
    if avg_s > worst_avg:
        worst_avg = avg_s
        worst_subj = subj

print(f"\n  MEILLEUR sujet : #{best_subj['id']} ({best_subj['gender']}, {best_subj['height_cm']}cm) - erreur moyenne: {best_avg:.2f} cm")
print(f"  PIRE sujet : #{worst_subj['id']} ({worst_subj['gender']}, {worst_subj['height_cm']}cm) - erreur moyenne: {worst_avg:.2f} cm")

check("R3-best-subject", best_avg < 5.0, f"best={best_avg:.2f}")
check("R3-worst-subject", worst_avg < 15.0, f"worst={worst_avg:.2f}")


# ============================================================================
# TEST R4 : Calibration des facteurs ellipse sur donnees reelles
# ============================================================================
print("\n" + "=" * 70)
print("TEST R4 : Calibration des facteurs ellipse sur 13 sujets reels")
print("=" * 70)

# Pour chaque sujet, calculer le facteur tour/ellipse
# (en utilisant les largeurs/profondeurs estimees)

factors_by_subject = {"chest": [], "waist": [], "hips": []}

for subj in sujets:
    is_female = subj["gender"] == "female"
    ref = ANSUR_FEMALE if is_female else ANSUR_MALE
    
    chest = subj["tours"][1]
    waist = subj["tours"][2]
    hips = subj["tours"][3]
    
    # Estimation des largeurs/profondeurs
    chest_breadth = ref["chestbreadth"] * (chest / ref["chest"])
    chest_depth = ref["chestdepth"] * (chest / ref["chest"])
    waist_breadth = ref["waistbreadth"] * (waist / ref["waist"])
    waist_depth = ref["waistdepth"] * (waist / ref["waist"])
    hip_breadth = ref["hipbreadth"] * (hips / ref["hips"])
    hip_depth = ref["buttockdepth"] * (hips / ref["hips"])
    
    # Perimetres d'ellipse
    chest_ellipse = ellipse_perimeter(chest_breadth, chest_depth)
    waist_ellipse = ellipse_perimeter(waist_breadth, waist_depth)
    hip_ellipse = ellipse_perimeter(hip_breadth, hip_depth)
    
    # Facteurs reels
    if chest_ellipse > 0:
        factors_by_subject["chest"].append(chest / chest_ellipse)
    if waist_ellipse > 0:
        factors_by_subject["waist"].append(waist / waist_ellipse)
    if hip_ellipse > 0:
        factors_by_subject["hips"].append(hips / hip_ellipse)

print(f"\n  Facteurs tour/ellipse reels (13 sujets) :")
print(f"\n  {'Mesure':>10} {'Moyenne':>10} {'Ecart-type':>12} {'CV%':>8} {'Plage':>20}")
print(f"  {'-'*65}")

for measure in ["chest", "waist", "hips"]:
    factors = factors_by_subject[measure]
    avg = sum(factors) / len(factors)
    std = (sum((f - avg)**2 for f in factors) / len(factors)) ** 0.5
    cv = std / avg * 100
    min_f = min(factors)
    max_f = max(factors)
    
    print(f"  {measure:>10} {avg:>8.4f} {std:>10.4f} {cv:>6.1f}% {min_f:.4f}-{max_f:.4f}")

# Comparaison avec les facteurs ANSUR
print(f"\n  Comparaison avec facteurs ANSUR :")
print(f"  {'Mesure':>10} {'ANSUR':>10} {'Reel 13s':>12} {'Ecart':>10}")
print(f"  {'-'*45}")

ansur_factors = {"chest": 1.240, "waist": 1.056, "hips": 1.089}
for measure in ["chest", "waist", "hips"]:
    factors = factors_by_subject[measure]
    avg = sum(factors) / len(factors)
    ecart = avg - ansur_factors[measure]
    print(f"  {measure:>10} {ansur_factors[measure]:>8.4f} {avg:>10.4f} {ecart:>+8.4f}")

check("R4-factors-stable", all(
    (sum(factors_by_subject[m])/len(factors_by_subject[m]) - ansur_factors[m]) < 0.1
    for m in ["chest", "waist", "hips"]
), "Facteurs eloignes d'ANSUR")


# ============================================================================
# TEST R5 : Impact de la correction par le poids
# ============================================================================
print("\n" + "=" * 70)
print("TEST R5 : Impact du poids sur la precision")
print("=" * 70)

# Classer les sujets par IMC
subjects_with_bmi = []
for subj in sujets:
    bmi = subj["weight_kg"] / (subj["height_cm"] / 100) ** 2
    subjects_with_bmi.append({**subj, "bmi": bmi})

# Trier par BMI
subjects_with_bmi.sort(key=lambda x: x["bmi"])

print(f"\n  {'Sujet':>8} {'BMI':>6} {'Poids':>7} {'Taille':>8} {'Erreur V4':>10}")
print(f"  {'-'*45}")

for subj in subjects_with_bmi:
    pred_v4 = simulate_v4_prediction(subj)
    errors_s = [abs(pred_v4[key] - subj["tours"][i]) for i, key in enumerate(tour_keys)]
    avg_s = sum(errors_s) / len(errors_s)
    
    print(f"  {subj['id']:>8} {subj['bmi']:>5.1f} {subj['weight_kg']:>5.1f}kg {subj['height_cm']:>6.0f}cm {avg_s:>8.2f}")

# Correlation BMI / erreur
bmis = [subj["bmi"] for subj in subjects_with_bmi]
errors = []
for subj in subjects_with_bmi:
    pred_v4 = simulate_v4_prediction(subj)
    errors_s = [abs(pred_v4[key] - subj["tours"][i]) for i, key in enumerate(tour_keys)]
    errors.append(sum(errors_s) / len(errors_s))

# Correlation de Pearson
n = len(bmis)
avg_bmi = sum(bmis) / n
avg_err = sum(errors) / n
cov = sum((b - avg_bmi) * (e - avg_err) for b, e in zip(bmis, errors)) / n
std_bmi = (sum((b - avg_bmi)**2 for b in bmis) / n) ** 0.5
std_err = (sum((e - avg_err)**2 for e in errors) / n) ** 0.5
correlation = cov / (std_bmi * std_err) if std_bmi * std_err > 0 else 0

print(f"\n  Correlation BMI / erreur : {correlation:.3f}")
print(f"  (proche de 0 = pas de correlation, proche de 1 = forte correlation)")

check("R5-bmi-correlation", abs(correlation) < 0.5,
      f"correlation = {correlation:.3f}")


# ============================================================================
# TEST R6 : Impact de la taille sur la precision
# ============================================================================
print("\n" + "=" * 70)
print("TEST R6 : Impact de la taille sur la precision")
print("=" * 70)

# Classer les sujets par taille
subjects_by_height = sorted(sujets, key=lambda x: x["height_cm"])

print(f"\n  {'Sujet':>8} {'Taille':>8} {'Poids':>7} {'BMI':>6} {'Erreur V4':>10}")
print(f"  {'-'*45}")

for subj in subjects_by_height:
    bmi = subj["weight_kg"] / (subj["height_cm"] / 100) ** 2
    pred_v4 = simulate_v4_prediction(subj)
    errors_s = [abs(pred_v4[key] - subj["tours"][i]) for i, key in enumerate(tour_keys)]
    avg_s = sum(errors_s) / len(errors_s)
    
    print(f"  {subj['id']:>8} {subj['height_cm']:>6.0f}cm {subj['weight_kg']:>5.1f}kg {bmi:>5.1f} {avg_s:>8.2f}")

# Separer grands (>180cm) et petits (<170cm)
grands = [s for s in sujets if s["height_cm"] > 180]
petits = [s for s in sujets if s["height_cm"] < 170]

errors_grands = []
errors_petits = []

for subj in grands:
    pred_v4 = simulate_v4_prediction(subj)
    errors_s = [abs(pred_v4[key] - subj["tours"][i]) for i, key in enumerate(tour_keys)]
    errors_grands.append(sum(errors_s) / len(errors_s))

for subj in petits:
    pred_v4 = simulate_v4_prediction(subj)
    errors_s = [abs(pred_v4[key] - subj["tours"][i]) for i, key in enumerate(tour_keys)]
    errors_petits.append(sum(errors_s) / len(errors_s))

if errors_grands and errors_petits:
    avg_grands = sum(errors_grands) / len(errors_grands)
    avg_petits = sum(errors_petits) / len(errors_petits)
    print(f"\n  Grands (>180cm) : {len(grands)} sujets, erreur moyenne = {avg_grands:.2f} cm")
    print(f"  Petits (<170cm) : {len(petits)} sujets, erreur moyenne = {avg_petits:.2f} cm")
    print(f"  Ecart : {abs(avg_grands - avg_petits):.2f} cm")


# ============================================================================
# TEST R7 : Analyse des erreurs par type de mesure
# ============================================================================
print("\n" + "=" * 70)
print("TEST R7 : Repartition des erreurs par type de mesure")
print("=" * 70)

# Separer les mesures en categories
categories = {
    "Tronc": ["chest", "waist", "hips"],
    "Membres superieurs": ["neck", "biceps", "wrist"],
    "Membres inferieurs": ["thigh", "ankle"],
}

for cat_name, cat_keys in categories.items():
    errors_cat = []
    for key in cat_keys:
        errors_cat.extend(errors_v4[key])
    
    avg_cat = sum(errors_cat) / len(errors_cat)
    min_cat = min(errors_cat)
    max_cat = max(errors_cat)
    
    print(f"\n  {cat_name} :")
    print(f"    Erreur moyenne : {avg_cat:.2f} cm")
    print(f"    Erreur min : {min_cat:.2f} cm")
    print(f"    Erreur max : {max_cat:.2f} cm")
    
    for key in cat_keys:
        avg_key = sum(errors_v4[key]) / len(errors_v4[key])
        print(f"      {key:>12} : {avg_key:.2f} cm")


# ============================================================================
# TEST R8 : Identification des patterns d'erreur
# ============================================================================
print("\n" + "=" * 70)
print("TEST R8 : Patterns d'erreur identifies")
print("=" * 70)

# Pour chaque sujet, identifier les mesures les plus erronees
print(f"\n  {'Sujet':>8} {'Mesure la + erronee':>25} {'Erreur':>8} {'Type':>10}")
print(f"  {'-'*55}")

for subj in sujets:
    pred_v4 = simulate_v4_prediction(subj)
    
    worst_measure = None
    worst_error = 0
    
    for i, key in enumerate(tour_keys):
        error = abs(pred_v4[key] - subj["tours"][i])
        if error > worst_error:
            worst_error = error
            worst_measure = key
    
    # Categoriser
    if worst_measure in ["chest", "waist", "hips"]:
        cat = "Tronc"
    elif worst_measure in ["neck", "biceps", "wrist"]:
        cat = "Membres sup"
    else:
        cat = "Membres inf"
    
    print(f"  {subj['id']:>8} {worst_measure:>25} {worst_error:>6.1f}cm {cat:>10}")

# Compter les erreurs par categorie
tronc_errors = []
membres_sup_errors = []
membres_inf_errors = []

for subj in sujets:
    pred_v4 = simulate_v4_prediction(subj)
    for i, key in enumerate(tour_keys):
        error = abs(pred_v4[key] - subj["tours"][i])
        if key in ["chest", "waist", "hips"]:
            tronc_errors.append(error)
        elif key in ["neck", "biceps", "wrist"]:
            membres_sup_errors.append(error)
        else:
            membres_inf_errors.append(error)

print(f"\n  Resume des erreurs par categorie :")
print(f"    Tronc : {sum(tronc_errors)/len(tronc_errors):.2f} cm (n={len(tronc_errors)})")
print(f"    Membres superieurs : {sum(membres_sup_errors)/len(membres_sup_errors):.2f} cm (n={len(membres_sup_errors)})")
print(f"    Membres inferieurs : {sum(membres_inf_errors)/len(membres_inf_errors):.2f} cm (n={len(membres_inf_errors)})")


# ============================================================================
# TEST R9 : Validation du facteur de correction sur donnees reelles
# ============================================================================
print("\n" + "=" * 70)
print("TEST R9 : Validation du facteur de correction sur donnees reelles")
print("=" * 70)

# Pour chaque sujet, calculer l'erreur avec et sans facteur
errors_without_factor = []
errors_with_factor = []

for subj in sujets:
    is_female = subj["gender"] == "female"
    ref = ANSUR_FEMALE if is_female else ANSUR_MALE
    
    for i, key in enumerate(["chest", "waist", "hips"]):
        true_val = subj["tours"][i + 1]
        
        # Estimation des dimensions
        if key == "chest":
            breadth = ref["chestbreadth"] * (true_val / ref["chest"])
            depth = ref["chestdepth"] * (true_val / ref["chest"])
        elif key == "waist":
            breadth = ref["waistbreadth"] * (true_val / ref["waist"])
            depth = ref["waistdepth"] * (true_val / ref["waist"])
        else:
            breadth = ref["hipbreadth"] * (true_val / ref["hips"])
            depth = ref["buttockdepth"] * (true_val / ref["hips"])
        
        # Perimetre d'ellipse
        ellipse = ellipse_perimeter(breadth, depth)
        
        # Avec facteur
        factor = {"chest": 1.240, "waist": 1.056, "hips": 1.089}[key]
        if is_female:
            factor = {"chest": 1.168, "waist": 1.061, "hips": 1.096}[key]
        
        pred_with = ellipse * factor
        
        errors_without_factor.append(abs(ellipse - true_val))
        errors_with_factor.append(abs(pred_with - true_val))

avg_without = sum(errors_without_factor) / len(errors_without_factor)
avg_with = sum(errors_with_factor) / len(errors_with_factor)
gain = (avg_without - avg_with) / avg_without * 100

print(f"\n  Sans facteur : {avg_without:.2f} cm")
print(f"  Avec facteur : {avg_with:.2f} cm")
print(f"  Gain : {gain:.1f}%")

check("R9-factor-improvement", avg_with < avg_without,
      f"Sans={avg_without:.2f}, Avec={avg_with:.2f}")


# ============================================================================
# RESUME FINAL
# ============================================================================
print("\n" + "=" * 70)
print("RESUME DES TESTS SUR DONNEES REELLES (13 sujets)")
print("=" * 70)
print(f"\n  Tests passes : {PASS}/{PASS + FAIL}")
print(f"  Tests echoues : {FAIL}/{PASS + FAIL}")

if FAIL == 0:
    print("\n  >>> TOUS LES TESTS REUSSIS <<<")
else:
    print(f"\n  >>> {FAIL} TEST(S) EN ECHEC <<<")

# Sauvegarde
with open("test_real_subjects_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "summary": {"passed": PASS, "failed": FAIL},
        "results": RESULTS,
        "key_findings": {
            "v3_avg_error": round(avg_all_v3, 2),
            "v4_avg_error": round(avg_all_v4, 2),
            "v4_gain": f"{total_gain:.1f}%",
            "best_subject": f"#{best_subj['id']} ({best_avg:.2f} cm)",
            "worst_subject": f"#{worst_subj['id']} ({worst_avg:.2f} cm)",
            "factor_calibration": {m: round(sum(factors_by_subject[m])/len(factors_by_subject[m]), 4) for m in ["chest", "waist", "hips"]},
            "bmi_correlation": round(correlation, 3),
        }
    }, f, indent=2)

print(f"\n  Resultats sauvegardes dans test_real_subjects_results.json")
