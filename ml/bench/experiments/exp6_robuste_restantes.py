"""
Experience 6 : regression robuste (Theil-Sen) sur la SORTIE, pour les
mesures ou seul l'OLS avait ete teste et rejete -- shoulder, sleeve_length,
inseam, back_length, chest, waist, hips.

Un seul candidat (la sortie du modele/de la lecture directe elle-meme) :
pas de selection parmi plusieurs variables, donc pas de risque de fuite du
type trouve en Exp5b. LOO strict simple.

    python -m ml.bench.experiments.exp6_robuste_restantes
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"
SUJETS_JSON = Path(__file__).resolve().parents[1] / "sujets.json"
CIBLES = ["shoulder", "sleeve_length", "inseam", "back_length", "chest", "waist", "hips"]


def charger(cible: str, exclure_notes: bool = True) -> list[dict]:
    donnees = json.loads(BASELINE_JSON.read_text(encoding="utf-8"))
    sujets = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))
    notes = {s["id"]: s.get("note") for s in sujets["sujets"]}
    lignes = []
    for s in donnees:
        if not s.get("ok"):
            continue
        if exclure_notes and cible == "shoulder" and notes.get(s["id"]):
            continue
        m, a = s["mesures"], s["attendu"]
        if cible in m and cible in a:
            lignes.append({"id": s["id"], "calc": m[cible], "reel": a[cible]})
    return lignes


def theil_sen(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    n = len(x)
    pentes = [(y[j] - y[i]) / (x[j] - x[i]) for i in range(n) for j in range(i + 1, n) if x[j] != x[i]]
    pente = float(np.median(pentes)) if pentes else 0.0
    ordonnee = float(np.median(y - pente * x))
    return pente, ordonnee


def loo_theil_sen(calc: np.ndarray, reel: np.ndarray) -> np.ndarray:
    corr = np.empty_like(calc)
    for i in range(len(calc)):
        tr = [j for j in range(len(calc)) if j != i]
        pente, ordonnee = theil_sen(reel[tr], calc[tr])
        corr[i] = (calc[i] - ordonnee) / pente if abs(pente) > 1e-6 else calc[i]
    return corr


def main() -> None:
    for cible in CIBLES:
        lignes = charger(cible)
        if len(lignes) < 5:
            continue
        calc = np.array([l["calc"] for l in lignes])
        reel = np.array([l["reel"] for l in lignes])
        mae_avant = float(np.mean(np.abs(calc - reel)))
        corr = loo_theil_sen(calc, reel)
        mae_apres = float(np.mean(np.abs(corr - reel)))
        marque = "  <-- AMELIORATION" if mae_apres < mae_avant - 0.05 else ("  <-- DEGRADATION" if mae_apres > mae_avant + 0.05 else "  (egal)")
        print(f"{cible:15} n={len(lignes):2}  MAE avant={mae_avant:5.2f}  MAE apres (Theil-Sen LOO)={mae_apres:5.2f}"
              f"  ({mae_apres - mae_avant:+.2f}){marque}")


if __name__ == "__main__":
    main()
