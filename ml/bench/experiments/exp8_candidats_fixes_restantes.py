"""
Experience 8 : meme methode que 3quater (4 candidats FIXES, choix valide en
LOO imbrique) appliquee aux 7 mesures encore sans solution : biceps
(deja fait, rejoue pour reference), shoulder, inseam, hips, chest,
sleeve_length, waist.

    python -m ml.bench.experiments.exp8_candidats_fixes_restantes
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"
SUJETS_JSON = Path(__file__).resolve().parents[1] / "sujets.json"
CIBLES = ["shoulder", "sleeve_length", "inseam", "hips", "chest", "waist"]

CANDIDATS = ["weight_seul", "stature_seul", "weight_stature", "sortie_weight"]


def predire(nom, tr, i, w, h, calc, reel):
    if nom == "weight_seul":
        A = np.vstack([w[tr], np.ones(len(tr))]).T
        p, o = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
        return p * w[i] + o
    if nom == "stature_seul":
        A = np.vstack([h[tr], np.ones(len(tr))]).T
        p, o = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
        return p * h[i] + o
    if nom == "weight_stature":
        A = np.vstack([w[tr], h[tr], np.ones(len(tr))]).T
        c = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
        return c[0] * w[i] + c[1] * h[i] + c[2]
    if nom == "sortie_weight":
        A = np.vstack([calc[tr], w[tr], np.ones(len(tr))]).T
        c = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
        return c[0] * calc[i] + c[1] * w[i] + c[2]


def loo_interne(nom, sous, w, h, calc, reel):
    err = []
    for i in sous:
        tr = [j for j in sous if j != i]
        err.append(abs(predire(nom, tr, i, w, h, calc, reel) - reel[i]))
    return np.mean(err)


def charger(cible: str) -> list[dict]:
    donnees = json.loads(BASELINE_JSON.read_text(encoding="utf-8"))
    sujets = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))
    notes = {s["id"]: s.get("note") for s in sujets["sujets"]}
    lignes = []
    for s in donnees:
        if not s.get("ok"):
            continue
        if cible == "shoulder" and notes.get(s["id"]):
            continue
        m, a, f = s["mesures"], s["attendu"], s["features"]
        if cible in m and cible in a:
            lignes.append((f["weight_kg"], f["stature_m"], m[cible], a[cible]))
    return lignes


def main() -> None:
    for cible in CIBLES:
        lignes = charger(cible)
        if len(lignes) < 5:
            continue
        w = np.array([l[0] for l in lignes])
        h = np.array([l[1] for l in lignes])
        calc = np.array([l[2] for l in lignes])
        reel = np.array([l[3] for l in lignes])
        n = len(lignes)
        mae_avant = float(np.mean(np.abs(calc - reel)))

        erreurs, choix = [], []
        for i in range(n):
            sous = [j for j in range(n) if j != i]
            meilleur = None
            for nom in CANDIDATS:
                m_ = loo_interne(nom, sous, w, h, calc, reel)
                if meilleur is None or m_ < meilleur[1]:
                    meilleur = (nom, m_)
            nom = meilleur[0]
            choix.append(nom)
            erreurs.append(abs(predire(nom, sous, i, w, h, calc, reel) - reel[i]))

        mae_apres = float(np.mean(erreurs))
        stable = len(set(choix)) == 1
        marque = ""
        if mae_apres < mae_avant - 0.05:
            marque = "  <-- CONFIRME (stable)" if stable else "  <-- gain mais INSTABLE, pas fiable"
        print(f"{cible:15} n={n:2}  MAE avant={mae_avant:5.2f}  MAE LOO imbrique={mae_apres:5.2f}"
              f"  ({mae_apres - mae_avant:+.2f}){marque}")
        print(f"                choix: {choix}")


if __name__ == "__main__":
    main()
