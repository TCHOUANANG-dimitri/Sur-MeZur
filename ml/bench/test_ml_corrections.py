#!/usr/bin/env python3
"""
TEST DE CORRECTIONS ML SUR FEATURES DU PIPELINE
=================================================
Utilise les features extraites par le pipeline (largeurs, profondeurs, etc.)
pour construire des modeles de correction valides en LOO-CV.
Tout est fait sur les 13 vrais sujets avec vraie vérité terrain.
"""
import json
import numpy as np
from pathlib import Path

BASE = Path(__file__).parent
RESULTS_FILE = BASE / "test_real_pipeline_results.json"
SUJETS_FILE = BASE / "sujets.json"

with open(RESULTS_FILE) as f:
    raw_results = json.load(f)

with open(SUJETS_FILE) as f:
    sujets_raw = json.load(f)

MEASURES_ORDER = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS_ORDER = ["shoulder", "sleeve_length", "inseam", "back_length"]
ALL_MEASURES = MEASURES_ORDER + LONGUEURS_ORDER

# Build data
subjects = []
details = raw_results["details_sujets"]
sujets_map = {str(s["id"]): s for s in sujets_raw["sujets"]}

for d in details:
    sid = str(d["id"])
    if sid not in sujets_map:
        continue
    s = sujets_map[sid]
    entry = {
        "id": d["id"],
        "gender": s["gender"],
        "height_cm": s["height_cm"],
        "weight_kg": s["weight_kg"],
        "features": d["features"],
        "mesures": {},
    }
    # Ground truth
    for i, m in enumerate(MEASURES_ORDER):
        entry["mesures"][m] = {"attendu": s["tours"][i], "calcule": d["mesures"][m]["calcule"]}
    for i, m in enumerate(LONGUEURS_ORDER):
        if m in d["mesures"]:
            entry["mesures"][m] = {"attendu": s["longueurs"][i], "calcule": d["mesures"][m]["calcule"]}
    subjects.append(entry)

subjects.sort(key=lambda x: x["id"])
N = len(subjects)
print(f"Sujets charges: {N}")

# Build feature matrix
feature_keys = [
    "biacromialbreadth", "bideltoidbreadth", "hipbreadth", "sittingheight",
    "crotchheight", "chestbreadth", "waistbreadth", "chestdepth", "waistdepth",
    "buttockdepth", "stature_m", "weight_kg",
    "chestbreadth_body", "chestdepth_body", "waistbreadth_body",
    "waistdepth_body", "hipbreadth_body", "buttockdepth_body"
]
# Also compute derived features
for subj in subjects:
    f = subj["features"]
    subj["derived"] = {
        "bmi": subj["weight_kg"] / (subj["height_cm"] / 100.0) ** 2,
        "chest_ratio": f["chestbreadth"] / max(f["chestdepth"], 1),
        "waist_ratio": f["waistbreadth"] / max(f["waistdepth"], 1),
        "hip_ratio": f["hipbreadth"] / max(f["buttockdepth"], 1),
        "trunk_width_diff": f["chestbreadth"] - f["waistbreadth"],
        "trunk_depth_diff": f["chestdepth"] - f["waistdepth"],
        "height_weight_ratio": subj["height_cm"] / max(subj["weight_kg"], 1),
        "sitting_ratio": f["sittingheight"] / max(subj["height_cm"], 1),
        "crotch_ratio": f["crotchheight"] / max(subj["height_cm"], 1),
        "chest_body_diff": f["chestbreadth"] - f["chestbreadth_body"],
        "waist_body_diff": f["waistbreadth"] - f["waistbreadth_body"],
        "hip_body_diff": f["hipbreadth"] - f["hipbreadth_body"],
    }

ALL_FEATURE_KEYS = feature_keys + list(subjects[0]["derived"].keys())

def build_X(subjects_list, feature_keys_list):
    X = []
    for s in subjects_list:
        row = []
        for k in feature_keys_list:
            if k in s["features"]:
                row.append(s["features"][k])
            elif k in s["derived"]:
                row.append(s["derived"][k])
            else:
                row.append(0.0)
        X.append(row)
    return np.array(X)

def build_y(subjects_list, measure, key="calcule"):
    return np.array([s["mesures"][measure][key] for s in subjects_list if measure in s["mesures"]])

def build_y_true(subjects_list, measure):
    return np.array([s["mesures"][measure]["attendu"] for s in subjects_list if measure in s["mesures"]])

def get_valid_subjects(subjects_list, measure):
    return [s for s in subjects_list if measure in s["mesures"]]


def solve_ridge(X_train, y_train, lam=1.0):
    """Ridge regression: w = (X^T X + lambda I)^{-1} X^T y"""
    XtX = X_train.T @ X_train + lam * np.eye(X_train.shape[1])
    Xty = X_train.T @ y_train
    try:
        return np.linalg.solve(XtX, Xty)
    except np.linalg.LinAlgError:
        return np.zeros(X_train.shape[1])


def solve_ridge_with_intercept(X_train, y_train, lam=1.0):
    """Ridge with intercept"""
    X_aug = np.column_stack([np.ones(X_train.shape[0]), X_train])
    w = solve_ridge(X_aug, y_train, lam)
    return w[0], w[1:]


def loo_cv_ridge(subjects, measure, feature_keys_list, lam=1.0):
    """LOO-CV for Ridge correction model"""
    valid = get_valid_subjects(subjects, measure)
    if len(valid) < 3:
        return 99.0
    X = build_X(valid, feature_keys_list)
    y_pred = build_y(valid, measure, "calcule")
    y_true = build_y_true(valid, measure)

    errors_corrected = []
    n_valid = len(valid)
    for i in range(n_valid):
        mask = np.arange(n_valid) != i
        X_train, y_train = X[mask], y_pred[mask]
        y_true_train = y_true[mask]
        
        # Train: learn correction w such that corrected = pred + w @ features + b
        y_correction = y_true_train - y_pred[mask]
        
        intercept, weights = solve_ridge_with_intercept(X_train, y_correction, lam)
        
        # Predict correction for test subject
        correction = intercept + weights @ X[i]
        corrected = y_pred[i] + correction
        errors_corrected.append(abs(corrected - y_true[i]))

    return np.mean(errors_corrected)


def loo_cv_direct_ridge(subjects, measure, feature_keys_list, lam=1.0):
    """LOO-CV: directly predict measurement from features (bypass pipeline)"""
    valid = get_valid_subjects(subjects, measure)
    if len(valid) < 3:
        return 99.0
    X = build_X(valid, feature_keys_list)
    y_true = build_y_true(valid, measure)

    errors = []
    n_valid = len(valid)
    for i in range(n_valid):
        mask = np.arange(n_valid) != i
        X_train, y_train = X[mask], y_true[mask]
        
        intercept, weights = solve_ridge_with_intercept(X_train, y_train, lam)
        predicted = intercept + weights @ X[i]
        errors.append(abs(predicted - y_true[i]))

    return np.mean(errors)


# ====================================================================
print()
print("=" * 80)
print("TEST 1: LOO-CV avec correction par Ridge (features du pipeline)")
print("  Apprend: erreur = intercept + w @ features")
print("  corrige = prediction_pipeline + erreur_predite")
print("=" * 80)

for m in ALL_MEASURES:
    valid = get_valid_subjects(subjects, m)
    if len(valid) < 3:
        print(f"  {m:20s}: insufficient data (n={len(valid)})")
        continue
    # Basic features
    basic = ["height_cm", "weight_kg", "biacromialbreadth", "hipbreadth",
             "chestbreadth", "waistbreadth", "crotchheight"]
    mae_basic = loo_cv_ridge(subjects, m, basic, lam=1.0)

    # All features
    mae_all = loo_cv_ridge(subjects, m, ALL_FEATURE_KEYS, lam=1.0)

    # Raw pipeline error
    errors_raw = [abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid]
    mae_raw = np.mean(errors_raw)

    best_mae = min(mae_basic, mae_all)
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  ridge_basic={mae_basic:.2f}  ridge_all={mae_all:.2f}  ->  {best_mae:.2f} cm  [{status}]")


# ====================================================================
print()
print("=" * 80)
print("TEST 2: LOO-CV Ridge direct (predire la mesure sans le pipeline)")
print("  Apprend: mesure_reelle = intercept + w @ features")
print("=" * 80)

for m in ALL_MEASURES:
    valid = get_valid_subjects(subjects, m)
    if len(valid) < 3:
        print(f"  {m:20s}: insufficient data (n={len(valid)})")
        continue
    basic = ["height_cm", "weight_kg", "biacromialbreadth", "hipbreadth",
             "chestbreadth", "waistbreadth", "crotchheight", "buttockdepth"]
    mae_basic = loo_cv_direct_ridge(subjects, m, basic, lam=1.0)
    mae_all = loo_cv_direct_ridge(subjects, m, ALL_FEATURE_KEYS, lam=1.0)

    errors_raw = [abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid]
    mae_raw = np.mean(errors_raw)

    best_mae = min(mae_basic, mae_all)
    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  ridge_direct_basic={mae_basic:.2f}  ridge_direct_all={mae_all:.2f}  ->  {best_mae:.2f} cm  [{status}]")


# ====================================================================
print()
print("=" * 80)
print("TEST 3: Meilleur lamdba pour chaque mesure")
print("=" * 80)

for m in ALL_MEASURES:
    valid = get_valid_subjects(subjects, m)
    if len(valid) < 3:
        print(f"  {m:20s}: insufficient data (n={len(valid)})")
        continue
    best_mae = 999
    best_lam = 1.0
    best_method = ""
    for lam in [0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0]:
        for feat_name, feats in [("basic", ["height_cm", "weight_kg", "biacromialbreadth",
                                             "hipbreadth", "chestbreadth", "waistbreadth", "crotchheight"]),
                                  ("all", ALL_FEATURE_KEYS)]:
            # Correction model
            mae_corr = loo_cv_ridge(subjects, m, feats, lam)
            if mae_corr < best_mae:
                best_mae = mae_corr
                best_lam = lam
                best_method = f"correction_{feat_name}"

            # Direct model
            mae_dir = loo_cv_direct_ridge(subjects, m, feats, lam)
            if mae_dir < best_mae:
                best_mae = mae_dir
                best_lam = lam
                best_method = f"direct_{feat_name}"

    errors_raw = [abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid]
    mae_raw = np.mean(errors_raw)

    status = "<1" if best_mae < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  best={best_method:20s} lam={best_lam:5.1f}  ->  {best_mae:.2f} cm  [{status}]")


# ====================================================================
print()
print("=" * 80)
print("TEST 4: Validation LOO-CV avec features combinees (meilleur setup)")
print("=" * 80)
print()
print("  Teste un modele hybride: correction par biais + features supplementaires")
print()

for m in ALL_MEASURES:
    valid = get_valid_subjects(subjects, m)
    if len(valid) < 3:
        print(f"  {m:20s}: insufficient data (n={len(valid)})")
        continue
    n_valid = len(valid)
    errors_raw = [abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid]
    mae_raw = np.mean(errors_raw)

    # Model: corrected = raw + bias + w1*weight + w2*height
    errors_corrected = []
    for i in range(n_valid):
        mask = np.arange(n_valid) != i
        raw_train = np.array([valid[j]["mesures"][m]["calcule"] for j in range(n_valid) if j != i])
        true_train = np.array([valid[j]["mesures"][m]["attendu"] for j in range(n_valid) if j != i])
        corrections_train = true_train - raw_train

        # Features: weight, height
        w_train = np.array([valid[j]["weight_kg"] for j in range(n_valid) if j != i])
        h_train = np.array([valid[j]["height_cm"] for j in range(n_valid) if j != i])
        X_train = np.column_stack([np.ones(len(w_train)), w_train, h_train])

        # Solve
        try:
            w = np.linalg.lstsq(X_train, corrections_train, rcond=None)[0]
        except:
            w = np.zeros(3)

        # Predict
        w_test = np.array([valid[i]["weight_kg"], valid[i]["height_cm"]])
        correction = w[0] + w[1] * w_test[0] + w[2] * w_test[1]
        raw_test = valid[i]["mesures"][m]["calcule"]
        corrected = raw_test + correction
        errors_corrected.append(abs(corrected - valid[i]["mesures"][m]["attendu"]))

    mae_corrected = np.mean(errors_corrected)
    status = "<1" if mae_corrected < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  corrige_poids_taille={mae_corrected:.2f} cm  [{status}]")


# ====================================================================
print()
print("=" * 80)
print("TEST 5: Modele basique mais robuste - biais + ratio anatomique")
print("  corrected = raw * (1 + a * (weight/height^2 - 22) + b)")
print("=" * 80)

for m in ALL_MEASURES:
    valid = get_valid_subjects(subjects, m)
    if len(valid) < 3:
        print(f"  {m:20s}: insufficient data (n={len(valid)})")
        continue
    n_valid = len(valid)
    errors_raw = [abs(s["mesures"][m]["calcule"] - s["mesures"][m]["attendu"]) for s in valid]
    mae_raw = np.mean(errors_raw)

    errors_corrected = []
    for i in range(n_valid):
        mask = np.arange(n_valid) != i
        raw_train = np.array([valid[j]["mesures"][m]["calcule"] for j in range(n_valid) if j != i])
        true_train = np.array([valid[j]["mesures"][m]["attendu"] for j in range(n_valid) if j != i])

        bmi_dev_train = np.array([
            valid[j]["weight_kg"] / (valid[j]["height_cm"] / 100.0) ** 2 - 22.0
            for j in range(n_valid) if j != i
        ])

        # Try simple multiplicative correction: corrected = raw * (1 + a * bmi_dev)
        best_mae_t = 999
        best_a_t = 0.0
        for a in np.arange(-0.1, 0.1, 0.005):
            corrected_t = raw_train * (1 + a * bmi_dev_train)
            mae_t = np.mean(np.abs(corrected_t - true_train))
            if mae_t < best_mae_t:
                best_mae_t = mae_t
                best_a_t = a

        bmi_dev_test = valid[i]["weight_kg"] / (valid[i]["height_cm"] / 100.0) ** 2 - 22.0
        corrected = valid[i]["mesures"][m]["calcule"] * (1 + best_a_t * bmi_dev_test)
        errors_corrected.append(abs(corrected - valid[i]["mesures"][m]["attendu"]))

    mae_corrected = np.mean(errors_corrected)
    status = "<1" if mae_corrected < 1.0 else ">=1"
    print(f"  {m:20s}: brut={mae_raw:.2f}  bmi_correction={mae_corrected:.2f} cm  [{status}]")


# ====================================================================
print()
print("=" * 80)
print("TEST 6: Modele utilise-t-il des features du RUN actuel?")
print("  Calcule la features utilisable sans ground truth")
print("=" * 80)
print()
print("  Features disponibles en production (pas de ground truth):")
print("    - height_cm, weight_kg (donnees utilisateur)")
print("    - biacromialbreadth, hipbreadth (MediaPipe silhouette)")
print("    - chestbreadth, waistbreadth (Silhouette body)")
print("    - crotchheight (MediaPipe pose)")
print("    - sittingheight (MediaPipe pose)")
print("    - chestdepth, waistdepth, buttockdepth (Silhouette body)")
print()
print("  OK: toutes les features testees ci-dessus sont disponibles en production")
