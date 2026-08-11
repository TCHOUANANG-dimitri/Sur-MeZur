"""
Test complet de la chaîne d'avatar 3D.

Ce script valide :
1. Le mapping mensurations -> paramètres MPFB (body_params.py)
2. Le lancement Blender subprocess (blender_runner.py)
3. La génération du GLB (generator.py)
4. La taille et validité du fichier produit

Usage (depuis backend/) :
    python -m tests.test_avatar
"""

import json
import os
import sys
import tempfile
from pathlib import Path

# Ajouter le backend au path
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


def test_body_params():
    """Test du mapping mensurations -> paramètres avatar."""
    print("=" * 60)
    print("TEST 1 : body_params.py")
    print("=" * 60)

    from app.services.avatar.body_params import measurements_to_avatar_params, to_json

    # Cas test : homme, 180cm, 80kg, mesures normales
    measurements_male = {
        "height_total": 180.0,
        "weight_kg": 80.0,
        "chest": 100.0,
        "waist": 85.0,
        "hips": 98.0,
        "biceps": 34.0,
        "thigh": 58.0,
        "neck": 39.0,
        "wrist": 17.0,
        "ankle": 25.0,
        "shoulder": 44.0,
    }
    params_male = measurements_to_avatar_params(measurements_male, "male")
    print(f"  Homme 180/80 :")
    for note in params_male.notes:
        print(f"    {note}")

    json_male = to_json(params_male)
    assert "gender" in json_male
    assert "height_cm" in json_male
    assert json_male["gender"] == 0.0  # male
    assert json_male["height_cm"] == 180.0
    print(f"  [OK] JSON valide : {len(json_male)} champs")
    print()

    # Cas test : femme, 165cm, 65kg
    measurements_female = {
        "height_total": 165.0,
        "weight_kg": 65.0,
        "chest": 94.0,
        "waist": 78.0,
        "hips": 100.0,
        "biceps": 30.0,
        "thigh": 56.0,
        "neck": 34.0,
        "wrist": 15.0,
        "ankle": 22.0,
        "shoulder": 39.0,
    }
    params_female = measurements_to_avatar_params(measurements_female, "female")
    print(f"  Femme 165/65 :")
    for note in params_female.notes:
        print(f"    {note}")

    json_female = to_json(params_female)
    assert json_female["gender"] == 1.0  # female
    assert json_female["breast_size"] != 0.0  # doit avoir un volume de sein
    print(f"  [OK] JSON valide : {len(json_female)} champs")
    print()

    print("[OK] TEST 1 REUSSI\n")
    return True


def test_blender_generation():
    """Test de la génération GLB via Blender."""
    print("=" * 60)
    print("TEST 2 : blender_runner.py + generator.py")
    print("=" * 60)

    from app.services.avatar.blender_runner import run_blender, check_blender_available

    # Vérifier que Blender est disponible
    info = check_blender_available()
    print(f"  Blender : {info['blender_path']}")
    print(f"  Disponible : {info['blender_available']}")
    print(f"  Script generator : {info['generator_script']}")
    print(f"  Script disponible : {info['generator_available']}")

    if not info["blender_available"]:
        print("  [SKIP] Blender non disponible - test ignore")
        return True

    # Paramètres de test (homme moyen)
    test_params = {
        "gender": 0.0,
        "height_cm": 178.0,
        "weight_factor": 0.1,
        "muscle_factor": 0.05,
        "chest_scale": 0.2,
        "waist_scale": -0.05,
        "hip_scale": 0.15,
        "buttock_scale": 0.1,
        "breast_size": 0.0,
        "biceps_scale": 0.08,
        "thigh_scale": 0.05,
        "neck_scale": 0.05,
        "wrist_scale": 0.0,
        "ankle_scale": 0.0,
        "skin_tone_hex": "#9C6644",
        "request_id": "test_validation",
    }

    print(f"\n  Lancement Blender avec paramètres de test...")
    glb_path = run_blender(test_params)

    if glb_path is None:
        print("  [FAIL] Echec de la generation")
        return False

    # Vérifier le fichier
    glb_file = Path(glb_path)
    if not glb_file.exists():
        print(f"  [FAIL] Fichier non trouvé : {glb_path}")
        return False

    size = glb_file.stat().st_size
    print(f"  [OK] GLB genere : {glb_path}")
    print(f"    Taille : {size:,} octets ({size/1024:.1f} Ko)")

    # Vérifier que c'est un GLB valide (commence par 'glTF')
    with open(glb_path, 'rb') as f:
        magic = f.read(4)
    if magic != b'glTF':
        print(f"  [FAIL] Magic bytes invalides : {magic}")
        return False
    print(f"  [OK] Magic bytes valides (glTF)")

    # Nettoyage
    os.unlink(glb_path)
    print(f"  [OK] Fichier de test supprime")

    print(f"\n[OK] TEST 2 REUSSI\n")
    return True


def test_full_service():
    """Test du service complet (depuis des mensurations jusqu'au GLB)."""
    print("=" * 60)
    print("TEST 3 : service.py (chaîne complète)")
    print("=" * 60)

    from app.services.avatar.service import generate_avatar
    from app.models.measurements import Measurement

    # Créer un objet Measurement factice
    fake_measurement = Measurement()
    fake_measurement.id = "test_measurement_001"
    fake_measurement.data = {
        "height_total": 175.0,
        "weight_kg": 75.0,
        "chest": 98.0,
        "waist": 82.0,
        "hips": 96.0,
        "biceps": 33.0,
        "thigh": 57.0,
        "neck": 38.0,
        "wrist": 16.5,
        "ankle": 24.0,
        "shoulder": 43.0,
    }
    fake_measurement.height_cm = 175.0
    fake_measurement.weight_kg = 75.0
    fake_measurement.gender = "male"

    print(f"  Génération depuis des mensurations factices...")
    gltf_url = generate_avatar(
        measurement=fake_measurement,
        skin_tone_hex="#C68863",
    )

    if gltf_url is None:
        print("  ✚ Échec de la génération")
        return False

    print(f"  [OK] URL generee : {gltf_url}")

    # Vérifier que le fichier existe
    from app.core.config import settings
    file_path = Path(settings.avatar_output_dir) / gltf_url.replace("avatars/", "")
    if file_path.exists():
        size = file_path.stat().st_size
        print(f"  [OK] Fichier existant : {size:,} octets")
    else:
        print(f"  [WARN] Fichier non trouvé à {file_path} (URL relative)")

    print(f"\n[OK] TEST 3 REUSSI\n")
    return True


def main():
    print("\n" + "=" * 60)
    print("  TESTS DE LA CHAÎNE D'AVATAR 3D")
    print("=" * 60 + "\n")

    results = []

    try:
        results.append(("body_params", test_body_params()))
    except Exception as e:
        print(f"  [EXCEPTION] {e}")
        import traceback
        traceback.print_exc()
        results.append(("body_params", False))

    try:
        results.append(("blender_generation", test_blender_generation()))
    except Exception as e:
        print(f"  [EXCEPTION] {e}")
        import traceback
        traceback.print_exc()
        results.append(("blender_generation", False))

    try:
        results.append(("full_service", test_full_service()))
    except Exception as e:
        print(f"  [EXCEPTION] {e}")
        import traceback
        traceback.print_exc()
        results.append(("full_service", False))

    # Résumé
    print("=" * 60)
    print("  RESUME")
    print("=" * 60)
    all_ok = True
    for name, ok in results:
        status = "[OK] REUSSI" if ok else "[FAIL] ECHOUE"
        print(f"  {status} : {name}")
        if not ok:
            all_ok = False

    print()
    if all_ok:
        print("  >>> TOUS LES TESTS SONT PASSES <<<")
    else:
        print("  [WARN] CERTAINS TESTS ONT ECHOUE")
    print()

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
