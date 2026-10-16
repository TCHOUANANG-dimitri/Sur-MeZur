"""Essai du moteur de patrons en local, sans API ni base de donnees.

Depuis backend/ :
    ./venv/Scripts/python.exe -m scripts.patron_essai --base jupe_droite \
        --mesures '{"waist": 72, "hips": 100, "height": 165}' --style '{"longueur_cm": 60}'
    ./venv/Scripts/python.exe -m scripts.patron_essai --liste

Ecrit patron.svg, patron_a4.pdf, patron_plein.pdf, patron_tracage.pdf et
fiche.json dans --sortie (par defaut ./patron_essai/).
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.patrons import catalogue_public, fichiers, generer  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    ap.add_argument("--mesures", default="{}")
    ap.add_argument("--style", default="{}")
    ap.add_argument("--genre", choices=["femme", "homme"])
    ap.add_argument("--sortie", default="patron_essai")
    ap.add_argument("--liste", action="store_true", help="afficher les modeles de base")
    a = ap.parse_args()
    if a.liste or not a.base:
        for c in catalogue_public()["categories"]:
            print(f"{c['id']:10} {c['label']}")
            for b in c["bases"]:
                print(f"    {b['id']:16} {b['label']} ({b['statut']}) style={b['style_defaut']}")
            if c["a_venir"]:
                print(f"    (à venir : {c['a_venir']})")
        return
    t = time.time()
    p = generer(a.base, json.loads(a.mesures), json.loads(a.style), a.genre)
    out = Path(a.sortie)
    out.mkdir(parents=True, exist_ok=True)
    for nom, contenu in fichiers(p).items():
        (out / f"patron{'.' if nom == 'svg' else '_'}{nom}").write_bytes(contenu)
    (out / "fiche.json").write_text(json.dumps(p.fiche(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{p.base.label} : {len(p.pieces)} pièce(s) en {time.time() - t:.1f} s -> {out.resolve()}")
    for pc in p.fiche()["pieces"]:
        print(f"  - {pc['nom']} ({pc['consigne']}) {pc['largeur_cm']} x {pc['hauteur_cm']} cm, {len(pc['points'])} points")
    for c in p.controles:
        print(f"  [{c['statut']}] {c['controle']} : {c['detail']}")
    for r in p.remarques:
        print(f"  ! {r}")


if __name__ == "__main__":
    main()
