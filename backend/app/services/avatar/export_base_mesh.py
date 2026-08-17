"""
Script Blender à exécuter UNE SEULE FOIS EN LOCAL (jamais en production) pour
générer les 2 maillages de base (homme/femme) portant tous les axes de
morphologie comme morph targets glTF. Ces fichiers sont ensuite embarqués
dans l'app mobile (mobile/assets/) : le client déforme lui-même le maillage
avec les poids envoyés par le serveur, sans jamais relancer Blender.

Usage :
    blender --background --python export_base_mesh.py -- male   <sortie.glb>
    blender --background --python export_base_mesh.py -- female <sortie.glb>

Différence avec generator.py (génération par client, une exécution par
mesure) : ici, chaque cible est chargée dans SES DEUX SENS (-incr et -decr)
comme deux shape keys distinctes, à poids 0 — seule la donnée de déformation
est embarquée, rien n'est appliqué par défaut. Aucune mise à l'échelle de
taille n'est appliquée non plus : c'est le mobile qui calcule son propre
facteur, exactement comme il le fait déjà pour le repli procédural
(voir Viewer3D.tsx, `heightCm / BASE_HEIGHT_CM`).
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generator as gen  # noqa: E402 -- réutilise les tables de cibles et les helpers MPFB

import bpy  # noqa: E402


def _get_positional(index: int) -> str | None:
    try:
        sep = sys.argv.index("--")
    except ValueError:
        return None
    pos = sep + 1 + index
    return sys.argv[pos] if pos < len(sys.argv) else None


def _load_both_directions(targets_dir: Path, sous: str, racine: str) -> int:
    """Charge les fichiers -incr et -decr d'une cible directionnelle, à poids 0."""
    n = 0
    for sens in ("incr", "decr"):
        if gen._load_fichier(targets_dir, sous, f"{racine}-{sens}.target.gz", 0.0):
            n += 1
    return n


def build_base(gender: str, output_path: str) -> None:
    gen._clear_scene()
    human = gen._create_human()
    if human is None:
        print("Erreur : impossible de créer le corps MPFB")
        sys.exit(1)
    print(f"Corps créé : {human.name} ({len(human.data.vertices)} sommets)")

    targets_dir = gen._targets_dir()
    if targets_dir is None:
        print("Cibles MakeHuman introuvables")
        sys.exit(1)

    total = 0
    for table in (gen.MEASURE_TARGETS, gen.SHAPE_TARGETS, gen.BREADTH_DEPTH_TARGETS, gen.PROPORTION_TARGETS):
        for _param, (sous, racine) in table.items():
            total += _load_both_directions(targets_dir, sous, racine)

    total += _load_both_directions(targets_dir, *gen.TORSO_WIDTH_TARGET)
    total += _load_both_directions(targets_dir, *gen.TORSO_DEPTH_TARGET)

    # Corpulence et musculature : mêmes cibles que _apply_morphology (un seul
    # scalaire pilote plusieurs cibles à la fois côté paramètres runtime, mais
    # chacune doit exister ici comme shape key indépendante).
    for sous, racine in (
        ("arms", "l-upperarm-fat"), ("arms", "r-upperarm-fat"),
        ("legs", "l-upperleg-fat"), ("legs", "r-upperleg-fat"),
        ("stomach", "stomach-pregnant"),
    ):
        total += _load_both_directions(targets_dir, sous, racine)
    for sous, racine in (("torso", "torso-muscle-pectoral"), ("torso", "torso-muscle-dorsi")):
        total += _load_both_directions(targets_dir, sous, racine)

    if gender == "female":
        for sens in ("up", "down"):
            if gen._load_fichier(targets_dir, "breast", f"breast-volume-vert-{sens}.target.gz", 0.0):
                total += 1

    print(f"{total} shape key(s) chargée(s)")

    gen._apply_skin(human, "#C68863")

    hauteur_cm = gen._hauteur_reelle_m(human) * 100.0
    print(f"Hauteur du maillage neutre : {hauteur_cm:.2f} cm (toutes cibles à 0)")

    bpy.ops.object.select_all(action="DESELECT")
    human.select_set(True)
    bpy.context.view_layer.objects.active = human

    # B4: Lissage de base pour un rendu plus naturel (supprime les faces
    # visibles sur les zones courbes comme les jambes et le tronc).
    bpy.ops.object.shade_smooth()

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,   # pas de fusion des modifiers : on veut garder les shape keys
        export_morph=True,    # <- c'est la seule vraie différence avec generator.py
        export_morph_normal=False,  # sans les normales par cible (≈20 Mo → 4-5 Mo)
        export_morph_tangent=False,
    )
    size = os.path.getsize(output_path)
    print(f"Export : {output_path} ({size} octets)")


def main() -> None:
    gender = _get_positional(0)
    output_path = _get_positional(1)
    if gender not in ("male", "female") or not output_path:
        print("Usage: blender --background --python export_base_mesh.py -- <male|female> <sortie.glb>")
        sys.exit(1)
    build_base(gender, output_path)


if __name__ == "__main__":
    main()
