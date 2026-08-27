"""
Piste "Anny (Naver Labs) + clad-body" (RAPPORT_PROJET.md, section 6bis,
"Recherche d'architecture alternative") : teste si un modele parametrique
WHO-calibre (Anny, licence Apache 2.0, meme lignee MakeHuman que notre
avatar) predit mieux nos mensurations reelles que le pipeline actuel,
EN NE LUI DONNANT QUE CE QUE LE CLIENT SAISIT DEJA -- taille, poids, sexe.
Rien d'autre : pas de photo, pas de largeur/profondeur extraite.

C'est le test le plus dur et le plus honnete de cette piste : on demande a
Anny de deviner un corps "moyen pour ce gabarit" (comme le fait deja notre
correction BMI pour chest/hips/waist hommes) mais a partir d'un modele de
forme beaucoup plus riche, calibre sur des statistiques de population OMS
plutot qu'ANSUR (population militaire americaine).

Methode :
  1. Anny expose des parametres phenotype normalises [0,1] (gender, age,
     muscle, weight, height, proportions, cupsize, firmness, + 3 poids
     d'origine ethnique) -- pas d'unites physiques directes.
  2. On fixe gender (connu), age=0.8 (adulte, valeur par defaut suggeree
     par AnnyInverter pour la convergence), et on laisse muscle/proportions/
     cupsize/firmness/origine a leur valeur moyenne 0.5 -- ce sont des
     inconnues, les figer a la moyenne est la version honnete de "on ne
     sait rien d'autre".
  3. SEULS "height" et "weight" sont optimises par descente de gradient
     (clad_body.measure.measure_grad + Adam, motif documente dans le
     README de clad-body) pour que le mesh reproduise exactement la taille
     et le poids reels du sujet -- 2 parametres libres pour 2 contraintes,
     probleme bien pose, aucune triche possible sur les autres mesures.
  4. On lit ensuite TOUTES les mesures ISO 8559-1 du mesh resultant
     (clad_body.measure.measure, preset "fitted") et on les compare a la
     verite terrain -- ce sont des mesures qu'Anny n'a JAMAIS vues.

Donnees : les 20 sujets reels deja caches par exp13_gp_vs_lineaire.py
(aucune photo relancee) -- seuls height_cm/weight_kg/gender/verite terrain
sont utilises ici, pas les features de vision (Anny ne les consomme pas).

Environnement : venv JETABLE separe (pas le venv de production), cree
uniquement pour ce test -- anny/clad-body n'ont pas leur place dans les
dependances de prod tant que la piste n'est pas confirmee.

Usage (depuis le venv jetable) :
    venv_anny\\Scripts\\python.exe ml/bench/experiments/exp14_anny_clad_body.py
"""
from __future__ import annotations

import statistics as st
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exp13_gp_vs_lineaire import charger_tous  # noqa: E402

from clad_body.load.anny import load_anny_from_params  # noqa: E402
from clad_body.measure import measure, measure_grad  # noqa: E402

# Correspondance nomenclature clad-body (ISO 8559-1) -> la notre.
CLE_VERS_MESURE = {
    "neck_cm": "neck",
    "bust_cm": "chest",
    "waist_cm": "waist",
    "hip_cm": "hips",
    "upperarm_cm": "biceps",
    "thigh_cm": "thigh",
    "wrist_cm": "wrist",
    "sleeve_length_cm": "sleeve_length",
    "inseam_cm": "inseam",
    "shoulder_width_cm": "shoulder",
    "back_neck_to_waist_cm": "back_length",
}

# Cles differentiables (measure_grad) parmi celles ci-dessus -- le reste
# (wrist_cm notamment) est lu apres coup via measure() non-differentiable.
CLES_GRAD = [k for k in CLE_VERS_MESURE if k in {
    "height_cm", "bust_cm", "waist_cm", "hip_cm", "thigh_cm", "upperarm_cm",
    "shoulder_width_cm", "inseam_cm", "sleeve_length_cm", "neck_cm", "mass_kg",
}]


def ajuster_taille_poids(height_cm: float, weight_kg: float, gender: str, n_steps: int = 300):
    """Optimise SEULEMENT height/weight (Adam) pour matcher taille+poids
    reels ; tout le reste du phenotype reste a la moyenne (0.5)."""
    is_male = (gender or "").lower().startswith("m")
    params = {
        "gender": 0.0 if is_male else 1.0,
        "age": 0.8,
        "muscle": 0.5, "weight": 0.5, "height": 0.5,
        "proportions": 0.5, "cupsize": 0.5, "firmness": 0.5,
        "african": 0.5, "asian": 0.5, "caucasian": 0.5,
    }
    body = load_anny_from_params(params, requires_grad=False)
    body.phenotype_kwargs["height"].requires_grad_(True)
    body.phenotype_kwargs["weight"].requires_grad_(True)

    opt = torch.optim.Adam(
        [body.phenotype_kwargs["height"], body.phenotype_kwargs["weight"]], lr=0.08
    )
    for _ in range(n_steps):
        opt.zero_grad()
        m = measure_grad(body, only=["height_cm", "mass_kg"])
        loss = ((m["height_cm"] - height_cm) / height_cm) ** 2 + \
               ((m["mass_kg"] - weight_kg) / weight_kg) ** 2
        loss.backward()
        opt.step()
        with torch.no_grad():
            body.phenotype_kwargs["height"].clamp_(0.01, 0.99)
            body.phenotype_kwargs["weight"].clamp_(0.01, 0.99)

    h_fit = float(body.phenotype_kwargs["height"].detach())
    w_fit = float(body.phenotype_kwargs["weight"].detach())
    with torch.no_grad():
        m_final = measure_grad(body, only=["height_cm", "mass_kg"])
    return h_fit, w_fit, float(m_final["height_cm"]), float(m_final["mass_kg"])


def mesurer_sujet(height_cm: float, weight_kg: float, gender: str) -> dict:
    is_male = (gender or "").lower().startswith("m")
    h_fit, w_fit, h_reproduit, m_reproduit = ajuster_taille_poids(height_cm, weight_kg, gender)

    params = {
        "gender": 0.0 if is_male else 1.0,
        "age": 0.8,
        "muscle": 0.5, "weight": w_fit, "height": h_fit,
        "proportions": 0.5, "cupsize": 0.5, "firmness": 0.5,
        "african": 0.5, "asian": 0.5, "caucasian": 0.5,
    }
    body_final = load_anny_from_params(params, requires_grad=False)
    mesures = measure(body_final, only=list(CLE_VERS_MESURE))
    return {
        "h_fit_err_cm": abs(h_reproduit - height_cm),
        "m_fit_err_kg": abs(m_reproduit - weight_kg),
        "mesures": {CLE_VERS_MESURE[k]: v for k, v in mesures.items() if k in CLE_VERS_MESURE},
    }


def main() -> None:
    print("Chargement des 20 sujets reels (cache reutilise, aucune photo relancee)...")
    sujets = charger_tous()
    print(f"  {len(sujets)} sujets\n")

    erreurs_anny: dict[str, list[float]] = {v: [] for v in CLE_VERS_MESURE.values()}
    erreurs_brut: dict[str, list[float]] = {v: [] for v in CLE_VERS_MESURE.values()}
    fit_errs_h, fit_errs_m = [], []

    for s in sujets:
        height_cm = s["features"]["stature_m"]  # deja en cm malgre le nom
        weight_kg = s["features"]["weight_kg"]
        gender = s["gender"]
        print(f"  sujet {s['uid']} ({gender}, {height_cm}cm, {weight_kg}kg)...", flush=True)

        res = mesurer_sujet(height_cm, weight_kg, gender)
        fit_errs_h.append(res["h_fit_err_cm"])
        fit_errs_m.append(res["m_fit_err_kg"])

        for mesure_nom, valeur_anny in res["mesures"].items():
            if mesure_nom in s["attendu"]:
                ref = s["attendu"][mesure_nom]
                erreurs_anny[mesure_nom].append(abs(valeur_anny - ref))
            if mesure_nom in s["mesures"] and mesure_nom in s["attendu"]:
                erreurs_brut[mesure_nom].append(abs(s["mesures"][mesure_nom] - s["attendu"][mesure_nom]))

    print(f"\nQualite du fit taille/poids : erreur moyenne taille = {st.mean(fit_errs_h):.2f}cm, "
          f"poids = {st.mean(fit_errs_m):.2f}kg (doit etre proche de 0 : "
          f"2 parametres libres pour 2 contraintes)\n")

    print(f"{'mesure':14} {'n':>3} {'brut (prod)':>12} {'Anny (h+w seuls)':>18} {'gagnant':>10}")
    print("-" * 65)
    resultats = []
    for mesure_nom in CLE_VERS_MESURE.values():
        ea, eb = erreurs_anny[mesure_nom], erreurs_brut[mesure_nom]
        if not ea:
            continue
        mae_anny = st.mean(ea)
        mae_brut = st.mean(eb) if eb else float("nan")
        gagnant = "Anny" if (eb and mae_anny < mae_brut - 0.02) else (
            "prod" if (eb and mae_brut < mae_anny - 0.02) else "egalite/n.a.")
        print(f"{mesure_nom:14} {len(ea):3d} {mae_brut:11.2f}cm {mae_anny:17.2f}cm {gagnant:>10}")
        resultats.append((mesure_nom, mae_brut, mae_anny, gagnant))

    print("-" * 65)
    valides = [(b, a) for _, b, a, _ in resultats if b == b]  # exclut NaN
    if valides:
        moy_brut = st.mean(b for b, _ in valides)
        moy_anny = st.mean(a for _, a in valides)
        print(f"{'MOYENNE':14} {'':>3} {moy_brut:11.2f}cm {moy_anny:17.2f}cm")
    n_gagne = sum(1 for _, _, _, g in resultats if g == "Anny")
    print(f"\nAnny (taille+poids seuls) gagne sur {n_gagne}/{len(resultats)} mesures.")


if __name__ == "__main__":
    main()
