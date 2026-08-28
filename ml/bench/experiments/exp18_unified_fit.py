"""
Test de l'ajustement unifié (analysis-by-synthesis) : au lieu de calculer une
mensuration en cm puis d'ajuster séparément un avatar pour qu'il y corresponde
(ce que fait déjà refine_weights.py), on ajuste directement les paramètres de
forme du maillage pour que sa LARGEUR et sa PROFONDEUR (grandeurs directement
observables sur les photos face/profil, via measure_widths) correspondent à
celles de la silhouette réelle -- puis on LIT le tour de hanches directement
sur le maillage ajusté (mesh_measure, périmètre réel par coupe de plan), sans
jamais passer par la formule d'ellipse.

Hypothèse testée : la forme de section transversale "apprise" par MakeHuman
(issue de scans réels lors de la création des cibles morphologiques) donne-t-
elle un tour de hanches plus fidèle que l'ellipse géométrique, à largeur et
profondeur observées égales ?

Portée volontairement limitée aux HANCHES. Le maillage MakeHuman n'a qu'un
seul levier de largeur de tronc et un seul levier de profondeur de tronc,
partagés entre poitrine ET taille (voir target_map.py :
TORSO_WIDTH_TARGET/TORSO_DEPTH_TARGET, calculés comme la MOYENNE de
chest_breadth_scale et waist_breadth_scale) -- impossible d'ajuster
indépendamment poitrine et taille en largeur+profondeur avec les cibles
actuellement exportées. Les hanches, elles, ont deux cibles dédiées
(hip-scale-horiz, hip-scale-depth) : c'est le seul endroit où ce test peut
être mené proprement avec le maillage existant. Un test poitrine/taille
demanderait de nouvelles cibles morphologiques (hors de portée ici, voir
conclusion).

Usage :
    python exp18_unified_fit.py
"""

from __future__ import annotations

import json
import logging
import math
import sys
from pathlib import Path

logging.basicConfig(level=logging.WARNING)  # tait les logs internes du pipeline vision

_BACKEND_ROOT = Path(__file__).resolve().parents[3] / "backend"
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))
_ROOT = Path(__file__).resolve().parents[3]  # .../Sur-MeZur-App
_PHOTOS_DIR = _ROOT / "IMAGES TEST"
_SUJETS_JSON = _ROOT / "ml" / "bench" / "nouveaux_sujets_reels.json"


def ellipse_circumference_cm(width_cm: float, depth_cm: float) -> float:
    """Formule de production actuelle (Ramanujan) -- pour comparaison."""
    a, b = width_cm / 2.0, depth_cm / 2.0
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


def fit_hip_width_depth(base, sensitivity, target_width_cm, target_depth_cm,
                         max_iter=5, tol_cm=0.3):
    """
    Ajuste hip-scale-horiz (largeur) et hip-scale-depth (profondeur) pour que
    le maillage mesuré (mesh_measure) corresponde aux deux cibles observées
    sur les photos face/profil. Même principe que refine_weights.py,
    généralisé à deux grandeurs indépendantes au lieu d'une seule
    circonférence -- spécifique aux hanches, seul endroit du maillage où ces
    deux cibles sont réellement indépendantes (voir docstring du module).
    """
    from app.services.avatar import mesh_io, mesh_measure

    def slope(param, key):
        axis = sensitivity.get("sensitivity", {}).get(param, {})
        neutral = sensitivity.get("neutral_measurements", {})
        w1 = axis.get("w1.0", {})
        if not w1 or key not in neutral or key not in w1:
            return None
        return w1[key] - neutral[key]

    slope_w = slope("hip_breadth_scale", "hipbreadth")
    slope_d = slope("buttock_depth_scale", "buttockdepth")

    weights: dict[str, float] = {}
    width_key_incr, width_key_decr = "hip-scale-horiz-incr", "hip-scale-horiz-decr"
    depth_key_incr, depth_key_decr = "hip-scale-depth-incr", "hip-scale-depth-decr"

    measured = {}
    for it in range(max_iter):
        verts = mesh_io.apply_weights(base, weights)
        m = mesh_measure._measure_at_level(verts, base.faces, mesh_measure.CUT_LEVELS["hips"])
        measured = m
        residual_w = target_width_cm - m["width_cm"]
        residual_d = target_depth_cm - m["depth_cm"]
        if abs(residual_w) <= tol_cm and abs(residual_d) <= tol_cm:
            break
        if slope_w:
            cur = weights.get(width_key_incr, 0.0) - weights.get(width_key_decr, 0.0)
            new = max(-1.0, min(1.0, cur + 0.7 * residual_w / slope_w))
            weights.pop(width_key_incr, None); weights.pop(width_key_decr, None)
            if abs(new) >= 0.02:
                weights[width_key_incr if new > 0 else width_key_decr] = abs(new)
        if slope_d:
            cur = weights.get(depth_key_incr, 0.0) - weights.get(depth_key_decr, 0.0)
            new = max(-1.0, min(1.0, cur + 0.7 * residual_d / slope_d))
            weights.pop(depth_key_incr, None); weights.pop(depth_key_decr, None)
            if abs(new) >= 0.02:
                weights[depth_key_incr if new > 0 else depth_key_decr] = abs(new)

    return weights, measured, it + 1


def process_subject(sujet: dict) -> dict | None:
    from app.services.vision import pose as pose_mod
    from app.services.vision import silhouette as sil_mod
    from app.services.vision.scale import estimate_scale
    from app.services.avatar import mesh_io
    from app.services.avatar.optimize_weights import load_sensitivity

    photos = sujet.get("photos")
    if not photos:
        return None
    front_path = _PHOTOS_DIR / photos["face"]
    side_path = _PHOTOS_DIR / photos["profil"]
    if not front_path.exists() or not side_path.exists():
        print(f"  photos introuvables pour sujet {sujet['id']}, ignore")
        return None

    gender = sujet["gender"]
    height_cm = sujet["height_cm"]

    pose_front = pose_mod.extract_pose(str(front_path))
    if pose_front is None:
        print(f"  pose non detectee (face) sujet {sujet['id']}")
        return None
    cm_per_pixel = estimate_scale(pose_front, height_cm)
    if not cm_per_pixel:
        print(f"  echelle non calculable sujet {sujet['id']}")
        return None

    front_w = sil_mod.measure_widths(str(front_path), pose_front, orientation="front")
    if front_w is None or front_w.levels is None:
        print(f"  silhouette face non mesurable sujet {sujet['id']}")
        return None

    pose_side = pose_mod.extract_pose(str(side_path))
    if pose_side is None:
        print(f"  pose non detectee (profil) sujet {sujet['id']}")
        return None
    side_w = sil_mod.measure_widths(str(side_path), pose_side, orientation="side", levels=front_w.levels)
    if side_w is None:
        print(f"  silhouette profil non mesurable sujet {sujet['id']}")
        return None

    hip_width_cm = front_w.hip_px * cm_per_pixel
    hip_depth_cm = side_w.hip_px * cm_per_pixel

    sensitivity = load_sensitivity(gender)
    if sensitivity is None:
        print(f"  pas de matrice de sensibilite pour {gender}")
        return None

    base = mesh_io.load_base_mesh(gender)
    weights, measured, iters = fit_hip_width_depth(
        base, sensitivity, hip_width_cm, hip_depth_cm,
    )

    ellipse_cm = ellipse_circumference_cm(hip_width_cm, hip_depth_cm)
    unified_cm = measured["circumference_cm"]
    gt_cm = sujet["tours"][3]  # ordre: neck, chest, waist, hips

    return {
        "id": sujet["id"],
        "gender": gender,
        "hip_width_observe_cm": round(hip_width_cm, 1),
        "hip_depth_observe_cm": round(hip_depth_cm, 1),
        "iterations": iters,
        "mesh_width_atteinte_cm": round(measured["width_cm"], 1),
        "mesh_depth_atteinte_cm": round(measured["depth_cm"], 1),
        "cible_metre_ruban_cm": gt_cm,
        "ellipse_cm": round(ellipse_cm, 1),
        "ecart_ellipse_cm": round(ellipse_cm - gt_cm, 2),
        "ajustement_unifie_cm": round(unified_cm, 1),
        "ecart_unifie_cm": round(unified_cm - gt_cm, 2),
    }


def main() -> None:
    sujets = json.loads(_SUJETS_JSON.read_text(encoding="utf-8"))["sujets"]
    results = []
    for sujet in sujets:
        if "photos" not in sujet:
            continue
        print(f"Sujet {sujet['id']} ({sujet['gender']}, {sujet['height_cm']} cm)...")
        r = process_subject(sujet)
        if r:
            results.append(r)
            print(f"  {json.dumps(r, indent=2, ensure_ascii=False)}")

    if not results:
        print("Aucun sujet exploitable.")
        return

    print("\n=== Synthese (tour de hanches uniquement) ===")
    mae_ellipse = sum(abs(r["ecart_ellipse_cm"]) for r in results) / len(results)
    mae_unifie = sum(abs(r["ecart_unifie_cm"]) for r in results) / len(results)
    print(f"MAE ellipse (production)     : {mae_ellipse:.2f} cm  (n={len(results)})")
    print(f"MAE ajustement unifie (mesh) : {mae_unifie:.2f} cm  (n={len(results)})")
    for r in results:
        print(f"  sujet {r['id']:>2}  cible={r['cible_metre_ruban_cm']:>6.1f}  "
              f"ellipse={r['ellipse_cm']:>6.1f} ({r['ecart_ellipse_cm']:+.1f})  "
              f"unifie={r['ajustement_unifie_cm']:>6.1f} ({r['ecart_unifie_cm']:+.1f})")


if __name__ == "__main__":
    main()
