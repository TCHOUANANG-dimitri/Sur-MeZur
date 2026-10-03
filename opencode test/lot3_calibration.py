"""Lot 3 — calibration enrichie : globale vs par sexe, affine vs decalage.

Evalue en leave-one-out strict, sur les 18 sujets communs :
  prod_b, prod_b+calib, prod_b+calib_sexe,
  annyB, annyB+calib, annyB+calib_sexe, annyB+decal,
  annyA, annyA+calib, annyA+calib_sexe, annyA+decal, production.
Sortie : lot3_resultats.json + tableau console.
"""
import json
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]  # .../Sur-MeZur-App
sys.path.insert(0, str(RACINE / "pipeline_anny"))

from anny_pipeline import calibration, evaluation  # noqa: E402
from sujets import LIBELLES, MESURES  # noqa: E402

ICI = str(RACINE / "pipeline_anny" / "resultats")
OUT = str(RACINE / "opencode test")


def loo_sexe(predictions, verite, sexes, mesures, exclues, variante="affine"):
    """LOO ou la droite est apprise sur les sujets du MEME sexe (sans soi)."""
    out = {u: {} for u in predictions}
    for m in mesures:
        for u, d in predictions.items():
            if m not in d or m not in verite.get(u, {}) or m in exclues.get(u, set()):
                continue
            pairs = [(v, predictions[v][m], verite[v][m]) for v in predictions
                     if v != u and m in predictions.get(v, {}) and m in verite.get(v, {})
                     and sexes.get(v) == sexes.get(u) and m not in exclues.get(v, set())]
            if len(pairs) >= calibration.MIN_SUJETS:
                a, b = calibration.ajuster([p[1] for p in pairs], [p[2] for p in pairs], variante)
                out[u][m] = round(a * d[m] + b, 2)
            else:  # repli honnete : LOO globale
                autres = [(v, predictions[v][m], verite[v][m]) for v in predictions
                          if v != u and m in predictions.get(v, {}) and m in verite.get(v, {})
                          and m not in exclues.get(v, set())]
                if len(autres) >= calibration.MIN_SUJETS:
                    a, b = calibration.ajuster([p[1] for p in autres], [p[2] for p in autres], variante)
                    out[u][m] = round(a * d[m] + b, 2)
                else:
                    out[u][m] = d[m]
    return out


def cles(d):
    return {k: float(v) for k, v in d.items() if k in MESURES and v is not None}


def main():
    obs = json.load(open(ICI + "/observations.json", encoding="utf-8"))
    anny = json.load(open(ICI + "/anny.json", encoding="utf-8"))
    verite = {u: o["verite"] for u, o in obs.items()}
    exclues = {u: set(o.get("exclues", [])) for u, o in obs.items()}
    sexes = {u: o["gender"] for u, o in obs.items()}
    base = {}
    for u, o in obs.items():
        p = o.get("production") or {}
        if p.get("ok"):
            base.setdefault("prod_b", {})[u] = cles(p["brut"])
            base.setdefault("production", {})[u] = cles(p["final"])
        a = anny.get(u) or {}
        if a.get("ok"):
            base.setdefault("annyB", {})[u] = cles(a["voie_b"]["mesures"])
            base.setdefault("annyA", {})[u] = cles(a["voie_a"]["mesures"])
    pred = dict(base)
    pred["prod_b+calib"] = calibration.loo_toutes(base["prod_b"], verite, MESURES, exclues)
    pred["prod_b+calib_sexe"] = loo_sexe(base["prod_b"], verite, sexes, MESURES, exclues)
    pred["annyB+calib"] = calibration.loo_toutes(base["annyB"], verite, MESURES, exclues)
    pred["annyB+calib_sexe"] = loo_sexe(base["annyB"], verite, sexes, MESURES, exclues)
    pred["annyB+decal"] = calibration.loo_toutes(base["annyB"], verite, MESURES, exclues, "decalage")
    pred["annyA+calib"] = calibration.loo_toutes(base["annyA"], verite, MESURES, exclues)
    pred["annyA+calib_sexe"] = loo_sexe(base["annyA"], verite, sexes, MESURES, exclues)
    pred["annyA+decal"] = calibration.loo_toutes(base["annyA"], verite, MESURES, exclues, "decalage")

    tous = list(obs)
    commun = [u for u in tous if all(u in pred[m] for m in
              ("production", "prod_b", "annyB", "annyA"))]
    print(f"communs: {len(commun)}")
    lignes = []
    resumes = {}
    for m in ("production", "prod_b", "prod_b+calib", "prod_b+calib_sexe",
              "annyB", "annyB+calib", "annyB+calib_sexe", "annyB+decal",
              "annyA", "annyA+calib", "annyA+calib_sexe", "annyA+decal"):
        r = evaluation.resume(evaluation.erreurs(pred[m], verite, MESURES, commun, exclues))
        resumes[m] = r
        det = " ".join(f"{k}={r['par_mesure'][k]['mae']:.1f}" for k in MESURES if k in r["par_mesure"])
        print(f"{m:20} moy={r['mae_globale']:.2f} <=3:{r['mesures_sous_3cm']}/12\n   {det}")
        lignes.append((m, r["mae_globale"], r["mesures_sous_3cm"]))
    json.dump({"commun": commun, "table": lignes, "resumes": resumes},
              open(OUT + "/lot3_resultats.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("-> " + OUT + "/lot3_resultats.json")


if __name__ == "__main__":
    main()
