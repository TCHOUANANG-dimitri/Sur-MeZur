"""Tests d'intégration pour morph_weights.py"""
import sys
sys.path.insert(0, "C:\\Users\\Admin\\Desktop\\Sur-MeZur\\Sur-MeZur-App\\backend")

from unittest.mock import MagicMock
from app.services.avatar.morph_weights import compute_avatar_morphology
from app.services.avatar.body_params import measurements_to_avatar_params
from app.services.avatar.target_map import compute_target_weights
from app.services.avatar.optimize_weights import (
    fallback_weights, load_sensitivity, optimize_weights, _interpolate_sensitivity
)
import numpy as np

PASS = 0
FAIL = 0

def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  OK  {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name} -- {detail}")

def make_measurement(data, gender, height_cm, weight_kg, features=None):
    m = MagicMock()
    m.data = data
    m.gender = gender
    m.height_cm = height_cm
    m.weight_kg = weight_kg
    m.features = features
    return m

# ============================================================
print("=" * 70)
print("TEST 4: INTEGRATION morph_weights")
print("=" * 70)

# 4a: Cas normal homme
m = make_measurement(
    data={"chest": 100.0, "waist": 85.0, "hips": 95.0, "biceps": 34.0,
          "thigh": 60.0, "neck": 38.0, "wrist": 17.0, "ankle": 22.0,
          "shoulder": 34.0, "sleeve_length": 59.0, "back_length": 56.0},
    gender="male", height_cm=180.0, weight_kg=80.0)
result = compute_avatar_morphology(m)
check("4a-result-not-None", result is not None)
check("4a-gender", result and result["gender"] == "male")
check("4a-height", result and result["height_cm"] == 180.0)
check("4a-ref-height", result and "reference_height_cm" in result)
check("4a-weights", result and len(result["weights"]) > 0)
check("4a-method-valid", result and result["method"] in ("fallback_z_score", "sensitivity_optimization"),
      f"method={result and result['method']}")

# 4b: Cas normal femme
m = make_measurement(
    data={"chest": 92.0, "waist": 80.0, "hips": 98.0, "biceps": 29.0,
          "thigh": 58.0, "neck": 32.0, "wrist": 15.0, "ankle": 21.0,
          "shoulder": 30.0, "sleeve_length": 54.0, "back_length": 45.0},
    gender="female", height_cm=165.0, weight_kg=65.0)
result = compute_avatar_morphology(m)
check("4b-result-not-None", result is not None)
check("4b-gender", result and result["gender"] == "female")
check("4b-breast", result and any("breast" in k for k in result["weights"]),
      "breast devrait etre present pour femme")

# 4c: Data vide
m = make_measurement(data={}, gender="male", height_cm=175.0, weight_kg=75.0)
result = compute_avatar_morphology(m)
check("4c-empty-data", result is None)

# 4d: Data = None
m = make_measurement(data=None, gender="male", height_cm=175.0, weight_kg=75.0)
result = compute_avatar_morphology(m)
check("4d-none-data", result is None)

# 4e: height/weight dans data
m = make_measurement(
    data={"chest": 100.0, "height_total": 185.0, "weight_kg": 90.0},
    gender="male", height_cm=None, weight_kg=None)
result = compute_avatar_morphology(m)
check("4e-height-from-data", result and result["height_cm"] == 185.0)

# 4f: Features SAM
m = make_measurement(
    data={"chest": 100.0, "waist": 85.0, "hips": 95.0},
    gender="male", height_cm=175.0, weight_kg=75.0,
    features={"chestbreadth": 28.0, "chestdepth": 25.0,
              "waistbreadth": 32.0, "waistdepth": 23.0,
              "hipbreadth": 34.0, "buttockdepth": 24.0})
result = compute_avatar_morphology(m)
check("4f-sam-features", result and len(result["weights"]) > 0)

# ============================================================
print()
print("=" * 70)
print("TEST 5: OPTIMISATION _interpolate_sensitivity")
print("=" * 70)

# Simuler une matrice de sensibilite
mock_sensitivity = {
    "neutral_measurements": {"chest": 92.0, "waist": 81.0, "hips": 93.0},
    "weight_levels": [0.0, 0.25, 0.5, 0.75, 1.0],
    "sensitivity": {
        "chest_scale": {
            "w0.0": {"chest": 92.0, "waist": 81.0, "hips": 93.0},
            "w0.25": {"chest": 94.0, "waist": 81.2, "hips": 93.1},
            "w0.5": {"chest": 96.0, "waist": 81.4, "hips": 93.2},
            "w0.75": {"chest": 98.0, "waist": 81.6, "hips": 93.3},
            "w1.0": {"chest": 100.0, "waist": 81.8, "hips": 93.4},
        }
    }
}

# 5a: Interpolation a w=0.0
deltas = _interpolate_sensitivity(mock_sensitivity, "chest_scale", 0.0)
check("5a-interp-0", abs(deltas.get("chest", 0)) < 0.01,
      f"chest delta = {deltas.get('chest')}")

# 5b: Interpolation a w=0.5
deltas = _interpolate_sensitivity(mock_sensitivity, "chest_scale", 0.5)
check("5b-interp-0.5", abs(deltas.get("chest", 0) - 4.0) < 0.1,
      f"chest delta = {deltas.get('chest')}")

# 5c: Interpolation a w=1.0
deltas = _interpolate_sensitivity(mock_sensitivity, "chest_scale", 1.0)
check("5c-interp-1.0", abs(deltas.get("chest", 0) - 8.0) < 0.1,
      f"chest delta = {deltas.get('chest')}")

# 5d: Interpolation a w=0.3 (entre 0.25 et 0.5)
deltas = _interpolate_sensitivity(mock_sensitivity, "chest_scale", 0.3)
# w=0.25 -> delta=2.0, w=0.5 -> delta=4.0, linear at 0.3: 2.0 + 2.0*0.2/0.25 = 2.4
check("5d-interp-0.3", abs(deltas.get("chest", 0) - 2.4) < 0.1,
      f"chest delta = {deltas.get('chest')}")

# 5e: Cible inexistante
deltas = _interpolate_sensitivity(mock_sensitivity, "nonexistent", 0.5)
check("5e-nonexistent", len(deltas) == 0)

# ============================================================
print()
print("=" * 70)
print("TEST 6: OPTIMISATION optimize_weights")
print("=" * 70)

# 6a: Optimisation basique
real_measures = {"chest": 98.0, "waist": 83.0, "hips": 94.0}
z_scores = {"chest_scale": -0.5, "waist_scale": -0.3}
weights = optimize_weights(real_measures, z_scores, mock_sensitivity)
check("6a-optimize-result", isinstance(weights, dict))
check("6a-optimize-keys", all(k.endswith("-incr") or k.endswith("-decr") for k in weights),
      f"cles: {list(weights.keys())}")

# 6b: Tous les poids dans [0, 1]
all_valid = all(0.0 <= v <= 1.0 for v in weights.values())
check("6b-weights-range", all_valid, f"poids: {weights}")

# 6c: Pas assez de mesures
weights_few = optimize_weights({"chest": 98.0}, {"chest_scale": -0.5}, mock_sensitivity)
check("6c-too-few-measures", len(weights_few) == 0)

# 6d: Aucune cible active
weights_none = optimize_weights(real_measures, {}, mock_sensitivity)
check("6d-no-active-targets", len(weights_none) == 0)

# 6e: Cible hors matrice
weights_unknown = optimize_weights(real_measures, {"unknown_param": 0.5}, mock_sensitivity)
check("6e-unknown-target", len(weights_unknown) == 0)

# ============================================================
print()
print("=" * 70)
print("TEST 7: VERIFICATION INTEGRALITE cibles MakeHuman")
print("=" * 70)

# Verifier que les noms de cibles dans target_map sont bien
# au format attendu par le GLB (pas d'extension, pas de chemin)
from app.services.avatar.target_map import (
    MEASURE_TARGETS, SHAPE_TARGETS, BREADTH_DEPTH_TARGETS,
    PROPORTION_TARGETS, TORSO_WIDTH_TARGET, TORSO_DEPTH_TARGET,
    FAT_TARGETS, MUSCLE_TARGETS, BREAST_TARGET
)

all_cibles = []

for param, (sous, racine) in MEASURE_TARGETS.items():
    for sens in ("incr", "decr"):
        name = f"{racine}-{sens}"
        all_cibles.append(name)

for param, (sous, racine) in SHAPE_TARGETS.items():
    for sens in ("incr", "decr"):
        name = f"{racine}-{sens}"
        all_cibles.append(name)

for param, (sous, racine) in BREADTH_DEPTH_TARGETS.items():
    for sens in ("incr", "decr"):
        name = f"{racine}-{sens}"
        all_cibles.append(name)

for param, (sous, racine) in PROPORTION_TARGETS.items():
    for sens in ("incr", "decr"):
        name = f"{racine}-{sens}"
        all_cibles.append(name)

# TORSO_WIDTH/DEPTH
for racine in (TORSO_WIDTH_TARGET[1], TORSO_DEPTH_TARGET[1]):
    for sens in ("incr", "decr"):
        all_cibles.append(f"{racine}-{sens}")

# FAT_TARGETS
for sous, racine in FAT_TARGETS:
    for sens in ("incr", "decr"):
        all_cibles.append(f"{racine}-{sens}")

# MUSCLE_TARGETS
for sous, racine in MUSCLE_TARGETS:
    for sens in ("incr", "decr"):
        all_cibles.append(f"{racine}-{sens}")

# BREAST
for sens in ("up", "down"):
    all_cibles.append(f"{BREAST_TARGET[1]}-{sens}")

print(f"  Total cibles MakeHuman definies: {len(all_cibles)}")

# Verifier pas de doublons
unique = set(all_cibles)
check("7a-no-duplicates", len(unique) == len(all_cibles),
      f"{len(all_cibles)} total, {len(unique)} uniques")

# Verifier pas de caracteres speciaux
bad_chars = [c for c in all_cibles if " " in c or "/" in c or "." in c]
check("7b-no-special-chars", len(bad_chars) == 0, f"problematiques: {bad_chars}")

# Verifier format: tout en minuscules, tirets, pas d'underscore
bad_format = [c for c in all_cibles if "_" in c or c != c.lower()]
check("7c-format-lowercase-dash", len(bad_format) == 0, f"problematiques: {bad_format}")

print(f"  Cibles uniques: {len(unique)}")
print("  Exemples:", sorted(unique)[:10])

# ============================================================
print()
print("=" * 70)
print("RESULTATS")
print("=" * 70)
print(f"  PASSES: {PASS}")
print(f"  ECHECS: {FAIL}")
if FAIL == 0:
    print("  >>> TOUS LES TESTS REUSSIS <<<")
else:
    print(f"  >>> {FAIL} TEST(S) EN ECHEC <<<")
    sys.exit(1)
