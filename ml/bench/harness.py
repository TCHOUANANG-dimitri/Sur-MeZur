"""
Harnais reutilisable pour les experiences de precision.

Expose `run()` : execute le VRAI pipeline (`app.services.vision.pipeline.run`)
sur les 13 sujets terrain et renvoie les erreurs par mesure. Un experiment
script importe ce module, patche une constante ou une fonction AVANT
d'appeler `run()`, puis compare le resultat a la reference (`baseline()`).

Ne jamais dupliquer la logique du pipeline ici : le but est de mesurer le
code de production tel qu'il tourne, pas une reimplementation qui pourrait
diverger.
"""
from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
BACKEND = RACINE / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

PHOTOS = BACKEND / "uploads" / "measurement_photos"
SUJETS_JSON = Path(__file__).with_name("sujets.json")
BASELINE_JSON = Path(__file__).with_name("baseline_v3.json")

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]
TOUTES = TOURS + LONGUEURS


def charger_sujets() -> dict:
    return json.loads(SUJETS_JSON.read_text(encoding="utf-8"))


def run(gender_filter: str | None = None, sujet_ids: set[int] | None = None) -> dict:
    """
    Fait tourner le pipeline sur chaque sujet (ou sous-ensemble).

    Renvoie {"par_mesure": {cle: [erreurs...]}, "brut": [...], "echecs": [...]}.
    """
    from app.services.vision import pipeline

    donnees = charger_sujets()
    erreurs: dict[str, list[float]] = {k: [] for k in TOUTES}
    brut = []
    echecs = []

    for s in donnees["sujets"]:
        if gender_filter and s["gender"] != gender_filter:
            continue
        if sujet_ids and s["id"] not in sujet_ids:
            continue
        sid = str(s["id"])
        pp = donnees["photos"].get(sid)
        if not pp or pp.get("incertain"):
            continue

        resultat = pipeline.run(
            front_photo=PHOTOS / pp["face"],
            side_photo=PHOTOS / pp["profil"],
            height_cm=s["height_cm"],
            weight_kg=s["weight_kg"],
            gender=s["gender"],
        )
        if resultat is None:
            echecs.append(s["id"])
            continue

        attendu = dict(zip(TOURS, s["tours"]))
        attendu.update(dict(zip(LONGUEURS, s["longueurs"])))

        ligne = {"id": s["id"], "source": resultat.source, "ecarts": {}}
        for cle, ref in attendu.items():
            calc = resultat.data.get(cle)
            if calc is None:
                continue
            if cle == "shoulder" and s.get("note"):
                continue  # valeur de reference aberrante, documentee dans sujets.json
            e = calc - ref
            erreurs[cle].append(abs(e))
            ligne["ecarts"][cle] = round(e, 2)
        brut.append(ligne)

    return {"par_mesure": erreurs, "brut": brut, "echecs": echecs}


def mae_par_mesure(resultat: dict) -> dict[str, float]:
    return {k: (st.mean(v) if v else None) for k, v in resultat["par_mesure"].items()}


def mae_globale(resultat: dict) -> float:
    vals = [st.mean(v) for v in resultat["par_mesure"].values() if v]
    return st.mean(vals) if vals else float("nan")


def baseline() -> dict[str, float]:
    """MAE de reference (mesuree sur le pipeline non modifie, voir run_bench.py)."""
    return {
        "neck": 1.74, "chest": 4.45, "waist": 6.66, "hips": 4.04, "biceps": 2.33,
        "thigh": 1.64, "wrist": 1.55, "ankle": 4.02, "shoulder": 2.27,
        "sleeve_length": 4.50, "inseam": 3.14, "back_length": 0.88,
    }


def comparer(nom: str, resultat: dict) -> None:
    """Affiche une comparaison lisible face a la reference."""
    ref = baseline()
    mae = mae_par_mesure(resultat)
    print(f"\n=== {nom} ===")
    if resultat["echecs"]:
        print(f"  echecs pipeline: sujets {resultat['echecs']}")
    total_avant, total_apres = [], []
    for cle in TOUTES:
        avant = ref.get(cle)
        apres = mae[cle]
        if apres is None or avant is None:
            continue
        total_avant.append(avant)
        total_apres.append(apres)
        delta = apres - avant
        marque = "  <-- AMELIORATION" if delta < -0.05 else ("  <-- DEGRADATION" if delta > 0.05 else "")
        print(f"  {cle:15} {avant:6.2f} -> {apres:6.2f} cm  ({delta:+.2f}){marque}")
    if total_avant:
        print(f"  {'MOYENNE':15} {st.mean(total_avant):6.2f} -> {st.mean(total_apres):6.2f} cm"
              f"  ({st.mean(total_apres) - st.mean(total_avant):+.2f})")
