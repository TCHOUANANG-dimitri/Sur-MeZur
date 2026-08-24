"""
Experience 3 : lisser la lecture de largeur/profondeur sur quelques lignes
plutot qu'une seule.

Constat : `_row_width_px` lit la largeur du masque sur UNE SEULE ligne de
pixels. Un masque de segmentation reel porte du bruit local -- bord dentele,
pli de vetement, artefact JPEG -- auquel une lecture mono-ligne est
maximalement sensible. C'est un axe different des deux precedents : une
reduction de BRUIT, pas une correction apprise sur une population. Elle ne
devrait donc pas retomber dans le piege de transfert de population deja
confirme deux fois cette session (Experience 2 et 2b).

Test : remplacer la lecture mono-ligne par la MEDIANE de plusieurs lignes
autour du niveau vise (fenetre en % de la hauteur de torse), a la fois pour
la recherche des extremums (taille/hanches) et pour la lecture finale.

    python -m ml.bench.experiments.exp3_lissage_lignes
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import harness  # noqa: E402


def patch_row_width(largeur_fenetre_frac: float, nb_lignes: int):
    """Remplace `_row_width_px(mask, y, cx)` par la mediane sur `nb_lignes`
    autour de y, espacees de `largeur_fenetre_frac` * hauteur du masque."""
    from app.services.vision import silhouette as sil_mod

    original = sil_mod._row_width_px

    def lisse(mask, y, center_x):
        if nb_lignes <= 1:
            return original(mask, y, center_x)
        import statistics as st
        demi = (nb_lignes - 1) // 2
        pas = largeur_fenetre_frac * mask.shape[0]
        valeurs = []
        for k in range(-demi, demi + 1):
            v = original(mask, y + k * pas, center_x)
            if v > 0:
                valeurs.append(v)
        return st.median(valeurs) if valeurs else 0.0

    sil_mod._row_width_px = lisse
    return sil_mod, original


def main() -> None:
    for nb_lignes, fenetre in [(3, 0.006), (5, 0.006), (5, 0.012)]:
        sil_mod, original = patch_row_width(fenetre, nb_lignes)
        try:
            resultat = harness.run()
        finally:
            sil_mod._row_width_px = original
        harness.comparer(
            f"Exp3 : mediane sur {nb_lignes} lignes (pas={fenetre * 100:.1f}% de la hauteur de torse)",
            resultat,
        )


if __name__ == "__main__":
    main()
