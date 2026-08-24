"""
Experience 1 : plancher a zero sur l'epaisseur de vetement resolue.

Hypothese : `resolve_clothing_thickness` peut renvoyer une epaisseur NEGATIVE
(bornes actuelles : -4.0 a +8.0 cm). Physiquement, un vetement ne peut
quasiment jamais rendre la silhouette segmentee plus ETROITE que le corps nu
(sauf tissu compressif, rare dans notre contexte) : une epaisseur negative
signale plutot un desaccord entre le poids saisi et le volume mesure --
segmentation imparfaite, pose penchee, ou poids incorrect -- pas une correction
physique reelle. Sur les 4 sujets inspectes (5, 7, 8, 13), l'epaisseur resolue
etait negative pour 3 d'entre eux (-0.77, -0.37, -0.4), et ce sont precisement
des sujets a forte erreur de tronc.

Test : forcer un plancher a 0.0 cm au lieu de -4.0, sans toucher au plafond.

    python -m ml.bench.experiments.exp1_thickness_floor
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import harness  # noqa: E402


def main() -> None:
    from app.services.vision import silhouette as sil_mod

    original_resolve = sil_mod.resolve_clothing_thickness

    def resolve_avec_plancher(*args, **kwargs):
        t = original_resolve(*args, **kwargs)
        return None if t is None else max(t, 0.0)

    sil_mod.resolve_clothing_thickness = resolve_avec_plancher
    try:
        resultat = harness.run()
    finally:
        sil_mod.resolve_clothing_thickness = original_resolve

    harness.comparer("Exp1 : plancher 0.0 cm sur l'epaisseur de vetement", resultat)


if __name__ == "__main__":
    main()
