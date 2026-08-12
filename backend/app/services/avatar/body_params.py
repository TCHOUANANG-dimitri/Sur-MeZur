"""
Mapping complet de toutes les mesures du pipeline vers les paramètres MPFB.

Sources de mesures exploitées :
  1. Saisie client : taille, poids, sexe
  2. MediaPipe (squelette 33 points) : largeurs articulaires, longueurs membres
  3. MobileSAM (silhouette) : largeurs et profondeurs réelles du torse
  4. Modèle Ridge (8 tours) : circonférences prédites
  5. Géométrie (4 longueurs) : carrure, manche, entrejambe, dos

Total : ~25 mesures converties en ~20 paramètres morphologiques MPFB.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# --- Références de population (moyennes et écarts-types, en cm) -------------
#
# Ces valeurs centrent les z-scores : une mesure égale à la référence donne un
# corps moyen, un écart de deux écarts-types sature la cible morphologique.
#
# La table précédente était saisie à la main et n'avait jamais été confrontée
# aux données. Plusieurs entrées s'en écartaient assez pour saturer une cible
# sur TOUS les sujets — la pire, `shoulder` à 45,6 cm, comparait une carrure
# (~34 cm) à une largeur bidéltoïdienne : le z-score tombait à -2,5, borné à
# -1,0, et chaque avatar recevait les épaules les plus étroites possibles.
#
# Tout ce qui suit est désormais calculé sur les CSV ANSUR II (4082 hommes,
# 1986 femmes), à deux exceptions signalées ligne par ligne.
ANSUR_MALE = {
    "height": 175.6, "weight": 85.5,
    # Circonférences — colonnes ANSUR directes
    "chest": 105.9, "waist": 94.1, "hips": 102.0,
    "biceps": 35.8, "thigh": 62.5, "neck": 39.8,
    "wrist": 17.6, "ankle": 22.9,
    # Largeurs / profondeurs — colonnes ANSUR directes
    "chestbreadth": 28.9, "chestdepth": 25.4,
    "waistbreadth": 32.6, "waistdepth": 23.8,
    "hipbreadth": 34.6, "buttockdepth": 24.6,
    "biacromialbreadth": 41.6, "bideltoidbreadth": 51.0,
    # CARRURE : aucune colonne ANSUR ne la donne. Notre chaîne la produit en
    # multipliant la distance biacromiale du squelette par 0,90, alors que la
    # variable du modèle la multiplie par 1,09 — d'où la conversion
    # 41,6 x 0,90/1,09. Voir vision/features.JOINT_TO_SHOULDER_WIDTH.
    "shoulder": 34.3,
    "sleeve_length": 59.3,          # ANSUR sleeveoutseam
    # ENTREJAMBE : notre chaîne mesure hanche -> cheville sur l'image, soit la
    # hauteur d'entrejambe ANSUR moins la hauteur de cheville (~7 cm).
    "inseam": 77.6,
    # LONGUEUR DE DOS : milieu des épaules -> milieu des hanches, sans
    # équivalent ANSUR (waistbacklength part de la cervicale et s'arrête à la
    # taille). Moyenne relevée au mètre sur 8 hommes — échantillon trop petit,
    # à revoir dès qu'il grandit.
    "back_length": 56.5,
    "sittingheight": 91.8, "crotchheight": 84.6,
}

ANSUR_FEMALE = {
    "height": 162.8, "weight": 67.8,
    "chest": 94.7, "waist": 86.1, "hips": 102.1,
    "biceps": 30.6, "thigh": 61.6, "neck": 33.0,
    "wrist": 15.5, "ankle": 21.6,
    "chestbreadth": 26.9, "chestdepth": 24.7,
    "waistbreadth": 30.0, "waistdepth": 21.3,
    "hipbreadth": 35.4, "buttockdepth": 23.3,
    "biacromialbreadth": 36.5, "bideltoidbreadth": 45.0,
    "shoulder": 30.1,               # 36,5 x 0,90/1,09, voir ci-dessus
    "sleeve_length": 54.4,
    "inseam": 71.7,
    "back_length": 45.4,            # relevé sur 5 femmes seulement
    "sittingheight": 85.7, "crotchheight": 78.2,
}

ANSUR_STD_MALE = {
    "chest": 8.7, "waist": 11.2, "hips": 7.7,
    "biceps": 3.5, "thigh": 5.8, "neck": 2.6,
    "wrist": 0.9, "ankle": 1.5,
    "chestbreadth": 1.8, "chestdepth": 2.6,
    "waistbreadth": 3.5, "waistdepth": 3.5,
    "hipbreadth": 2.4, "buttockdepth": 2.6,
    "biacromialbreadth": 1.9, "bideltoidbreadth": 3.3,
    "shoulder": 1.6, "sleeve_length": 3.1,
    "inseam": 4.6, "back_length": 3.0,
    "sittingheight": 3.6, "crotchheight": 4.6,
}

ANSUR_STD_FEMALE = {
    "chest": 8.3, "waist": 10.0, "hips": 7.6,
    "biceps": 3.1, "thigh": 5.6, "neck": 1.9,
    "wrist": 0.8, "ankle": 1.5,
    "chestbreadth": 1.9, "chestdepth": 2.7,
    "waistbreadth": 3.3, "waistdepth": 3.1,
    "hipbreadth": 2.7, "buttockdepth": 2.4,
    "biacromialbreadth": 1.8, "bideltoidbreadth": 2.9,
    "shoulder": 1.5, "sleeve_length": 2.9,
    "inseam": 4.5, "back_length": 2.5,
    "sittingheight": 3.3, "crotchheight": 4.5,
}


def _clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _z_score(value: float, mean: float, std: float) -> float:
    if std <= 0:
        return 0.0
    return _clamp((value - mean) / (2.0 * std))


@dataclass
class AvatarParams:
    """
    Paramètres morphologiques MPFB, dérivés de TOUTES les mesures du pipeline.

    Valeurs dans [-1.0, +1.0] sauf height_cm.
    Le signe positif = plus grand / plus fort que la moyenne ANSUR.
    """
    # --- Base ---
    gender: float = 0.0           # 0=homme, 1=femme
    height_cm: float = 175.0

    # --- Macro-details ---
    weight_factor: float = 0.0    # BMI -> volume global
    muscle_factor: float = 0.0    # musculature

    # --- Torse (circonférences -> shape keys) ---
    chest_scale: float = 0.0      # poitrine
    waist_scale: float = 0.0      # taille (creux lombaire)
    hip_scale: float = 0.0        # hanches (largeur)
    buttock_scale: float = 0.0    # fessiers (saillie)
    breast_size: float = 0.0      # volume seins (femme)

    # --- Membres ---
    biceps_scale: float = 0.0     # bras
    thigh_scale: float = 0.0      # cuisses
    neck_scale: float = 0.0       # cou
    wrist_scale: float = 0.0      # poignets
    ankle_scale: float = 0.0      # chevilles

    # --- Proportions (nouveau) ---
    torso_ratio: float = 0.0      # sitting_height / height -> longueur du torse
    leg_ratio: float = 0.0        # crotch_height / height -> longueur des jambes
    shoulder_width: float = 0.0   # carrure (entre emmanchures)
    sleeve_factor: float = 0.0    # longueur de manche relative
    back_factor: float = 0.0      # longueur de dos relative

    # --- Largeurs/Profondeurs du torse (nouveau, depuis SAM) ---
    chest_breadth_scale: float = 0.0   # largeur poitrine (face)
    chest_depth_scale: float = 0.0     # profondeur poitrine (profil)
    waist_breadth_scale: float = 0.0   # largeur taille (face)
    waist_depth_scale: float = 0.0     # profondeur taille (profil)
    hip_breadth_scale: float = 0.0     # largeur hanches (face)
    buttock_depth_scale: float = 0.0   # profondeur fessiers (profil)

    # --- Épaisseur de vêtement (info) ---
    clothing_thickness_cm: float | None = None

    # Debug
    notes: list[str] = field(default_factory=list)


def measurements_to_avatar_params(
    measurements: dict[str, float],
    gender: str | None = None,
    features: dict[str, float] | None = None,
) -> AvatarParams:
    """
    Convertit TOUTES les mesures du pipeline en paramètres MPFB.

    Args:
        measurements: dict du data (8 tours + 4 géométriques + height_total)
        gender: "male" ou "female"
        features: dict des features (optionnel, 12 variables MediaPipe/SAM)
                  Si fourni, enrichit les paramètres avec les largeurs/profondeurs.
    """
    params = AvatarParams()
    notes: list[str] = []

    # --- Sexe ---
    sex = (gender or "").lower().startswith("f")
    params.gender = 1.0 if sex else 0.0
    ref = ANSUR_FEMALE if sex else ANSUR_MALE
    std = ANSUR_STD_FEMALE if sex else ANSUR_STD_MALE

    # --- Hauteur ---
    height = measurements.get("height_total", 170.0)
    params.height_cm = float(height)
    notes.append(f"height={height:.1f}")

    # --- Poids -> weight_factor / muscle_factor ---
    weight = measurements.get("weight_kg", 0.0)
    if weight > 0 and height > 0:
        bmi = weight / ((height / 100.0) ** 2)
        # IMC moyen de la population de référence, recalculé depuis les mêmes
        # CSV que la table ci-dessus (85,5 kg / 1,756 m et 67,8 kg / 1,628 m).
        # Les valeurs précédentes, 28,8 et 29,1, poussaient presque tous les
        # utilisateurs vers un facteur de corpulence négatif.
        bmi_ref = 27.7 if not sex else 25.6
        params.weight_factor = _clamp((bmi - bmi_ref) / 15.0)
        params.muscle_factor = _clamp(params.weight_factor * 0.6)
        notes.append(f"bmi={bmi:.1f} -> wf={params.weight_factor:.2f}")

    # --- Circonférences (8 tours du modèle Ridge) ---
    circumf_map = {
        "chest": "chest_scale",
        "waist": "waist_scale",
        "hips": "hip_scale",
        "biceps": "biceps_scale",
        "thigh": "thigh_scale",
        "neck": "neck_scale",
        "wrist": "wrist_scale",
        "ankle": "ankle_scale",
    }
    for key, param_name in circumf_map.items():
        value = measurements.get(key)
        if value is not None and key in ref:
            z = _z_score(value, ref[key], std[key])
            setattr(params, param_name, z)
            notes.append(f"{key}={value:.1f} -> {param_name}={z:.2f}")

    # --- Fessiers : dérivé des hanches ---
    params.buttock_scale = _clamp(params.hip_scale * 0.85 + 0.05)
    notes.append(f"buttock={params.buttock_scale:.2f}")

    # --- Seins (femme) : dérivé de la poitrine ---
    if sex:
        bmi_factor = 1.0 + params.weight_factor * 0.3
        params.breast_size = _clamp(params.chest_scale * 0.7 * bmi_factor)
        notes.append(f"breast={params.breast_size:.2f}")

    # --- Longueurs géométriques (4 mesures directes) ---
    shoulder = measurements.get("shoulder")
    if shoulder is not None and "shoulder" in ref:
        params.shoulder_width = _z_score(shoulder, ref["shoulder"], std["shoulder"])
        notes.append(f"shoulder={shoulder:.1f} -> {params.shoulder_width:.2f}")

    sleeve = measurements.get("sleeve_length")
    if sleeve is not None and "sleeve_length" in ref:
        params.sleeve_factor = _z_score(sleeve, ref["sleeve_length"], std["sleeve_length"])
        notes.append(f"sleeve={sleeve:.1f} -> sleeve_f={params.sleeve_factor:.2f}")

    back = measurements.get("back_length")
    if back is not None and "back_length" in ref:
        params.back_factor = _z_score(back, ref["back_length"], std["back_length"])
        notes.append(f"back={back:.1f} -> back_f={params.back_factor:.2f}")

    # --- Proportions (longueurs relatives) ---
    sitting_h = measurements.get("sittingheight") or (features or {}).get("sittingheight")
    if sitting_h and height > 0:
        ratio = sitting_h / height
        ratio_ref = ref["sittingheight"] / ref["height"]
        params.torso_ratio = _clamp((ratio - ratio_ref) / 0.1)
        notes.append(f"torso_ratio={ratio:.3f} -> {params.torso_ratio:.2f}")

    crotch_h = measurements.get("crotchheight") or (features or {}).get("crotchheight")
    if crotch_h and height > 0:
        ratio = crotch_h / height
        ratio_ref = ref["crotchheight"] / ref["height"]
        params.leg_ratio = _clamp((ratio - ratio_ref) / 0.1)
        notes.append(f"leg_ratio={ratio:.3f} -> {params.leg_ratio:.2f}")

    # --- Largeurs/Profondeurs du torse (depuis features SAM) ---
    if features:
        breadth_depth_map = {
            "chestbreadth": ("chest_breadth_scale", "chestbreadth"),
            "chestdepth": ("chest_depth_scale", "chestdepth"),
            "waistbreadth": ("waist_breadth_scale", "waistbreadth"),
            "waistdepth": ("waist_depth_scale", "waistdepth"),
            "hipbreadth": ("hip_breadth_scale", "hipbreadth"),
            "buttockdepth": ("buttock_depth_scale", "buttockdepth"),
        }
        for feat_key, (param_name, ref_key) in breadth_depth_map.items():
            value = features.get(feat_key)
            if value is not None and ref_key in ref:
                z = _z_score(value, ref[ref_key], std[ref_key])
                setattr(params, param_name, z)
                notes.append(f"{feat_key}={value:.1f} -> {param_name}={z:.2f}")

    # --- Épaisseur de vêtement ---
    params.clothing_thickness_cm = features.get("clothing_thickness_cm") if features else None

    params.notes = notes
    return params


def to_json(params: AvatarParams) -> dict:
    """Sérialise en dict pour passage au subprocess Blender."""
    return {
        "gender": params.gender,
        "height_cm": params.height_cm,
        "weight_factor": params.weight_factor,
        "muscle_factor": params.muscle_factor,
        "chest_scale": params.chest_scale,
        "waist_scale": params.waist_scale,
        "hip_scale": params.hip_scale,
        "buttock_scale": params.buttock_scale,
        "breast_size": params.breast_size,
        "biceps_scale": params.biceps_scale,
        "thigh_scale": params.thigh_scale,
        "neck_scale": params.neck_scale,
        "wrist_scale": params.wrist_scale,
        "ankle_scale": params.ankle_scale,
        "torso_ratio": params.torso_ratio,
        "leg_ratio": params.leg_ratio,
        "shoulder_width": params.shoulder_width,
        "sleeve_factor": params.sleeve_factor,
        "back_factor": params.back_factor,
        "chest_breadth_scale": params.chest_breadth_scale,
        "chest_depth_scale": params.chest_depth_scale,
        "waist_breadth_scale": params.waist_breadth_scale,
        "waist_depth_scale": params.waist_depth_scale,
        "hip_breadth_scale": params.hip_breadth_scale,
        "buttock_depth_scale": params.buttock_depth_scale,
    }
