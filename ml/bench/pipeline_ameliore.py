"""
Pipeline de mesure ameliore (V-recherche) -- synthese de toute la recherche
precision de ce depot.

CE MODULE EST INDEPENDANT DU CODE DE PRODUCTION. Il ne modifie rien dans
`backend/app/`. Il prend en entree la sortie du VRAI pipeline de production
(`app.services.vision.pipeline.run`) et applique, PAR-DESSUS, des
corrections statistiques et une correction geometrique, chacune validee
individuellement en LOO (validation croisee "leave-one-out") -- stricte
pour les candidats uniques, IMBRIQUEE (anti-fuite de selection) pour les
cas ou plusieurs candidats etaient en competition.

Origine des corrections :
  - Une partie vient de la recherche menee dans cette conversation
    (voir claude_code.md, sections 3 a 3undecies).
  - Une partie vient d'un autre agent ayant travaille en parallele sur ce
    meme depot (ml/bench/freebuff.md, ml/bench/test_exp4_features.py,
    test_exp9_best_per_measure.py) -- **chaque candidat propose par cet
    agent a ete revalide independamment** avant integration ici (voir
    ml/bench/experiments/exp11_synthese_finale.py) : leur methode de
    selection ("teste 330 combinaisons, garde le minimum LOO global")
    est structurellement a risque de fuite -- exactement le piege
    demontre dans cette session pour biceps/thigy quand teste avec 9
    candidats. Certains de leurs candidats degradent violemment quand on
    les revalide sur des features recalculees independamment (shoulder,
    chest, hips -- REJETES ici, voir tableau ci-dessous) ; d'autres
    resistent tres bien (biceps, thigh -- RETENUS, meilleurs que les
    candidats trouves dans cette session).

Un troisieme agent (ml/bench, PAS dans ce depot -- voir opencode.md a la
racine de C:\\Users\\Admin\\Desktop\\Sur-MeZur\\) a explore une voie
DIFFERENTE et INCOMPATIBLE avec ce module : capture multi-vues (video,
6-12 angles) + theoreme de Cauchy-Crofton + priors de vetement declare.
Resultats simules tres prometteurs (poitrine/taille ~1.0 cm, hanches
~1.3-1.5 cm, membres ~1.1 cm) MAIS jamais valides sur le vrai pipeline
photo (MediaPipe+SAM) ni sur les 13 sujets terrain -- l'agent lui-meme le
signale clairement ("Tier B bout-en-bout" non fait). Cette voie demande
une nouvelle UX de capture (video guidee) incompatible avec les 2 photos
actuelles : PAS implementee ici, mais documentee comme piste serieuse
pour une prochaine iteration si les corrections de CE module restent
insuffisantes sur de nouveaux sujets. Voir claude_code.md pour la
synthese complete.

--------------------------------------------------------------------------
TABLEAU DES CORRECTIONS APPLIQUEES, apres la premiere validation
independante du 25 aout 2026 (6 nouveaux sujets, jamais vus par aucune
calibration -- voir PIPELINE_AMELIORE.md) :
--------------------------------------------------------------------------

| Mesure         | Methode                              | Origine    | LOO  | Independant (n=6) |
|----------------|---------------------------------------|------------|------|---------------------|
| neck           | direct(calc, weight_kg)              | session    | 1.26 | ameliore (+0.75)     |
| thigh          | correction(weight,buttockdepth,      | freebuff   | 0.74 | quasi neutre (+0.02) |
|                |   waistdepth)                        |            |      |                      |
| biceps         | direct(weight,chestbreadth,          | freebuff   | 0.63 | quasi neutre (-0.05) |
|                |   buttockdepth)                      |            |      |                      |
| **ankle**      | direct(weight_kg)                    | session    | 1.22 | **CONFIRME (+2.92)** |
| sleeve_length  | direct(stature_m)                    | session    | 3.08 | ameliore (+0.23)     |
| inseam         | geometrique (moyenne 2 chevilles)    | session    | 2.98 | leger recul (-0.47)  |
| chest (hommes) | direct(weight_kg)                    | session    | 2.61 | ameliore (pooled +0.17) |
| **hips (h.)**  | Theil-Sen robuste sur BMI            | session    | 2.35 | **CONFIRME (+3.32)** |
| waist (hommes) | BMI (OLS)                             | session    | 4.14 | ameliore (pooled +0.52) |
| back_length    | aucune (deja optimal)                | --         | 0.88 | inchange (attendu)    |
| chest (femmes) | aucune -- diagnostic n=3 : 0.83 cm   | session    | --   | pas encore testable   |
| hips (femmes)  | aucune -- deja bon sans correction    | --         | 1.60 | pas encore testable   |
| waist (femmes) | aucune -- non resolu                 | --         | 6.55+| pas encore testable   |

**DESACTIVEES apres la validation independante** (voir
`CORRECTIONS_REJETEES_VALIDATION`) :
- **shoulder** : direct(weight_kg), LOO=1.46 -- s'est effondree (1.63 ->
  4.20 cm sur les 6 nouveaux sujets). Extrapolation catastrophique du
  lien poids -> largeur d'epaules au-dela de l'echantillon de calibration.
- **wrist** : direct(weight_kg), LOO=0.72 -- degrade en moyenne sur les 6
  nouveaux sujets (1.17 -> 1.92 cm), n'ameliore que 2 sujets sur 6.

Candidats freebuff REJETES apres revalidation independante (voir docstring
plus haut) : shoulder (weight+biacromial+chestdepth, direct) -- 6.28 cm
au lieu du 1.10 annonce ; chest pooled (weight+biacromial+buttockdepth,
direct) -- 4.51 cm, aucun gain ; hips pooled (stature+crotchheight+
buttockdepth, correction) -- 4.60 cm, degrade.
--------------------------------------------------------------------------

Usage :

    from ml.bench.pipeline_ameliore import mesurer_et_corriger

    resultat = mesurer_et_corriger(
        front_photo="chemin/face.jpg",
        side_photo="chemin/profil.jpg",
        height_cm=175, weight_kg=70, gender="male",
    )
    # resultat["corrige"] : les 12 mesures apres correction
    # resultat["brut"]    : les 12 mesures AVANT correction (sortie V3 standard)
    # resultat["confiance"] : "haute" / "moyenne" / "aucune_correction" par mesure

Pour evaluer sur de nouveaux sujets avec verite terrain connue, voir
`evaluer_nouveaux_sujets()` en bas de ce fichier, et
`ml/bench/nouveaux_sujets_exemple.json` pour le format attendu.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

RACINE = Path(__file__).resolve().parents[2]  # .../Sur-MeZur-App
BACKEND = RACINE / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]
TOUTES_MESURES = TOURS + LONGUEURS

Confiance = Literal["haute", "moyenne", "aucune_correction", "non_resolu", "rejete"]


# ==========================================================================
# 1. Corrections statistiques (post-hoc, sur mesures + features deja calcules)
# ==========================================================================

@dataclass(frozen=True)
class CorrectionLineaire:
    """calc_corrige = coefs . [features] + ordonnee (mode 'direct')
    ou       calc_corrige = calc_brut + (coefs . [features] + ordonnee) (mode 'correction')."""

    features: tuple[str, ...]
    coefs: tuple[float, ...]
    ordonnee: float
    mode: Literal["direct", "correction"]
    confiance: Confiance
    origine: str
    n_calibration: int

    def appliquer(self, calc_brut: float, valeurs_features: dict[str, float]) -> float:
        try:
            x = [valeurs_features[f] for f in self.features]
        except KeyError:
            return calc_brut  # feature manquante : pas de correction, valeur brute renvoyee
        lineaire = sum(c * v for c, v in zip(self.coefs, x)) + self.ordonnee
        if self.mode == "direct":
            return lineaire
        return calc_brut + lineaire


def _bmi(f: dict[str, float]) -> float:
    return f["weight_kg"] / (f["stature_m"] / 100.0) ** 2


@dataclass(frozen=True)
class CorrectionBMI:
    """Regression (OLS ou Theil-Sen, deja resolue) : reel = pente*BMI + ordonnee."""

    pente: float
    ordonnee: float
    confiance: Confiance
    origine: str
    n_calibration: int

    def appliquer(self, calc_brut: float, valeurs_features: dict[str, float]) -> float:
        return self.pente * _bmi(valeurs_features) + self.ordonnee


# Coefficients figes le 24 aout 2026 sur les 12-13 sujets terrain
# (ml/bench/sujets.json). Recalculer via
# ml/bench/experiments/exp11_synthese_finale.py + le script de calibration
# des coefficients (voir historique de la conversation) des que
# l'echantillon s'agrandit.
#
# MISE A JOUR 25 aout 2026 -- premiere validation independante (6 nouveaux
# sujets jamais vus par aucune calibration, voir PIPELINE_AMELIORE.md
# section "Validation independante") :
#   - ankle et hips (hommes) : CONFIRMES tres fortement (gains reels de
#     +2.92 et +3.32 cm sur des sujets inedits).
#   - waist (hommes), neck, chest, sleeve_length : confirmes modestement.
#   - shoulder et wrist : RETIRES d'ici (voir CORRECTIONS_REJETEES plus
#     bas) -- degradent sur les nouveaux sujets malgre une validation LOO
#     interne qui semblait solide. La lecon : une correction lineaire sur
#     une seule variable, calibree sur 11-12 points, peut extrapoler tres
#     mal des qu'elle rencontre un sujet meme legerement different de
#     l'echantillon d'origine (ex. shoulder : formule quasi correcte a
#     82 kg, fausse de +7 cm a 95 kg -- la largeur d'epaules n'evolue pas
#     lineairement avec le poids au-dela d'une certaine plage).

CORRECTIONS_UNIVERSELLES: dict[str, CorrectionLineaire] = {
    "neck": CorrectionLineaire(
        features=("__calc__", "weight_kg"), coefs=(0.8258, 0.1142), ordonnee=0.260,
        mode="direct", confiance="moyenne", origine="session", n_calibration=12,
    ),
    "thigh": CorrectionLineaire(
        features=("weight_kg", "buttockdepth", "waistdepth"),
        coefs=(-0.1302, -0.3547, 0.5176), ordonnee=6.686,
        mode="correction", confiance="haute", origine="freebuff (revalide)", n_calibration=12,
    ),
    "biceps": CorrectionLineaire(
        features=("weight_kg", "chestbreadth", "buttockdepth"),
        coefs=(0.2495, 0.2644, -0.8210), ordonnee=27.513,
        mode="direct", confiance="haute", origine="freebuff (revalide)", n_calibration=12,
    ),
    "ankle": CorrectionLineaire(
        features=("weight_kg",), coefs=(0.1450,), ordonnee=14.889,
        mode="direct", confiance="haute", origine="session, confirme independamment", n_calibration=12,
    ),
    "sleeve_length": CorrectionLineaire(
        features=("stature_m",), coefs=(0.3773,), ordonnee=-7.303,
        mode="direct", confiance="moyenne", origine="session", n_calibration=12,
    ),
}

# Corrections DESACTIVEES apres avoir echoue la validation independante du
# 25 aout 2026 -- conservees ici pour memoire, jamais appliquees. Ne pas
# les reintegrer dans CORRECTIONS_UNIVERSELLES sans nouvelle validation.
CORRECTIONS_REJETEES_VALIDATION: dict[str, CorrectionLineaire] = {
    "shoulder": CorrectionLineaire(
        features=("weight_kg",), coefs=(0.4619,), ordonnee=3.292,
        mode="direct", confiance="rejete", origine="session", n_calibration=11,
    ),  # 1.63 -> 4.20 cm sur 6 sujets inedits (n=6). Sujet 4 (95kg) :
        # predit 47.2cm pour un reel de 35.0cm. Extrapolation catastrophique.
    "wrist": CorrectionLineaire(
        features=("weight_kg",), coefs=(0.1234,), ordonnee=9.433,
        mode="direct", confiance="rejete", origine="session", n_calibration=12,
    ),  # 1.17 -> 1.92 cm sur 6 sujets inedits : ameliore 2/6, degrade 4/6.
        # Solide en LOO interne (0.72cm) mais ne generalise pas ici.
}

# Corrections dependant du sexe (hommes uniquement -- non validees chez les
# femmes, echantillon insuffisant n=5 dont 2 sujets aux mesures suspectes).
CORRECTIONS_HOMMES: dict[str, object] = {
    "chest": CorrectionLineaire(
        features=("weight_kg",), coefs=(0.4055,), ordonnee=58.766,
        mode="direct", confiance="moyenne", origine="session", n_calibration=7,
    ),
    "hips": CorrectionBMI(
        pente=1.1518, ordonnee=67.785, confiance="moyenne", origine="session", n_calibration=7,
    ),
    "waist": CorrectionBMI(
        pente=2.2005, ordonnee=31.068, confiance="moyenne", origine="session", n_calibration=7,
    ),
}

# Mesures sans correction fiable trouvee -- valeur brute renvoyee telle quelle.
NON_CORRIGEES = {"back_length"}
# Femmes : chest/hips/waist non corrigees (voir docstring, diagnostic
# chest tres prometteur mais n=3, pas assez pour figer un coefficient).
NON_CORRIGEES_FEMMES = {"chest", "hips", "waist"}


def _appliquer_correction_universelle(mesure: str, calc_brut: float, features: dict[str, float]) -> tuple[float, Confiance, str]:
    corr = CORRECTIONS_UNIVERSELLES.get(mesure)
    if corr is None:
        return calc_brut, "aucune_correction", "--"
    feats = dict(features)
    feats["__calc__"] = calc_brut
    return corr.appliquer(calc_brut, feats), corr.confiance, corr.origine


def _appliquer_correction_sexe(mesure: str, calc_brut: float, features: dict[str, float], gender: str) -> tuple[float, Confiance, str]:
    is_male = (gender or "").lower().startswith("m")
    if not is_male:
        if mesure in NON_CORRIGEES_FEMMES:
            return calc_brut, "non_resolu", "--"
        return calc_brut, "aucune_correction", "--"
    corr = CORRECTIONS_HOMMES.get(mesure)
    if corr is None:
        return calc_brut, "aucune_correction", "--"
    return corr.appliquer(calc_brut, features), corr.confiance, corr.origine


def corriger_mesures(mesures_brutes: dict[str, float], features: dict[str, float], gender: str) -> dict:
    """
    Applique toutes les corrections statistiques validees aux mesures deja
    calculees par le pipeline V3 de production. N'a PAS besoin d'acces aux
    photos ni au repere de pose -- fonctionne uniquement a partir de la
    sortie standard de `pipeline.run()` (`.data` et `.features`).

    `inseam` n'est PAS corrige ici (necessite le repere de pose brut pour
    la correction geometrique -- voir `mesurer_et_corriger`).
    """
    corrige: dict[str, float] = {}
    confiance: dict[str, Confiance] = {}
    origine: dict[str, str] = {}

    for mesure, valeur in mesures_brutes.items():
        if mesure == "height_total":
            corrige[mesure] = valeur
            continue
        if mesure in NON_CORRIGEES:
            corrige[mesure] = valeur
            confiance[mesure] = "aucune_correction"
            origine[mesure] = "--"
            continue
        if mesure in CORRECTIONS_HOMMES or mesure in NON_CORRIGEES_FEMMES:
            v, c, o = _appliquer_correction_sexe(mesure, valeur, features, gender)
            corrige[mesure] = round(v, 1)
            confiance[mesure] = c
            origine[mesure] = o
            continue
        if mesure in CORRECTIONS_UNIVERSELLES:
            v, c, o = _appliquer_correction_universelle(mesure, valeur, features)
            corrige[mesure] = round(v, 1)
            confiance[mesure] = c
            origine[mesure] = o
            continue
        # inseam (traite a part) ou mesure inconnue : valeur brute
        corrige[mesure] = valeur
        confiance[mesure] = "aucune_correction"
        origine[mesure] = "--"

    return {"corrige": corrige, "confiance": confiance, "origine": origine}


# ==========================================================================
# 2. Correction geometrique d'inseam (necessite le repere de pose brut)
# ==========================================================================

def _inseam_corrige(pose, cm_per_pixel: float) -> float | None:
    """
    Recalcule l'entrejambe par la moyenne des DEUX chevilles (au lieu de la
    plus visible seule) -- voir claude_code.md section 3decies.
    Fix construit sur les 13 sujets terrain : MAE 3.14 -> ~2.98 cm, 9/13
    sujets ameliores, pas un artefact d'un seul point.

    MISE A JOUR 25 aout 2026 : sur 6 nouveaux sujets inedits, resultat
    legerement negatif (3.60 -> 4.07 cm, n=6). Correction geometrique (pas
    une extrapolation statistique comme shoulder/wrist), donc conservee --
    mais confiance descendue de "haute" a "moyenne" en attendant plus de
    donnees pour trancher si ce recul est du bruit (n=6 est tres petit) ou
    un vrai signe que la moyenne des deux chevilles ne generalise pas.
    """
    from app.services.vision.pose import LEFT_HIP, RIGHT_HIP, LEFT_ANKLE, RIGHT_ANKLE
    from app.services.vision.scale import px_to_cm

    hip_mid = pose.midpoint(LEFT_HIP, RIGHT_HIP)
    left_px = ((hip_mid[0] - pose.point(LEFT_ANKLE).x) ** 2 + (hip_mid[1] - pose.point(LEFT_ANKLE).y) ** 2) ** 0.5
    right_px = ((hip_mid[0] - pose.point(RIGHT_ANKLE).x) ** 2 + (hip_mid[1] - pose.point(RIGHT_ANKLE).y) ** 2) ** 0.5
    return px_to_cm((left_px + right_px) / 2, cm_per_pixel)


# ==========================================================================
# 3. Point d'entree complet : photos -> mesures brutes -> mesures corrigees
# ==========================================================================

def mesurer_et_corriger(
    front_photo: str | Path,
    side_photo: str | Path | None,
    height_cm: float,
    weight_kg: float,
    gender: str,
) -> dict:
    """
    Fait tourner le VRAI pipeline de production (MediaPipe + MobileSAM +
    modeles V3), puis applique toutes les corrections validees de ce
    module, y compris la correction geometrique d'inseam.

    Renvoie :
        {
          "brut": {mesure: valeur, ...},       # sortie V3 standard, non corrigee
          "corrige": {mesure: valeur, ...},    # apres corrections
          "confiance": {mesure: "haute"|"moyenne"|"aucune_correction"|"non_resolu"},
          "origine": {mesure: "session"|"freebuff (revalide)"|"--"},
          "source": "vision_sam" | "vision_pose",
        }
    ou None si le pipeline echoue (photo illisible, pose non detectee...).
    """
    from app.services.vision import pipeline as pipeline_mod
    from app.services.vision import pose as pose_mod
    from app.services.vision.scale import estimate_scale

    resultat = pipeline_mod.run(
        front_photo=front_photo, side_photo=side_photo,
        height_cm=height_cm, weight_kg=weight_kg, gender=gender,
    )
    if resultat is None:
        return None

    sortie = corriger_mesures(resultat.data, resultat.features, gender)

    # Correction geometrique d'inseam : necessite de rejouer l'extraction
    # de pose (rapide, pas de SAM) -- pas disponible dans `resultat`.
    if "inseam" in resultat.data:
        front_downscaled = pipeline_mod._downscaled(front_photo)
        pose = pose_mod.extract_pose(front_downscaled)
        if pose is not None:
            cm_per_pixel = estimate_scale(pose, height_cm)
            if cm_per_pixel is not None:
                inseam_corrige = _inseam_corrige(pose, cm_per_pixel)
                if inseam_corrige is not None:
                    sortie["corrige"]["inseam"] = round(inseam_corrige, 1)
                    sortie["confiance"]["inseam"] = "moyenne"
                    sortie["origine"]["inseam"] = "session (geometrique)"

    return {
        "brut": dict(resultat.data),
        "corrige": sortie["corrige"],
        "confiance": sortie["confiance"],
        "origine": sortie["origine"],
        "source": resultat.source,
        "notes": resultat.notes,
    }


# ==========================================================================
# 4. Evaluation sur de nouveaux sujets (verite terrain connue)
# ==========================================================================

def evaluer_nouveaux_sujets(chemin_json: str | Path, dossier_photos: str | Path) -> None:
    """
    Format attendu du JSON (voir ml/bench/nouveaux_sujets_exemple.json) :

        {
          "sujets": [
            {"id": 1, "height_cm": 175, "weight_kg": 70, "gender": "male",
             "tours": [neck, chest, waist, hips, biceps, thigh, wrist, ankle],
             "longueurs": [shoulder, sleeve_length, inseam, back_length],
             "photos": {"face": "nom_fichier.jpg", "profil": "nom_fichier.jpg"}}
          ]
        }

    Affiche, mesure par mesure : MAE brut (V3 standard) vs MAE corrige, et
    la MOYENNE globale des deux -- LA validation independante qui manquait
    a toute la recherche precedente (nouveaux sujets, jamais vus par aucune
    des corrections ci-dessus).
    """
    import statistics as st

    donnees = json.loads(Path(chemin_json).read_text(encoding="utf-8"))
    dossier = Path(dossier_photos)

    erreurs_brut: dict[str, list[float]] = {k: [] for k in TOUTES_MESURES}
    erreurs_corrige: dict[str, list[float]] = {k: [] for k in TOUTES_MESURES}
    echecs = []

    for s in donnees["sujets"]:
        pp = s["photos"]
        front = dossier / pp["face"]
        side = dossier / pp["profil"] if pp.get("profil") else None

        resultat = mesurer_et_corriger(front, side, s["height_cm"], s["weight_kg"], s["gender"])
        if resultat is None:
            echecs.append(s["id"])
            continue

        attendu = dict(zip(TOURS, s["tours"]))
        attendu.update(dict(zip(LONGUEURS, s["longueurs"])))

        for cle, ref in attendu.items():
            if cle in resultat["brut"]:
                erreurs_brut[cle].append(abs(resultat["brut"][cle] - ref))
            if cle in resultat["corrige"]:
                erreurs_corrige[cle].append(abs(resultat["corrige"][cle] - ref))

    print(f"{'mesure':15} {'MAE brut (V3)':>14} {'MAE corrige':>13} {'gain':>8} {'confiance':>18}")
    print("-" * 75)
    if echecs:
        print(f"  echecs pipeline : sujets {echecs}\n")

    moyennes_brut, moyennes_corr = [], []
    for cle in TOUTES_MESURES:
        if not erreurs_brut[cle]:
            continue
        mb = st.mean(erreurs_brut[cle])
        mc = st.mean(erreurs_corrige[cle]) if erreurs_corrige[cle] else mb
        moyennes_brut.append(mb)
        moyennes_corr.append(mc)
        gain = mb - mc
        marque = "  <-- AMELIORE" if gain > 0.05 else ("  <-- DEGRADE" if gain < -0.05 else "")
        print(f"{cle:15} {mb:14.2f} {mc:13.2f} {gain:+8.2f}{marque}")

    if moyennes_brut:
        print("-" * 75)
        print(f"{'MOYENNE':15} {st.mean(moyennes_brut):14.2f} {st.mean(moyennes_corr):13.2f} "
              f"{st.mean(moyennes_brut) - st.mean(moyennes_corr):+8.2f}")


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("json_sujets", help="Chemin vers le JSON des nouveaux sujets")
    ap.add_argument("dossier_photos", help="Dossier contenant les photos referencees")
    args = ap.parse_args()
    evaluer_nouveaux_sujets(args.json_sujets, args.dossier_photos)
