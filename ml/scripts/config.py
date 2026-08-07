"""
Contrat de données partagé entre le notebook d'entraînement, le script de
qualité et le service d'inférence du backend.

Tout ce qui décrit le dataset vit ici, pour qu'une correction de colonne ou
d'unité se propage partout sans divergence.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"

RAW_FILES = {
    "male": RAW_DIR / "ANSUR_II_MALE.csv",
    "female": RAW_DIR / "ANSUR_II_FEMALE.csv",
}

# Les CSV ont été exportés avec l'index pandas : l'en-tête compte 99 champs
# alors que chaque ligne en compte 100. Sans `index_col=0`, TOUTES les colonnes
# sont décalées d'un cran et les valeurs deviennent silencieusement fausses
# (ex. `stature_m` renvoie alors le poids). Voir check_data_quality.py.
READ_CSV_KWARGS = {"index_col": 0, "encoding": "latin-1"}

# --- Unités -----------------------------------------------------------------
# ANSUR II stocke les mesures anthropométriques en millimètres. Ce dataset
# ajoute deux colonnes dérivées dans d'autres unités.
UNIT_METRE = ("stature_m",)          # mètres  -> cm : x100
UNIT_KG = ("weight_kg",)             # kilos   -> inchangé
# tout le reste : millimètres        -> cm : /10

# --- Entrées ----------------------------------------------------------------
# V1 : ce que MediaPipe seul permet d'obtenir (squelette) + la saisie client.
FEATURES_V1 = [
    "stature_m",          # saisie client (taille)
    "weight_kg",          # saisie client (poids)
    "biacromialbreadth",  # MediaPipe dist(11,12)
    "bideltoidbreadth",   # MediaPipe dist(11,12) étendu
    "hipbreadth",         # MediaPipe dist(23,24)
    "sittingheight",      # MediaPipe milieu(11,12) -> milieu(23,24)
    "crotchheight",       # MediaPipe dist(24->26->28)
]

# V2 : V1 + largeurs/profondeurs réelles issues de la silhouette SAM.
FEATURES_V2_EXTRA = [
    "chestbreadth",   # silhouette de face
    "chestdepth",     # silhouette de profil
    "waistbreadth",   # silhouette de face
    "waistdepth",     # silhouette de profil
    "buttockdepth",   # silhouette de profil
]
# `hipbreadth` est déjà dans V1 : la silhouette l'affine mais ne l'ajoute pas.
FEATURES_V2 = FEATURES_V1 + FEATURES_V2_EXTRA

# --- Sorties ----------------------------------------------------------------
# Les 8 tours prédits par le modèle.
TARGETS = [
    "neckcircumference",
    "chestcircumference",
    "waistcircumference",
    "buttockcircumference",
    "bicepscircumferenceflexed",
    "thighcircumference",
    "wristcircumference",
    "anklecircumference",
]

# Nom métier renvoyé au client (clé utilisée par l'app mobile).
TARGET_LABELS = {
    "neckcircumference": "neck",
    "chestcircumference": "chest",
    "waistcircumference": "waist",
    "buttockcircumference": "hips",
    "bicepscircumferenceflexed": "biceps",
    "thighcircumference": "thigh",
    "wristcircumference": "wrist",
    "anklecircumference": "ankle",
}

FEATURE_LABELS = {
    "stature_m": "height_total",
    "weight_kg": "weight",
    "biacromialbreadth": "shoulder",
    "bideltoidbreadth": "shoulder_deltoid",
    "hipbreadth": "hip_breadth",
    "sittingheight": "torso_length",
    "crotchheight": "leg_length",
    "chestbreadth": "chest_breadth",
    "chestdepth": "chest_depth",
    "waistbreadth": "waist_breadth",
    "waistdepth": "waist_depth",
    "buttockdepth": "buttock_depth",
}

# --- Mesures géométriques (calculées, non prédites) -------------------------
# Colonnes ANSUR servant uniquement à vérifier la formule géométrique.
GEOMETRIC_REFERENCE = {
    "shoulder_width": "biacromialbreadth",   # dist(11,12) x échelle
    "sleeve_length": "sleeveoutseam",        # dist(12->14->16) x échelle
    "inseam": "crotchheight",                # milieu(23,24) -> 28
    "back_length": "waistbacklength",        # milieu(11,12) -> milieu(23,24)
}

# --- Bornes de plausibilité (en cm après conversion) ------------------------
# Utilisées par le contrôle qualité et par la garde d'inférence côté backend.
PLAUSIBLE_RANGES_CM = {
    "stature_m": (120.0, 220.0),
    "biacromialbreadth": (25.0, 60.0),
    "bideltoidbreadth": (30.0, 75.0),
    "hipbreadth": (20.0, 55.0),
    "sittingheight": (60.0, 120.0),
    "crotchheight": (55.0, 115.0),
    "chestbreadth": (18.0, 45.0),
    "chestdepth": (14.0, 42.0),
    "waistbreadth": (18.0, 55.0),
    "waistdepth": (12.0, 45.0),
    "buttockdepth": (14.0, 42.0),
    "neckcircumference": (25.0, 55.0),
    "chestcircumference": (65.0, 150.0),
    "waistcircumference": (50.0, 160.0),
    "buttockcircumference": (65.0, 155.0),
    "bicepscircumferenceflexed": (18.0, 55.0),
    "thighcircumference": (35.0, 90.0),
    "wristcircumference": (12.0, 24.0),
    "anklecircumference": (15.0, 35.0),
}
PLAUSIBLE_WEIGHT_KG = (35.0, 200.0)

# --- Artefacts modèle -------------------------------------------------------
MODEL_VERSION = "v1"


def model_filename(sex: str, variant: str = "v1") -> str:
    """Nom canonique de l'artefact, partagé avec le backend."""
    return f"surmezur_measurements_{sex}_{variant}.joblib"


def to_cm(series, column: str):
    """Ramène une colonne à des centimètres selon son unité d'origine."""
    if column in UNIT_METRE:
        return series * 100.0
    if column in UNIT_KG:
        return series  # le poids reste en kg
    return series / 10.0  # millimètres
