"""
EXP-RL2 : mesure directe des membres par coupe de masque (vs Ridge).

Idée : au lieu de prédire le tour par un modèle entraîné sur ANSUR (R² plafonné),
on mesure la largeur de la section du membre directement sur le masque SAM et on
convertit en périmètre par π × largeur (sections quasi-circulaires pour les
membres).

Protocole LOO : calibre le facteur de conversion sur 12 sujets, teste sur le 13e.

Mesures cibles :
  - cheville  (MAE prod 3.98) : section visible sous le pantalon sur les photos ?
  - biceps    (MAE prod 2.56) : largeur du bras dans la bande [coude..épaule]
  - cou       (MAE prod 1.83) : bande entre menton et épaules
  - poignet   (MAE prod 1.57) : section au poignet
  - cuisse    (MAE prod 1.63) : section en haut de la cuisse (sous fesses)
"""
from __future__ import annotations

import json
import math
import statistics as st
import sys
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parents[2]
BACKEND = RACINE / "backend"
sys.path.insert(0, str(BACKEND))

PHOTOS = BACKEND / "uploads" / "measurement_photos"
SUJETS_JSON = Path(__file__).with_name("sujets.json")
CACHE_JSON = Path(__file__).with_name("cache_limbs_rl2.json")
PROD_DUMP = Path(r"C:\Users\Admin\AppData\Local\Temp\opencode\real_baseline_dump.json")

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGS = ["shoulder", "sleeve_length", "inseam", "back_length"]


def row_width_center(mask, y, cx):
    """Largeur du segment contigu du masque contenant cx, à la ligne y (indices entiers)."""
    y_i = int(max(0, min(mask.shape[0] - 1, round(y))))
    row = mask[y_i]
    cx_i = int(max(0, min(row.shape[0] - 1, round(cx))))
    if not row[cx_i]:
        white = np.where(row)[0]
        if white.size == 0:
            return 0.0, 0, 0
        cx_i = int(white[np.argmin(np.abs(white - cx_i))])
    left = cx_i
    while left > 0 and row[left - 1]:
        left -= 1
    right = cx_i
    while right < row.shape[0] - 1 and row[right + 1]:
        right += 1
    return float(right - left), int(left), int(right)


def search_extremum(mask, cx, y_center, band_half, want_max=True, n_steps=20):
    """Cherche l'extrémum (min ou max) de largeur sur une bande verticale."""
    best_w, best_y, best_l, best_r = 0, y_center, 0, 0
    for k in range(n_steps):
        t = (k / (n_steps - 1) - 0.5) * 2 * band_half
        w, l, r = row_width_center(mask, y_center + t, cx)
        if w <= 0:
            continue
        if best_w <= 0 or (w > best_w if want_max else w < best_w):
            best_w, best_y, best_l, best_r = w, y_center + t, l, r
    return best_w, best_y, best_l, best_r


def extract_features(photo_path, lms):
    """Extrait les repères utiles pour localiser les membrees."""
    img = None  # chargé si besoin
    feat = {}
    sh_l, sh_r = lms[11], lms[12]
    hip_l, hip_r = lms[23], lms[24]
    nose = lms[0]
    l_ank, r_ank = lms[27], lms[28]
    l_knee, r_knee = lms[25], lms[26]
    l_wri, r_wri = lms[15], lms[16]
    l_elb, r_elb = lms[13], lms[14]

    feat["sh_mid_y"] = (sh_l.y + sh_r.y) / 2
    feat["sh_mid_x"] = (sh_l.x + sh_r.x) / 2
    feat["hip_mid_y"] = (hip_l.y + hip_r.y) / 2
    feat["hip_mid_x"] = (hip_l.x + hip_r.x) / 2
    feat["nose_y"] = nose.y
    feat["chin_y"] = (nose.y + min(lms[1].y, lms[4].y)) / 2  # approx menton
    feat["torso_px"] = feat["hip_mid_y"] - feat["sh_mid_y"]

    # chevilles (la plus basse = plus visible)
    best_ank = l_ank if l_ank.visibility >= r_ank.visibility else r_ank
    feat["ankle_y"] = best_ank.y
    feat["ankle_x"] = best_ank.x
    # genoux
    best_knee = l_knee if l_knee.visibility >= r_knee.visibility else r_knee
    feat["knee_y"] = best_knee.y
    # poignets
    best_wri = l_wri if l_wri.visibility >= r_wri.visibility else r_wri
    feat["wrist_y"] = best_wri.y
    feat["wrist_x"] = best_wri.x
    # coudes
    best_elb = l_elb if l_elb.visibility >= r_elb.visibility else r_elb
    feat["elbow_y"] = best_elb.y
    # bas du masque = talons
    feat["floor_y"] = max(lms[29].y, lms[30].y, lms[31].y, lms[32].y,
                          l_ank.y, r_ank.y)

    return feat


def cache_sujets():
    """Extrait les largeurs de membres pour chaque sujet (coûté ~3-5 min)."""
    from app.services.vision import pose as vpose, silhouette as vsil, scale as vscale
    from app.services.vision.pipeline import _downscaled
    import sys

    donnees = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))
    cache = []

    for s in donnees["sujets"]:
        sid = str(s["id"])
        pp = donnees["photos"].get(sid)
        if not pp:
            cache.append({"id": s["id"], "ok": False, "reason": "pas de photo"})
            continue

        front_path = _downscaled(str(PHOTOS / pp["face"]))
        pose = vpose.extract_pose(front_path, 0.5)
        if pose is None:
            cache.append({"id": s["id"], "ok": False, "reason": "MediaPipe echec"})
            continue

        # les landmarks sont DÉJÀ en pixels (conversion faite dans pose.py)
        lm_px = pose.landmarks

        cm_px = vscale.estimate_scale(pose, s["height_cm"])
        if cm_px is None:
            cache.append({"id": s["id"], "ok": False, "reason": "echelle non calculee"})
            continue

        mask = vsil._body_mask(Path(front_path), pose)
        if mask is None:
            cache.append({"id": s["id"], "ok": False, "reason": "SAM echec"})
            continue
        mask = vsil._mask_without_arms(mask, pose, "front")
        print(f"  sujet {sid}: features extraits (cm_px={cm_px:.4f})", flush=True)

        feat = extract_features(front_path, lm_px)
        cx = feat["sh_mid_x"]

        result = {
            "id": s["id"], "ok": True,
            "height_cm": s["height_cm"], "weight_kg": s["weight_kg"],
            "gender": s["gender"], "cm_px": round(cm_px, 5),
            "torso_y0": round(feat["sh_mid_y"], 1),
            "torso_y1": round(feat["hip_mid_y"], 1),
            "attendu": dict(zip(TOURS, s["tours"])),
        }
        result["attendu"].update(dict(zip(LONGS, s["longueurs"])))

        torso_span = feat["hip_mid_y"] - feat["sh_mid_y"]
        lm = lm_px

        # --- COU : min dans bande [chin..shoulder], au centre du corps
        neck_band_cy = (feat["chin_y"] + feat["sh_mid_y"]) / 2
        neck_band_half = (feat["sh_mid_y"] - feat["chin_y"]) / 2
        neck_w, *_ = search_extremum(mask, cx, neck_band_cy, neck_band_half, want_max=False)
        result["neck_width_px"] = round(neck_w, 1)
        result["neck_width_cm"] = round(neck_w * cm_px, 1)

        # --- BICEPS : x = position du coude (bras = segment le plus éloigné du corps)
        elb_l, elb_r = lm[13], lm[14]
        best_elb = elb_l if elb_l.visibility >= elb_r.visibility else elb_r
        cx_arm = best_elb.x
        bicep_cy = (feat["sh_mid_y"] + feat["elbow_y"]) / 2
        bicep_half = (feat["elbow_y"] - feat["sh_mid_y"]) / 2
        bicep_w, *_ = search_extremum(mask, cx_arm, bicep_cy, bicep_half, want_max=True)
        result["biceps_width_px"] = round(bicep_w, 1)
        result["biceps_width_cm"] = round(bicep_w * cm_px, 1)

        # --- CUISSE : x = milieu de chaque jambe, prend la plus large
        leg_cx_l = (lm[23].x + lm[25].x) / 2
        leg_cx_r = (lm[24].x + lm[26].x) / 2
        thigh_cy = (feat["hip_mid_y"] + feat["knee_y"]) / 2
        thigh_half = (feat["knee_y"] - feat["hip_mid_y"]) / 2 * 0.4
        tw_l, *_ = search_extremum(mask, leg_cx_l, thigh_cy, thigh_half, want_max=True)
        tw_r, *_ = search_extremum(mask, leg_cx_r, thigh_cy, thigh_half, want_max=True)
        thigh_w = max(tw_l, tw_r)
        result["thigh_width_px"] = round(thigh_w, 1)
        result["thigh_width_cm"] = round(thigh_w * cm_px, 1)

        # --- POIGNET : x = position du poignet
        wri_l, wri_r = lm[15], lm[16]
        best_wri = wri_l if wri_l.visibility >= wri_r.visibility else wri_r
        ww1, *_ = row_width_center(mask, best_wri.y, best_wri.x)
        other_wri = wri_r if best_wri is wri_l else wri_l
        ww2, *_ = row_width_center(mask, other_wri.y, other_wri.x)
        wrist_w_best = max(ww1, ww2)
        result["wrist_width_px"] = round(wrist_w_best, 1)
        result["wrist_width_cm"] = round(wrist_w_best * cm_px, 1)

        # --- CHEVILLE : x = position de la cheville
        ank_l, ank_r = lm[27], lm[28]
        best_ank = ank_l if ank_l.visibility >= ank_r.visibility else ank_r
        aw1, *_ = row_width_center(mask, best_ank.y, best_ank.x)
        other_ank = ank_r if best_ank is ank_l else ank_l
        aw2, *_ = row_width_center(mask, other_ank.y, other_ank.x)
        ankle_w_best = max(aw1, aw2)
        result["ankle_width_px"] = round(ankle_w_best, 1)
        result["ankle_width_cm"] = round(ankle_w_best * cm_px, 1)

        cache.append(result)
        print(f"  sujet {sid}: OK (cm_px={cm_px:.4f})")

    CACHE_JSON.write_text(json.dumps(cache, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\nCache ecrit: {CACHE_JSON}")
    return cache


def evaluate(cache):
    """Évaluation en LOO du facteur de conversion largeur -> tour."""
    # charger les prédictions prod pour comparaison
    prod = {r["id"]: r for r in json.loads(PROD_DUMP.read_text(encoding="utf-8")) if r.get("ok")}
    valid = [c for c in cache if c.get("ok")]
    print(f"sujets valides: {len(valid)}/{len(cache)}")

    LIMBS = ["neck", "biceps", "thigh", "wrist", "ankle"]
    print(f"\n{'mesure':10s} {'prod MAE':>10s} {'direct MAE':>11s} {'gain':>7s} {'oracle MAE':>11s}")
    for limb in LIMBS:
        errs_prod = []
        errs_direct = []
        errs_oracle = []
        details_loo = []

        # facteur oracle : calibré sur TOUS les sujets
        all_fracs = []
        for r in valid:
            w = r.get(f"{limb}_width_cm", 0)
            target = r["attendu"][limb]
            if w > 0 and target > 0:
                all_fracs.append(target / w)
        f_oracle = float(np.median(all_fracs)) if all_fracs else 0

        for i_test, r_test in enumerate(valid):
            ref = r_test["attendu"][limb]
            w_test = r_test.get(f"{limb}_width_cm", 0)
            if w_test <= 0 or ref <= 0:
                continue

            train = [r for j, r in enumerate(valid) if j != i_test]
            fracs = []
            for r in train:
                w = r.get(f"{limb}_width_cm", 0)
                target = r["attendu"][limb]
                if w > 0 and target > 0:
                    fracs.append(target / w)
            if not fracs:
                continue
            f_loo = float(np.median(fracs))
            pred = w_test * f_loo
            errs_direct.append(abs(pred - ref))
            details_loo.append((r_test["id"], round(ref, 1), round(pred, 1), round(pred - ref, 1)))

            if r_test["id"] in prod and limb in prod[r_test["id"]].get("mesures", {}):
                errs_prod.append(abs(prod[r_test["id"]]["mesures"][limb] - ref))

            errs_oracle.append(abs(w_test * f_oracle - ref))

        if not errs_direct:
            print(f"{limb:10s} pas assez de donnees")
            continue

        mp = st.mean(errs_prod) if errs_prod else float("nan")
        md = st.mean(errs_direct)
        mo = st.mean(errs_oracle)
        gain = 100 * (mp - md) / mp if errs_prod else float("nan")

        print(f"{limb:10s} {mp:9.2f}cm {md:10.2f}cm {gain:+6.1f}% {mo:10.2f}cm")
        for sid, ref, pred, e in details_loo:
            print(f"            s{sid:2d}: ref={ref:5.1f} pred={pred:5.1f}  e={e:+.1f}")
        print()


def main():
    if CACHE_JSON.exists() and "--fresh" not in sys.argv:
        cache = json.loads(CACHE_JSON.read_text(encoding="utf-8"))
        print(f"Charge depuis le cache ({len(cache)} sujets)")
    else:
        print("Extraction des features membres (3-5 min)...")
        cache = cache_sujets()
    evaluate(cache)


if __name__ == "__main__":
    main()
