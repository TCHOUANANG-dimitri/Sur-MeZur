"""
Script Blender exécuté en subprocess pour générer un avatar 3D.

Ce script est appelé par blender_runner.py via :
    blender.exe --background --python generator.py -- <params.json> <output.glb>

Il crée un humain MPFB, applique les morphologies issues des mensurations,
ajoute le matériau peau, et exporte en GLB.
"""

import bpy
import json
import math
import os
import sys


# ---------------------------------------------------------------------------
# Utilitaires
# ---------------------------------------------------------------------------

def _find_arg(after_separator: str, name: str) -> str | None:
    """Cherche un argument dans sys.argv après le '--' de Blender."""
    args = sys.argv
    try:
        sep_idx = args.index(after_separator)
    except ValueError:
        return None
    for i, a in enumerate(args[sep_idx + 1:], start=sep_idx + 1):
        if a == name and i + 1 < len(args):
            return args[i + 1]
    return None


def _get_positional(after_separator: str, index: int) -> str | None:
    """Récupère un argument positionnel après '--'."""
    args = sys.argv
    try:
        sep_idx = args.index(after_separator)
    except ValueError:
        return None
    pos = sep_idx + 1 + index
    if pos < len(args):
        return args[pos]
    return None


def _clamp(v, lo=-1.0, hi=1.0):
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------
# Application des cibles morphologiques
# ---------------------------------------------------------------------------

# Mapping de nos paramètres vers les noms de shape keys MPFB.
# Les shape keys MPFB utilisent une nomenclature codée :
#   $md-$ca-$ma-$yn  = macrodetails-caucasian-male-young
#   $md-universal-$fe-$yn-$av$mu-$av$wg = macrodetails universal female young
#
# On applique les shape keys par leur nom exact, avec des valeurs
# proportionnelles à l'écart mesuré.

SHAPE_KEY_MAP = {
    # (param_name, shape_key_fragment, direction)
    # direction: +1 = la clé augmente quand le paramètre augmente
    "chest_scale": [
        ("$md-universal-$fe-$yn-$av$mu-$av$wg", +1),    # femme : volume poitrine
        ("$md-universal-$ma-$yn-$av$mu-$av$wg", +1),    # homme : torse
    ],
    "waist_scale": [
        ("$md-universal-$fe-$yn-$av$mu-$av$wg", -1),    # taille étroite = clé négative
        ("$md-universal-$ma-$yn-$av$mu-$av$wg", -1),
    ],
    "hip_scale": [
        ("$md-universal-$fe-$yn-$av$mu-$av$wg", +1),    # hanches larges
        ("$md-universal-$ma-$yn-$av$mu-$av$wg", +1),
    ],
}


def _clear_scene():
    """Supprime tous les objets mesh de la scène."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def _create_human():
    """Crée un humain MPFB de base."""
    bpy.ops.mpfb.create_human()
    # Trouver l'objet Human créé
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and 'uman' in obj.name.lower():
            return obj
    # Fallback : prendre le plus gros mesh
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    return max(meshes, key=lambda o: len(o.data.vertices)) if meshes else None


def _apply_body_shape(human_obj, params):
    """
    Applique les ajustements morphologiques via shape keys.

    Stratégie :
    1. Ajuster les shape keys macrodetails (hauteur, poids, musculature)
    2. Ajuster les shape keys spécifiques (circonférences)
    3. Ajuster les proportions (torse, jambes, épaules, manches, dos)
    4. Ajuster les largeurs/profondeurs du torse (depuis SAM)
    """
    me = human_obj.data
    if not me.shape_keys:
        return

    sk = me.shape_keys.key_blocks

    gender = params.get("gender", 0.0)
    is_female = gender > 0.5

    # --- Macro-details : poids / musculature ---
    weight_factor = params.get("weight_factor", 0.0)
    muscle_factor = params.get("muscle_factor", 0.0)

    base_key_name = None
    for key_name in sk.keys():
        if is_female and "$fe-$yn" in key_name and "universal" in key_name:
            base_key_name = key_name
            break
        elif not is_female and "$ma-$yn" in key_name and "universal" in key_name:
            base_key_name = key_name
            break

    if base_key_name:
        sk[base_key_name].value = _clamp(weight_factor * 0.8)

    # --- Circonférences (8 tours) ---
    _apply_circumference_targets(human_obj, params, is_female)

    # --- Proportions relatives (nouveau) ---
    _apply_proportions(human_obj, params)

    # --- Largeurs / profondeurs du torse (depuis SAM, nouveau) ---
    _apply_torso_shape(human_obj, params, is_female)


def _apply_circumference_targets(human_obj, params, is_female):
    """
    Applique les cibles spécifiques aux parties du corps.

    MPFB organise ses targets par catégorie (hip, breast, chest, etc.).
    On mappe nos paramètres vers ces catégories.
    """
    me = human_obj.data
    if not me.shape_keys:
        return

    sk = me.shape_keys.key_blocks

    # Mapping direct : param_name -> (substring de shape key, facteur)
    # On cherche les shape keys qui contiennent le substring et on ajuste
    direct_map = {
        "chest_scale": [
            ("chest", +1.0),
            ("breast", +0.6 if is_female else 0.2),
        ],
        "waist_scale": [
            ("waist", +1.0),
        ],
        "hip_scale": [
            ("hip", +1.0),
        ],
        "buttock_scale": [
            ("buttock", +1.0),
            ("hip", +0.3),
        ],
        "breast_size": [
            ("breast", +1.0),
        ],
        "biceps_scale": [
            ("arm", +1.0),
            ("bicep", +0.8),
        ],
        "thigh_scale": [
            ("thigh", +1.0),
            ("leg", +0.5),
        ],
        "neck_scale": [
            ("neck", +1.0),
        ],
        "wrist_scale": [
            ("wrist", +1.0),
        ],
        "ankle_scale": [
            ("ankle", +1.0),
            ("foot", +0.3),
        ],
    }

    for param_name, mappings in direct_map.items():
        param_value = params.get(param_name, 0.0)
        if abs(param_value) < 0.01:
            continue

        for substring, factor in mappings:
            for key_name in sk.keys():
                if substring.lower() in key_name.lower() and key_name.startswith("$"):
                    sk[key_name].value = _clamp(param_value * factor)
                    break  # une seule clé par substring


def _apply_proportions(human_obj, params):
    """Ajuste les proportions relatives (torse, jambes, épaules, manche, dos)."""
    me = human_obj.data
    if not me.shape_keys:
        return
    sk = me.shape_keys.key_blocks

    proportion_map = {
        "torso_ratio": ["torso", "sitting", "spine"],
        "leg_ratio": ["leg", "lower", "crotch"],
        "shoulder_width": ["shoulder", "acromial", "biacromial"],
        "sleeve_factor": ["sleeve", "arm", "upper"],
        "back_factor": ["back", "trunk"],
    }
    for param_name, substrings in proportion_map.items():
        value = params.get(param_name, 0.0)
        if abs(value) < 0.01:
            continue
        for key_name in sk.keys():
            kl = key_name.lower()
            if key_name.startswith("$") and any(s in kl for s in substrings):
                sk[key_name].value = _clamp(value)
                break


def _apply_torso_shape(human_obj, params, is_female):
    """Ajuste les largeurs et profondeurs du torse (depuis SAM)."""
    me = human_obj.data
    if not me.shape_keys:
        return
    sk = me.shape_keys.key_blocks

    torso_map = {
        "chest_breadth_scale": [("chest", +1.0)],
        "chest_depth_scale": [("chest", +0.7), ("breast", +0.3 if is_female else 0.1)],
        "waist_breadth_scale": [("waist", +1.0)],
        "waist_depth_scale": [("waist", +0.8)],
        "hip_breadth_scale": [("hip", +1.0)],
        "buttock_depth_scale": [("buttock", +0.8), ("hip", +0.2)],
    }
    for param_name, mappings in torso_map.items():
        value = params.get(param_name, 0.0)
        if abs(value) < 0.01:
            continue
        for substring, factor in mappings:
            for key_name in sk.keys():
                kl = key_name.lower()
                if key_name.startswith("$") and substring in kl:
                    sk[key_name].value = _clamp(value * factor)
                    break


def _apply_height(human_obj, height_cm):
    """
    Applique la hauteur en ajustant l'échelle du mesh.

    MPFB crée un mesh à une taille de base (~1.75m). On ajuste via
    l'échelle de l'objet pour atteindre la taille cible.
    """
    # Hauteur de base MPFB (mesurée après create_human)
    # Le mesh fait environ 1.75m de haut (175 cm)
    BASE_HEIGHT_CM = 175.0

    scale = height_cm / BASE_HEIGHT_CM
    human_obj.scale = (scale, scale, scale)
    # Appliquer l'échelle pour que l'export GLB soit à la bonne taille
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def _apply_skin_material(human_obj, skin_tone_hex):
    """
    Applique un matériau de peau avec la couleur demandée.
    """
    # Convertir hex en RGB [0,1]
    hex_clean = skin_tone_hex.lstrip('#')
    r = int(hex_clean[0:2], 16) / 255.0
    g = int(hex_clean[2:4], 16) / 255.0
    b = int(hex_clean[4:6], 16) / 255.0

    # Tenter d'utiliser le matériau de skin MPFB
    try:
        bpy.ops.mpfb.create_makeskin_material()
    except Exception:
        pass

    # Créer un matériau PBR avec la couleur de peau
    mat_name = "SurMezur_Skin"
    mat = bpy.data.materials.get(mat_name)
    if mat is None:
        mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
    tree = mat.node_tree

    # Trouver ou créer le nœud Principled BSDF
    bsdf = None
    for node in tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bsdf = node
            break
    if bsdf is None:
        bsdf = tree.nodes.new(type='ShaderNodeBsdfPrincipled')

    # Définir la couleur de base
    if 'Base Color' in bsdf.inputs:
        bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    elif 'BaseColor' in bsdf.inputs:
        bsdf.inputs['BaseColor'].default_value = (r, g, b, 1.0)

    # Roughness réaliste pour la peau
    if 'Roughness' in bsdf.inputs:
        bsdf.inputs['Roughness'].default_value = 0.45
    elif 'roughness' in bsdf.inputs:
        bsdf.inputs['roughness'].default_value = 0.45

    # Subsurface scattering pour la peau
    if 'Subsurface' in bsdf.inputs:
        bsdf.inputs['Subsurface'].default_value = 0.15
    elif 'Subsurface Weight' in bsdf.inputs:
        bsdf.inputs['Subsurface Weight'].default_value = 0.15

    # Appliquer le matériau à l'objet
    if human_obj.data.materials:
        human_obj.data.materials[0] = mat
    else:
        human_obj.data.materials.append(mat)


def _setup_scene():
    """Configure la scène pour un export propre."""
    # Supprimer les caméras et lights existantes
    for obj in list(bpy.data.objects):
        if obj.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(obj, do_unlink=True)

    # Ajouter un éclairage simple
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 5))
    sun = bpy.context.active_object
    sun.data.energy = 3.0

    # Ajouter une caméra
    bpy.ops.object.camera_add(location=(0, -3, 1.2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(80), 0, 0)
    bpy.context.scene.camera = cam


def _export_glb(output_path):
    """Exporte la scène en GLB."""
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
    )


# ---------------------------------------------------------------------------
# Point d'entrée
# ---------------------------------------------------------------------------

def main():
    # Lire les arguments
    params_path = _get_positional("--", 0)
    output_path = _get_positional("--", 1)

    if not params_path or not output_path:
        print(f"Usage: blender --background --python {__file__} -- <params.json> <output.glb>")
        sys.exit(1)

    if not os.path.exists(params_path):
        print(f"Fichier de paramètres introuvable : {params_path}")
        sys.exit(1)

    with open(params_path, 'r', encoding='utf-8') as f:
        params = json.load(f)

    print(f"Paramètres chargés : {json.dumps(params, indent=2)}")

    # 1. Nettoyer la scène
    _clear_scene()

    # 2. Créer l'humain MPFB
    human = _create_human()
    if human is None:
        print("Erreur : impossible de créer l'humain MPFB")
        sys.exit(1)

    print(f"Humain créé : {human.name} ({len(human.data.vertices)} sommets)")

    # 3. Appliquer la morphologie
    _apply_body_shape(human, params)

    # 4. Appliquer la hauteur
    height = params.get("height_cm", 175.0)
    _apply_height(human, height)
    print(f"Hauteur appliquée : {height} cm")

    # 5. Appliquer le matériau peau
    skin_tone = params.get("skin_tone_hex", "#C68863")
    _apply_skin_material(human, skin_tone)
    print(f"Matériau peau appliqué : {skin_tone}")

    # 6. Configurer la scène
    _setup_scene()

    # 7. Exporter en GLB
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    _export_glb(output_path)

    file_size = os.path.getsize(output_path)
    print(f"GLB exporté : {output_path} ({file_size} octets)")


if __name__ == "__main__":
    main()
