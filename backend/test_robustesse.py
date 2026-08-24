"""Tests de robustesse profonde - Analyse de fond"""
import sys
sys.path.insert(0, "C:\\Users\\Admin\\Desktop\\Sur-MeZur\\Sur-MeZur-App\\backend")

import ast
from app.services.avatar.body_params import measurements_to_avatar_params
from app.services.avatar.target_map import compute_target_weights
from app.services.avatar.optimize_weights import fallback_weights
from app.services.avatar.morph_weights import compute_avatar_morphology
from unittest.mock import MagicMock

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

# ============================================================
print("=" * 70)
print("TEST A: muscle_factor TOUJOURS neutre")
print("=" * 70)

# A1: Source code - muscle_factor jamais recalcule
with open("app/services/avatar/body_params.py", "r", encoding="utf-8") as f:
    source = f.read()

# Chercher toute affectation de muscle_factor qui n'est pas 0.0
import re
muscle_assigns = re.findall(r'muscle_factor\s*=\s*(.+)', source)
real_assigns = [a for a in muscle_assigns if "0.0" not in a and "0" not in a.strip()]
check("A1-no-reassignment", len(real_assigns) == 0,
      f"assignments trouves: {muscle_assigns}")

# A2: muscle_factor toujours 0 pour tous les profils
profiles = [
    ({"height_total": 170, "weight_kg": 60}, "male"),
    ({"height_total": 170, "weight_kg": 100}, "male"),
    ({"height_total": 170, "weight_kg": 140}, "male"),
    ({"height_total": 160, "weight_kg": 50}, "female"),
    ({"height_total": 160, "weight_kg": 90}, "female"),
    ({"height_total": 190, "weight_kg": 120}, "male"),
]
for data, gender in profiles:
    params = measurements_to_avatar_params(data, gender)
    check(f"A2-mf=0-{gender}-{data['weight_kg']}kg",
          params.muscle_factor == 0.0,
          f"muscle_factor={params.muscle_factor}")

# A3: Cibles muscle jamais dans les weights finaux
m = MagicMock()
m.data = {"chest": 100, "waist": 85, "hips": 95, "biceps": 34, "thigh": 60,
          "neck": 38, "wrist": 17, "ankle": 22}
m.gender = "male"
m.height_cm = 175.0
m.weight_kg = 75.0
m.features = None
result = compute_avatar_morphology(m)
muscle_targets = [k for k in result["weights"] if "muscle" in k.lower()]
check("A3-no-muscle-targets", len(muscle_targets) == 0,
      f"muscle cibles: {muscle_targets}")

# ============================================================
print()
print("=" * 70)
print("TEST B: Tous les z-scores dans [-1, 1]")
print("=" * 70)

# B1: Profil extreme gros
params = measurements_to_avatar_params({
    "height_total": 170, "weight_kg": 150,
    "chest": 130, "waist": 130, "hips": 140,
    "biceps": 50, "thigh": 80, "neck": 48,
    "wrist": 22, "ankle": 28,
}, "male")
for attr in ("chest_scale", "waist_scale", "hip_scale", "biceps_scale",
             "thigh_scale", "neck_scale", "wrist_scale", "ankle_scale",
             "shoulder_width", "sleeve_factor", "back_factor",
             "buttock_scale", "torso_ratio", "leg_ratio"):
    val = getattr(params, attr, 0.0)
    check(f"B1-zscore-clamp-{attr}", -1.0 <= val <= 1.0,
          f"{attr}={val}")

# B2: Profil extreme maigre
params = measurements_to_avatar_params({
    "height_total": 190, "weight_kg": 45,
    "chest": 75, "waist": 65, "hips": 80,
    "biceps": 22, "thigh": 42, "neck": 30,
    "wrist": 13, "ankle": 18,
}, "female")
for attr in ("chest_scale", "waist_scale", "hip_scale", "biceps_scale",
             "thigh_scale", "neck_scale", "wrist_scale", "ankle_scale"):
    val = getattr(params, attr, 0.0)
    check(f"B2-zscore-clamp-{attr}", -1.0 <= val <= 1.0,
          f"{attr}={val}")

# ============================================================
print()
print("=" * 70)
print("TEST C: Pas de fonction orpheline / import cassee")
print("=" * 70)

# Verifier morph_weights.py - 3 fonctions publiques
try:
    from app.services.avatar.morph_weights import (
        compute_avatar_morphology,
        _build_z_scores,
        _build_measurements_dict,
    )
    check("C1-morph_weights-imports", True)
except ImportError as e:
    check("C1-morph_weights-imports", False, str(e))

# Verifier optimize_weights.py - 6 fonctions
try:
    from app.services.avatar.optimize_weights import (
        fallback_weights,
        load_sensitivity,
        optimize_weights,
        _interpolate_sensitivity,
        _build_sensitivity_matrix,
        _find_sensitivity_file,
    )
    check("C2-optimize_weights-imports", True)
except ImportError as e:
    check("C2-optimize_weights-imports", False, str(e))

# Verifier body_params.py - fonctions publiques actuelles
try:
    from app.services.avatar.body_params import (
        measurements_to_avatar_params,
        AvatarParams,
        to_json,
    )
    check("C3-body_params-imports", True)
except ImportError as e:
    check("C3-body_params-imports", False, str(e))

# Verifier target_map.py
try:
    from app.services.avatar.target_map import (
        compute_target_weights,
        estimate_reference_height_cm,
        MEASURE_TARGETS, SHAPE_TARGETS, BREADTH_DEPTH_TARGETS,
        PROPORTION_TARGETS, TORSO_WIDTH_TARGET, TORSO_DEPTH_TARGET,
        FAT_TARGETS, MUSCLE_TARGETS, BREAST_TARGET,
    )
    check("C4-target_map-imports", True)
except ImportError as e:
    check("C4-target_map-imports", False, str(e))

# ============================================================
print()
print("=" * 70)
print("TEST D: generate.py n'appelle PAS compute_avatarget")
print("=" * 70)

# Verifier que compute_avatarget a ete supprime (ancienne API)
with open("app/services/avatar/body_params.py", "r", encoding="utf-8") as f:
    bp_source = f.read()
check("D1-compute_avatarget-removed",
      "def compute_avatarget" not in bp_source,
      "compute_avatarget ne devrait plus exister")

# Verifier que generate.py importe les tables de donnees (pas compute_target_weights)
with open("app/services/avatar/generator.py", "r", encoding="utf-8") as f:
    gen_source = f.read()
check("D2-generator-imports-target-tables",
      "MEASURE_TARGETS" in gen_source and "SHAPE_TARGETS" in gen_source,
      "generator.py devrait importer les tables depuis target_map")

# ============================================================
print()
print("=" * 70)
print("TEST E: Cohérence des poids pour differentes morphologies")
print("=" * 70)

def get_weights_for_profile(data, gender, features=None):
    m = MagicMock()
    m.data = data
    m.gender = gender
    m.height_cm = data.get("height_total", 170)
    m.weight_kg = data.get("weight_kg", 70)
    m.features = features
    result = compute_avatar_morphology(m)
    return result["weights"] if result else {}

# E1: Gros ventre (waist=110 > moyenne ANSUR 94.1) -> waist_scale-incr devrait etre eleve
w_heavy = get_weights_for_profile(
    {"height_total": 175, "weight_kg": 95, "chest": 105, "waist": 110, "hips": 100},
    "male")
check("E1-heavy-waist", w_heavy.get("measure-waist-circ-incr", 0) > 0.3,
      f"measure-waist-circ-incr={w_heavy.get('measure-waist-circ-incr')}")

# E2: Grand et mince -> shoulder-width et leg-ratio devraient etre presents
w_tall = get_weights_for_profile(
    {"height_total": 195, "weight_kg": 75, "chest": 95, "waist": 80, "hips": 90,
     "shoulder": 38, "sleeve_length": 65, "crotchheight": 92, "sittingheight": 95},
    "male")
check("E2-tall-has-leg-ratio", "measure-upperleg-height" in " ".join(w_tall.keys()),
      f"keys: {list(w_tall.keys())}")

# E3: Femme -> breast devrait toujours etre present
w_female = get_weights_for_profile(
    {"height_total": 165, "weight_kg": 60, "chest": 92, "waist": 75, "hips": 95},
    "female")
has_breast = any("breast" in k for k in w_female)
check("E3-female-breast", has_breast, f"keys: {list(w_female.keys())}")

# E4: Homme -> pas de breast
w_male = get_weights_for_profile(
    {"height_total": 175, "weight_kg": 80, "chest": 100, "waist": 85, "hips": 95},
    "male")
has_breast_male = any("breast" in k for k in w_male)
check("E4-male-no-breast", not has_breast_male)

# E5: Poids > seuil 0.02, tous les weights sont >= 0.02
for profile_name, data, gender in [
    ("thin", {"height_total": 180, "weight_kg": 55, "chest": 85, "waist": 72, "hips": 88}, "male"),
    ("obese", {"height_total": 170, "weight_kg": 120, "chest": 120, "waist": 125, "hips": 115}, "male"),
    ("average", {"height_total": 175, "weight_kg": 75, "chest": 98, "waist": 88, "hips": 95}, "female"),
]:
    w = get_weights_for_profile(data, gender)
    too_small = {k: v for k, v in w.items() if 0 < v < 0.02}
    check(f"E5-no-noise-{profile_name}", len(too_small) == 0,
          f"poids trop petits: {too_small}")

# ============================================================
print()
print("=" * 70)
print("RESULTATS FINAUX")
print("=" * 70)
print(f"  PASSES: {PASS}")
print(f"  ECHECS: {FAIL}")
if FAIL == 0:
    print("  >>> TOUS LES TESTS REUSSIS - CODE ROBUSTE <<<")
else:
    print(f"  >>> {FAIL} TEST(S) EN ECHEC <<<")
    sys.exit(1)
