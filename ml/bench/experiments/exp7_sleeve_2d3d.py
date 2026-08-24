"""
Experience 7 : diagnostic de la bascule 2D/3D pour sleeve_length.

`_sleeve_length_cm` (vision/features.py) essaie d'abord la reconstruction 3D
(repere `world` de MediaPipe), et ne retombe sur la simple projection 2D que
si le 3D donne une valeur PLUS COURTE que la projection (signe d'un repere 3D
incoherent, puisque la projection est une borne INFERIEURE garantie de la
vraie longueur).

Le biais observe sur sleeve_length (majoritairement negatif, jusqu'a -9.7 cm)
est compatible avec deux explications :
  (a) le repere 3D est presque toujours rejete sur nos photos -> on reste
      bloque sur la 2D, qui sous-estime TOUJOURS par construction.
  (b) le repere 3D est accepte mais reste lui-meme insuffisant.

Ce script rejoue juste l'extraction de pose (rapide, pas besoin de SAM) sur
les 12 sujets valides et compare TROIS variantes a la verite terrain :
  - toujours 2D (projection)
  - toujours 3D (quand disponible)
  - la logique actuelle (bascule automatique)

    python -m ml.bench.experiments.exp7_sleeve_2d3d
"""
from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[3]  # .../Sur-MeZur-App
BACKEND = RACINE / "backend"
sys.path.insert(0, str(BACKEND))

PHOTOS = BACKEND / "uploads" / "measurement_photos"
SUJETS_JSON = Path(__file__).resolve().parents[1] / "sujets.json"


def main() -> None:
    from app.services.vision import pose as pose_mod
    from app.services.vision.scale import estimate_scale, px_to_cm
    from app.services.vision.pose import LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST

    donnees = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))

    ecarts_2d, ecarts_3d, ecarts_actuel = [], [], []
    print(f"{'sujet':6} {'reel':>6} {'2D':>7} {'3D':>7} {'actuel':>7} {'3D dispo?':>10} {'3D<2D?':>8}")

    for s in donnees["sujets"]:
        sid = str(s["id"])
        pp = donnees["photos"].get(sid)
        if not pp or pp.get("incertain"):
            continue
        front = PHOTOS / pp["face"]
        r = pose_mod.extract_pose(str(front))
        if r is None:
            print(f"{sid:6} pose non detectee")
            continue

        cm_per_pixel = estimate_scale(r, s["height_cm"])
        if cm_per_pixel is None:
            print(f"{sid:6} echelle non calculable")
            continue

        left_px = r.path_length(LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST)
        right_px = r.path_length(RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST)
        projected = px_to_cm(max(left_px, right_px), cm_per_pixel)

        scale = r.world_scale(cm_per_pixel)
        spatial = None
        if scale is not None:
            left_m = r.path_length_3d(LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST)
            right_m = r.path_length_3d(RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST)
            if left_m is not None and right_m is not None:
                spatial = max(left_m, right_m) * scale

        actuel = projected if (spatial is None or spatial < projected) else spatial
        reel = s["longueurs"][1]  # LONGUEURS = [shoulder, sleeve_length, inseam, back_length]

        ecarts_2d.append(abs(projected - reel))
        ecarts_actuel.append(abs(actuel - reel))
        if spatial is not None:
            ecarts_3d.append(abs(spatial - reel))

        print(f"{sid:6} {reel:6.1f} {projected:7.1f} {spatial if spatial else float('nan'):7.1f} "
              f"{actuel:7.1f} {'oui' if spatial is not None else 'NON':>10} "
              f"{'oui' if (spatial is not None and spatial < projected) else 'non':>8}")

    print(f"\nMAE toujours-2D    : {st.mean(ecarts_2d):.2f} cm")
    if ecarts_3d:
        print(f"MAE toujours-3D (n={len(ecarts_3d)}) : {st.mean(ecarts_3d):.2f} cm")
    print(f"MAE logique actuelle : {st.mean(ecarts_actuel):.2f} cm")


if __name__ == "__main__":
    main()
