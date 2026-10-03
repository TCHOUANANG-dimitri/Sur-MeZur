"""
Comparaison chiffree des methodes sur la verite terrain.

Memes conventions que ml/bench/harness.py : erreur absolue par mesure, puis
« erreur moyenne » = moyenne des erreurs moyennes des 12 mesures (chaque
mesure pese pareil, quel que soit le nombre de sujets qui l'ont).
"""

from __future__ import annotations

import statistics as st


def erreurs(
    predictions: dict[str, dict[str, float]],
    verite: dict[str, dict[str, float]],
    mesures: list[str],
    uids: list[str],
    exclues: dict[str, set[str]] | None = None,
) -> dict[str, list[float]]:
    """Ecarts signes (predit - reel) par mesure, sur la liste de sujets donnee."""
    exclues = exclues or {}
    out: dict[str, list[float]] = {m: [] for m in mesures}
    for u in uids:
        p = predictions.get(u) or {}
        for m in mesures:
            if m in exclues.get(u, set()) or m not in p or m not in verite.get(u, {}):
                continue
            out[m].append(p[m] - verite[u][m])
    return out


def resume(ecarts: dict[str, list[float]]) -> dict:
    par_mesure = {}
    for m, e in ecarts.items():
        if not e:
            continue
        a = [abs(x) for x in e]
        par_mesure[m] = {
            "n": len(e),
            "mae": round(st.mean(a), 2),
            "biais": round(st.mean(e), 2),
            "max": round(max(a), 1),
            "sous_1cm": sum(x <= 1 for x in a),
            "sous_3cm": sum(x <= 3 for x in a),
        }
    maes = [v["mae"] for v in par_mesure.values()]
    return {
        "par_mesure": par_mesure,
        "mae_globale": round(st.mean(maes), 2) if maes else None,
        "mesures_sous_3cm": sum(v["mae"] <= 3 for v in par_mesure.values()),
    }
