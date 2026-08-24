"""
Banc d'essai : precision reelle de la chaine de mesure sur les 13 sujets terrain.

Fait tourner `app.services.vision.pipeline.run` (le VRAI pipeline de
production, pas une reimplementation) sur chaque paire de photos, compare au
metre ruban (`sujets.json`), et rapporte l'erreur absolue moyenne (MAE) par
mesure.

    python ml/bench/run_bench.py                  # baseline actuelle
    python ml/bench/run_bench.py --detail          # + chaque sujet, chaque mesure
    python ml/bench/run_bench.py --dump out.json   # sauvegarde brute (mesures + features) pour analyse

Ce script ne modifie rien : c'est l'instrument de mesure qui permet de juger
si une piste d'amelioration change reellement quelque chose, avant de la
garder.
"""
from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
BACKEND = RACINE / "backend"
sys.path.insert(0, str(BACKEND))

PHOTOS = BACKEND / "uploads" / "measurement_photos"
SUJETS_JSON = Path(__file__).with_name("sujets.json")

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]


def charger_sujets() -> dict:
    return json.loads(SUJETS_JSON.read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--detail", action="store_true", help="affiche chaque sujet")
    ap.add_argument("--dump", type=str, default=None, help="chemin JSON pour sauvegarder les resultats bruts")
    ap.add_argument("--no-side", action="store_true", help="ignore la photo de profil (simule l'absence de profil)")
    args = ap.parse_args()

    from app.services.vision import pipeline

    donnees = charger_sujets()
    sujets = donnees["sujets"]
    photos = donnees["photos"]

    erreurs: dict[str, list[float]] = {k: [] for k in TOURS + LONGUEURS}
    bruts = []

    for s in sujets:
        sid = str(s["id"])
        pp = photos.get(sid)
        if not pp or pp.get("incertain"):
            print(f"sujet {sid:>2} : appariement incertain, ignore")
            continue

        front = PHOTOS / pp["face"]
        side = None if args.no_side else PHOTOS / pp["profil"]

        resultat = pipeline.run(
            front_photo=front,
            side_photo=side,
            height_cm=s["height_cm"],
            weight_kg=s["weight_kg"],
            gender=s["gender"],
        )

        if resultat is None:
            print(f"sujet {sid:>2} : ECHEC pipeline (repli heuristique attendu en production)")
            bruts.append({"id": s["id"], "ok": False})
            continue

        attendu_tours = dict(zip(TOURS, s["tours"]))
        attendu_long = dict(zip(LONGUEURS, s["longueurs"]))
        attendu = {**attendu_tours, **attendu_long}

        # `chest`/`waist`/`hips` du referentiel -> colonnes calculees par le modele
        alias = {"chest": "chest", "waist": "waist", "hips": "hips"}

        lignes = []
        for cle, ref in attendu.items():
            calc = resultat.data.get(cle)
            if calc is None:
                continue
            e = abs(calc - ref)
            if cle == "shoulder" and s.get("note"):
                lignes.append((cle, ref, calc, e, "EXCLU (aberrant)"))
                continue
            erreurs[cle].append(e)
            lignes.append((cle, ref, calc, e, ""))

        bruts.append({
            "id": s["id"], "ok": True,
            "source": resultat.source,
            "notes": resultat.notes,
            "features": resultat.features,
            "mesures": resultat.data,
            "attendu": attendu,
        })

        if args.detail:
            print(f"\n--- sujet {sid} ({s['gender']}, {s['height_cm']}cm, {s['weight_kg']}kg) "
                  f"[source={resultat.source}] ---")
            for cle, ref, calc, e, note in lignes:
                print(f"  {cle:15} attendu={ref:6.1f}  calcule={calc:6.1f}  erreur={e:5.2f}  {note}")
            if resultat.notes:
                print(f"  notes: {resultat.notes}")

    print("\n" + "=" * 70)
    print("MAE par mesure (cm)")
    print("=" * 70)
    total = []
    for cle in TOURS + LONGUEURS:
        vals = erreurs[cle]
        if not vals:
            print(f"  {cle:15} -- aucune donnee")
            continue
        mae = st.mean(vals)
        total.append(mae)
        print(f"  {cle:15} {mae:6.2f} cm   (n={len(vals)}, max={max(vals):5.2f})")
    if total:
        print("-" * 70)
        print(f"  {'MOYENNE':15} {st.mean(total):6.2f} cm")

    if args.dump:
        Path(args.dump).write_text(json.dumps(bruts, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nDonnees brutes ecrites dans {args.dump}")


if __name__ == "__main__":
    main()
