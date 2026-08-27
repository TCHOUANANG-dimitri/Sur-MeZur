"""
Corrections statistiques post-hoc appliquees aux mesures V3/V4 (Ridge +
geometrie ellipse) produites par `app.services.vision.pipeline.run()`.

Portage en production de `ml/bench/pipeline_ameliore.py`, apres la
validation independante du 25-26 aout 2026 sur des sujets terrain jamais
vus par aucune calibration (voir PIPELINE_AMELIORE.md section 8 et
claude_code.md section 11 pour l'historique complet de la recherche).

Origine des corrections : une partie vient de la recherche menee dans ce
depot, une partie vient d'un agent ayant travaille en parallele
(ml/bench/freebuff.md) -- chaque candidat propose par cet agent a ete
revalide independamment avant integration ici (biceps, thigh retenus ;
shoulder, chest/hips pooles rejetes a la revalidation).

Corrections DELIBEREMENT ABSENTES de ce module -- retirees apres avoir
echoue la validation independante malgre une validation croisee interne
qui semblait solide (LOO sur 11-12 sujets) :
  - shoulder : 1.63 -> 4.20 cm sur 6 sujets inedits. Extrapolation
    catastrophique du lien poids -> largeur d'epaules (un sujet de 95kg
    predisait 47.2cm pour une carrure reelle de 35.0cm).
  - wrist : 1.17 -> 1.92 cm sur 6 sujets inedits, n'ameliore que 2/6.
Ne pas les reintroduire sans nouvelle validation sur des sujets neufs.

Usage :
    from app.services.measurement_corrections import corriger_mesures, inseam_corrige

    resultat = corriger_mesures(mesures_brutes, features, gender)
    # resultat["corrige"][mesure] : valeur apres correction (ou brute, si
    # aucune correction fiable trouvee pour cette mesure/ce sexe)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Confiance = Literal["haute", "moyenne", "aucune_correction", "non_resolu"]


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
# (ml/bench/sujets.json), confirmes par la validation independante du
# 25 aout 2026 (6 nouveaux sujets, voir docstring du module).
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

# Corrections dependant du sexe (hommes uniquement -- non validees chez les
# femmes, echantillon insuffisant n=5 dont 2 sujets aux mesures suspectes).
CORRECTIONS_HOMMES: dict[str, CorrectionLineaire | CorrectionBMI] = {
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
# Femmes : chest/hips/waist non corrigees (diagnostic chest prometteur mais
# n=3, pas assez pour figer un coefficient).
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
    calculees par le pipeline V3/V4 de production. N'a pas besoin d'acces
    aux photos ni au repere de pose -- fonctionne uniquement a partir de la
    sortie standard de `vision.run()` (`.data` et `.features`).

    `inseam` n'est PAS corrige ici (necessite le repere de pose brut pour
    la correction geometrique -- voir `inseam_corrige`).
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
        # inseam (traite a part par inseam_corrige) ou mesure inconnue : valeur brute
        corrige[mesure] = valeur
        confiance[mesure] = "aucune_correction"
        origine[mesure] = "--"

    return {"corrige": corrige, "confiance": confiance, "origine": origine}


def inseam_corrige(pose, cm_per_pixel: float) -> float | None:
    """
    Recalcule l'entrejambe par la moyenne des DEUX chevilles (au lieu de la
    plus visible seule) -- voir claude_code.md section 3decies.
    Fix construit sur les 13 sujets terrain : MAE 3.14 -> ~2.98 cm.

    Validation independante du 25 aout 2026 (6 sujets inedits) : resultat
    legerement negatif (3.60 -> 4.07 cm, n=6). Correction geometrique (pas
    une extrapolation statistique comme shoulder/wrist), donc conservee --
    confiance "moyenne" en attendant plus de donnees pour trancher si ce
    recul est du bruit (n=6 est tres petit) ou un vrai signe que la moyenne
    des deux chevilles ne generalise pas.
    """
    from app.services.vision.pose import LEFT_HIP, RIGHT_HIP, LEFT_ANKLE, RIGHT_ANKLE
    from app.services.vision.scale import px_to_cm

    hip_mid = pose.midpoint(LEFT_HIP, RIGHT_HIP)
    left_px = ((hip_mid[0] - pose.point(LEFT_ANKLE).x) ** 2 + (hip_mid[1] - pose.point(LEFT_ANKLE).y) ** 2) ** 0.5
    right_px = ((hip_mid[0] - pose.point(RIGHT_ANKLE).x) ** 2 + (hip_mid[1] - pose.point(RIGHT_ANKLE).y) ** 2) ** 0.5
    return px_to_cm((left_px + right_px) / 2, cm_per_pixel)
