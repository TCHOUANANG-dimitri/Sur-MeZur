"""
Experience 9 : nouvelles pistes, jamais testees dans cette session, pour les
5 mesures encore bloquees (chest, waist, hips, inseam, biceps).

Idees testees ici :

  H. Formules de perimetre alternatives a Ramanujan (SANS aucun parametre
     ajuste sur nos donnees -- donc zero risque de sur-apprentissage,
     contrairement a l'exposant de superellipse deja rejete).
  I. Correction CROISEE : utiliser les 3 circonferences du tronc ENSEMBLE
     (chest, waist, hips calcules) pour corriger chacune -- hypothese que
     leurs erreurs partagent une cause commune (meme resolution d'epaisseur
     de vetement) et qu'une combinaison lineaire peut partiellement
     l'annuler.
  J. Epaisseur de vetement comme variable de correction supplementaire
     (proxy reconstruit depuis les features _body deja extraites).
  K. Stratification par source (vision_sam vs vision_pose) -- diagnostic :
     l'erreur est-elle concentree sur les sujets ou SAM a echoue ?
  L. BMI (poids/taille^2) comme variable, au lieu de poids et taille
     separement -- deja teste separement et ensemble, jamais comme ratio.

Toute selection parmi plusieurs candidats est validee en LOO imbrique,
comme dans les experiences precedentes.

    python -m ml.bench.experiments.exp9_nouvelles_pistes
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"
SUJETS_JSON = Path(__file__).resolve().parents[1] / "sujets.json"


def charger_toutes() -> tuple[list[dict], dict[int, str]]:
    donnees = json.loads(BASELINE_JSON.read_text(encoding="utf-8"))
    sujets = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))
    genre = {s["id"]: s["gender"] for s in sujets["sujets"]}
    return [s for s in donnees if s.get("ok")], genre


# ============================================================
# H. Formules de perimetre alternatives (zero parametre ajuste)
# ============================================================

def ramanujan(a, b):
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def ramanujan_ii(a, b):
    if a + b == 0:
        return 0.0
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


def approx_naive(a, b):
    return math.pi * (a + b)


def approx_quadratique(a, b):
    return 2 * math.pi * math.sqrt((a ** 2 + b ** 2) / 2)


FORMULES = {
    "ramanujan (actuel)": ramanujan,
    "ramanujan_ii": ramanujan_ii,
    "naive pi(a+b)": approx_naive,
    "quadratique": approx_quadratique,
}

ZONE_COLS = {
    "chest": ("chestbreadth", "chestdepth"),
    "waist": ("waistbreadth", "waistdepth"),
    "hips": ("hipbreadth", "buttockdepth"),
}


def test_formules() -> None:
    print("\n" + "=" * 70)
    print("H. Formules de perimetre alternatives (0 parametre ajuste)")
    print("=" * 70)
    donnees, _ = charger_toutes()
    for zone, (bcol, dcol) in ZONE_COLS.items():
        print(f"\n  --- {zone} ---")
        for nom, fn in FORMULES.items():
            erreurs = []
            for s in donnees:
                f, a = s["features"], s["attendu"]
                if zone not in a:
                    continue
                largeur = f.get(bcol + "_body", f.get(bcol))
                profondeur = f.get(dcol + "_body", f.get(dcol))
                if largeur is None or profondeur is None:
                    continue
                pred = fn(largeur / 2, profondeur / 2)
                erreurs.append(abs(pred - a[zone]))
            print(f"    {nom:20} MAE={np.mean(erreurs):5.2f} cm")


# ============================================================
# I. Correction croisee (chest+waist+hips ensemble)
# ============================================================

def test_correction_croisee() -> None:
    print("\n" + "=" * 70)
    print("I. Correction croisee : chest+waist+hips utilises ensemble")
    print("=" * 70)
    donnees, _ = charger_toutes()
    lignes = []
    for s in donnees:
        m, a = s["mesures"], s["attendu"]
        if all(z in m and z in a for z in ("chest", "waist", "hips")):
            lignes.append((m["chest"], m["waist"], m["hips"], a["chest"], a["waist"], a["hips"]))
    if len(lignes) < 6:
        print("  pas assez de sujets")
        return
    arr = np.array(lignes)
    cchest, cwaist, chips = arr[:, 0], arr[:, 1], arr[:, 2]
    rchest, rwaist, rhips = arr[:, 3], arr[:, 4], arr[:, 5]
    n = len(lignes)

    for nom, calc, reel in (("chest", cchest, rchest), ("waist", cwaist, rwaist), ("hips", chips, rhips)):
        mae_avant = np.mean(np.abs(calc - reel))
        # LOO : reel = c0*chest + c1*waist + c2*hips + c3 (les 3 ensembles)
        erreurs = []
        for i in range(n):
            tr = [j for j in range(n) if j != i]
            A = np.vstack([cchest[tr], cwaist[tr], chips[tr], np.ones(len(tr))]).T
            coefs = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
            pred = coefs[0] * cchest[i] + coefs[1] * cwaist[i] + coefs[2] * chips[i] + coefs[3]
            erreurs.append(abs(pred - reel[i]))
        mae_apres = np.mean(erreurs)
        marque = "  <-- gain" if mae_apres < mae_avant - 0.05 else ""
        print(f"  {nom:8} MAE avant={mae_avant:5.2f}  MAE LOO (3 cibles jointes)={mae_apres:5.2f}"
              f"  ({mae_apres - mae_avant:+.2f}){marque}")


# ============================================================
# J. Epaisseur de vetement (proxy) comme variable supplementaire
# ============================================================

def test_epaisseur_proxy() -> None:
    print("\n" + "=" * 70)
    print("J. Proxy d'epaisseur de vetement comme variable de correction")
    print("=" * 70)
    donnees, _ = charger_toutes()
    for zone, (bcol, dcol) in ZONE_COLS.items():
        lignes = []
        for s in donnees:
            f, m, a = s["features"], s["mesures"], s["attendu"]
            if zone not in m or zone not in a:
                continue
            clothed = f.get(bcol)
            body = f.get(bcol + "_body")
            if clothed is None or body is None:
                continue
            proxy = (clothed - body) / 2.0  # ~ epaisseur resolue, cm
            lignes.append((m[zone], a[zone], proxy))
        if len(lignes) < 6:
            continue
        calc = np.array([l[0] for l in lignes])
        reel = np.array([l[1] for l in lignes])
        proxy = np.array([l[2] for l in lignes])
        mae_avant = np.mean(np.abs(calc - reel))
        n = len(lignes)
        erreurs = []
        for i in range(n):
            tr = [j for j in range(n) if j != i]
            A = np.vstack([calc[tr], proxy[tr], np.ones(len(tr))]).T
            coefs = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
            pred = coefs[0] * calc[i] + coefs[1] * proxy[i] + coefs[2]
            erreurs.append(abs(pred - reel[i]))
        mae_apres = np.mean(erreurs)
        marque = "  <-- gain" if mae_apres < mae_avant - 0.05 else ""
        print(f"  {zone:8} MAE avant={mae_avant:5.2f}  MAE LOO (calc+epaisseur)={mae_apres:5.2f}"
              f"  ({mae_apres - mae_avant:+.2f}){marque}")


# ============================================================
# K. Stratification par source (vision_sam vs vision_pose)
# ============================================================

def test_stratification_source() -> None:
    print("\n" + "=" * 70)
    print("K. Erreur par source (vision_sam vs vision_pose) -- diagnostic")
    print("=" * 70)
    donnees, _ = charger_toutes()
    par_source: dict[str, dict[str, list[float]]] = {}
    for s in donnees:
        src = s["source"]
        m, a = s["mesures"], s["attendu"]
        par_source.setdefault(src, {})
        for zone in ("chest", "waist", "hips"):
            if zone in m and zone in a:
                par_source[src].setdefault(zone, []).append(abs(m[zone] - a[zone]))
    for src, zones in par_source.items():
        print(f"  source={src}")
        for zone, erreurs in zones.items():
            print(f"    {zone:8} n={len(erreurs):2}  MAE={np.mean(erreurs):5.2f}")


# ============================================================
# L. BMI (poids/taille^2) comme variable
# ============================================================

def test_bmi() -> None:
    print("\n" + "=" * 70)
    print("L. BMI (poids/stature^2) comme variable de correction")
    print("=" * 70)
    donnees, _ = charger_toutes()
    for cible in ("chest", "waist", "hips", "biceps", "inseam"):
        lignes = []
        for s in donnees:
            f, m, a = s["features"], s["mesures"], s["attendu"]
            if cible not in m or cible not in a:
                continue
            bmi = f["weight_kg"] / (f["stature_m"] / 100.0) ** 2
            lignes.append((m[cible], a[cible], bmi))
        if len(lignes) < 6:
            continue
        calc = np.array([l[0] for l in lignes])
        reel = np.array([l[1] for l in lignes])
        bmi = np.array([l[2] for l in lignes])
        mae_avant = np.mean(np.abs(calc - reel))
        n = len(lignes)
        erreurs = []
        for i in range(n):
            tr = [j for j in range(n) if j != i]
            A = np.vstack([bmi[tr], np.ones(len(tr))]).T
            p, o = np.linalg.lstsq(A, reel[tr], rcond=None)[0]
            erreurs.append(abs((p * bmi[i] + o) - reel[i]))
        mae_apres = np.mean(erreurs)
        marque = "  <-- gain" if mae_apres < mae_avant - 0.05 else ""
        print(f"  {cible:8} MAE avant={mae_avant:5.2f}  MAE LOO (BMI seul)={mae_apres:5.2f}"
              f"  ({mae_apres - mae_avant:+.2f}){marque}")


if __name__ == "__main__":
    test_formules()
    test_correction_croisee()
    test_epaisseur_proxy()
    test_stratification_source()
    test_bmi()
