"""
EXP-RL1 : correction du tronc calibrée leave-one-out sur les 13 sujets RÉELS.

La chaîne actuelle estime chest/waist/hips par ellipse de Ramanujan depuis
(w,d) mesurés. Le banc synthétique a montré un biais de forme systématique
(l'ellipse sous-estime la section réelle). Ici on apprend une correction
linéaire SUR LA POPULATION LOCALE :

    P_hat = a0 + a1*P_ellipse + a2*w_body + a3*d_body + a4*IMC

validée en strict leave-one-out (12 sujets d'apprentissage -> 1 sujet test,
tournant). Comparaison au pipeline non corrigé (mesures du dump).
"""
from __future__ import annotations

import json
import math
import statistics as st
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, r"C:\Users\Admin\Desktop\Sur-MeZur\Sur-MeZur-App\backend")

DUMP = Path(r"C:\Users\Admin\AppData\Local\Temp\opencode\real_baseline_dump.json")


def ramanujan(a_full, b_full):
    a, b = max(a_full, b_full) / 2, min(a_full, b_full) / 2
    h = ((a - b) / (a + b)) ** 2 if (a + b) > 0 else 0.0
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


def main():
    rows = json.loads(DUMP.read_text(encoding="utf-8"))
    rows = [r for r in rows if r.get("ok")]

    cibles = ["chest", "waist", "hips"]
    print(f"n={len(rows)} sujets valides\n")

    # signaux disponibles dans les features du dump (noms exacts du dump)
    CLES = {"chest": ("chestbreadth", "chestdepth"),
            "waist": ("waistbreadth", "waistdepth"),
            "hips": ("hipbreadth", "buttockdepth")}

    def feats(r, key):
        f = r["features"]
        kb, kd = CLES[key]
        return f.get(f"{kb}_body"), f.get(f"{kd}_body"), f.get(kb), f.get(kd)

    erreurs_base = {k: [] for k in cibles}
    erreurs_loo = {k: [] for k in cibles}
    details = {k: [] for k in cibles}

    X_all = []
    for r in rows:
        y = {}
        x = {}
        for k in cibles:
            wb, db, wg, dg = feats(r, k)
            if None in (wb, db):
                continue
            pe = ramanujan(max(wb, db), min(wb, db))
            x[k] = [pe, wg or wb]     # ellipse + largeur globale habillée
            y[k] = r["attendu"][k]
        X_all.append((r, x, y))

    # LOO par cible
    for k in cibles:
        idx_valides = [i for i, (_, x, y) in enumerate(X_all) if k in x and k in y]
        for i_test in idx_valides:
            Xtr, Ytr = [], []
            for j in idx_valides:
                if j == i_test:
                    continue
                _, xj, yj = X_all[j]
                Xtr.append(xj[k])
                Ytr.append(yj[k])
            _, xt, yt = X_all[i_test]
            A = np.array(Xtr)
            b = np.array(Ytr)
            # petite régression ridge pour stabilité (n petit)
            lam = 1e-2 * len(Xtr) * np.eye(A.shape[1])
            coef = np.linalg.solve(A.T @ A + lam, A.T @ b)
            pred = float(np.array(xt[k]) @ coef)

            # baseline : mesure pipeline (déjà ellipse+corrections prod)
            r_test = X_all[i_test][0]
            base = r_test["mesures"][k]

            erreurs_base[k].append(abs(base - yt[k]))
            erreurs_loo[k].append(abs(pred - yt[k]))
            details[k].append((r_test["id"], round(base - yt[k], 1), round(pred - yt[k], 1)))

    print(f"{'mesure':8s} {'MAE prod':>9s} {'MAE LOO':>9s} {'gain':>7s}")
    for k in cibles:
        mb = st.mean(erreurs_base[k])
        ml = st.mean(erreurs_loo[k])
        gain = 100 * (mb - ml) / mb if mb else 0
        print(f"{k:8s} {mb:8.2f}cm {ml:8.2f}cm {gain:+6.1f}%")

    print("\n=== détail par sujet (erreur signée prod -> loo) ===")
    for k in cibles:
        ligne = ", ".join(f"s{sid}:{e0:+.0f}->{e1:+.1f}" for sid, e0, e1 in details[k])
        print(f"  {k}: {ligne}")


if __name__ == "__main__":
    main()
