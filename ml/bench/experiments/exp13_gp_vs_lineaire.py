"""
Niveau 0 bis (voir RAPPORT_PROJET.md, section 6bis, "Recherche d'architecture
alternative") : teste, sur nos VRAIS sujets deja mesures et photographies
(13 + 7 = 20), si un processus gaussien (GP) bat la regression lineaire
utilisee aujourd'hui dans la couche de correction post-hoc
(ml/bench/pipeline_ameliore.py -- CORRECTIONS_UNIVERSELLES / CORRECTIONS_HOMMES).

La piste, telle que formulee dans le rapport : "remplacer la regression
Ridge (lineaire) par une regression par processus gaussien sur les cibles
actuelles -- la litterature rapporte des gains de 20-30% sur des problemes
comparables, aucune nouvelle donnee requise." Teste ici au sens strict :
MEMES features que les corrections en production, MEME protocole (LOO
stricte, refit a chaque tour), seul l'estimateur change (lineaire -> GP).
Ce N'EST PAS un test sur le modele V3 (Ridge entraine sur ANSUR) : les CSV
ANSUR bruts ne sont pas presents sur cette machine (voir ml/data/, absent).
La piste "aucune nouvelle donnee requise" pointe de toute facon vers CETTE
couche -- celle deja calibree sur nos sujets reels, pas sur ANSUR.

Protocole (identique a celui utilise tout au long de cette recherche pour
biceps/thigh/ankle/hips, voir claude_code.md) : pour chaque mesure et
chaque sujet, le sujet teste est totalement absent du fit -- lineaire ET
GP sur EXACTEMENT les memes folds, comparaison appariee.

Sources des donnees (aucune photo relancee inutilement) :
  - 13 sujets originaux : deja en cache (features + predictions V3 brutes)
    par un autre agent -- C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\
    real_baseline_dump.json -- reutilise tel quel.
  - 7 nouveaux sujets (25 aout, ml/bench/nouveaux_sujets_reels.json) :
    jamais passes dans le pipeline complet -> extraits ici (SAM inclus,
    quelques minutes la premiere fois), mis en cache localement ensuite.

Usage :
    "chemin_vers_venv\\python.exe" ml/bench/experiments/exp13_gp_vs_lineaire.py [--fresh]
"""
from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parents[3]  # .../Sur-MeZur-App
BACKEND = RACINE / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(RACINE / "ml" / "bench"))

from pipeline_ameliore import CORRECTIONS_UNIVERSELLES, CORRECTIONS_HOMMES  # noqa: E402

PROD_DUMP = Path(r"C:\Users\Admin\AppData\Local\Temp\opencode\real_baseline_dump.json")
NOUVEAUX_JSON = RACINE / "ml" / "bench" / "nouveaux_sujets_reels.json"
IMAGES_DIR = RACINE / "IMAGES TEST"
CACHE_NOUVEAUX = Path(__file__).with_name("cache_exp13_nouveaux.json")

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]


# ==========================================================================
# 1. Chargement des 20 sujets reels (features + brut + verite terrain)
# ==========================================================================

def _charger_originaux() -> list[dict]:
    data = json.loads(PROD_DUMP.read_text(encoding="utf-8"))
    out = []
    for r in data:
        if not r.get("ok"):
            continue
        # genre absent du dump -- retrouve via sujets.json
        out.append(r)
    # injecter le genre depuis sujets.json (le dump ne le porte pas)
    sujets = json.loads((RACINE / "ml" / "bench" / "sujets.json").read_text(encoding="utf-8"))
    genre_par_id = {s["id"]: s["gender"] for s in sujets["sujets"]}
    for r in out:
        r["gender"] = genre_par_id.get(r["id"], "male")
        r["uid"] = f"orig_{r['id']}"
    return out


def _extraire_nouveaux() -> list[dict]:
    if CACHE_NOUVEAUX.exists() and "--fresh" not in sys.argv:
        return json.loads(CACHE_NOUVEAUX.read_text(encoding="utf-8"))

    from app.services.vision import pipeline as pipeline_mod

    donnees = json.loads(NOUVEAUX_JSON.read_text(encoding="utf-8"))
    out = []
    for s in donnees["sujets"]:
        pp = s.get("photos")
        if not pp or not s.get("tours"):
            continue
        front = IMAGES_DIR / pp["face"]
        side = IMAGES_DIR / pp["profil"] if pp.get("profil") else None
        print(f"  nouveau sujet {s['id']}: extraction pipeline complet...", flush=True)
        resultat = pipeline_mod.run(
            front_photo=front, side_photo=side,
            height_cm=s["height_cm"], weight_kg=s["weight_kg"], gender=s["gender"],
        )
        if resultat is None:
            print(f"  nouveau sujet {s['id']}: ECHEC pipeline")
            continue
        attendu = dict(zip(TOURS, s["tours"]))
        attendu.update(dict(zip(LONGUEURS, s["longueurs"])))
        out.append({
            "id": s["id"], "uid": f"new_{s['id']}", "gender": s["gender"],
            "features": dict(resultat.features), "mesures": dict(resultat.data),
            "attendu": attendu,
        })
        print(f"  nouveau sujet {s['id']}: OK (source={resultat.source})")

    CACHE_NOUVEAUX.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    return out


def charger_tous() -> list[dict]:
    return _charger_originaux() + _extraire_nouveaux()


# ==========================================================================
# 2. Construction des matrices X/y par mesure, a partir des memes features
#    que la correction en production (mode "direct" ou "correction")
# ==========================================================================

def matrice(sujets: list[dict], features: tuple[str, ...], mode: str, mesure: str):
    """Renvoie (X, y, uids) -- y est la CIBLE que le regresseur doit apprendre
    (la valeur reelle en mode direct, le residu reel-brut en mode correction),
    exactement comme le fait CorrectionLineaire.appliquer en production."""
    X, y, uids = [], [], []
    for s in sujets:
        feats = dict(s["features"])
        feats["__calc__"] = s["mesures"].get(mesure)
        if mesure not in s["attendu"] or mesure not in s["mesures"]:
            continue
        try:
            x = [float(feats[f]) for f in features]
        except (KeyError, TypeError):
            continue
        ref = s["attendu"][mesure]
        brut = s["mesures"][mesure]
        cible = ref if mode == "direct" else (ref - brut)
        X.append(x)
        y.append(cible)
        uids.append(s["uid"])
    return np.array(X, dtype=float), np.array(y, dtype=float), uids


def matrice_bmi(sujets: list[dict], mesure: str):
    """Cas CorrectionBMI : feature unique = BMI, mode toujours 'direct'."""
    X, y, uids = [], [], []
    for s in sujets:
        feats = s["features"]
        if mesure not in s["attendu"] or "weight_kg" not in feats or "stature_m" not in feats:
            continue
        bmi = feats["weight_kg"] / (feats["stature_m"] / 100.0) ** 2
        X.append([bmi])
        y.append(s["attendu"][mesure])
        uids.append(s["uid"])
    return np.array(X, dtype=float), np.array(y, dtype=float), uids


# ==========================================================================
# 3. LOO apparie : meme folds, lineaire (refit) vs GP (refit)
# ==========================================================================

def loo_compare(X: np.ndarray, y: np.ndarray, brut_par_uid: dict, uids: list[str], mode: str):
    from sklearn.gaussian_process import GaussianProcessRegressor
    from sklearn.gaussian_process.kernels import RBF, ConstantKernel, WhiteKernel
    from sklearn.linear_model import LinearRegression
    from sklearn.preprocessing import StandardScaler

    n = len(y)
    if n < 5:
        return None

    err_brut, err_lin, err_gp = [], [], []
    for i in range(n):
        mask = np.ones(n, dtype=bool)
        mask[i] = False
        X_tr, y_tr = X[mask], y[mask]
        X_te = X[i : i + 1]

        scaler = StandardScaler().fit(X_tr)
        X_tr_s, X_te_s = scaler.transform(X_tr), scaler.transform(X_te)

        lin = LinearRegression().fit(X_tr_s, y_tr)
        pred_lin = float(lin.predict(X_te_s)[0])

        n_feat = X_tr_s.shape[1]
        kernel = ConstantKernel(1.0, (1e-2, 1e3)) * RBF(
            length_scale=np.ones(n_feat), length_scale_bounds=(1e-1, 1e2)
        ) + WhiteKernel(noise_level=1.0, noise_level_bounds=(1e-3, 1e2))
        gp = GaussianProcessRegressor(
            kernel=kernel, normalize_y=True, n_restarts_optimizer=6, random_state=0, alpha=1e-8,
        ).fit(X_tr_s, y_tr)
        pred_gp = float(gp.predict(X_te_s)[0])

        ref_reel = y[i] if mode == "direct" else (y[i] + brut_par_uid[uids[i]])
        pred_lin_reel = pred_lin if mode == "direct" else (pred_lin + brut_par_uid[uids[i]])
        pred_gp_reel = pred_gp if mode == "direct" else (pred_gp + brut_par_uid[uids[i]])
        brut_reel = brut_par_uid[uids[i]]

        err_brut.append(abs(brut_reel - ref_reel))
        err_lin.append(abs(pred_lin_reel - ref_reel))
        err_gp.append(abs(pred_gp_reel - ref_reel))

    return {
        "n": n,
        "mae_brut": st.mean(err_brut),
        "mae_lin": st.mean(err_lin),
        "mae_gp": st.mean(err_gp),
    }


# ==========================================================================
# 4. Orchestration
# ==========================================================================

def main() -> None:
    print("Chargement des 20 sujets reels (cache reutilise si present)...")
    sujets = charger_tous()
    print(f"  {len(sujets)} sujets charges ({sum(1 for s in sujets if s['uid'].startswith('orig'))} originaux + "
          f"{sum(1 for s in sujets if s['uid'].startswith('new'))} nouveaux)\n")

    brut_par_uid = {s["uid"]: s["mesures"] for s in sujets}

    print(f"{'mesure':14} {'n':>3} {'brut':>8} {'lineaire(LOO)':>15} {'GP(LOO)':>10} {'gagnant':>10}")
    print("-" * 70)

    resultats = []

    for mesure, corr in CORRECTIONS_UNIVERSELLES.items():
        X, y, uids = matrice(sujets, corr.features, corr.mode, mesure)
        brut_map = {u: brut_par_uid[u][mesure] for u in uids if mesure in brut_par_uid[u]}
        res = loo_compare(X, y, brut_map, uids, corr.mode)
        if res is None:
            continue
        gagnant = "GP" if res["mae_gp"] < res["mae_lin"] - 0.02 else (
            "lineaire" if res["mae_lin"] < res["mae_gp"] - 0.02 else "egalite")
        print(f"{mesure:14} {res['n']:3d} {res['mae_brut']:7.2f}cm {res['mae_lin']:14.2f}cm "
              f"{res['mae_gp']:9.2f}cm {gagnant:>10}")
        resultats.append((mesure, res, gagnant))

    hommes = [s for s in sujets if (s.get("gender") or "").lower().startswith("m")]
    for mesure, corr in CORRECTIONS_HOMMES.items():
        if hasattr(corr, "features"):
            X, y, uids = matrice(hommes, corr.features, corr.mode, mesure)
            mode = corr.mode
        else:
            X, y, uids = matrice_bmi(hommes, mesure)
            mode = "direct"
        brut_map = {u: brut_par_uid[u][mesure] for u in uids if mesure in brut_par_uid[u]}
        res = loo_compare(X, y, brut_map, uids, mode)
        if res is None:
            continue
        gagnant = "GP" if res["mae_gp"] < res["mae_lin"] - 0.02 else (
            "lineaire" if res["mae_lin"] < res["mae_gp"] - 0.02 else "egalite")
        print(f"{mesure + ' (h.)':14} {res['n']:3d} {res['mae_brut']:7.2f}cm {res['mae_lin']:14.2f}cm "
              f"{res['mae_gp']:9.2f}cm {gagnant:>10}")
        resultats.append((mesure + " (h.)", res, gagnant))

    print("-" * 70)
    moy_brut = st.mean(r["mae_brut"] for _, r, _ in resultats)
    moy_lin = st.mean(r["mae_lin"] for _, r, _ in resultats)
    moy_gp = st.mean(r["mae_gp"] for _, r, _ in resultats)
    print(f"{'MOYENNE':14} {'':>3} {moy_brut:7.2f}cm {moy_lin:14.2f}cm {moy_gp:9.2f}cm")
    n_gp_gagne = sum(1 for _, _, g in resultats if g == "GP")
    print(f"\nGP gagne sur {n_gp_gagne}/{len(resultats)} mesures (marge > 0.02cm).")


if __name__ == "__main__":
    main()
