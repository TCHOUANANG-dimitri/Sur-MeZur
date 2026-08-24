"""
Experience 4 : recalibration lineaire (pente + ordonnee) des 5 cibles Ridge
(cou, biceps, cuisse, poignet, cheville) -- "Platt scaling".

Origine : `ankle` est sous-estime chez les 12 sujets terrain, TOUJOURS dans
le meme sens (biais moyen -4.0 cm, ecart-type seulement 1.3 cm -- l'essentiel
de l'erreur de 4.0 cm est un biais constant, pas du bruit). Une regression
lineaire calc = pente*reel + ordonnee ajuste mieux (residu 0.93 cm) qu'un
simple decalage constant (residu 1.33 cm) : la pente vaut ~0.53, signature
classique d'un RETRECISSEMENT (shrinkage) -- attendu d'une regression Ridge
regularisee, qui tire ses predictions vers la moyenne d'ANSUR. Le modele
"voit" moins de variation entre individus qu'il n'en existe reellement.

Question : ce phenomene est-il specifique a la cheville, ou touche-t-il aussi
les 4 autres cibles Ridge (cou, biceps, cuisse, poignet) ?

Protocole : validation croisee "leave-one-out" STRICTE. Pour chaque sujet
exclu, la pente et l'ordonnee sont calculees sur les 11-12 AUTRES sujets
seulement, puis appliquees au sujet exclu. Le gain rapporte est donc un gain
HORS ECHANTILLON, pas un ajustement qui se regarderait dans un miroir.

    python -m ml.bench.experiments.exp4_recalibration_lineaire
"""
from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

import numpy as np

BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"
CIBLES = ["neck", "biceps", "thigh", "wrist", "ankle"]


def charger_paires(cible: str) -> list[tuple[int, float, float]]:
    """[(id_sujet, calcule, reel), ...]"""
    donnees = json.loads(BASELINE_JSON.read_text(encoding="utf-8"))
    paires = []
    for s in donnees:
        if not s.get("ok"):
            continue
        m, a = s["mesures"], s["attendu"]
        if cible in m and cible in a:
            paires.append((s["id"], m[cible], a[cible]))
    return paires


def loo_lineaire(paires: list[tuple[int, float, float]]) -> tuple[float, float, list[float]]:
    """LOO : ajuste pente+ordonnee sur n-1 sujets, applique au sujet exclu.
    Renvoie (MAE avant, MAE apres, [erreurs apres par sujet])."""
    calc = np.array([c for _, c, _ in paires])
    reel = np.array([r for _, _, r in paires])
    erreurs_avant = np.abs(calc - reel)

    erreurs_apres = []
    for i in range(len(paires)):
        train = [j for j in range(len(paires)) if j != i]
        A = np.vstack([reel[train], np.ones(len(train))]).T
        pente, ordonnee = np.linalg.lstsq(A, calc[train], rcond=None)[0]
        # calc = pente*reel + ordonnee  =>  reel_estime = (calc - ordonnee) / pente
        if abs(pente) < 1e-6:
            corrige = calc[i]
        else:
            corrige = (calc[i] - ordonnee) / pente
        erreurs_apres.append(abs(corrige - reel[i]))

    return float(np.mean(erreurs_avant)), float(np.mean(erreurs_apres)), erreurs_apres


def main() -> None:
    print(f"{'cible':10} {'MAE avant':>10} {'MAE apres (LOO)':>17} {'delta':>8}")
    print("-" * 50)
    for cible in CIBLES:
        paires = charger_paires(cible)
        if len(paires) < 4:
            print(f"{cible:10} trop peu de sujets")
            continue
        avant, apres, _ = loo_lineaire(paires)
        marque = "  <-- AMELIORATION (LOO)" if apres < avant - 0.05 else (
            "  <-- DEGRADATION" if apres > avant + 0.05 else "  (egal)")
        print(f"{cible:10} {avant:10.2f} {apres:17.2f} {apres - avant:+8.2f}{marque}")

        # Coefficients finaux (sur TOUS les sujets), a ne publier qu'apres
        # confirmation LOO -- c'est ce qui serait embarque dans le code.
        calc = np.array([c for _, c, _ in paires])
        reel = np.array([r for _, _, r in paires])
        A = np.vstack([reel, np.ones(len(reel))]).T
        pente, ordonnee = np.linalg.lstsq(A, calc, rcond=None)[0]
        print(f"           (coefficients complets : pente={pente:.3f}, ordonnee={ordonnee:+.2f}, n={len(paires)})")


if __name__ == "__main__":
    main()
