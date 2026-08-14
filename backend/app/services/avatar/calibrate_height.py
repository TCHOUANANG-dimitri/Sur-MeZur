"""
Outillage de développement, à exécuter UNE FOIS avec Blender : mesure combien
chaque axe susceptible d'affecter la hauteur du maillage la déplace réellement,
en cm, quand il est poussé à +1.0 / -1.0 seul (tous les autres à 0).

Pourquoi ce script existe : le mobile ne peut pas mesurer la hauteur du
maillage APRÈS application des morph targets (le blending se fait côté GPU,
la géométrie CPU reste à la pose neutre) — contrairement à generator.py, qui
mesure la vraie hauteur post-morphologie via `_hauteur_reelle_m` avant de
choisir son facteur d'échelle (voir sa docstring : jusqu'à 7 cm d'erreur en
utilisant une hauteur de référence constante). Sans ce calibrage, le mobile
utiliserait `base_height_cm` (hauteur du maillage NEUTRE, cibles à 0) comme si
c'était la hauteur post-morphologie de CHAQUE avatar — faux dès que
leg_ratio/torso_ratio/back_factor s'écartent de 0.

Usage : blender --background --python calibrate_height.py
Sortie : imprime des coefficients à recopier dans target_map.py
(HEIGHT_SENSITIVITY), qui permettent d'estimer la hauteur post-morphologie
côté backend (Python pur) sans jamais relancer Blender en production.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generator as gen

import bpy


def height_for(axis_values: dict) -> float:
    gen._clear_scene()
    human = gen._create_human()
    targets_dir = gen._targets_dir()
    for param, (sous, racine) in {**gen.MEASURE_TARGETS, **gen.PROPORTION_TARGETS}.items():
        if param in axis_values:
            gen._load_target(targets_dir, sous, racine, axis_values[param])
    return gen._hauteur_reelle_m(human) * 100.0


def main():
    base = height_for({})
    print(f"Hauteur neutre : {base:.3f} cm")

    # Axes susceptibles d'affecter la hauteur globale (proportions verticales),
    # par opposition aux axes de circonférence (chest/waist/hip/...) qui ne
    # devraient quasiment pas la modifier — vérifiés ci-dessous aussi, par
    # prudence plutôt que par supposition.
    candidates = ["leg_ratio", "torso_ratio", "back_factor", "shoulder_width",
                  "chest_scale", "waist_scale", "hip_scale"]

    results = {}
    for axis in candidates:
        h_plus = height_for({axis: 1.0})
        h_minus = height_for({axis: -1.0})
        results[axis] = ((h_plus - base), (h_minus - base))
        print(f"{axis:16s} +1.0 -> {h_plus:.3f} cm (delta {h_plus - base:+.3f})   "
              f"-1.0 -> {h_minus:.3f} cm (delta {h_minus - base:+.3f})")

    print("\nHEIGHT_SENSITIVITY = {")
    for axis, (dp, dm) in results.items():
        if abs(dp) < 0.05 and abs(dm) < 0.05:
            continue
        print(f'    "{axis}": ({dp / 100.0:.5f}, {dm / 100.0:.5f}),  # m par unité de poids, (+1, -1)')
    print("}")


if __name__ == "__main__":
    main()
