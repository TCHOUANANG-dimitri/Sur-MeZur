#!/usr/bin/env python3
"""
Analyse de profondeur des erreurs du vrai pipeline + tests de corrections.

Ce script prend les resultats reels du vrai pipeline (test_real_pipeline_results.json)
et :
1. Identifie les biais systematiques par mesure
2. Teste des corrections de calibration simples
3. Teste des corrections basees sur le poids/morphologie
4. Teste des ameliorations du pipeline (features, echelle)
5. Documente tout dans freebuff.md
"""
from __future__ import annotations

import json
import math
import statistics as st
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
RESULTS_JSON = Path(__file__).with_name("test_real_pipeline_results.json")
SUJETS_JSON = Path(__file__).with_name("sujets.json")
FREEBUFF_MD = RACINE / "freebuff.md"

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]
TOUTES = TOURS + LONGUEURS


def charger_donnees():
    resultats = json.loads(RESULTS_JSON.read_text(encoding="utf-8"))
    sujets = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))
    return resultats, sujets


def mae(errors):
    return st.mean(errors) if errors else float("nan")


def median_error(errors):
    return st.median(errors) if errors else float("nan")


def std_error(errors):
    return st.stdev(errors) if len(errors) > 1 else 0.0


def analyse_biais_systematique(resultats, sujets):
    """Identifie les biais systematiques par mesure."""
    print("=" * 80)
    print("1. ANALYSE DES BIAIS SYSTEMATIQUES")
    print("=" * 80)

    donnees_sujets = {s["id"]: s for s in sujets["sujets"]}

    # Collecter les erreurs signees par mesure
    ecarts = {k: [] for k in TOUTES}
    for d in resultats["details_sujets"]:
        for cle, m in d["mesures"].items():
            ecarts[cle].append(m["erreur_signe"])

    print(f"\n{'Mesure':15} {'Bias':>8} {'MAE':>8} {'Median':>8} {'Std':>8} {'N':>4}  Interpretation")
    print("-" * 80)

    biais = {}
    for cle in TOUTES:
        vals = ecarts[cle]
        if not vals:
            continue
        bias = st.mean(vals)
        mae_val = st.mean([abs(v) for v in vals])
        med = st.median([abs(v) for v in vals])
        std = st.stdev(vals) if len(vals) > 1 else 0
        biais[cle] = bias

        # Interpretation
        if abs(bias) < 0.5:
            interp = "BIAIS NEGLIGEABLE"
        elif abs(bias) < 1.5:
            interp = "BIAIS FAIBLE"
        elif abs(bias) < 3.0:
            interp = "BIAIS MODERE"
        else:
            interp = "BIAIS FORT"

        signe = "+" if bias > 0 else ""
        print(f"  {cle:13} {signe}{bias:6.2f}  {mae_val:6.2f}  {med:6.2f}  {std:6.2f}  {len(vals):4d}  {interp}")

    return biais


def test_corrections_calibration(resultats, sujets, biais):
    """Teste des corrections de calibration simples."""
    print("\n" + "=" * 80)
    print("2. TEST DE CORRECTIONS DE CALIBRATION SIMPLES")
    print("=" * 80)

    donnees_sujets = {s["id"]: s for s in sujets["sujets"]}

    # Correction 1: Biais additif (corrige le biais moyen)
    print("\n--- Correction 1: Biais additif (soustraire le bias moyen) ---")
    erreurs_corrigees = {k: [] for k in TOUTES}
    for d in resultats["details_sujets"]:
        for cle, m in d["mesures"].items():
            if cle in biais:
                calc_corrige = m["calcule"] - biais[cle]
                erreur_corr = abs(calc_corrige - m["attendu"])
                erreurs_corrigees[cle].append(erreur_corr)

    print(f"\n{'Mesure':15} {'Avant':>8} {'Apres':>8} {'Gain':>8}")
    print("-" * 50)
    total_avant = []
    total_apres = []
    for cle in TOUTES:
        avant_vals = [abs(d["mesures"][cle]["erreur_signe"]) for d in resultats["details_sujets"]
                     if cle in d["mesures"]]
        avant = mae(avant_vals)
        apres = mae(erreurs_corrigees[cle])
        if not math.isnan(avant) and not math.isnan(apres):
            gain = avant - apres
            total_avant.append(avant)
            total_apres.append(apres)
            marque = " *" if gain > 0.5 else ""
            print(f"  {cle:13} {avant:6.2f}  {apres:6.2f}  {gain:+6.2f}{marque}")
    if total_avant:
        print(f"  {'MOYENNE':13} {st.mean(total_avant):6.2f}  {st.mean(total_apres):6.2f}  "
              f"{st.mean(total_avant) - st.mean(total_apres):+6.2f}")

    # Correction 2: Facteur proportionnel
    print("\n--- Correction 2: Facteur proportionnel (multiplicateur) ---")
    facteurs = {}
    for cle in TOUTES:
        ratios = []
        for d in resultats["details_sujets"]:
            if cle in d["mesures"]:
                m = d["mesures"][cle]
                if m["attendu"] > 0:
                    ratios.append(m["attendu"] / m["calcule"])
        if ratios:
            facteurs[cle] = st.median(ratios)

    erreurs_facteur = {k: [] for k in TOUTES}
    for d in resultats["details_sujets"]:
        for cle, m in d["mesures"].items():
            if cle in facteurs:
                calc_corrige = m["calcule"] * facteurs[cle]
                erreur_corr = abs(calc_corrige - m["attendu"])
                erreurs_facteur[cle].append(erreur_corr)

    print(f"\n{'Mesure':15} {'Facteur':>8} {'Avant':>8} {'Apres':>8} {'Gain':>8}")
    print("-" * 60)
    total_avant2 = []
    total_apres2 = []
    for cle in TOUTES:
        avant_vals = [abs(d["mesures"][cle]["erreur_signe"]) for d in resultats["details_sujets"]
                     if cle in d["mesures"]]
        avant = mae(avant_vals)
        apres = mae(erreurs_facteur[cle])
        if not math.isnan(avant) and not math.isnan(apres) and cle in facteurs:
            gain = avant - apres
            total_avant2.append(avant)
            total_apres2.append(apres)
            marque = " *" if gain > 0.5 else ""
            print(f"  {cle:13} {facteurs[cle]:7.4f} {avant:6.2f}  {apres:6.2f}  {gain:+6.2f}{marque}")
    if total_avant2:
        print(f"  {'MOYENNE':13} {'':8} {st.mean(total_avant2):6.2f}  {st.mean(total_apres2):6.2f}  "
              f"{st.mean(total_avant2) - st.mean(total_apres2):+6.2f}")

    return facteurs


def test_corrections_morpho(resultats, sujets):
    """Teste des corrections basees sur le poids/morphologie."""
    print("\n" + "=" * 80)
    print("3. TEST DE CORRECTIONS BASEES SUR LA MORPHOLOGIE")
    print("=" * 80)

    donnees_sujets = {s["id"]: s for s in sujets["sujets"]}

    # Analyser la correlation entre erreur et BMI
    print("\n--- Correlation erreur vs BMI ---")
    for cle in TOUTES:
        bmis = []
        erreurs = []
        for d in resultats["details_sujets"]:
            if cle in d["mesures"]:
                s = donnees_sujets.get(d["id"])
                if s:
                    bmi = s["weight_kg"] / (s["height_cm"] / 100.0) ** 2
                    bmis.append(bmi)
                    erreurs.append(d["mesures"][cle]["erreur_signe"])
        if len(bmis) > 2:
            # Correlation de Pearson
            n = len(bmis)
            mean_bmi = st.mean(bmis)
            mean_err = st.mean(erreurs)
            cov = sum((b - mean_bmi) * (e - mean_err) for b, e in zip(bmis, erreurs)) / n
            std_bmi = (sum((b - mean_bmi) ** 2 for b in bmis) / n) ** 0.5
            std_err = (sum((e - mean_err) ** 2 for e in erreurs) / n) ** 0.5
            r = cov / (std_bmi * std_err) if std_bmi > 0 and std_err > 0 else 0
            print(f"  {cle:15} r={r:+.3f}  (n={n})")

    # Analyser la correlation erreur vs poids
    print("\n--- Correlation erreur vs poids ---")
    for cle in TOUTES:
        poids = []
        erreurs = []
        for d in resultats["details_sujets"]:
            if cle in d["mesures"]:
                s = donnees_sujets.get(d["id"])
                if s:
                    poids.append(s["weight_kg"])
                    erreurs.append(d["mesures"][cle]["erreur_signe"])
        if len(poids) > 2:
            n = len(poids)
            mean_p = st.mean(poids)
            mean_e = st.mean(erreurs)
            cov = sum((p - mean_p) * (e - mean_e) for p, e in zip(poids, erreurs)) / n
            std_p = (sum((p - mean_p) ** 2 for p in poids) / n) ** 0.5
            std_e = (sum((e - mean_e) ** 2 for e in erreurs) / n) ** 0.5
            r = cov / (std_p * std_e) if std_p > 0 and std_e > 0 else 0
            print(f"  {cle:15} r={r:+.3f}  (n={n})")

    # Correction basee sur le poids (regression lineaire)
    print("\n--- Correction par regression lineaire (erreur = a*poids + b) ---")
    corrections_poids = {}
    for cle in TOUTES:
        x = []  # poids
        y = []  # erreur
        for d in resultats["details_sujets"]:
            if cle in d["mesures"]:
                s = donnees_sujets.get(d["id"])
                if s:
                    x.append(s["weight_kg"])
                    y.append(d["mesures"][cle]["erreur_signe"])
        if len(x) < 3:
            continue

        # Regression lineaire simple
        n = len(x)
        mean_x = st.mean(x)
        mean_y = st.mean(y)
        ss_xx = sum((xi - mean_x) ** 2 for xi in x)
        ss_xy = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
        a = ss_xy / ss_xx if ss_xx > 0 else 0
        b = mean_y - a * mean_x
        corrections_poids[cle] = (a, b)

        # Evaluer
        erreurs_corr = []
        for d in resultats["details_sujets"]:
            if cle in d["mesures"]:
                s = donnees_sujets.get(d["id"])
                if s:
                    pred_err = a * s["weight_kg"] + b
                    calc_corrige = d["mesures"][cle]["calcule"] - pred_err
                    erreurs_corr.append(abs(calc_corrige - d["mesures"][cle]["attendu"]))

        avant_vals2 = [abs(d["mesures"][cle]["erreur_signe"])
                     for d in resultats["details_sujets"] if cle in d["mesures"]]
        avant = mae(avant_vals2)
        apres = mae(erreurs_corr)
        gain = avant - apres
        marque = " *" if gain > 0.5 else ""
        print(f"  {cle:15} a={a:+.4f} b={b:+.2f}  avant={avant:.2f} apres={apres:.2f} gain={gain:+.2f}{marque}")

    return corrections_poids


def test_analyse_features(resultats, sujets):
    """Analyse les features du pipeline pour identifier les sources d'erreur."""
    print("\n" + "=" * 80)
    print("4. ANALYSE DES FEATURES DU PIPELINE")
    print("=" * 80)

    donnees_sujets = {s["id"]: s for s in sujets["sujets"]}

    # Analyser les features par sujet
    print("\n--- Features extraites par sujet ---")
    print(f"{'Sujet':>6} {'Sexe':>4} {'Taille':>6} {'Poids':>6} {'BMI':>5} "
          f"{'Biacr':>6} {'ChestB':>7} {'ChestD':>7} {'WaistB':>7} {'WaistD':>7} "
          f"{'HipB':>6} {'ButtD':>6}")
    print("-" * 100)

    for d in resultats["details_sujets"]:
        s = donnees_sujets.get(d["id"])
        if not s:
            continue
        bmi = s["weight_kg"] / (s["height_cm"] / 100.0) ** 2
        f = d.get("features", {})
        print(f"  {d['id']:4d} {d['gender'][0]:>4} {s['height_cm']:6.0f} {s['weight_kg']:6.1f} "
              f"{bmi:5.1f} {f.get('biacromialbreadth', 0):6.1f} "
              f"{f.get('chestbreadth', 0):7.1f} {f.get('chestdepth', 0):7.1f} "
              f"{f.get('waistbreadth', 0):7.1f} {f.get('waistdepth', 0):7.1f} "
              f"{f.get('hipbreadth', 0):6.1f} {f.get('buttockdepth', 0):6.1f}")

    # Analyser les features _body vs habillees
    print("\n--- Epaisseur de vetement estimee (habille - body) ---")
    print(f"{'Sujet':>6} {'Sexe':>4} {'Chest_t':>8} {'Waist_t':>8} {'Hip_t':>8} {'Moy_t':>8}")
    print("-" * 50)

    for d in resultats["details_sujets"]:
        f = d.get("features", {})
        if not f:
            continue

        chest_t = (f.get("chestbreadth", 0) - f.get("chestbreadth_body", 0)) / 2
        waist_t = (f.get("waistbreadth", 0) - f.get("waistbreadth_body", 0)) / 2
        hip_t = (f.get("hipbreadth", 0) - f.get("hipbreadth_body", 0)) / 2
        moy_t = (chest_t + waist_t + hip_t) / 3

        print(f"  {d['id']:4d} {d['gender'][0]:>4} {chest_t:8.2f} {waist_t:8.2f} "
              f"{hip_t:8.2f} {moy_t:8.2f}")

    # Analyser les erreurs par rapport aux features
    print("\n--- Correlation erreur vs features ---")
    for cle in ["chest", "waist", "hips", "biceps", "ankle"]:
        if cle == "chest":
            feat_name = "chestbreadth"
        elif cle == "waist":
            feat_name = "waistbreadth"
        elif cle == "hips":
            feat_name = "hipbreadth"
        elif cle == "biceps":
            feat_name = "biacromialbreadth"  # proxy
        elif cle == "ankle":
            feat_name = "crotchheight"
        else:
            continue

        vals = []
        errs = []
        for d in resultats["details_sujets"]:
            if cle in d["mesures"] and feat_name in d.get("features", {}):
                vals.append(d["features"][feat_name])
                errs.append(d["mesures"][cle]["erreur_signe"])

        if len(vals) > 2:
            n = len(vals)
            mean_v = st.mean(vals)
            mean_e = st.mean(errs)
            cov = sum((v - mean_v) * (e - mean_e) for v, e in zip(vals, errs)) / n
            std_v = (sum((v - mean_v) ** 2 for v in vals) / n) ** 0.5
            std_e = (sum((e - mean_e) ** 2 for e in errs) / n) ** 0.5
            r = cov / (std_v * std_e) if std_v > 0 and std_e > 0 else 0
            print(f"  {cle:15} vs {feat_name:20} r={r:+.3f}")


def test_ankle_detaille(resultats, sujets):
    """Analyse detaillee de la cheville (erreur systematique de -4cm)."""
    print("\n" + "=" * 80)
    print("5. ANALYSE DETAILLEE DE LA CHEVILLE (erreur systematique)")
    print("=" * 80)

    donnees_sujets = {s["id"]: s for s in sujets["sujets"]}

    print("\n--- Donnees brutes de la cheville ---")
    print(f"{'Sujet':>6} {'Attendu':>8} {'Calcule':>8} {'Erreur':>8} {'Poids':>6} {'Taille':>6} "
          f"{'CrotchH':>8} {'Ratio':>8}")
    print("-" * 70)

    erreurs_ankle = []
    for d in resultats["details_sujets"]:
        if "ankle" not in d["mesures"]:
            continue
        s = donnees_sujets.get(d["id"])
        if not s:
            continue
        m = d["mesures"]["ankle"]
        f = d.get("features", {})
        crotch_h = f.get("crotchheight", 0)
        ratio = m["attendu"] / m["calcule"] if m["calcule"] > 0 else 0
        erreurs_ankle.append({
            "id": d["id"],
            "attendu": m["attendu"],
            "calcule": m["calcule"],
            "erreur": m["erreur_signe"],
            "poids": s["weight_kg"],
            "taille": s["height_cm"],
            "crotch_h": crotch_h,
            "ratio": ratio,
        })
        print(f"  {d['id']:4d} {m['attendu']:8.1f} {m['calcule']:8.1f} "
              f"{m['erreur_signe']:+8.1f} {s['weight_kg']:6.1f} {s['height_cm']:6.0f} "
              f"{crotch_h:8.1f} {ratio:8.3f}")

    # La cheville est predite par le modele Ridge V3
    # Elle depend des 12 features + 4 derives
    # L'erreur est toujours negative (sous-estimation)
    # C'est probablement un biais de population (ANSUR = militaires US)

    # Calculer le facteur de correction
    ratios = [e["ratio"] for e in erreurs_ankle]
    print(f"\n  Ratio moyen (attendu/calcule) : {st.mean(ratios):.3f}")
    print(f"  Ratio median                 : {st.median(ratios):.3f}")
    print(f"  Ecart-type                   : {st.stdev(ratios):.3f}")

    # Correction par facteur
    facteur = st.median(ratios)
    erreurs_corr = [abs(e["calcule"] * facteur - e["attendu"]) for e in erreurs_ankle]
    print(f"\n  MAE avant correction : {st.mean([abs(e['erreur']) for e in erreurs_ankle]):.2f} cm")
    print(f"  MAE apres correction : {st.mean(erreurs_corr):.2f} cm")
    print(f"  Facteur de correction : {facteur:.4f}")

    return facteur


def test_sleeve_detaille(resultats, sujets):
    """Analyse detaillee de la manche (erreur de -3cm)."""
    print("\n" + "=" * 80)
    print("6. ANALYSE DETAILLEE DE LA MANCHE (erreur de -3cm)")
    print("=" * 80)

    donnees_sujets = {s["id"]: s for s in sujets["sujets"]}

    print("\n--- Donnees brutes de la manche ---")
    print(f"{'Sujet':>6} {'Attendu':>8} {'Calcule':>8} {'Erreur':>8} {'Taille':>6} "
          f"{'Ratio':>8}")
    print("-" * 50)

    erreurs_sleeve = []
    for d in resultats["details_sujets"]:
        if "sleeve_length" not in d["mesures"]:
            continue
        s = donnees_sujets.get(d["id"])
        if not s:
            continue
        m = d["mesures"]["sleeve_length"]
        ratio = m["attendu"] / m["calcule"] if m["calcule"] > 0 else 0
        erreurs_sleeve.append({
            "id": d["id"],
            "attendu": m["attendu"],
            "calcule": m["calcule"],
            "erreur": m["erreur_signe"],
            "taille": s["height_cm"],
            "ratio": ratio,
        })
        print(f"  {d['id']:4d} {m['attendu']:8.1f} {m['calcule']:8.1f} "
              f"{m['erreur_signe']:+8.1f} {s['height_cm']:6.0f} {ratio:8.3f}")

    ratios = [e["ratio"] for e in erreurs_sleeve]
    print(f"\n  Ratio moyen : {st.mean(ratios):.3f}")
    print(f"  Ratio median : {st.median(ratios):.3f}")

    facteur = st.median(ratios)
    erreurs_corr = [abs(e["calcule"] * facteur - e["attendu"]) for e in erreurs_sleeve]
    print(f"  MAE avant : {st.mean([abs(e['erreur']) for e in erreurs_sleeve]):.2f} cm")
    print(f"  MAE apres : {st.mean(erreurs_corr):.2f} cm")

    return facteur


def test_biceps_detaille(resultats, sujets):
    """Analyse detaillee des biceps (erreur de -2.3cm)."""
    print("\n" + "=" * 80)
    print("7. ANALYSE DETAILLEE DES BICEPS (erreur de -2.3cm)")
    print("=" * 80)

    donnees_sujets = {s["id"]: s for s in sujets["sujets"]}

    print("\n--- Donnees brutes des biceps ---")
    print(f"{'Sujet':>6} {'Attendu':>8} {'Calcule':>8} {'Erreur':>8} {'Poids':>6}")
    print("-" * 40)

    erreurs_biceps = []
    for d in resultats["details_sujets"]:
        if "biceps" not in d["mesures"]:
            continue
        s = donnees_sujets.get(d["id"])
        if not s:
            continue
        m = d["mesures"]["biceps"]
        erreurs_biceps.append({
            "id": d["id"],
            "attendu": m["attendu"],
            "calcule": m["calcule"],
            "erreur": m["erreur_signe"],
            "poids": s["weight_kg"],
        })
        print(f"  {d['id']:4d} {m['attendu']:8.1f} {m['calcule']:8.1f} "
              f"{m['erreur_signe']:+8.1f} {s['weight_kg']:6.1f}")

    # Correlation erreur vs poids
    poids = [e["poids"] for e in erreurs_biceps]
    errs = [e["erreur"] for e in erreurs_biceps]
    n = len(poids)
    mean_p = st.mean(poids)
    mean_e = st.mean(errs)
    cov = sum((p - mean_p) * (e - mean_e) for p, e in zip(poids, errs)) / n
    std_p = (sum((p - mean_p) ** 2 for p in poids) / n) ** 0.5
    std_e = (sum((e - mean_e) ** 2 for e in errs) / n) ** 0.5
    r = cov / (std_p * std_e) if std_p > 0 and std_e > 0 else 0
    print(f"\n  Correlation erreur vs poids : r={r:+.3f}")
    print(f"  Bias moyen : {st.mean(errs):+.2f} cm")

    # Correction par biais simple
    facteur_correction = 1.0 + (st.mean(errs) / st.mean([e["attendu"] for e in erreurs_biceps]))
    print(f"  Facteur de correction : {facteur_correction:.4f}")

    return facteur_correction


def genere_rapport_complet(resultats, sujets, biais, facteurs, corrections_poids,
                           facteur_ankle, facteur_sleeve, facteur_biceps):
    """Genere le rapport complet dans freebuff.md."""
    print("\n" + "=" * 80)
    print("8. GENERATION DU RAPPORT freebuff.md")
    print("=" * 80)

    donnees_sujets = {s["id"]: s for s in sujets["sujets"]}

    # Calculer les MAE avant/apres toutes les corrections
    erreurs_avant = {k: [] for k in TOUTES}
    erreurs_apres_bias = {k: [] for k in TOUTES}
    erreurs_apres_facteur = {k: [] for k in TOUTES}
    erreurs_apres_morpho = {k: [] for k in TOUTES}

    for d in resultats["details_sujets"]:
        for cle, m in d["mesures"].items():
            erreurs_avant[cle].append(abs(m["erreur_signe"]))

            # Correction bias
            calc = m["calcule"] - biais.get(cle, 0)
            erreurs_apres_bias[cle].append(abs(calc - m["attendu"]))

            # Correction facteur
            if cle in facteurs:
                calc = m["calcule"] * facteurs[cle]
                erreurs_apres_facteur[cle].append(abs(calc - m["attendu"]))

            # Corrections specifiques
            calc = m["calcule"]
            if cle == "ankle":
                calc *= facteur_ankle
            elif cle == "sleeve_length":
                calc *= facteur_sleeve
            elif cle == "biceps":
                calc *= facteur_biceps
            elif cle in biais:
                calc -= biais[cle]
            erreurs_apres_morpho[cle].append(abs(calc - m["attendu"]))

    # Generer le rapport
    rapport = []
    rapport.append("# Analyse Complete du Pipeline de Mesure - Sur-MeZur\n")
    rapport.append("## Resultats du VRAI pipeline sur les 13 photos reelles\n")
    rapport.append("### Conditions du test\n")
    rapport.append("- **Pipeline** : MediaPipe + MobileSAM + Modele V3 (production)")
    rapport.append("- **Photos** : 13 paires (face + profil) depuis le terrain")
    rapport.append("- **Mesures** :.au metre ruban par le tailleur")
    rapport.append("- **Vision** : MobileSAM (CPU)")
    rapport.append("- **Modele** : Ridge V3, entraine sur ANSUR II")
    rapport.append("")

    rapport.append("### Resultats de base (pipeline non modifie)\n")
    rapport.append(f"| Mesure | MAE (cm) | Bias (cm) | Statut |")
    rapport.append(f"|--------|----------|-----------|--------|")
    for cle in TOUTES:
        vals_avant = erreurs_avant[cle]
        if vals_avant:
            mae_avant = st.mean(vals_avant)
            bias = biais.get(cle, 0)
            statut = "OK" if mae_avant <= 1.0 else ("PRESQUE" if mae_avant <= 2.0 else "ERREUR")
            rapport.append(f"| {cle} | {mae_avant:.2f} | {bias:+.2f} | {statut} |")
    rapport.append(f"| **MOYENNE** | **{st.mean([st.mean(v) for v in erreurs_avant.values() if v]):.2f}** | | |")
    rapport.append("")

    rapport.append("### Erreurs par sujet\n")
    rapport.append(f"| Sujet | Sexe | Taille | Poids | MAE (cm) |")
    rapport.append(f"|-------|------|--------|-------|----------|")
    for d in resultats["details_sujets"]:
        s = donnees_sujets.get(d["id"])
        if not s or not d["mesures"]:
            continue
        mae_sujet = st.mean([m["erreur_abs"] for m in d["mesures"].values()])
        rapport.append(f"| {d['id']} | {d['gender'][0]} | {s['height_cm']} | {s['weight_kg']:.1f} | {mae_sujet:.2f} |")
    rapport.append("")

    rapport.append("### Corrections teste\n")
    rapport.append("#### 1. Correction par biais additif\n")
    rapport.append("On soustrait le biais moyen de chaque mesure.\n")
    rapport.append("| Mesure | Avant | Apres | Gain |")
    rapport.append("|--------|-------|-------|------|")
    total_av = []
    total_ap = []
    for cle in TOUTES:
        if erreurs_avant[cle] and erreurs_apres_bias[cle]:
            av = st.mean(erreurs_avant[cle])
            ap = st.mean(erreurs_apres_bias[cle])
            total_av.append(av)
            total_ap.append(ap)
            rapport.append(f"| {cle} | {av:.2f} | {ap:.2f} | {av-ap:+.2f} |")
    if total_av:
        rapport.append(f"| **MOYENNE** | **{st.mean(total_av):.2f}** | **{st.mean(total_ap):.2f}** | **{st.mean(total_av)-st.mean(total_ap):+.2f}** |")
    rapport.append("")

    rapport.append("#### 2. Correction par facteur proportionnel\n")
    rapport.append("On multiplie par le ratio median (attendu/calcule).\n")
    rapport.append("| Mesure | Facteur | Avant | Apres | Gain |")
    rapport.append("|--------|---------|-------|-------|------|")
    total_av2 = []
    total_ap2 = []
    for cle in TOUTES:
        if erreurs_avant[cle] and cle in facteurs:
            av = st.mean(erreurs_avant[cle])
            ap = st.mean(erreurs_apres_facteur[cle])
            total_av2.append(av)
            total_ap2.append(ap)
            rapport.append(f"| {cle} | {facteurs[cle]:.4f} | {av:.2f} | {ap:.2f} | {av-ap:+.2f} |")
    if total_av2:
        rapport.append(f"| **MOYENNE** | | **{st.mean(total_av2):.2f}** | **{st.mean(total_ap2):.2f}** | **{st.mean(total_av2)-st.mean(total_ap2):+.2f}** |")
    rapport.append("")

    rapport.append("#### 3. Corrections specifiques par mesure\n")
    rapport.append(f"- **Ankle** : facteur {facteur_ankle:.4f} (correction systematique)")
    rapport.append(f"- **Sleeve** : facteur {facteur_sleeve:.4f} (correction systematique)")
    rapport.append(f"- **Biceps** : facteur {facteur_biceps:.4f} (correction systematique)")
    rapport.append(f"- **Autres** : biais additif")
    rapport.append("")

    rapport.append("| Mesure | Avant | Apres | Gain |")
    rapport.append("|--------|-------|-------|------|")
    total_av3 = []
    total_ap3 = []
    for cle in TOUTES:
        if erreurs_avant[cle] and erreurs_apres_morpho[cle]:
            av = st.mean(erreurs_avant[cle])
            ap = st.mean(erreurs_apres_morpho[cle])
            total_av3.append(av)
            total_ap3.append(ap)
            rapport.append(f"| {cle} | {av:.2f} | {ap:.2f} | {av-ap:+.2f} |")
    if total_av3:
        rapport.append(f"| **MOYENNE** | **{st.mean(total_av3):.2f}** | **{st.mean(total_ap3):.2f}** | **{st.mean(total_av3)-st.mean(total_ap3):+.2f}** |")
    rapport.append("")

    # Bilan final
    nb_av = sum(1 for v in total_av3 if v > 1.0)
    nb_ap = sum(1 for cle in TOUTES if erreurs_apres_morpho[cle] and st.mean(erreurs_apres_morpho[cle]) <= 1.0)

    rapport.append("### Bilan final\n")
    rapport.append(f"- **Avant corrections** : MAE moyenne = {st.mean(total_av):.2f} cm")
    rapport.append(f"- **Apres corrections** : MAE moyenne = {st.mean(total_ap3):.2f} cm")
    rapport.append(f"- **Gain** : {st.mean(total_av) - st.mean(total_ap3):.2f} cm ({(st.mean(total_av) - st.mean(total_ap3)) / st.mean(total_av) * 100:.1f}%)")
    rapport.append(f"- **Mesures < 1 cm** : {nb_ap}/{len(TOUTES)}")
    rapport.append("")

    rapport.append("### Recommandations\n")
    rapport.append("1. **Corriger le biais de la cheville** : facteur {0:.4f}".format(facteur_ankle))
    rapport.append("2. **Corriger le biais de la manche** : facteur {0:.4f}".format(facteur_sleeve))
    rapport.append("3. **Corriger le biais des biceps** : facteur {0:.4f}".format(facteur_biceps))
    rapport.append("4. **Corriger le biais du cou** : {0:+.2f} cm".format(biais.get("neck", 0)))
    rapport.append("5. **Collecter 50+ sujets** pour calibrer les facteurs sur la population locale")
    rapport.append("6. **Tester la capture guidee** : tenue ajustee, pose correcte, fond degage")
    rapport.append("")

    rapport.append("### Données brutes\n")
    rapport.append("Voir `test_real_pipeline_results.json` pour les details complets.\n")

    # Ecrire le rapport
    FREEBUFF_MD.write_text("\n".join(rapport), encoding="utf-8")
    print(f"\nRapport ecrit dans {FREEBUFF_MD}")

    return nb_ap


def main():
    print("=" * 80)
    print("ANALYSE COMPL_DU PIPELINE REEL - SUR-MEZUR")
    print("=" * 80)

    resultats, sujets = charger_donnees()

    # 1. Analyse des biais
    biais = analyse_biais_systematique(resultats, sujets)

    # 2. Corrections de calibration
    facteurs = test_corrections_calibration(resultats, sujets, biais)

    # 3. Corrections morphologiques
    corrections_poids = test_corrections_morpho(resultats, sujets)

    # 4. Analyse des features
    test_analyse_features(resultats, sujets)

    # 5. Analyse detaillee de la cheville
    facteur_ankle = test_ankle_detaille(resultats, sujets)

    # 6. Analyse detaillee de la manche
    facteur_sleeve = test_sleeve_detaille(resultats, sujets)

    # 7. Analyse detaillee des biceps
    facteur_biceps = test_biceps_detaille(resultats, sujets)

    # 8. Generer le rapport
    nb_ap = genere_rapport_complet(
        resultats, sujets, biais, facteurs, corrections_poids,
        facteur_ankle, facteur_sleeve, facteur_biceps
    )

    # Recommandations finales
    print("\n" + "=" * 80)
    print("RECOMMANDATIONS FINALES")
    print("=" * 80)
    print(f"\nApres toutes les corrections, {nb_ap}/{len(TOUTES)} mesures sont sous 1 cm.")
    print("\nPour atteindre <1 cm pour TOUTES les mesures :")
    print("  1. Corriger les biais systematiques (facteurs ci-dessus)")
    print("  2. Collecter 50+ sujets camerounais pour calibrer")
    print("  3. Tester la capture guidee (tenue ajustee)")
    print("  4. Envisager un modele local (pas seulement ANSUR)")


if __name__ == "__main__":
    main()
