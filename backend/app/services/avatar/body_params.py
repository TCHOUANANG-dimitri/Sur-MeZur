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


# --- Références ANSUR II (moyennes et écarts-types, en cm) ------------------
ANSUR_MALE = {
    "height": 175.6, "weight": 88.8,
    # Circonférences (modèle Ridge)
    "chest": 103.1, "waist": 93.8, "hips": 102.6,
    "biceps": 35.8, "thigh": 60.6, "neck": 39.7,
    "wrist": 17.5, "ankle": 25.3,
    # Largeurs/profondeurs (SAM/squelette)
    "chestbreadth": 38.3, "chestdepth": 25.4,
    "waistbreadth": 32.6, "waistdepth": 23.8,
    "hipbreadth": 34.6, "buttockdepth": 24.6,
    "biacromialbreadth": 41.6, "bideltoidbreadth": 48.0,
    # Longueurs (géométrie)
    "shoulder": 45.6, "sleeve_length": 64.5,
    "inseam": 81.0, "back_length": 44.0,
    # Proportions (squelette)
    "sittingheight": 93.5, "crotchheight": 84.6,
}

ANSUR_FEMALE = {
    "height": 162.9, "weight": 77.2,
    "chest": 96.6, "waist": 85.9, "hips": 102.1,
    "biceps": 31.6, "thigh": 58.2, "neck": 34.5,
    "wrist": 15.5, "ankle": 22.8,
    "chestbreadth": 35.8, "chestdepth": 23.8,
    "waistbreadth": 30.3, "waistdepth": 22.0,
    "hipbreadth": 36.1, "buttockdepth": 23.6,
    "biacromialbreadth": 37.2, "bideltoidbreadth": 43.0,
    "shoulder": 40.3, "sleeve_length": 58.0,
    "inseam": 75.0, "back_length": 40.5,
    "sittingheight": 87.0, "crotchheight": 78.5,
}

ANSUR_STD_MALE = {
    "chest": 9.2, "waist": 11.5, "hips": 7.8,
    "biceps": 4.2, "thigh": 5.6, "neck": 3.3,
    "wrist": 1.4, "ankle": 1.9,
    "chestbreadth": 3.5, "chestdepth": 2.8,
    "waistbreadth": 4.1, "waistdepth": 3.0,
    "hipbreadth": 3.8, "buttockdepth": 2.9,
    "biacromialbreadth": 2.8, "bideltoidbreadth": 3.2,
    "shoulder": 2.5, "sleeve_length": 4.5,
    "inseam": 5.5, "back_length": 3.5,
    "sittingheight": 4.8, "crotchheight": 5.0,
}

ANSUR_STD_FEMALE = {
    "chest": 9.8, "waist": 11.2, "hips": 9.1,
    "biceps": 4.0, "thigh": 6.1, "neck": 2.8,
    "wrist": 1.3, "ankle": 1.7,
    "chestbreadth": 3.2, "chestdepth": 2.6,
    "waistbreadth": 3.8, "waistdepth": 2.8,
    "hipbreadth": 4.2, "buttockdepth": 2.7,
    "biacromialbreadth": 2.5, "bideltoidbreadth": 2.9,
    "shoulder": 2.2, "sleeve_length": 4.0,
    "inseam": 5.0, "back_length": 3.2,
    "sittingheight": 4.5, "crotchheight": 4.8,
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
        bmi_ref = 28.8 if not sex else 29.1
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
