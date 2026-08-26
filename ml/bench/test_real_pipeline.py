#!/usr/bin/env python3
"""
Test reel : le VRAI pipeline de production sur les 13 photos reelles.

Ce script ne SIMULE rien. Il charge le code de production tel quel,
lance MediaPipe + SAM + modele V3 sur chaque paire de photos, et compare
les resultats aux mesures au metre ruban (sujets.json).

C'est le seul test qui prouve que la precision reelle est ce qu'on affiche.
"""
from __future__ import annotations

import json
import os
import sys
import time
import statistics as st
from pathlib import Path

# Force VISION_ENABLED avant tout import du backend
os.environ["VISION_ENABLED"] = "1"

RACINE = Path(__file__).resolve().parents[2]
BACKEND = RACINE / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

PHOTOS = BACKEND / "uploads" / "measurement_photos"
SUJETS_JSON = Path(__file__).with_name("sujets.json")
RESULTS_JSON = Path(__file__).with_name("test_real_pipeline_results.json")

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]
TOUTES = TOURS + LONGUEURS


def charger_sujets() -> dict:
    return json.loads(SUJETS_JSON.read_text(encoding="utf-8"))


def main() -> None:
    from app.services.vision import pipeline
    from app.core.config import settings

    print("=" * 70)
    print("TEST REEL : PIPELINE DE PRODUCTION SUR 13 PHOTOS TERRAIN")
    print("=" * 70)
    print(f"VISION_ENABLED = {settings.vision_enabled}")
    print(f"SAM disponible = {pipeline.capabilities()['sam']['available']}")
    print(f"MediaPipe disponible = {pipeline.capabilities()['mediapipe']['available']}")
    print(f"Modeles = {pipeline.capabilities()['models']}")
    print()

    donnees = charger_sujets()
    sujets = donnees["sujets"]
    photos = donnees["photos"]

    erreurs: dict[str, list[float]] = {k: [] for k in TOUTES}
    ecarts_signes: dict[str, list[float]] = {k: [] for k in TOUTES}
    details_sujets = []
    echecs = []
    timings = []

    for s in sujets:
        sid = str(s["id"])
        pp = photos.get(sid)
        if not pp or pp.get("incertain"):
            print(f"  Sujet {sid:>2} : appariement incertain, IGNORE")
            continue

        front = PHOTOS / pp["face"]
        side = PHOTOS / pp["profil"]

        if not front.exists():
            print(f"  Sujet {sid:>2} : photo face manquante, IGNORE")
            continue
        if not side.exists():
            print(f"  Sujet {sid:>2} : photo profil manquante, IGNORE")
            continue

        t0 = time.time()
        resultat = pipeline.run(
            front_photo=front,
            side_photo=side,
            height_cm=s["height_cm"],
            weight_kg=s["weight_kg"],
            gender=s["gender"],
        )
        dt = time.time() - t0
        timings.append(dt)

        if resultat is None:
            print(f"  Sujet {sid:>2} : ECHEC pipeline ({dt:.1f}s)")
            echecs.append(s["id"])
            continue

        attendu_tours = dict(zip(TOURS, s["tours"]))
        attendu_long = dict(zip(LONGUEURS, s["longueurs"]))
        attendu = {**attendu_tours, **attendu_long}

        detail = {
            "id": s["id"],
            "gender": s["gender"],
            "height_cm": s["height_cm"],
            "weight_kg": s["weight_kg"],
            "source": resultat.source,
            "duree_s": round(dt, 1),
            "notes": resultat.notes,
            "features": resultat.features,
            "mesures": {},
        }

        print(f"\n--- Sujet {sid} ({s['gender']}, {s['height_cm']}cm, "
              f"{s['weight_kg']}kg) [{resultat.source}, {dt:.1f}s] ---")

        for cle, ref in attendu.items():
            calc = resultat.data.get(cle)
            if calc is None:
                print(f"  {cle:15} attendu={ref:6.1f}  calcule=   N/A")
                continue

            # Exclure la carrure du sujet 5 (valeur aberrante documentee)
            if cle == "shoulder" and s.get("note"):
                print(f"  {cle:15} attendu={ref:6.1f}  calcule={calc:6.1f}  EXCLU (aberrant)")
                continue

            e = abs(calc - ref)
            e_signe = calc - ref
            erreurs[cle].append(e)
            ecarts_signes[cle].append(e_signe)

            marque = ""
            if e > 5.0:
                marque = " <<< ERREUR MAJEURE"
            elif e > 2.0:
                marque = " < ERROR"
            elif e <= 1.0:
                marque = " * OK"

            print(f"  {cle:15} attendu={ref:6.1f}  calcule={calc:6.1f}  "
                  f"erreur={e:5.2f}  (signe={e_signe:+6.2f}){marque}")

            detail["mesures"][cle] = {
                "attendu": ref,
                "calcule": calc,
                "erreur_abs": round(e, 2),
                "erreur_signe": round(e_signe, 2),
            }

        details_sujets.append(detail)

    # --- SYNTHSE ---
    print("\n" + "=" * 70)
    print("SYNTHSE : MAE PAR MESURE (cm)")
    print("=" * 70)

    total_mae = []
    total_signe = []
    for cle in TOUTES:
        vals = erreurs[cle]
        vals_s = ecarts_signes[cle]
        if not vals:
            print(f"  {cle:15} -- aucune donnee")
            continue
        mae = st.mean(vals)
        bias = st.mean(vals_s)
        total_mae.append(mae)
        total_signe.append(bias)
        ecart_type = st.stdev(vals_s) if len(vals_s) > 1 else 0
        status = "OK" if mae <= 1.0 else ("PRESQUE" if mae <= 2.0 else "ERREUR")
        print(f"  {cle:15} MAE={mae:6.2f}  bias={bias:+6.2f}  "
              f"std={ecart_type:5.2f}  n={len(vals):2d}  [{status}]")

    if total_mae:
        print("-" * 70)
        print(f"  {'MOYENNE':15} MAE={st.mean(total_mae):6.2f}  "
              f"bias={st.mean(total_signe):+6.2f}")
        nb_ok = sum(1 for m in total_mae if m <= 1.0)
        nb_presque = sum(1 for m in total_mae if 1.0 < m <= 2.0)
        nb_err = sum(1 for m in total_mae if m > 2.0)
        print(f"\n  Bilan : {nb_ok}/{len(total_mae)} sous 1 cm, "
              f"{nb_presque} entre 1-2 cm, {nb_err} au-dessus de 2 cm")

    if timings:
        print(f"\n  Temps moyen par sujet : {st.mean(timings):.1f}s "
              f"(min={min(timings):.1f}s, max={max(timings):.1f}s)")

    if echecs:
        print(f"\n  Echecs pipeline : {len(echecs)} sujets ({echecs})")

    # --- ERREURS PAR SUJET ---
    print("\n" + "=" * 70)
    print("ERREURS PAR SUJET")
    print("=" * 70)
    for d in details_sujets:
        if not d["mesures"]:
            continue
        erreurs_sujet = [m["erreur_abs"] for m in d["mesures"].values()]
        mae_sujet = st.mean(erreurs_sujet) if erreurs_sujet else 0
        print(f"  Sujet {d['id']:>2} ({d['gender'][0]}, {d['height_cm']}cm, "
              f"{d['weight_kg']:>5.1f}kg) MAE={mae_sujet:.2f}cm [{d['source']}]")

    # --- SAUVEGARDE ---
    resultats = {
        "details_sujets": details_sujets,
        "mae_par_mesure": {k: round(st.mean(v), 2) if v else None
                           for k, v in erreurs.items()},
        "bias_par_mesure": {k: round(st.mean(v), 2) if v else None
                            for k, v in ecarts_signes.items()},
        "mae_moyenne": round(st.mean(total_mae), 2) if total_mae else None,
        "echecs": echecs,
        "n_sujets_reussis": len(details_sujets),
        "n_sujets_total": len(sujets),
    }
    RESULTS_JSON.write_text(json.dumps(resultats, ensure_ascii=False, indent=2),
                            encoding="utf-8")
    print(f"\nResultats sauvegardes dans {RESULTS_JSON}")


if __name__ == "__main__":
    main()
