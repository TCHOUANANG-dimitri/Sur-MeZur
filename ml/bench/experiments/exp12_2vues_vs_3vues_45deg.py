"""
Niveau 0 (voir claude_code.md et la conversation) : teste sur des maillages
3D EXACTS (pas de photo, pas de bruit de segmentation) la seule question
factuelle posee par la proposition "4 vues structurees" : une 3e vue a 45
degres (entre face et profil) ameliore-t-elle vraiment l'estimation du
perimetre du tronc par rapport a face+profil seuls ?

Reutilise l'outillage deja construit et valide par un autre agent
(C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\bench_core.py,
bench_run.py -- voir opencode.md) : chargement des maillages MakeHuman,
coupe exacte du maillage par plan horizontal, perimetre vrai du polygone
de coupe. Rien n'est reinvente ni resimule -- seule la COMPARAISON
2 vues vs 3 vues est nouvelle.

Estimateurs compares (measure = perimetre) :
  E_2vues (production actuelle) : ellipse de Ramanujan depuis largeur
    face (0 deg) et profondeur profil (90 deg).
  E_3vues (proposition testee) : Cauchy-Crofton a 3 angles
    (0 deg, 45 deg, 90 deg) -- P = pi * moyenne(w0, w45, w90). C'est
    l'estimateur le plus favorable possible pour "3 vues", puisque
    Crofton est exact pour toute section convexe des qu'on integre
    suffisamment d'angles -- si meme cet estimateur optimal ne bat pas
    la production, aucune methode a 3 vues discretes ne le fera.

Aucun bruit de photo/segmentation injecte ici : c'est un plancher
GEOMETRIQUE pur (la meilleure precision atteignable si l'extraction
etait parfaite), exactement comme ORACLE_ELLIPSE / E_ORACLE dans le
travail original. Repond uniquement a : "y a-t-il seulement un signal
geometrique a aller chercher avec une 3e vue ?"

    "chemin_vers_venv\\python.exe" ml/bench/experiments/exp12_2vues_vs_3vues_45deg.py
"""
from __future__ import annotations

import math
import sys

import numpy as np

sys.path.insert(0, r"C:\Users\Admin\AppData\Local\Temp\opencode")
from bench_core import load_glb_morphs, synthesize, BASE_MESHES  # noqa: E402
from bench_run import skin, torso_loop, width_of, ramanujan, crofton_blind, crotch_height  # noqa: E402

# Sujets synthetiques : les 4 de bench_run.py (deja utilises et discutes
# dans opencode.md) + quelques variantes supplementaires pour couvrir plus
# de morphologies (corpulence, proportions) sans construire un nouveau jeu.
SUBJECTS_DEF = [
    ("homme_neutre_175", "male", {}, 175.0),
    ("homme_fort_185", "male", {
        "measure-bust-circ-incr": 1.0, "measure-waist-circ-incr": 1.0,
        "measure-hips-circ-incr": 0.8, "measure-neck-circ-incr": 1.0,
        "measure-thigh-circ-incr": 1.0, "measure-upperarm-circ-incr": 1.0,
        "measure-wrist-circ-incr": 1.0, "measure-ankle-circ-incr": 1.0,
        "buttocks-volume-incr": 0.6}, 185.0),
    ("femme_mince_155", "female", {
        "measure-bust-circ-decr": 0.8, "measure-waist-circ-decr": 1.0,
        "measure-hips-circ-decr": 0.4, "measure-neck-circ-decr": 0.6,
        "measure-thigh-circ-decr": 0.7, "measure-upperarm-circ-decr": 0.8,
        "measure-wrist-circ-decr": 0.8, "measure-ankle-circ-decr": 0.8}, 155.0),
    ("homme_bureaucrate_172", "male", {
        "measure-waist-circ-incr": 1.2, "measure-bust-circ-incr": 0.6,
        "measure-hips-circ-incr": 0.5, "stomach-pregnant-incr": 0.7}, 172.0),
    # Variantes supplementaires : femme forte, homme mince, corpulences moyennes.
    ("femme_forte_168", "female", {
        "measure-bust-circ-incr": 0.9, "measure-waist-circ-incr": 1.1,
        "measure-hips-circ-incr": 1.0, "buttocks-volume-incr": 0.7}, 168.0),
    ("homme_mince_180", "male", {
        "measure-bust-circ-decr": 0.7, "measure-waist-circ-decr": 0.9,
        "measure-hips-circ-decr": 0.5}, 180.0),
    ("femme_moyenne_162", "female", {
        "measure-waist-circ-incr": 0.4, "measure-hips-circ-incr": 0.3}, 162.0),
    ("homme_moyen_178", "male", {
        "measure-waist-circ-incr": 0.5, "measure-bust-circ-incr": 0.3}, 178.0),
]


def prepare_light(name, v0, faces):
    """Version allegee de bench_run.prepare() : ne calcule que ce qu'il
    faut pour comparer les estimateurs a 0/45/90 deg (pas le grid complet,
    pas le solveur d'epaisseur -- hors sujet ici, comparaison geometrique
    pure)."""
    v, f = skin(v0, faces)
    H = v[:, 1].max()
    sh_y, hip_y = 0.815 * H, 0.53 * H

    ts = np.linspace(0, 1.30, 66)
    prof = []
    for t in ts:
        lp = torso_loop(v, f, sh_y - t * (sh_y - hip_y))
        prof.append((float(t), width_of(lp, 0.0) * 100 if lp is not None else 0.0))

    def extrem(a, b, mx):
        c = [(w, t) for t, w in prof if a <= t <= b and w > 0]
        return (max if mx else min)(c)[1]

    levels = {"chest": extrem(0.20, 0.38, False),
              "waist": extrem(0.45, 0.80, False),
              "hip": extrem(0.85, 1.08, True)}

    cr_y = crotch_height(v, f, H)

    out = {}
    for k, t in levels.items():
        y = sh_y - t * (sh_y - hip_y)
        if k == "hip" and cr_y is not None:
            y = max(y, cr_y + 0.02)
        lp = torso_loop(v, f, y)
        if lp is None:
            continue
        P_true = 0.0
        d = np.diff(np.vstack([lp, lp[:1]]), axis=0)
        P_true = float(np.sum(np.hypot(d[:, 0], d[:, 1]))) * 100
        w0 = width_of(lp, 0.0) * 100
        w45 = width_of(lp, 45.0) * 100
        w90 = width_of(lp, 90.0) * 100
        out[k] = {"P_true": P_true, "w0": w0, "w45": w45, "w90": w90}
    return out


def main() -> None:
    cache = {}
    resultats = {"chest": [], "waist": [], "hip": []}

    for name, sex, morphs, h in SUBJECTS_DEF:
        if sex not in cache:
            pos, deltas, faces = load_glb_morphs(BASE_MESHES / f"avatar-base-{sex}.glb")
            cache[sex] = (pos, deltas, faces)
        pos, deltas, faces = cache[sex]
        v = synthesize(pos, deltas, morphs, h)
        levels = prepare_light(name, v, faces)

        print(f"\n--- {name} ---")
        for zone, d in levels.items():
            P_true = d["P_true"]
            e_2vues = ramanujan(d["w0"], d["w90"])
            e_3vues = crofton_blind([d["w0"], d["w45"], d["w90"]])
            err_2 = abs(e_2vues - P_true)
            err_3 = abs(e_3vues - P_true)
            resultats[zone].append((err_2, err_3))
            print(f"  {zone:6} P_vrai={P_true:6.2f}  2vues={e_2vues:6.2f} (err {err_2:5.2f})  "
                  f"3vues(45deg)={e_3vues:6.2f} (err {err_3:5.2f})  "
                  f"{'<-- 3vues gagne' if err_3 < err_2 else '<-- 2vues gagne (ou egal)'}")

    print("\n" + "=" * 70)
    print("SYNTHESE (plancher geometrique pur, sans bruit de photo)")
    print("=" * 70)
    for zone, errs in resultats.items():
        e2 = np.array([e[0] for e in errs])
        e3 = np.array([e[1] for e in errs])
        print(f"{zone:6} MAE 2vues(production)={e2.mean():6.2f} cm   "
              f"MAE 3vues(face+45+profil)={e3.mean():6.2f} cm   "
              f"gain={e2.mean()-e3.mean():+6.2f} cm")


if __name__ == "__main__":
    main()
