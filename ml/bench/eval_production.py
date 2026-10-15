"""
Precision de la chaine de mesure TELLE QU'EN PRODUCTION, sur les 20 sujets
mesures au metre ruban.

Fait tourner `app.services.vision.pipeline.run` puis les corrections de
production (`app.api.v1.measurements._corriger`), et rapporte l'erreur absolue
moyenne (MAE, cm) par mesure, brute et corrigee, separement pour :
  - les 13 sujets pilotes (sujets.json) : ils ont servi a regler les
    corrections, leurs chiffres sont donc flatteurs ;
  - les 7 sujets de validation (nouveaux_sujets_reels.json), jamais utilises
    pour un reglage : ce sont les chiffres honnetes.

    python ml/bench/eval_production.py
    python ml/bench/eval_production.py --dump resultats.json

Une correction qui degrade la validation n'a rien a faire en production.

Les modeles sont prechauffes avant la premiere photo, comme au demarrage du
service : sinon le chargement de MobileSAM depasse le delai par etape (30 s),
le pipeline se replie sur le squelette et les chiffres ne veulent plus rien
dire. Un sujet mesure en mode degrade est signale dans le rapport.

Photos : ml/bench/photos/ (40 fichiers, hors git car ce sont des photos de
personnes et le depot est public). C'est le seul jeu de donnees reelles du
projet : en garder une copie hors de cette machine (disque externe, Drive
prive), jamais dans le depot ni sur un lien public.
"""
from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from pathlib import Path
from types import SimpleNamespace

RACINE = Path(__file__).resolve().parents[2]
BACKEND = RACINE / "backend"
sys.path.insert(0, str(BACKEND))

PHOTOS = Path(__file__).with_name("photos")
PILOTES_JSON = Path(__file__).with_name("sujets.json")
VALIDATION_JSON = Path(__file__).with_name("nouveaux_sujets_reels.json")

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]


def groupes() -> dict[str, list[tuple[dict, dict]]]:
    pil = json.loads(PILOTES_JSON.read_text(encoding="utf-8"))
    val = json.loads(VALIDATION_JSON.read_text(encoding="utf-8"))
    pilotes = [
        (s, pil["photos"][str(s["id"])]) for s in pil["sujets"]
        if str(s["id"]) in pil["photos"] and not pil["photos"][str(s["id"])].get("incertain")
    ]
    validation = [(s, s["photos"]) for s in val["sujets"] if s.get("photos")]
    return {"pilotes": pilotes, "validation": validation}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", type=str, default=None, help="chemin JSON pour sauvegarder le rapport")
    args = ap.parse_args()

    from app.api.v1.measurements import _corriger
    from app.services.vision import pipeline

    pipeline.warm_up()

    rapport = {}
    for nom, sujets in groupes().items():
        brut = {k: [] for k in TOURS + LONGUEURS}
        prod = {k: [] for k in TOURS + LONGUEURS}
        echecs, degrades = [], []
        for s, pp in sujets:
            front, side = PHOTOS / pp["face"], PHOTOS / pp["profil"]
            if not front.exists() or not side.exists():
                echecs.append(f"{s['id']} : photo absente de {PHOTOS}")
                continue
            r = pipeline.run(front_photo=front, side_photo=side, height_cm=s["height_cm"],
                             weight_kg=s["weight_kg"], gender=s["gender"])
            if r is None:
                echecs.append(f"{s['id']} : analyse en echec")
                continue
            if r.notes:
                degrades.append(f"{s['id']} : {'; '.join(r.notes)}")
            corrige = _corriger(r, SimpleNamespace(gender=s["gender"], id=s["id"]))
            vrai = dict(zip(TOURS, s["tours"])) | dict(zip(LONGUEURS, s["longueurs"]))
            for k, v in vrai.items():
                if v is None:
                    continue
                if k in r.data:
                    brut[k].append(abs(r.data[k] - v))
                if k in corrige:
                    prod[k].append(abs(corrige[k] - v))
        rapport[nom] = {
            "n": len(sujets) - len(echecs),
            "echecs": echecs,
            "degrades": degrades,
            "brut": {k: round(st.mean(v), 2) for k, v in brut.items() if v},
            "production": {k: round(st.mean(v), 2) for k, v in prod.items() if v},
        }

    print(f"\n{'mesure':<14}" + "".join(f"{g + ' brut':>18}{g + ' prod':>18}" for g in rapport))
    for k in TOURS + LONGUEURS:
        ligne = f"{k:<14}"
        for g in rapport.values():
            ligne += f"{g['brut'].get(k, float('nan')):>18.2f}{g['production'].get(k, float('nan')):>18.2f}"
        print(ligne)
    for nom, g in rapport.items():
        moy = st.mean(g["production"].values()) if g["production"] else float("nan")
        print(f"{nom} : {g['n']} sujets, MAE moyenne en production {moy:.2f} cm")
        for e in g["echecs"]:
            print(f"  echec {e}")
        for d in g["degrades"]:
            print(f"  degrade {d}")

    if args.dump:
        Path(args.dump).write_text(json.dumps(rapport, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
