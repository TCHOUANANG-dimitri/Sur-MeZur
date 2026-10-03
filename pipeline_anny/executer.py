"""
Etapes 2 a 4 de la nouvelle chaine, pour chaque sujet pilote :

    observations (etape 1) -> voie B (a priori Anny) -> voie A (ajustement)
                           -> extraction ISO 8559 sur le maillage

A lancer avec le Python de CE dossier (Anny, clad-body) :

    pipeline_anny\\.venv\\Scripts\\python.exe pipeline_anny\\executer.py [uid ...]

Reprend la ou il s'est arrete : un sujet deja traite n'est pas recalcule
(--refaire pour forcer). Sortie : pipeline_anny/resultats/anny.json
La calibration locale (phase 1) et la comparaison sont faites par comparer.py.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

# Cache Anny hors du disque systeme (voir README).
os.environ.setdefault("ANNY_CACHE_DIR", "F:/smz_tools/anny_cache")
os.environ.setdefault("WARP_CACHE_PATH", "F:/smz_tools/warp_cache")

import torch  # noqa: E402

from anny_pipeline import ajustement, mesures  # noqa: E402
from anny_pipeline.observations import depuis_observation  # noqa: E402

OBS = ICI / "resultats" / "observations.json"
SORTIE = ICI / "resultats" / "anny.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("uids", nargs="*")
    ap.add_argument("--refaire", action="store_true")
    ap.add_argument("--etapes", type=int, default=None)
    args = ap.parse_args()

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    obs = json.loads(OBS.read_text(encoding="utf-8"))
    res = json.loads(SORTIE.read_text(encoding="utf-8")) if SORTIE.exists() else {}

    uids = args.uids or list(obs)
    for uid in uids:
        if uid in res and not args.refaire:
            print(f"[{uid}] deja traite")
            continue
        o = obs[uid]
        c = depuis_observation(o)
        print(f"[{uid}] {c.gender} {c.height_cm:.0f} cm {c.weight_kg:.1f} kg — "
              f"{len(c.largeurs)} largeurs, {len(c.profondeurs)} profondeurs, {len(c.longueurs)} longueurs", flush=True)
        t0 = time.time()
        try:
            corps, init = ajustement.initialiser(c)
            params_b = corps.valeurs()
            mes_b = mesures.extraire(corps, c.gender)
            print(f"    voie B : {init['hauteur_cm']} cm / {init['masse_kg']} kg ({init['duree_s']} s)", flush=True)
            fit = ajustement.ajuster(corps, c, etapes=args.etapes)
            params_a = corps.valeurs()
            mes_a = mesures.extraire(corps, c.gender)
            print(f"    voie A : {fit['bilan']['hauteur_cm']} cm / {fit['bilan']['masse_kg']} kg ({fit['duree_s']} s)", flush=True)
            res[uid] = {
                "ok": True,
                "notes": c.notes,
                "voie_b": {"params": params_b, "mesures": mes_b, "info": init},
                "voie_a": {"params": params_a, "mesures": mes_a, "historique": fit["historique"], "bilan": fit["bilan"]},
                "duree_totale_s": round(time.time() - t0, 1),
            }
        except Exception as e:  # un echec ne doit pas arreter la serie
            import traceback

            traceback.print_exc()
            res[uid] = {"ok": False, "erreur": f"{type(e).__name__}: {e}", "duree_totale_s": round(time.time() - t0, 1)}
        SORTIE.write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"    total {res[uid]['duree_totale_s']} s", flush=True)


if __name__ == "__main__":
    main()
