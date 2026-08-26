"""
Experience 11 : synthese finale, LOO imbrique sur un ensemble de candidats
CURES (pas un scan aveugle de centaines de combinaisons) combinant :
  - Les candidats trouves et valides dans cette session (weight_kg seul,
    stature_m seul, sortie+weight, Theil-Sen sur sortie, BMI...).
  - Les candidats trouves par un autre agent (freebuff.md, ml/bench/
    test_exp4/9), verifies independamment (voir chat) : plusieurs
    generalisent bien sur des features recalculees independamment, malgre
    une methode de selection (330 combinaisons, minimum LOO global) a
    risque de fuite -- donc retenus comme CANDIDATS a valider ici, pas
    comme verites toutes faites.

Pour chaque mesure, la selection du meilleur candidat est faite en LOO
IMBRIQUE strict (jamais en regardant le sujet exclu) -- seul un candidat
choisi de facon STABLE (meme choix quel que soit le sujet exclu) est
retenu comme "confirme". Sinon, le meilleur candidat A CANDIDAT UNIQUE
(pas de scan) est utilise comme repli sur.

    python -m ml.bench.experiments.exp11_synthese_finale
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

BASELINE_JSON = Path(__file__).resolve().parents[1] / "baseline_v3.json"
SUJETS_JSON = Path(__file__).resolve().parents[1] / "sujets.json"


def charger(cible: str):
    donnees = json.loads(BASELINE_JSON.read_text(encoding="utf-8"))
    sujets = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))
    notes = {s["id"]: s.get("note") for s in sujets["sujets"]}
    lignes = []
    for s in donnees:
        if not s.get("ok"):
            continue
        if cible == "shoulder" and notes.get(s["id"]):
            continue
        m, a, f = s["mesures"], s["attendu"], s["features"]
        if cible in m and cible in a:
            lignes.append({"id": s["id"], "calc": m[cible], "reel": a[cible], "f": f})
    return lignes


def predire(strategie: str, feats: list[str], tr_idx, i, lignes):
    X = np.array([[lignes[j]["f"][fn] for fn in feats] for j in tr_idx])
    xi = np.array([lignes[i]["f"][fn] for fn in feats])
    if strategie == "correction":
        y = np.array([lignes[j]["reel"] - lignes[j]["calc"] for j in tr_idx])
        A = np.hstack([X, np.ones((len(tr_idx), 1))])
        coefs = np.linalg.lstsq(A, y, rcond=None)[0]
        return lignes[i]["calc"] + np.dot(coefs[:-1], xi) + coefs[-1]
    else:  # "direct"
        y = np.array([lignes[j]["reel"] for j in tr_idx])
        A = np.hstack([X, np.ones((len(tr_idx), 1))])
        coefs = np.linalg.lstsq(A, y, rcond=None)[0]
        return np.dot(coefs[:-1], xi) + coefs[-1]


def theil_sen_sur_sortie(tr_idx, i, lignes):
    calc = np.array([lignes[j]["calc"] for j in tr_idx])
    reel = np.array([lignes[j]["reel"] for j in tr_idx])
    n = len(tr_idx)
    pentes = [(reel[b] - reel[a]) / (calc[b] - calc[a]) for a in range(n) for b in range(a + 1, n) if calc[b] != calc[a]]
    pente = float(np.median(pentes)) if pentes else 1.0
    ordonnee = float(np.median(reel - pente * calc))
    calc_i = lignes[i]["calc"]
    return pente * calc_i + ordonnee


CANDIDATS = {
    "neck": [
        ("weight_seul", "direct", ["weight_kg"]),
        ("sortie+weight", "direct", None),  # traite a part (utilise calc comme feature)
        ("freebuff:weight+biacromial+buttockdepth", "correction", ["weight_kg", "biacromialbreadth", "buttockdepth"]),
    ],
    "biceps": [
        ("weight_seul", "direct", ["weight_kg"]),
        ("freebuff:weight+chestbreadth+buttockdepth", "direct", ["weight_kg", "chestbreadth", "buttockdepth"]),
    ],
    "wrist": [
        ("weight_seul", "direct", ["weight_kg"]),
        ("freebuff:stature+chestbreadth+waistbreadth", "correction", ["stature_m", "chestbreadth", "waistbreadth"]),
    ],
    "thigh": [
        ("theilsen_sortie", None, None),
        ("freebuff:weight+buttockdepth+waistdepth", "correction", ["weight_kg", "buttockdepth", "waistdepth"]),
    ],
    "ankle": [
        ("weight_seul", "direct", ["weight_kg"]),
        ("freebuff:stature+chestdepth", "correction", ["stature_m", "chestdepth"]),
    ],
    "shoulder": [
        ("weight_seul", "direct", ["weight_kg"]),
        ("freebuff:weight+biacromial+chestdepth", "direct", ["weight_kg", "biacromialbreadth", "chestdepth"]),
    ],
    "sleeve_length": [
        ("stature_seul", "direct", ["stature_m"]),
        ("freebuff:stature+crotchheight+buttockdepth", "direct", ["stature_m", "crotchheight", "buttockdepth"]),
    ],
    "chest": [
        ("weight_seul", "direct", ["weight_kg"]),
        ("freebuff:weight+biacromial+buttockdepth", "direct", ["weight_kg", "biacromialbreadth", "buttockdepth"]),
    ],
    "waist": [
        ("bmi_seul", None, None),
        ("freebuff:weight+hipbreadth+crotchheight", "correction", ["weight_kg", "hipbreadth", "crotchheight"]),
    ],
    "hips": [
        ("bmi_seul", None, None),
        ("freebuff:stature+crotchheight+buttockdepth", "correction", ["stature_m", "crotchheight", "buttockdepth"]),
    ],
}


def predire_special(nom, tr_idx, i, lignes):
    if nom == "sortie+weight":
        X = np.array([[lignes[j]["calc"], lignes[j]["f"]["weight_kg"]] for j in tr_idx])
        y = np.array([lignes[j]["reel"] for j in tr_idx])
        A = np.hstack([X, np.ones((len(tr_idx), 1))])
        coefs = np.linalg.lstsq(A, y, rcond=None)[0]
        xi = np.array([lignes[i]["calc"], lignes[i]["f"]["weight_kg"]])
        return np.dot(coefs[:-1], xi) + coefs[-1]
    if nom == "theilsen_sortie":
        return theil_sen_sur_sortie(tr_idx, i, lignes)
    if nom == "bmi_seul":
        bmi = np.array([lignes[j]["f"]["weight_kg"] / (lignes[j]["f"]["stature_m"] / 100.0) ** 2 for j in tr_idx])
        reel = np.array([lignes[j]["reel"] for j in tr_idx])
        A = np.vstack([bmi, np.ones(len(tr_idx))]).T
        p, o = np.linalg.lstsq(A, reel, rcond=None)[0]
        bmi_i = lignes[i]["f"]["weight_kg"] / (lignes[i]["f"]["stature_m"] / 100.0) ** 2
        return p * bmi_i + o
    raise ValueError(nom)


def loo_interne(nom, strategie, feats, sous_idx, lignes):
    err = []
    for i in sous_idx:
        tr = [j for j in sous_idx if j != i]
        if feats is None:
            pred = predire_special(nom, tr, i, lignes)
        else:
            pred = predire(strategie, feats, tr, i, lignes)
        err.append(abs(pred - lignes[i]["reel"]))
    return np.mean(err)


def main():
    print(f"{'mesure':15} {'MAE avant':>10} {'MAE LOO imbrique':>18} {'candidat retenu':40} {'stable?':>8}")
    print("-" * 95)
    resume = {}
    for cible, candidats in CANDIDATS.items():
        lignes = charger(cible)
        n = len(lignes)
        mae_avant = np.mean([abs(l["calc"] - l["reel"]) for l in lignes])

        choix_par_sujet = []
        erreurs = []
        for i in range(n):
            sous = [j for j in range(n) if j != i]
            meilleur = None
            for nom, strategie, feats in candidats:
                try:
                    m_ = loo_interne(nom, strategie, feats, sous, lignes)
                except Exception:
                    continue
                if meilleur is None or m_ < meilleur[1]:
                    meilleur = (nom, m_)
            nom_choisi = meilleur[0]
            choix_par_sujet.append(nom_choisi)
            strategie_c, feats_c = next((s, f) for n2, s, f in candidats if n2 == nom_choisi)
            if feats_c is None:
                pred = predire_special(nom_choisi, sous, i, lignes)
            else:
                pred = predire(strategie_c, feats_c, sous, i, lignes)
            erreurs.append(abs(pred - lignes[i]["reel"]))

        mae_apres = np.mean(erreurs)
        stable = len(set(choix_par_sujet)) == 1
        gagnant = choix_par_sujet[0] if stable else f"instable:{set(choix_par_sujet)}"
        resume[cible] = (mae_avant, mae_apres, gagnant, stable)
        print(f"{cible:15} {mae_avant:10.2f} {mae_apres:18.2f} {gagnant[:40]:40} {'oui' if stable else 'NON':>8}")

    return resume


if __name__ == "__main__":
    main()
