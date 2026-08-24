"""
Experience 5 : approche modulaire, mesure par mesure.

Pour chaque cible predite par un modele Ridge (neck, biceps, thigh, wrist,
ankle), teste PLUSIEURS strategies de recalibration independantes, chacune
validee en LOO strict (ajustee sur n-1 sujets, appliquee au sujet exclu) :

  A. Lineaire sur la SORTIE du modele (deja fait en Exp4, rejoue ici comme
     reference commune) : calc = pente*reel + ordonnee.
  B. Lineaire ROBUSTE sur la sortie (Theil-Sen -- moins sensible qu'OLS a
     un sujet aberrant isole, utile vu qu'on n'a que 12-13 points).
  C. Regression fraiche sur UNE SEULE variable d'entree brute (poids,
     stature, largeur biacromiale...), en ignorant la sortie du modele Ridge
     -- teste si le modele a 16 variables ajoute plus de bruit que
     d'information utile pour CETTE cible precise, vu le peu de sujets.
  D. Combinaison : correction lineaire sur la sortie (A) mais seulement si
     elle bat une simple moyenne constante (base de comparaison triviale).

Objectif : ne pas se contenter d'UNE piste par mesure -- en tester
plusieurs, garder seulement celle(s) qui gagnent en LOO, sujet par sujet si
besoin.

    python -m ml.bench.experiments.exp5_par_mesure
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"
CIBLES_RIDGE = ["neck", "biceps", "thigh", "wrist", "ankle"]

# Variables d'entree candidates pour la strategie C (univariee).
CANDIDATES_UNIVARIE = [
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


def loo_ols(calc: np.ndarray, reel: np.ndarray) -> np.ndarray:
    """Strategie A : LOO, calc = pente*reel + ordonnee, inversee pour corriger calc."""
    corriges = np.empty_like(calc)
    for i in range(len(calc)):
        tr = [j for j in range(len(calc)) if j != i]
        A = np.vstack([reel[tr], np.ones(len(tr))]).T
        pente, ordonnee = np.linalg.lstsq(A, calc[tr], rcond=None)[0]
        corriges[i] = (calc[i] - ordonnee) / pente if abs(pente) > 1e-6 else calc[i]
    return corriges


def theil_sen_pente_ordonnee(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """Pente = mediane des pentes par paire (robuste), ordonnee = mediane(y - pente*x)."""
    n = len(x)
    pentes = []
    for i in range(n):
        for j in range(i + 1, n):
            if x[j] != x[i]:
                pentes.append((y[j] - y[i]) / (x[j] - x[i]))
    pente = float(np.median(pentes)) if pentes else 0.0
    ordonnee = float(np.median(y - pente * x))
    return pente, ordonnee


def loo_theil_sen(calc: np.ndarray, reel: np.ndarray) -> np.ndarray:
    """Strategie B : meme principe que A mais pente/ordonnee robustes (Theil-Sen)."""
    corriges = np.empty_like(calc)
    for i in range(len(calc)):
        tr = [j for j in range(len(calc)) if j != i]
        pente, ordonnee = theil_sen_pente_ordonnee(reel[tr], calc[tr])
        corriges[i] = (calc[i] - ordonnee) / pente if abs(pente) > 1e-6 else calc[i]
    return corriges


def loo_univarie(feature_vals: np.ndarray, reel: np.ndarray) -> np.ndarray:
    """Strategie C : reel_estime = pente*feature + ordonnee, calibre en LOO."""
    corriges = np.empty_like(reel)
    for i in range(len(reel)):
        tr = [j for j in range(len(reel)) if j != i]
        A = np.vstack([feature_vals[tr], np.ones(len(tr))]).T
        pente, ordonnee = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
        corriges[i] = pente * feature_vals[i] + ordonnee
    return corriges


def mae(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(np.abs(a - b)))


def main() -> None:
    for cible in CIBLES_RIDGE:
        lignes = charger(cible)
        if len(lignes) < 4:
            continue
        calc = np.array([l["calc"] for l in lignes])
        reel = np.array([l["reel"] for l in lignes])
        mae_avant = mae(calc, reel)

        print(f"\n{'='*70}\n{cible.upper()}  (n={len(lignes)}, MAE actuel={mae_avant:.2f} cm)\n{'='*70}")

        # A. lineaire OLS sur sortie
        corr_a = loo_ols(calc, reel)
        mae_a = mae(corr_a, reel)
        print(f"  A. lineaire OLS (sortie modele)         : {mae_a:5.2f} cm  ({mae_a - mae_avant:+.2f})"
              f"{'  <-- retenu' if mae_a < mae_avant - 0.05 else ''}")

        # B. lineaire robuste (Theil-Sen) sur sortie
        corr_b = loo_theil_sen(calc, reel)
        mae_b = mae(corr_b, reel)
        print(f"  B. lineaire robuste Theil-Sen (sortie)  : {mae_b:5.2f} cm  ({mae_b - mae_avant:+.2f})"
              f"{'  <-- retenu' if mae_b < mae_avant - 0.05 and mae_b < mae_a - 0.05 else ''}")

        # C. univarie sur chaque variable d'entree candidate
        meilleur_c = None
        for feat_name in CANDIDATES_UNIVARIE:
            vals = np.array([l["features"].get(feat_name) for l in lignes], dtype=float)
            if np.any(np.isnan(vals)):
                continue
            corr_c = loo_univarie(vals, reel)
            mae_c = mae(corr_c, reel)
            if meilleur_c is None or mae_c < meilleur_c[1]:
                meilleur_c = (feat_name, mae_c)
        if meilleur_c:
            feat_name, mae_c = meilleur_c
            print(f"  C. meilleure regression univariee       : {mae_c:5.2f} cm  ({mae_c - mae_avant:+.2f})"
                  f"  [variable={feat_name}]"
                  f"{'  <-- retenu' if mae_c < mae_avant - 0.05 and mae_c < min(mae_a, mae_b) - 0.05 else ''}")

        print(f"  -- reference : MAE actuel sans correction : {mae_avant:.2f} cm")


if __name__ == "__main__":
    main()
