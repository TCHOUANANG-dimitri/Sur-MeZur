"""
Experience 5b : verification anti-fuite de l'Experience 5 (regression
univariee, strategie C).

Probleme methodologique dans exp5_par_mesure.py : la variable d'entree
"gagnante" (ex. weight_kg pour ankle) est choisie en regardant l'ERREUR LOO
GLOBALE de chaque candidate sur les 12 sujets -- ce qui veut dire que
l'erreur du sujet i, calculee SANS lui pour l'ajustement, contribue quand
meme au CHOIX de la variable qui sera utilisee pour corriger le sujet i.
C'est une fuite subtile : le sujet "vote" indirectement sur son propre
traitement.

Correction : LOO IMBRIQUE. Pour chaque sujet exclu i :
  1. Sur les n-1 AUTRES sujets seulement, choisir la variable qui minimise
     l'erreur en LOO INTERNE (sur ces n-1 points, sans jamais toucher i).
  2. Ajuster pente/ordonnee de cette variable sur les n-1 points.
  3. Appliquer au sujet i.

Si le gain resiste a cette procedure plus stricte, il est solide. S'il
s'effondre, c'etait un artefact de selection.

    python -m ml.bench.experiments.exp5b_loo_imbrique
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"
CIBLES = ["neck", "biceps", "thigh", "wrist", "ankle"]
CANDIDATES = [
    "stature_m", "weight_kg", "biacromialbreadth", "bideltoidbreadth",
    "hipbreadth", "sittingheight", "crotchheight",
    "chestbreadth", "waistbreadth",
]


def charger(cible: str) -> list[dict]:
    donnees = json.loads(BASELINE_JSON.read_text(encoding="utf-8"))
    lignes = []
    for s in donnees:
        if not s.get("ok"):
            continue
        m, a, f = s["mesures"], s["attendu"], s["features"]
        if cible in m and cible in a:
            lignes.append({"id": s["id"], "calc": m[cible], "reel": a[cible], "features": f})
    return lignes


def loo_interne_mae(feat: np.ndarray, reel: np.ndarray) -> float:
    """LOO sur le sous-ensemble donne (utilise pour choisir une variable
    SANS jamais regarder le sujet externe)."""
    n = len(feat)
    erreurs = []
    for i in range(n):
        tr = [j for j in range(n) if j != i]
        A = np.vstack([feat[tr], np.ones(len(tr))]).T
        pente, ordonnee = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
        erreurs.append(abs((pente * feat[i] + ordonnee) - reel[i]))
    return float(np.mean(erreurs))


def loo_imbrique_univarie(lignes: list[dict], reel: np.ndarray) -> tuple[np.ndarray, list[str]]:
    n = len(lignes)
    corriges = np.empty(n)
    variables_choisies = []
    for i in range(n):
        sous_idx = [j for j in range(n) if j != i]
        sous_reel = reel[sous_idx]

        meilleure = None
        for feat_name in CANDIDATES:
            vals_sous = np.array([lignes[j]["features"].get(feat_name) for j in sous_idx], dtype=float)
            if np.any(np.isnan(vals_sous)):
                continue
            m = loo_interne_mae(vals_sous, sous_reel)
            if meilleure is None or m < meilleure[1]:
                meilleure = (feat_name, m)

        feat_name = meilleure[0]
        variables_choisies.append(feat_name)
        vals_sous = np.array([lignes[j]["features"].get(feat_name) for j in sous_idx], dtype=float)
        A = np.vstack([vals_sous, np.ones(len(vals_sous))]).T
        pente, ordonnee = np.linalg.lstsq(A, sous_reel, rcond=None)[0]

        vi = lignes[i]["features"].get(feat_name)
        corriges[i] = pente * vi + ordonnee

    return corriges, variables_choisies


def main() -> None:
    for cible in CIBLES:
        lignes = charger(cible)
        if len(lignes) < 5:
            continue
        calc = np.array([l["calc"] for l in lignes])
        reel = np.array([l["reel"] for l in lignes])
        mae_avant = float(np.mean(np.abs(calc - reel)))

        corr, variables = loo_imbrique_univarie(lignes, reel)
        mae_apres = float(np.mean(np.abs(corr - reel)))

        marque = "  <-- CONFIRME (resiste au LOO imbrique)" if mae_apres < mae_avant - 0.05 else "  <-- ARTEFACT (s'effondre)"
        print(f"{cible:8} MAE avant={mae_avant:5.2f}  MAE apres LOO IMBRIQUE={mae_apres:5.2f}"
              f"  ({mae_apres - mae_avant:+.2f}){marque}")
        print(f"         variables choisies par sujet exclu : {variables}")


if __name__ == "__main__":
    main()
