"""
Experience 2 : remplacer l'ellipse (Ramanujan) par une superellipse (courbe de
Lame) pour le socle geometrique du tronc (poitrine / taille / hanches).

Contexte : `_predict_v3` utilise, pour ces trois tours, le perimetre d'une
ELLIPSE PURE (largeur/profondeur mesurees) SANS aucun residu appris -- un
residu entraine sur ANSUR degradait le resultat (voir measurement_model.py,
docstring de `_predict_v3`). C'est le seul endroit de toute la chaine ou rien
n'absorbe l'ecart entre la forme reelle d'une section de torse et la forme
mathematique supposee. Le rapport documente cet ecart comme une "limite
intrinseque de l'ellipse" de 2 a 5 cm (RAPPORT_PROJET.md, section 6.1).

Hypothese : une section de torse humain n'est pas une ellipse parfaite (n=2
dans |x/a|^n + |y/b|^n = 1) mais plus proche d'un rectangle aux coins arrondis
(dos plat, sternum) -- donc n > 2. Un SEUL parametre scalaire par zone (pas
un modele a plusieurs variables) est une correction a tres faible capacite :
peu de risque de sur-apprendre des idiosyncrasies d'ANSUR, contrairement au
residu par gradient boosting deja rejete.

Protocole :
  1. Sur ANSUR (hommes ET femmes separement), balayer n de 1.5 a 5.0 et
     choisir celui qui minimise l'erreur moyenne absolue de circonference,
     en validation croisee 5-fold (pour verifier que ce n'est pas un
     artefact d'ajustement).
  2. Appliquer ce n aux 13 sujets terrain (avec les largeurs/profondeurs deja
     extraites par la chaine reelle, sauvegardees dans baseline_v3.json) et
     comparer au perimetre d'ellipse actuel (n=2).

Le critere de decision : un gain qui se confirme a la fois sur ANSUR (hors
echantillon) ET sur le terrain justifie un changement de code ; un gain qui
n'apparait que sur l'un des deux est un artefact.

    python -m ml.bench.experiments.exp2_superellipse
"""
from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RACINE = Path(__file__).resolve().parents[2]  # .../Sur-MeZur-App/ml
ANSUR_DIR = RACINE.parents[1] / "ml" / "data" / "raw"  # .../Sur-MeZur/ml/data/raw (hors depot)
BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"

_N_THETA = 720
_THETA = np.linspace(0, 2 * np.pi, _N_THETA, endpoint=False)
_DT = _THETA[1] - _THETA[0]
_COS, _SIN = np.cos(_THETA), np.sin(_THETA)
_SIGN_COS, _SIGN_SIN = np.sign(_COS), np.sign(_SIN)
_ABS_COS, _ABS_SIN = np.abs(_COS), np.abs(_SIN)


def superellipse_perimeter(largeur: float, profondeur: float, n: float) -> float:
    """Perimetre numerique d'une courbe de Lame |x/a|^n+|y/b|^n=1. n=2 -> ellipse."""
    a, b = largeur / 2.0, profondeur / 2.0
    x = a * _SIGN_COS * _ABS_COS ** (2.0 / n)
    y = b * _SIGN_SIN * _ABS_SIN ** (2.0 / n)
    dx = np.gradient(x, _DT)
    dy = np.gradient(y, _DT)
    return float(np.sum(np.sqrt(dx ** 2 + dy ** 2)) * _DT)


def superellipse_perimeters_vect(largeurs: np.ndarray, profondeurs: np.ndarray, n: float) -> np.ndarray:
    """Version vectorisee sur toutes les lignes a la fois, pour un n donne."""
    a = largeurs[:, None] / 2.0
    b = profondeurs[:, None] / 2.0
    x = a * (_SIGN_COS * _ABS_COS ** (2.0 / n))[None, :]
    y = b * (_SIGN_SIN * _ABS_SIN ** (2.0 / n))[None, :]
    dx = np.gradient(x, _DT, axis=1)
    dy = np.gradient(y, _DT, axis=1)
    return np.sum(np.sqrt(dx ** 2 + dy ** 2), axis=1) * _DT


def ramanujan_perimeter(largeur: float, profondeur: float) -> float:
    import math
    a, b = largeur / 2.0, profondeur / 2.0
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


ZONES = {
    "chest": ("chestcircumference", "chestbreadth", "chestdepth"),
    "waist": ("waistcircumference", "waistbreadth", "waistdepth"),
    "hips": ("buttockcircumference", "hipbreadth", "buttockdepth"),
}


def fit_n(df: pd.DataFrame, circ_col: str, larg_col: str, prof_col: str) -> tuple[float, float, float]:
    """Renvoie (n_optimal, MAE_cm en CV 5-fold avec n=2, MAE_cm en CV avec n optimal)."""
    largeurs = df[larg_col].to_numpy(dtype=float) / 10.0  # mm -> cm
    profondeurs = df[prof_col].to_numpy(dtype=float) / 10.0
    circ_reel = df[circ_col].to_numpy(dtype=float) / 10.0

    rng = np.random.default_rng(0)
    idx = rng.permutation(len(df))
    folds = np.array_split(idx, 5)

    candidats = np.arange(1.5, 5.01, 0.1)
    # Perimetre superellipse pour CHAQUE ligne et CHAQUE n candidat, vectorise :
    # remplace ~700k appels Python un par un par 36 appels numpy pleine largeur.
    perims_par_n = {n: superellipse_perimeters_vect(largeurs, profondeurs, n) for n in candidats}
    perims_n2_tous = np.array([ramanujan_perimeter(largeurs[i], profondeurs[i]) for i in range(len(df))])

    erreurs_par_n = {n: [] for n in candidats}
    erreurs_n2 = []

    for k in range(5):
        test_idx = folds[k]
        train_idx = np.concatenate([folds[j] for j in range(5) if j != k])

        # Sur le pli d'entrainement : cherche le n qui minimise le MAE.
        meilleurs = None
        for n in candidats:
            mae = np.mean(np.abs(perims_par_n[n][train_idx] - circ_reel[train_idx]))
            if meilleurs is None or mae < meilleurs[1]:
                meilleurs = (n, mae)
        n_choisi = meilleurs[0]

        # Evalue CE n (choisi sans voir le pli de test) sur le pli de test.
        erreurs_par_n[n_choisi].append(
            np.mean(np.abs(perims_par_n[n_choisi][test_idx] - circ_reel[test_idx]))
        )
        erreurs_n2.append(np.mean(np.abs(perims_n2_tous[test_idx] - circ_reel[test_idx])))

    # n final : celui retenu sur l'ensemble complet (pour l'appliquer ensuite au terrain).
    meilleurs_global = None
    for n in candidats:
        mae = np.mean(np.abs(perims_par_n[n] - circ_reel))
        if meilleurs_global is None or mae < meilleurs_global[1]:
            meilleurs_global = (n, mae)

    mae_cv_n2 = float(np.mean(erreurs_n2))
    toutes_erreurs_cv = [e for lst in erreurs_par_n.values() for e in lst]
    mae_cv_superellipse = float(np.mean(toutes_erreurs_cv)) if toutes_erreurs_cv else float("nan")

    return meilleurs_global[0], mae_cv_n2, mae_cv_superellipse


def evaluer_terrain(n_par_zone: dict[str, dict[str, float]]) -> None:
    """Applique les n calibres aux 13 sujets terrain (features deja extraites)."""
    if not BASELINE_JSON.exists():
        print("  (baseline_v3.json absent -- lancez d'abord run_bench.py --dump)")
        return

    donnees = json.loads(BASELINE_JSON.read_text(encoding="utf-8"))
    sujets_json = json.loads((Path(__file__).resolve().parents[1] / "sujets.json").read_text(encoding="utf-8"))
    genre_par_id = {s["id"]: s["gender"] for s in sujets_json["sujets"]}
    erreurs_ellipse: dict[str, list[float]] = {z: [] for z in ZONES}
    erreurs_super: dict[str, list[float]] = {z: [] for z in ZONES}

    zone_to_body_cols = {
        "chest": ("chestbreadth", "chestdepth"),
        "waist": ("waistbreadth", "waistdepth"),
        "hips": ("hipbreadth", "buttockdepth"),
    }

    for s in donnees:
        if not s.get("ok"):
            continue
        f = s["features"]
        attendu = s["attendu"]
        genre = genre_par_id.get(s["id"], "male")
        for zone, (bcol, dcol) in zone_to_body_cols.items():
            if zone not in attendu:
                continue
            largeur = f.get(bcol + "_body", f.get(bcol))
            profondeur = f.get(dcol + "_body", f.get(dcol))
            if largeur is None or profondeur is None:
                continue
            reel = attendu[zone]
            pred_ellipse = ramanujan_perimeter(largeur, profondeur)
            n = n_par_zone[zone][genre]
            pred_super = superellipse_perimeter(largeur, profondeur, n)
            erreurs_ellipse[zone].append(abs(pred_ellipse - reel))
            erreurs_super[zone].append(abs(pred_super - reel))

    print("\n  --- application aux 13 sujets terrain (n par sexe reel du sujet) ---")
    for zone in ZONES:
        if not erreurs_ellipse[zone]:
            continue
        avant = st.mean(erreurs_ellipse[zone])
        apres = st.mean(erreurs_super[zone])
        marque = "  <-- AMELIORATION" if apres < avant - 0.05 else ("  <-- DEGRADATION" if apres > avant + 0.05 else "")
        print(f"  {zone:8} ellipse(n=2)={avant:5.2f} cm   superellipse={apres:5.2f} cm  ({apres - avant:+.2f}){marque}")


def main() -> None:
    resultats = {}
    for sexe, fichier in (("male", "ANSUR_II_MALE.csv"), ("female", "ANSUR_II_FEMALE.csv")):
        chemin = ANSUR_DIR / fichier
        if not chemin.exists():
            print(f"ANSUR introuvable: {chemin}")
            return
        df = pd.read_csv(chemin, encoding="latin1")
        print(f"\n=== {sexe} (n={len(df)}) ===")
        resultats[sexe] = {}
        for zone, (circ_col, larg_col, prof_col) in ZONES.items():
            n_opt, mae_n2, mae_super = fit_n(df, circ_col, larg_col, prof_col)
            resultats[sexe][zone] = n_opt
            delta = mae_super - mae_n2
            marque = "  <-- AMELIORATION (hors echantillon, CV 5-fold)" if delta < -0.05 else (
                "  <-- DEGRADATION" if delta > 0.05 else "  (pas de difference significative)")
            print(f"  {zone:8} n optimal={n_opt:.1f}   "
                  f"MAE ellipse(n=2)={mae_n2:5.2f} cm   MAE superellipse(CV)={mae_super:5.2f} cm"
                  f"  ({delta:+.2f}){marque}")

    n_par_zone = {zone: {sexe: resultats[sexe][zone] for sexe in resultats} for zone in ZONES}
    evaluer_terrain(n_par_zone)


if __name__ == "__main__":
    main()
