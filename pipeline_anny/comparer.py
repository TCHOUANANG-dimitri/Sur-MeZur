"""
Comparaison finale : chaine actuelle vs nouvelle chaine Anny, sur les sujets
pilotes, mesure par mesure.

Methodes comparees (toutes sur les MEMES photos et la MEME verite terrain) :

  production         la chaine actuelle telle qu'elle tourne pour les clients
                     (V3 + corrections statistiques + correction d'entrejambe).
                     Attention : ces corrections ont ete REGLEES sur une partie
                     de ces sujets (RAPPORT_PROJET.md §6bis) ; son score ici
                     est donc optimiste.
  production_brute   la chaine actuelle sans ses corrections.
  production_brute+calib   la meme, plus la calibration locale de la phase 1
                     (a·x+b en validation croisee) : reference equitable pour
                     juger la calibration de la nouvelle chaine.
  anny_voie_b        Anny, a priori seul (taille + poids, aucune photo).
  anny_voie_a        Anny ajuste sur les photos (voie A), mesures ISO brutes.
  anny_voie_a+calib  + calibration locale, phase 1 (le MVP 0->1->2 de la spec).
  anny_voie_a+decal  variante de calibration a decalage seul (a = 1).

Toutes les calibrations sont evaluees en leave-one-out : la valeur corrigee
d'un sujet vient d'une droite apprise sans lui.

    pipeline_anny\\.venv\\Scripts\\python.exe pipeline_anny\\comparer.py

Sorties : resultats/comparaison.json et resultats/RESULTATS.md
"""

from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

from anny_pipeline import calibration, evaluation  # noqa: E402
from sujets import LIBELLES, MESURES  # noqa: E402

OBS = ICI / "resultats" / "observations.json"
ANNY = ICI / "resultats" / "anny.json"
SORTIE_JSON = ICI / "resultats" / "comparaison.json"
SORTIE_MD = ICI / "resultats" / "RESULTATS.md"

ORDRE = [
    "production",
    "production_brute",
    "production_brute+calib",
    "anny_voie_b",
    "anny_voie_b+calib",
    "anny_voie_a",
    "anny_voie_a+calib",
    "anny_voie_a+decal",
]

NOMS = {
    "production": "Chaîne actuelle (production)",
    "production_brute": "Chaîne actuelle, sans corrections",
    "production_brute+calib": "Chaîne actuelle brute + calibration locale",
    "anny_voie_b": "Anny, a priori taille + poids (sans photo)",
    "anny_voie_b+calib": "Anny a priori + calibration locale",
    "anny_voie_a": "Anny ajusté aux photos (voie A), brut",
    "anny_voie_a+calib": "Anny voie A + calibration locale (a·x+b)",
    "anny_voie_a+decal": "Anny voie A + calibration (décalage seul)",
}


def _cles(d: dict) -> dict[str, float]:
    return {k: float(v) for k, v in d.items() if k in MESURES and v is not None}


def charger():
    obs = json.loads(OBS.read_text(encoding="utf-8"))
    anny = json.loads(ANNY.read_text(encoding="utf-8")) if ANNY.exists() else {}
    verite = {u: o["verite"] for u, o in obs.items()}
    exclues = {u: set(o.get("exclues", [])) for u, o in obs.items()}
    genre = {u: o["gender"] for u, o in obs.items()}
    pred: dict[str, dict[str, dict[str, float]]] = {m: {} for m in ORDRE}
    for u, o in obs.items():
        p = o.get("production") or {}
        if p.get("ok"):
            pred["production"][u] = _cles(p["final"])
            pred["production_brute"][u] = _cles(p["brut"])
        a = anny.get(u) or {}
        if a.get("ok"):
            pred["anny_voie_b"][u] = _cles(a["voie_b"]["mesures"])
            pred["anny_voie_a"][u] = _cles(a["voie_a"]["mesures"])
    pred["production_brute+calib"] = calibration.loo_toutes(pred["production_brute"], verite, MESURES, exclues)
    pred["anny_voie_b+calib"] = calibration.loo_toutes(pred["anny_voie_b"], verite, MESURES, exclues)
    pred["anny_voie_a+calib"] = calibration.loo_toutes(pred["anny_voie_a"], verite, MESURES, exclues)
    pred["anny_voie_a+decal"] = calibration.loo_toutes(pred["anny_voie_a"], verite, MESURES, exclues, "decalage")
    return obs, anny, verite, exclues, genre, pred


def tableau(resumes: dict[str, dict], methodes: list[str]) -> str:
    lignes = ["| Mesure | " + " | ".join(NOMS[m] for m in methodes) + " |",
              "|---|" + "---:|" * len(methodes)]
    for k in MESURES:
        cells = []
        for m in methodes:
            r = resumes[m]["par_mesure"].get(k)
            cells.append(f"{r['mae']:.1f}" if r else "—")
        lignes.append(f"| {LIBELLES[k]} | " + " | ".join(cells) + " |")
    lignes.append("| **Erreur moyenne** | " + " | ".join(
        f"**{resumes[m]['mae_globale']:.2f}**" if resumes[m]["mae_globale"] is not None else "—" for m in methodes) + " |")
    lignes.append("| Mesures ≤ 3 cm | " + " | ".join(f"{resumes[m]['mesures_sous_3cm']}/12" for m in methodes) + " |")
    return "\n".join(lignes)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows (cp1252)
    obs, anny, verite, exclues, genre, pred = charger()
    tous = list(obs)
    # Ensemble COMMUN : sujets ou toutes les methodes ont produit un resultat.
    commun = [u for u in tous if all(u in pred[m] for m in ORDRE)]
    resumes = {m: evaluation.resume(evaluation.erreurs(pred[m], verite, MESURES, commun, exclues)) for m in ORDRE}
    par_sexe = {}
    for sexe in ("male", "female"):
        us = [u for u in commun if genre[u] == sexe]
        par_sexe[sexe] = {
            "n": len(us),
            **{m: evaluation.resume(evaluation.erreurs(pred[m], verite, MESURES, us, exclues))["mae_globale"] for m in ORDRE},
        }
    # Robustesse : sujets traites par chaque chaine.
    couverture = {m: len(pred[m]) for m in ORDRE}
    anny_seul = [u for u in tous if u in pred["anny_voie_a"] and u not in pred["production"]]
    resume_anny_tous = evaluation.resume(evaluation.erreurs(pred["anny_voie_a+calib"], verite, MESURES,
                                                            [u for u in tous if u in pred["anny_voie_a"]], exclues))
    biais = {m: {k: v["biais"] for k, v in resumes[m]["par_mesure"].items()} for m in ("production_brute", "anny_voie_a")}
    durees = {
        "perception_s": round(st.mean([o["duree_perception_s"] for o in obs.values()]), 1),
        "production_s": round(st.mean([o["production"]["duree_s"] for o in obs.values()]), 1),
        "anny_s": round(st.mean([a["duree_totale_s"] for a in anny.values() if a.get("ok")]), 1) if anny else None,
    }

    SORTIE_JSON.write_text(json.dumps({
        "sujets_communs": commun, "resumes": resumes, "par_sexe": par_sexe, "couverture": couverture,
        "anny_seul": anny_seul, "anny_voie_a_calib_tous": resume_anny_tous, "biais": biais, "durees": durees,
        "predictions": pred,
    }, indent=1, ensure_ascii=False), encoding="utf-8")

    principales = ["production", "production_brute+calib", "anny_voie_b+calib", "anny_voie_a", "anny_voie_a+calib"]
    md = [
        "# Résultats — nouvelle chaîne Anny vs chaîne actuelle",
        "",
        f"Sujets comparés : **{len(commun)}** (ceux pour lesquels toutes les méthodes ont abouti), "
        f"{sum(genre[u]=='male' for u in commun)} hommes et {sum(genre[u]=='female' for u in commun)} femmes. "
        "Erreur absolue moyenne en cm ; « erreur moyenne » = moyenne des 12 mesures.",
        "",
        "## Tableau principal",
        "",
        tableau(resumes, principales),
        "",
        "## Toutes les variantes",
        "",
        tableau(resumes, ORDRE),
        "",
        "## Par sexe (erreur moyenne, cm)",
        "",
        "| Sexe | n | " + " | ".join(NOMS[m] for m in principales) + " |",
        "|---|---:|" + "---:|" * len(principales),
    ]
    for sexe, lib in (("male", "Hommes"), ("female", "Femmes")):
        d = par_sexe[sexe]
        md.append(f"| {lib} | {d['n']} | " + " | ".join(f"{d[m]:.2f}" if d[m] is not None else "—" for m in principales) + " |")
    md += [
        "",
        "## Biais moyen avant calibration (prédit − réel, cm)",
        "",
        "| Mesure | Chaîne actuelle brute | Anny voie A brut |",
        "|---|---:|---:|",
    ]
    for k in MESURES:
        a, b = biais["production_brute"].get(k), biais["anny_voie_a"].get(k)
        md.append(f"| {LIBELLES[k]} | {a:+.1f} | {b:+.1f} |" if a is not None and b is not None else f"| {LIBELLES[k]} | — | — |")
    md += [
        "",
        "## Couverture et temps de calcul",
        "",
        f"- Sujets traités : " + ", ".join(f"{NOMS[m]} {couverture[m]}" for m in ("production", "anny_voie_a")) + f" (sur {len(tous)}).",
        f"- Traités par Anny mais en échec dans la chaîne actuelle : {', '.join(anny_seul) or 'aucun'}.",
        f"- Anny voie A + calibration sur tous ses sujets ({len([u for u in tous if u in pred['anny_voie_a']])}) : "
        f"erreur moyenne {resume_anny_tous['mae_globale']} cm.",
        f"- Temps moyen par sujet sur ce poste (i3-5005U, sans GPU) : perception {durees['perception_s']} s, "
        f"chaîne actuelle {durees['production_s']} s, Anny (voies B + A + extraction) {durees['anny_s']} s.",
    ]
    SORTIE_MD.write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
