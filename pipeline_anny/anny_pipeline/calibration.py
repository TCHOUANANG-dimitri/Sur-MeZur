"""
Phase 1 de la specification — calibration locale : réel ≈ a·prédit + b,
une correction par mesure.

Avec 20 sujets, toute correction evaluee sur les sujets qui ont servi a
l'apprendre serait flatteuse. On l'evalue donc en VALIDATION CROISEE
« un contre tous » (leave-one-out) : la valeur corrigee de chaque sujet est
calculee avec une droite apprise SANS lui. C'est la seule facon honnete de
chiffrer le gain d'une calibration sur un si petit jeu.

Deux variantes :
  - « affine »  : a et b libres (la formule de la specification) ;
  - « decalage » : a = 1, seul b est appris. Plus robuste quand n est petit :
    une pente estimee sur 19 points peut amplifier le bruit.

En production, la droite serait apprise une fois sur tout le Jeu 1
(`ajuster`) puis appliquee a chaque client (`appliquer`).
"""

from __future__ import annotations

import numpy as np

MIN_SUJETS = 6


def ajuster(predit: list[float], reel: list[float], variante: str = "affine") -> tuple[float, float]:
    x = np.asarray(predit, dtype=float)
    y = np.asarray(reel, dtype=float)
    if variante == "decalage":
        return 1.0, float(np.mean(y - x))
    if np.ptp(x) < 1e-6:
        return 1.0, float(np.mean(y - x))
    a, b = np.polyfit(x, y, 1)
    return float(a), float(b)


def appliquer(valeur: float, coeffs: tuple[float, float]) -> float:
    a, b = coeffs
    return a * valeur + b


def loo(predictions: dict[str, float], verite: dict[str, float], variante: str = "affine") -> dict[str, float]:
    """Valeurs corrigees en leave-one-out, pour UNE mesure.

    `predictions` et `verite` : {uid: valeur}. Seuls les sujets presents dans
    les deux sont utilises. Renvoie {uid: valeur corrigee}.
    """
    uids = [u for u in predictions if u in verite]
    if len(uids) < MIN_SUJETS:
        return {u: predictions[u] for u in uids}
    out = {}
    for u in uids:
        autres = [v for v in uids if v != u]
        coeffs = ajuster([predictions[v] for v in autres], [verite[v] for v in autres], variante)
        out[u] = round(appliquer(predictions[u], coeffs), 2)
    return out


def loo_toutes(
    predictions: dict[str, dict[str, float]],
    verite: dict[str, dict[str, float]],
    mesures: list[str],
    exclues: dict[str, set[str]] | None = None,
    variante: str = "affine",
) -> dict[str, dict[str, float]]:
    """Calibration LOO de toutes les mesures. predictions[uid][mesure]."""
    exclues = exclues or {}
    out: dict[str, dict[str, float]] = {u: {} for u in predictions}
    for m in mesures:
        p = {u: d[m] for u, d in predictions.items() if m in d and m not in exclues.get(u, set())}
        v = {u: verite[u][m] for u in p if m in verite.get(u, {})}
        for u, val in loo(p, v, variante).items():
            out[u][m] = val
        # Sujets exclus pour cette mesure : valeur non calibree conservee
        # (ils ne comptent de toute facon pas dans les statistiques).
        for u, d in predictions.items():
            if m in d and m not in out[u]:
                out[u][m] = d[m]
    return out


def coefficients(
    predictions: dict[str, dict[str, float]],
    verite: dict[str, dict[str, float]],
    mesures: list[str],
    variante: str = "affine",
) -> dict[str, tuple[float, float]]:
    """Droites apprises sur TOUS les sujets (a utiliser en production)."""
    out = {}
    for m in mesures:
        uids = [u for u, d in predictions.items() if m in d and m in verite.get(u, {})]
        if len(uids) >= MIN_SUJETS:
            out[m] = ajuster([predictions[u][m] for u in uids], [verite[u][m] for u in uids], variante)
    return out
