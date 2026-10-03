"""
Observations photo -> cibles de l'ajustement (voie A).

Lit la sortie de l'etape de perception (resultats/observations.json) et en
tire, en centimetres :
  - les LONGUEURS de segments vues sur la photo de face (epaules, hanches,
    bras, avant-bras, cuisse, jambe, tronc) : c'est le terme « reprojection
    des landmarks » de la specification, exprime en longueurs plutot qu'en
    positions 2D (voir ajustement.py pour la raison) ;
  - le PROFIL de silhouette du tronc : largeurs (face) et profondeurs
    (profil), bras exclus, a des fractions de la hauteur epaules -> hanches.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# Indices MediaPipe (identiques a backend/app/services/vision/pose.py).
L_SH, R_SH, L_EL, R_EL, L_WR, R_WR = 11, 12, 13, 14, 15, 16
L_HIP, R_HIP, L_KN, R_KN, L_AN, R_AN = 23, 24, 25, 26, 27, 28

VISIBILITE_MIN = 0.5

# Tranches du profil retenues : sous 0,25 du tronc, la bande touche
# l'aisselle, ou bras et tronc se confondent dans le masque (meme constat que
# _CHEST_BAND en production, qui commence a 0,20).
FRACTION_MIN = 0.25


@dataclass
class Cibles:
    uid: str
    gender: str
    height_cm: float
    weight_kg: float
    longueurs: dict[str, float] = field(default_factory=dict)
    # (fraction epaules->hanches, valeur cm)
    largeurs: list[tuple[float, float]] = field(default_factory=list)
    profondeurs: list[tuple[float, float]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _dist(p, a, b, cm_px) -> float | None:
    pa, pb = p[a], p[b]
    if min(pa[2], pb[2]) < VISIBILITE_MIN:
        return None
    return math.hypot(pa[0] - pb[0], pa[1] - pb[1]) * cm_px


def _moyenne(*valeurs: float | None) -> float | None:
    v = [x for x in valeurs if x is not None]
    return sum(v) / len(v) if v else None


def _profil(vue: dict, garder_hanches: bool) -> list[tuple[float, float]]:
    prof = vue.get("profil_cm") or []
    n = len(prof)
    out = []
    for k, w in enumerate(prof):
        f = k / (n - 1)
        if f >= FRACTION_MIN and w > 0:
            out.append((f, float(w)))
    # Le plus fort des hanches est souvent SOUS la ligne de hanches
    # (production : recherche jusqu'a 1,25) : on ajoute ce point, s'il reste
    # au-dessus de l'entrejambe (au-dela, le masque ne contient plus qu'une
    # jambe et la largeur ne decrit plus le bassin).
    niv = vue.get("niveaux") or {}
    if garder_hanches and niv.get("hanches") and 1.0 < niv["hanches"] <= 1.15 and vue.get("hanches_cm"):
        out.append((float(niv["hanches"]), float(vue["hanches_cm"])))
    return out


def depuis_observation(obs: dict) -> Cibles:
    c = Cibles(uid=obs["uid"], gender=obs["gender"], height_cm=obs["height_cm"], weight_kg=obs["weight_kg"])
    face, profil = obs.get("face"), obs.get("profil")

    if face:
        p, k = face["points"], face["cm_par_px"]
        sh_mid = ((p[L_SH][0] + p[R_SH][0]) / 2, (p[L_SH][1] + p[R_SH][1]) / 2)
        hip_mid = ((p[L_HIP][0] + p[R_HIP][0]) / 2, (p[L_HIP][1] + p[R_HIP][1]) / 2)
        lg = {
            "epaules": _dist(p, L_SH, R_SH, k),
            "hanches": _dist(p, L_HIP, R_HIP, k),
            "bras": _moyenne(_dist(p, L_SH, L_EL, k), _dist(p, R_SH, R_EL, k)),
            "avant_bras": _moyenne(_dist(p, L_EL, L_WR, k), _dist(p, R_EL, R_WR, k)),
            "cuisse": _moyenne(_dist(p, L_HIP, L_KN, k), _dist(p, R_HIP, R_KN, k)),
            "jambe": _moyenne(_dist(p, L_KN, L_AN, k), _dist(p, R_KN, R_AN, k)),
            "tronc": math.hypot(sh_mid[0] - hip_mid[0], sh_mid[1] - hip_mid[1]) * k,
        }
        c.longueurs = {n: round(v, 2) for n, v in lg.items() if v}
        c.largeurs = _profil(face, garder_hanches=True)
    else:
        c.notes.append("photo de face inexploitable")

    if profil and profil.get("profil_cm"):
        c.profondeurs = _profil(profil, garder_hanches=True)
    else:
        c.notes.append("silhouette de profil inexploitable : profondeurs non contraintes")
    return c
