"""
Experience 2b : le n de l'Experience 2 etait calibre sur ANSUR (armee US) et
degradait le resultat sur les 13 sujets terrain -- transfert de population,
comme documente pour le residu de circonference (measurement_model.py).

Question distincte : si on calibre n directement sur LA BONNE population
(nos 13 sujets), un exposant de forme aide-t-il encore, ou l'ellipse pure
(n=2) est-elle deja optimale une fois la population correcte utilisee ?

Avec seulement 6-7 sujets par sexe, aucune conclusion ferme n'est possible --
mais un signal negatif net (n=2 gagne systematiquement en LOO) confirmerait
que ce n'est pas seulement UN MAUVAIS n qui pose probleme, mais l'idee meme
d'un exposant de forme fixe pour cette taille d'echantillon / ce niveau de
bruit d'extraction.

Protocole : validation croisee "leave-one-out" sur les sujets d'un sexe donne
(silhouette DEJA extraite par la chaine reelle, depuis baseline_v3.json) :
pour chaque sujet laisse de cote, on calibre n sur les autres, on l'applique
au sujet exclu, et on compare a l'ellipse pure (n=2).

    python -m ml.bench.experiments.exp2b_superellipse_terrain_fit
"""
from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exp2_superellipse import ramanujan_perimeter, superellipse_perimeters_vect  # noqa: E402

BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"
SUJETS_JSON = Path(__file__).resolve().parents[1] / "sujets.json"

ZONE_COLS = {
    "chest": ("chestbreadth", "chestdepth"),
    "waist": ("waistbreadth", "waistdepth"),
    "hips": ("hipbreadth", "buttockdepth"),
}


def charger() -> tuple[list[dict], dict]:
    donnees = json.loads(BASELINE_JSON.read_text(encoding="utf-8"))
    sujets = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))
    genre_par_id = {s["id"]: s["gender"] for s in sujets["sujets"]}
    lignes = []
    for s in donnees:
        if not s.get("ok"):
            continue
        lignes.append({
            "id": s["id"], "genre": genre_par_id.get(s["id"]),
            "features": s["features"], "attendu": s["attendu"],
        })
    return lignes, genre_par_id


def main() -> None:
    lignes, _ = charger()
    candidats = np.arange(1.2, 6.01, 0.1)

    for genre in ("male", "female"):
        sous = [l for l in lignes if l["genre"] == genre]
        print(f"\n=== {genre} (n={len(sous)} sujets terrain) ===")
        if len(sous) < 4:
            print("  trop peu de sujets pour une CV significative -- ignore")
            continue

        for zone, (bcol, dcol) in ZONE_COLS.items():
            largeurs = np.array([
                l["features"].get(bcol + "_body", l["features"].get(bcol)) for l in sous
            ])
            profondeurs = np.array([
                l["features"].get(dcol + "_body", l["features"].get(dcol)) for l in sous
            ])
            reel = np.array([l["attendu"].get(zone) for l in sous])
            valide = ~np.isnan(largeurs.astype(float)) & (reel != None)  # noqa: E711
            if valide.sum() < 4:
                continue

            perims_par_n = {n: superellipse_perimeters_vect(largeurs, profondeurs, n) for n in candidats}
            perims_n2 = np.array([ramanujan_perimeter(largeurs[i], profondeurs[i]) for i in range(len(sous))])

            erreurs_loo_super = []
            erreurs_loo_n2 = []
            n_choisis = []
            for i in range(len(sous)):
                train = [j for j in range(len(sous)) if j != i]
                meilleurs = None
                for n in candidats:
                    mae = np.mean(np.abs(perims_par_n[n][train] - reel[train]))
                    if meilleurs is None or mae < meilleurs[1]:
                        meilleurs = (n, mae)
                n_choisis.append(meilleurs[0])
                erreurs_loo_super.append(abs(perims_par_n[meilleurs[0]][i] - reel[i]))
                erreurs_loo_n2.append(abs(perims_n2[i] - reel[i]))

            mae_super = st.mean(erreurs_loo_super)
            mae_n2 = st.mean(erreurs_loo_n2)
            delta = mae_super - mae_n2
            marque = "  <-- AMELIORATION" if delta < -0.05 else ("  <-- DEGRADATION" if delta > 0.05 else "  (egal)")
            print(f"  {zone:8} n choisis (LOO)={sorted(set(round(x,1) for x in n_choisis))}  "
                  f"MAE ellipse={mae_n2:5.2f}  MAE superellipse(LOO)={mae_super:5.2f}  ({delta:+.2f}){marque}")


if __name__ == "__main__":
    main()
