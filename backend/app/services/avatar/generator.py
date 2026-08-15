"""
Script Blender exécuté en subprocess pour générer un avatar 3D.

Appelé par blender_runner.py :
    blender --background --python generator.py -- <params.json> <output.glb>

--- Pourquoi cette version diffère radicalement de la précédente -------------

La première version cherchait des shape keys dont le nom contenait "chest",
"waist", "hip"... Or MPFB2 n'en crée que **onze** à la création d'un humain,
toutes macroscopiques ($md-<ethnie>-<sexe>-<âge>, corpulence universelle,
bonnet). Aucune ne porte de nom de partie du corps : toutes les boucles de
recherche échouaient silencieusement, et chaque avatar sortait identique au
précédent — vérifié, trois fichiers produits partageaient le même MD5.

Le vrai levier est ailleurs. MPFB2 installe 1258 cibles MakeHuman sur disque,
dont **20 cibles `measure-*`** qui correspondent une à une à nos mensurations.
Elles ne sont pas chargées par défaut : il faut les demander via
`bpy.ops.mpfb.load_target`, qui les ajoute alors comme shape keys pilotables.

Mesuré : charger `measure-waist-circ-incr` à poids 1,0 déplace 1265 sommets
sur 13380, d'une amplitude maximale de 3,6 cm. Le mécanisme fonctionne.

--- Convention des cibles ---------------------------------------------------

Chaque mesure existe en deux fichiers, `-decr` et `-incr`. Notre paramètre est
un z-score signé dans [-1, +1] : le signe choisit le fichier, la valeur
absolue devient le poids. Un z de -0,4 sur la taille charge donc
`measure-waist-circ-decr` à 0,4.
"""

import json
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from target_map import (  # noqa: E402
    BREADTH_DEPTH_TARGETS,
    FAT_TARGET_GAIN,
    FAT_TARGETS,
    MEASURE_TARGETS,
    MUSCLE_TARGETS,
    PROPORTION_TARGETS,
    SHAPE_TARGETS,
    TORSO_DEPTH_TARGET,
    TORSO_WIDTH_TARGET,
)

import bpy


# ---------------------------------------------------------------------------
# Localisation des cibles MakeHuman
# ---------------------------------------------------------------------------

def _targets_dir() -> Path | None:
    """
    Dossier des cibles installées par MPFB2.

    On part du module `mpfb` lui-même : il est importable puisque ce script
    tourne à l'intérieur de Blender, et son emplacement suit l'installation
    de l'extension quelle que soit la version de Blender ou la plateforme.
    """
    try:
        import mpfb
        d = Path(mpfb.__file__).resolve().parent / "data" / "targets"
        if d.is_dir():
            return d
    except Exception:
        pass

    # Repli : chemins de configuration Blender usuels.
    for base in (Path(bpy.utils.resource_path("USER")),
                 Path(bpy.utils.resource_path("LOCAL"))):
        for motif in ("extensions/blender_org/mpfb/data/targets",
                      "scripts/addons/mpfb/data/targets"):
            d = base / motif
            if d.is_dir():
                return d
    return None


# Les tables de correspondance param -> cible MakeHuman (MEASURE_TARGETS,
# SHAPE_TARGETS, BREADTH_DEPTH_TARGETS, PROPORTION_TARGETS,
# TORSO_WIDTH_TARGET, TORSO_DEPTH_TARGET, FAT_TARGETS, MUSCLE_TARGETS) vivent
# désormais dans target_map.py, importé plus haut — partagées avec le calcul
# de poids côté backend (morph_weights.py), qui ne peut pas importer `bpy`.

BASE_HEIGHT_CM = 165.94  # hauteur du maillage MPFB par défaut, mesurée


def _clamp(v, lo=-1.0, hi=1.0):
    return max(lo, min(hi, v))


def _get_positional(index: int) -> str | None:
    """Argument positionnel après le séparateur '--' de Blender."""
    try:
        sep = sys.argv.index("--")
    except ValueError:
        return None
    pos = sep + 1 + index
    return sys.argv[pos] if pos < len(sys.argv) else None


# ---------------------------------------------------------------------------
# Construction du corps
# ---------------------------------------------------------------------------

def _clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def _create_human():
    """Crée le corps de base et le rend actif.

    Les opérateurs MPFB agissent sur l'objet actif : sans cette sélection,
    `load_target` n'a aucune cible et échoue sans rien dire.
    """
    bpy.ops.mpfb.create_human()
    human = next((o for o in bpy.data.objects
                  if o.type == "MESH" and o.get("MhObjectType") == "Basemesh"), None)
    if human is None:
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        human = max(meshes, key=lambda o: len(o.data.vertices)) if meshes else None
    if human is not None:
        bpy.ops.object.select_all(action="DESELECT")
        human.select_set(True)
        bpy.context.view_layer.objects.active = human
    return human


def _load_fichier(targets_dir: Path, sous_dossier: str, nom_fichier: str,
                  poids: float) -> str | None:
    """Charge un fichier de cible précis, à un poids donné dans [0, 1]."""
    dossier = targets_dir / sous_dossier
    if not (dossier / nom_fichier).exists():
        print(f"  cible absente : {sous_dossier}/{nom_fichier}")
        return None
    try:
        bpy.ops.mpfb.load_target(
            directory=str(dossier) + os.sep,
            files=[{"name": nom_fichier}],
            weight=max(0.0, min(poids, 1.0)),
        )
    except Exception as exc:
        print(f"  echec load_target {nom_fichier} : {type(exc).__name__} {exc}")
        return None
    print(f"  {nom_fichier[:-10]} @ {poids:.2f}")
    return nom_fichier


def _load_target(targets_dir: Path, sous_dossier: str, racine: str, valeur: float) -> str | None:
    """
    Charge une cible MakeHuman pondérée par `valeur` (z-score signé).

    Le signe choisit le fichier (-decr / -incr), la valeur absolue donne le
    poids. Renvoie le nom du fichier chargé, ou None si la cible est absente
    ou le poids négligeable.
    """
    if abs(valeur) < 0.02:
        return None
    sens = "incr" if valeur > 0 else "decr"
    return _load_fichier(targets_dir, sous_dossier, f"{racine}-{sens}.target.gz",
                         min(abs(valeur), 1.0))


def _apply_morphology(human, params):
    """Applique toutes les mensurations sous forme de cibles MakeHuman."""
    targets_dir = _targets_dir()
    if targets_dir is None:
        print("ATTENTION : dossier des cibles MakeHuman introuvable — "
              "l'avatar restera au gabarit moyen")
        return 0

    print(f"Cibles MakeHuman : {targets_dir}")
    appliquees = 0

    for table in (MEASURE_TARGETS, SHAPE_TARGETS, BREADTH_DEPTH_TARGETS, PROPORTION_TARGETS):
        for param, (sous, racine) in table.items():
            valeur = float(params.get(param, 0.0) or 0.0)
            if _load_target(targets_dir, sous, racine, valeur):
                appliquees += 1

    # Largeur/profondeur du tronc : moyenne poitrine+taille sur chaque axe,
    # faute de cible MakeHuman séparée par niveau (voir TORSO_WIDTH_TARGET /
    # TORSO_DEPTH_TARGET ci-dessus). Ignorées jusqu'ici, ces 4 valeurs SAM
    # étaient calculées pour rien.
    largeur = (float(params.get("chest_breadth_scale", 0.0) or 0.0)
               + float(params.get("waist_breadth_scale", 0.0) or 0.0)) / 2.0
    if _load_target(targets_dir, *TORSO_WIDTH_TARGET, largeur):
        appliquees += 1
    profondeur = (float(params.get("chest_depth_scale", 0.0) or 0.0)
                  + float(params.get("waist_depth_scale", 0.0) or 0.0)) / 2.0
    if _load_target(targets_dir, *TORSO_DEPTH_TARGET, profondeur):
        appliquees += 1

    # Volume mammaire : cible dédiée, uniquement pertinente au féminin.
    # Elle ne suit pas la convention decr/incr — MakeHuman nomme ses deux
    # sens `-down` et `-up` ici — d'où le chargement direct.
    if params.get("gender", 0.0) > 0.5:
        sein = float(params.get("breast_size", 0.0) or 0.0)
        if abs(sein) >= 0.02:
            sens = "up" if sein > 0 else "down"
            if _load_fichier(targets_dir, "breast", f"breast-volume-vert-{sens}.target.gz",
                             min(abs(sein), 1.0)):
                appliquees += 1

    # Corpulence globale : les cibles de graisse des membres suivent le BMI.
    poids_corps = float(params.get("weight_factor", 0.0) or 0.0)
    if abs(poids_corps) >= 0.02:
        for sous, racine in FAT_TARGETS:
            if _load_target(targets_dir, sous, racine, poids_corps * FAT_TARGET_GAIN):
                appliquees += 1

    # Musculature : jusqu'ici calculée (body_params.py) mais jamais lue ici —
    # seul weight_factor pilotait la corpulence, muscle_factor ne faisait rien.
    muscle = float(params.get("muscle_factor", 0.0) or 0.0)
    if abs(muscle) >= 0.02:
        for sous, racine in MUSCLE_TARGETS:
            if _load_target(targets_dir, sous, racine, muscle):
                appliquees += 1

    return appliquees


def _hauteur_reelle_m(human) -> float:
    """Hauteur du maillage ÉVALUÉ, cibles morphologiques comprises.

    `evaluated_get` est indispensable : le maillage de base ignore les shape
    keys, et le mesurer donnerait la hauteur du gabarit moyen quelles que
    soient les cibles chargées.
    """
    deps = bpy.context.evaluated_depsgraph_get()
    ev = human.evaluated_get(deps)
    me = ev.to_mesh()
    zs = [v.co.z for v in me.vertices]
    ev.to_mesh_clear()
    return (max(zs) - min(zs)) if zs else 0.0


def _apply_height(human, height_cm):
    """
    Met le corps à la taille demandée.

    On agit sur l'échelle de l'objet, sans `transform_apply` : Blender refuse
    d'appliquer une transformation à un maillage porteur de shape keys, et
    c'est précisément notre cas depuis que les cibles sont chargées. L'export
    glTF conserve de toute façon la transformation du nœud.

    Le facteur se calcule sur la hauteur APRÈS morphologie, pas sur celle du
    gabarit par défaut : les cibles de longueur de jambe et de dos changent
    déjà la stature de plusieurs centimètres. Mesuré sur deux morphologies
    opposées, la hauteur post-cibles allait de 1,61 à 1,73 m — partir d'une
    constante donnait jusqu'à 7 cm d'erreur sur la taille finale.
    """
    if height_cm <= 0:
        return
    base_m = _hauteur_reelle_m(human)
    if base_m <= 0.01:
        base_m = BASE_HEIGHT_CM / 100.0
    facteur = (height_cm / 100.0) / base_m
    human.scale = (facteur, facteur, facteur)
    print(f"Taille : {height_cm:.1f} cm (corps morphé {base_m * 100:.1f} cm, facteur {facteur:.3f})")


def _apply_skin(human, skin_tone_hex):
    """Matériau peau appliqué uniquement aux emplacements de peau du corps.

    MPFB crée plusieurs emplacements matériau (peau, yeux, dents, langue,
    sourcils, cils…). Remplacer TOUS les emplacements teintait les yeux,
    dents et cils avec la couleur de peau — donnant un aspect étrange
    (« semblant de cheveux » sur le front). On ne remplace que les slots
    dont le nom correspond à la peau.
    """
    h = (skin_tone_hex or "#C68863").lstrip("#")
    if len(h) < 6:
        h = "C68863"
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

    mat = bpy.data.materials.get("SurMezur_Skin") or bpy.data.materials.new("SurMezur_Skin")
    mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    if "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.45

    # Noms connus des emplacements de peau MakeHuman/MPFB — on n'imprime
    # qu'un avertissement pour les slots inconnus au lieu de les peindre.
    SKIN_SLOT_NAMES = {"skin", "body", "skinbody"}

    if human.data.materials:
        for i in range(len(human.data.materials)):
            slot = human.data.materials[i]
            if slot and slot.name.lower() in SKIN_SLOT_NAMES:
                human.data.materials[i] = mat
            elif slot:
                print(f"  matériau conservé tel quel : {slot.name}")
    else:
        human.data.materials.append(mat)
    print(f"Peau : {skin_tone_hex}")


def _export_glb(human, output_path):
    """
    Exporte le seul corps, cibles fondues dans la géométrie.

    `export_selection` limite l'export au corps : la scène contient aussi les
    géométries d'aide de MPFB (cheveux, dents, yeux, jupe...) que l'avatar n'a
    pas à embarquer. `export_morph=False` fond les shape keys dans le maillage
    au lieu de les exporter comme morphs, ce qui divise le poids du fichier et
    évite qu'un lecteur remette les influences à zéro.
    """
    bpy.ops.object.select_all(action="DESELECT")
    human.select_set(True)
    bpy.context.view_layer.objects.active = human

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_morph=False,
    )


# ---------------------------------------------------------------------------
# Point d'entrée
# ---------------------------------------------------------------------------

def main():
    params_path = _get_positional(0)
    output_path = _get_positional(1)
    if not params_path or not output_path:
        print(f"Usage: blender --background --python {__file__} -- <params.json> <output.glb>")
        sys.exit(1)
    if not os.path.exists(params_path):
        print(f"Fichier de paramètres introuvable : {params_path}")
        sys.exit(1)

    with open(params_path, "r", encoding="utf-8") as f:
        params = json.load(f)
    print(f"Paramètres : {json.dumps(params, ensure_ascii=False)}")

    _clear_scene()

    human = _create_human()
    if human is None:
        print("Erreur : impossible de créer le corps MPFB")
        sys.exit(1)
    print(f"Corps créé : {human.name} ({len(human.data.vertices)} sommets)")

    n = _apply_morphology(human, params)
    print(f"{n} cible(s) morphologique(s) appliquée(s)")

    _apply_height(human, float(params.get("height_cm", BASE_HEIGHT_CM)))
    _apply_skin(human, params.get("skin_tone_hex", "#C68863"))

    _export_glb(human, output_path)
    print(f"GLB exporté : {output_path} ({os.path.getsize(output_path)} octets)")


if __name__ == "__main__":
    main()
