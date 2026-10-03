"""
Etape 1 — perception : photos -> observations, et reference de production.

Correspond a la brique « BlazePose (MediaPipe) + masque de silhouette +
echelle » de la specification (§2). On REUTILISE le code de production
(backend/app/services/vision) plutot que de le reecrire : la nouvelle chaine
et l'actuelle partent alors exactement des memes observations, et toute
difference de resultat vient de ce qui se passe APRES (modele de corps,
ajustement, extraction des mesures).

Pour chaque sujet pilote, on enregistre :
  - les 33 points MediaPipe (pixels + visibilite) de face et de profil ;
  - l'echelle cm/pixel de chaque vue, ancree sur la taille saisie ;
  - le profil de silhouette du tronc, bras exclus : 50 largeurs (face) et
    50 profondeurs (profil) de la ligne d'epaules a la ligne de hanches ;
  - les niveaux poitrine / taille / hanches trouves par la production.
Et, pour la comparaison finale, les mesures de la CHAINE ACTUELLE sur les
memes photos : sortie brute (pipeline.run) et sortie de production
(corrections statistiques + correction d'entrejambe, comme
measurements.py::_corriger).

A lancer avec le Python du BACKEND (MediaPipe, MobileSAM y sont installes) :

    backend\\venv\\Scripts\\python.exe pipeline_anny\\perception\\extraire_observations.py

Sortie : pipeline_anny/resultats/observations.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
RACINE_PIPE = ICI.parent
RACINE = RACINE_PIPE.parent
sys.path.insert(0, str(RACINE / "backend"))
sys.path.insert(0, str(RACINE_PIPE))

# Comme app/main.py : plafonner les threads AVANT d'importer torch / OpenCV.
from app.core.thread_limits import set_env_limits  # noqa: E402

set_env_limits()

from app.services.measurement_corrections import corriger_mesures, inseam_corrige  # noqa: E402
from app.services.vision import pipeline as pipeline_mod  # noqa: E402
from app.services.vision import pose as pose_mod  # noqa: E402
from app.services.vision import silhouette as sil_mod  # noqa: E402
from app.services.vision.pipeline import _downscaled  # noqa: E402
from app.services.vision.scale import estimate_scale  # noqa: E402

import sujets as sujets_mod  # noqa: E402

SORTIE = RACINE_PIPE / "resultats" / "observations.json"


def _points(pose) -> list[list[float]]:
    return [[round(p.x, 2), round(p.y, 2), round(p.visibility, 3)] for p in pose.landmarks]


def _monde(pose) -> list[list[float]] | None:
    wl = getattr(pose, "world", None)
    if not wl:
        return None
    return [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in wl]


def _vue(chemin: Path, height_cm: float, orientation: str, levels=None) -> tuple[dict | None, object | None]:
    """Observations d'une photo. Renvoie (dict, niveaux) ; dict None si echec."""
    image = _downscaled(chemin)
    pose = pose_mod.extract_pose(image)
    if pose is None:
        return None, None
    cm_px = estimate_scale(pose, height_cm)
    if not cm_px:
        return None, None
    sil = sil_mod.measure_widths(image, pose, orientation=orientation, levels=levels)
    obs = {
        "image_w": pose.image_width,
        "image_h": pose.image_height,
        "cm_par_px": cm_px,
        "points": _points(pose),
        "monde": _monde(pose),
    }
    if sil is not None:
        obs.update(
            {
                "profil_cm": [round(w * cm_px, 2) for w in sil.profile_px],
                "torse_cm": round(sil.torso_px * cm_px, 2),
                "niveaux": {"poitrine": sil.levels.chest, "taille": sil.levels.waist, "hanches": sil.levels.hip},
                "poitrine_cm": round(sil.chest_px * cm_px, 2),
                "taille_cm": round(sil.waist_px * cm_px, 2),
                "hanches_cm": round(sil.hip_px * cm_px, 2),
            }
        )
    return obs, (sil.levels if sil is not None else None)


def _production(s) -> dict:
    """Chaine actuelle : brut + sortie de production (memes etapes que
    backend/app/api/v1/measurements.py::_corriger)."""
    t0 = time.time()
    res = pipeline_mod.run(
        front_photo=s.face, side_photo=s.profil,
        height_cm=s.height_cm, weight_kg=s.weight_kg, gender=s.gender,
    )
    if res is None:
        return {"ok": False, "duree_s": round(time.time() - t0, 1)}
    brut = dict(res.data)
    final = dict(brut)
    try:
        final = dict(corriger_mesures(res.data, res.features, s.gender)["corrige"])
    except Exception as e:  # meme repli que la production
        print(f"    correction statistique en erreur : {e}")
    try:
        pose = pose_mod.extract_pose(_downscaled(s.face))
        cm_px = estimate_scale(pose, s.height_cm) if pose else None
        if cm_px and "inseam" in final:
            v = inseam_corrige(pose, cm_px)
            if v is not None:
                final["inseam"] = round(v, 1)
    except Exception as e:
        print(f"    correction d'entrejambe en erreur : {e}")
    return {
        "ok": True,
        "source": res.source,
        "brut": {k: brut[k] for k in sujets_mod.MESURES if k in brut},
        "final": {k: final[k] for k in sujets_mod.MESURES if k in final},
        "duree_s": round(time.time() - t0, 1),
    }


def main() -> None:
    print("Prechauffage MediaPipe / MobileSAM...", flush=True)
    pipeline_mod.warm_up()
    sujets = sujets_mod.charger()
    if len(sys.argv) > 1:
        sujets = [s for s in sujets if s.uid in sys.argv[1:]]

    resultats = {}
    if SORTIE.exists():
        resultats = json.loads(SORTIE.read_text(encoding="utf-8"))

    for s in sujets:
        print(f"[{s.uid}] {s.gender} {s.height_cm:.0f} cm {s.weight_kg:.1f} kg", flush=True)
        t0 = time.time()
        face, niveaux = _vue(s.face, s.height_cm, "front")
        profil, _ = _vue(s.profil, s.height_cm, "side", levels=niveaux)
        t_perc = time.time() - t0
        prod = _production(s)
        resultats[s.uid] = {
            "uid": s.uid,
            "gender": s.gender,
            "height_cm": s.height_cm,
            "weight_kg": s.weight_kg,
            "verite": s.verite,
            "exclues": sorted(s.exclues),
            "face": face,
            "profil": profil,
            "duree_perception_s": round(t_perc, 1),
            "production": prod,
        }
        etat = "ok" if face and profil and face.get("profil_cm") and profil.get("profil_cm") else "INCOMPLET"
        print(
            f"    perception {etat} ({t_perc:.1f} s) ; production {'ok' if prod['ok'] else 'ECHEC'} ({prod['duree_s']} s)",
            flush=True,
        )
        SORTIE.parent.mkdir(parents=True, exist_ok=True)
        SORTIE.write_text(json.dumps(resultats, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"\n{len(resultats)} sujets -> {SORTIE}")


if __name__ == "__main__":
    main()
