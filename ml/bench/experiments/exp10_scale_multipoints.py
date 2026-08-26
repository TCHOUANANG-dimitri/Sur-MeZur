"""
Experience 10 : echelle pixel->cm multi-points, proposee dans le travail
parallele "V4" (backend/app/services/vision/scale_v4.py).

Contrairement au facteur de correction d'ellipse du meme travail (deja
teste dans exp10_v4_ellipse_factor -- rejete, effondrement sur le terrain
comme les pistes ANSUR precedentes), cette idee est structurellement
DIFFERENTE : elle ne calibre rien sur ANSUR pour la partie geometrique du
tronc, elle ameliore la conversion pixel->cm elle-meme, en combinant trois
lectures (nez->sol, epaules->hanches, hanches->chevilles) au lieu du nez
seul. Les ratios anatomiques utilises SONT tires d'ANSUR (torso/leg height
ratio), donc le risque de transfert de population existe aussi ici, mais
de maniere plus diffuse (un ratio de proportions corporelles generales,
pas une correction de circonference).

Comme l'echelle affecte TOUTES les mesures (multiplicativement), un test
complet demande de rejouer le pipeline entier (MediaPipe + SAM) avec cette
nouvelle fonction d'echelle a la place de l'actuelle.

    python -m ml.bench.experiments.exp10_scale_multipoints
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
BACKEND = RACINE / "backend"
sys.path.insert(0, str(BACKEND))

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import harness  # noqa: E402

PHOTOS = BACKEND / "uploads" / "measurement_photos"

# --- Reimplementation de scale_v4.estimate_scale, avec gender en fermeture --
NOSE_HEIGHT_RATIO = 0.932
TORSO_HEIGHT_RATIO_MALE = 0.352
TORSO_HEIGHT_RATIO_FEMALE = 0.358
LEG_HEIGHT_RATIO_MALE = 0.482
LEG_HEIGHT_RATIO_FEMALE = 0.475
SCALE_WEIGHTS = {"nose": 0.50, "torso": 0.30, "leg": 0.20}
MIN_TORSO_PX = 80
MIN_LEG_PX = 100
MIN_CM_PER_PIXEL = 0.05
MAX_CM_PER_PIXEL = 3.0


def _estimate_scale_v4(pose, height_cm, gender):
    from app.services.vision.pose import (
        LEFT_ANKLE, LEFT_FOOT_INDEX, LEFT_HEEL, LEFT_HIP, LEFT_SHOULDER,
        NOSE, RIGHT_ANKLE, RIGHT_FOOT_INDEX, RIGHT_HEEL, RIGHT_HIP, RIGHT_SHOULDER,
    )
    if height_cm <= 0:
        return None
    nose = pose.point(NOSE)
    is_female = (gender or "").lower().startswith("f")

    foot_candidates = [pose.point(i) for i in (LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX, LEFT_ANKLE, RIGHT_ANKLE)]
    visible_feet = [p for p in foot_candidates if p.visibility >= 0.3]

    scale_nose = None
    if visible_feet:
        floor_y = max(p.y for p in visible_feet)
        span_px = floor_y - nose.y
        if span_px > 1:
            scale_nose = (height_cm * NOSE_HEIGHT_RATIO) / span_px

    shoulder_mid_y = hip_mid_y = scale_torso = None
    if (pose.point(LEFT_SHOULDER).visibility >= 0.5 and pose.point(RIGHT_SHOULDER).visibility >= 0.5
            and pose.point(LEFT_HIP).visibility >= 0.5 and pose.point(RIGHT_HIP).visibility >= 0.5):
        shoulder_mid_y = (pose.point(LEFT_SHOULDER).y + pose.point(RIGHT_SHOULDER).y) / 2
        hip_mid_y = (pose.point(LEFT_HIP).y + pose.point(RIGHT_HIP).y) / 2
        torso_px = hip_mid_y - shoulder_mid_y
        if torso_px > MIN_TORSO_PX:
            ratio = TORSO_HEIGHT_RATIO_FEMALE if is_female else TORSO_HEIGHT_RATIO_MALE
            scale_torso = (height_cm * ratio) / torso_px

    scale_leg = None
    if hip_mid_y is not None and visible_feet:
        leg_px = max(p.y for p in visible_feet) - hip_mid_y
        if leg_px > MIN_LEG_PX:
            ratio = LEG_HEIGHT_RATIO_FEMALE if is_female else LEG_HEIGHT_RATIO_MALE
            scale_leg = (height_cm * ratio) / leg_px

    methods = {"nose": scale_nose, "torso": scale_torso, "leg": scale_leg}
    active = {n: SCALE_WEIGHTS[n] for n, s in methods.items() if s is not None and MIN_CM_PER_PIXEL <= s <= MAX_CM_PER_PIXEL}
    if not active:
        return scale_nose
    total = sum(active.values())
    result = sum(methods[n] * (w / total) for n, w in active.items())
    if not (MIN_CM_PER_PIXEL <= result <= MAX_CM_PER_PIXEL):
        return None
    return result


def main() -> None:
    from app.services.vision import scale as scale_mod

    donnees = harness.charger_sujets()
    genre_par_id = {s["id"]: s["gender"] for s in donnees["sujets"]}

    original = scale_mod.estimate_scale

    def patched(pose, height_cm, _genre_actuel=[None]):
        # `harness.run` n'a pas de crochet par sujet : on utilise l'ordre
        # d'appel (front puis eventuellement side, meme sujet) et un cache
        # externe rempli juste avant chaque sujet -- voir boucle plus bas.
        return _estimate_scale_v4(pose, height_cm, _genre_actuel[0])

    resultats_par_genre = {"actuel": None}

    # On ne peut pas reutiliser harness.run() tel quel (il ne permet pas de
    # savoir quel sujet est en cours au moment du patch) : boucle manuelle,
    # copiee de harness.run() mais avec le genre correctement route.
    from app.services.vision import pipeline

    erreurs: dict[str, list[float]] = {k: [] for k in harness.TOUTES}
    echecs = []
    for s in donnees["sujets"]:
        sid = str(s["id"])
        pp = donnees["photos"].get(sid)
        if not pp or pp.get("incertain"):
            continue

        def patched_for_subject(pose, height_cm, _g=s["gender"]):
            return _estimate_scale_v4(pose, height_cm, _g)

        scale_mod.estimate_scale = patched_for_subject
        try:
            resultat = pipeline.run(
                front_photo=harness.PHOTOS / pp["face"],
                side_photo=harness.PHOTOS / pp["profil"],
                height_cm=s["height_cm"], weight_kg=s["weight_kg"], gender=s["gender"],
            )
        finally:
            scale_mod.estimate_scale = original

        if resultat is None:
            echecs.append(s["id"])
            continue
        attendu = dict(zip(harness.TOURS, s["tours"]))
        attendu.update(dict(zip(harness.LONGUEURS, s["longueurs"])))
        for cle, ref in attendu.items():
            calc = resultat.data.get(cle)
            if calc is None or (cle == "shoulder" and s.get("note")):
                continue
            erreurs[cle].append(abs(calc - ref))

    harness.comparer("Exp10 : echelle multi-points (V4, nez+torse+jambe)", {"par_mesure": erreurs, "echecs": echecs})


if __name__ == "__main__":
    main()
