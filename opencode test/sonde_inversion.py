"""Sonde inversion : fitter les params Anny sur les 12 mesures prod (orig-10).

Loss differentiable = measure_grad (A-pose, cles ISO) + termes tailleur
via passe() repos (shoulder/back/inseam), tous branches sur les memes
tensors brut_* de CorpsAnny. 40 etapes, chrono.
"""
import json
import math
import os
import sys
import time
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "pipeline_anny"))

os.environ.setdefault("ANNY_CACHE_DIR", "F:/smz_tools/anny_cache")
os.environ.setdefault("WARP_CACHE_PATH", "F:/smz_tools/warp_cache")

import torch  # noqa: E402

torch.set_num_threads(max(1, os.cpu_count() or 1))

from anny_pipeline import config  # noqa: E402
from anny_pipeline.corps import CorpsAnny  # noqa: E402

ICI = str(RACINE / "pipeline_anny" / "resultats")

GRAD_MAP = {  # nos cles -> cles clad-body differentiables
    "neck": "neck_cm", "chest": "bust_cm", "waist": "waist_cm",
    "hips": "hip_cm", "biceps": "upperarm_cm", "thigh": "thigh_cm",
    "sleeve_length": "sleeve_length_cm",
}
SIG = 2.0


def _logit(p):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def _atanh(x):
    x = min(max(x, -0.999), 0.999)
    return 0.5 * math.log((1 + x) / (1 - x))


def main():
    from clad_body.load.anny import load_anny_from_params
    from clad_body.measure import measure_grad

    uid = "orig-10"
    obs = json.load(open(ICI + "/observations.json", encoding="utf-8"))
    anny = json.load(open(ICI + "/anny.json", encoding="utf-8"))
    gender = obs[uid]["gender"]
    cibles = {k: float(v) for k, v in obs[uid]["production"]["final"].items()
              if k in list(GRAD_MAP) + ["inseam", "shoulder", "back_length", "height_total"]}
    print("cibles prod:", cibles, flush=True)

    stored = anny[uid]["voie_b"]["params"]
    p = dict(config.PHENOTYPE_INITIAL)
    p["gender"] = 0.0 if gender == "male" else 1.0
    corps = CorpsAnny(p, config.LOCAUX)
    for lab, v in stored.items():
        if lab == "_local_changes":
            continue
        if lab in corps.brut_pheno:
            corps.brut_pheno[lab] = torch.tensor([_logit(float(v))], dtype=torch.float32, requires_grad=True)
    for lab, v in (stored.get("_local_changes") or {}).items():
        if lab in corps.brut_local:
            corps.brut_local[lab] = torch.tensor([_atanh(float(v))], dtype=torch.float32, requires_grad=True)

    plain = {lab: float(torch.sigmoid(v)) for lab, v in corps.brut_pheno.items()}
    plain["_local_changes"] = {lab: float(torch.tanh(v)) for lab, v in corps.brut_local.items()}
    body = load_anny_from_params(dict(p, **{k: v for k, v in plain.items() if k != "_local_changes"},
                                      _local_changes=plain["_local_changes"]), requires_grad=False)

    libres = list(config.PHENO_LIBRES) + (config.PHENO_LIBRES_FEMME if gender == "female" else [])
    params = corps.parametres(libres, avec_locaux=True)
    opt = torch.optim.Adam(params, lr=0.05)
    facteur_dos = 1.0 if gender == "male" else 0.919

    t0 = time.time()
    for step in range(40):
        opt.zero_grad()
        ph = corps.pheno()
        lc = corps.local()
        body.phenotype_kwargs = {k: v for k, v in ph.items()}
        body.local_changes_kwargs = {k: v for k, v in lc.items()}
        m = measure_grad(body, only=list(set(GRAD_MAP.values()) | {"inseam_cm", "height_cm"}))
        loss = ((m["height_cm"] - obs[uid]["height_cm"]) / 0.5) ** 2
        for notre, cle in GRAD_MAP.items():
            if notre in cibles:
                loss = loss + ((m[cle] - cibles[notre]) / SIG) ** 2
        # termes tailleur via pose de repos (differentiables aussi)
        out = corps.passe()
        P = lambda lab: corps.point(out, lab)  # noqa: E731
        if "shoulder" in cibles:
            sh = torch.linalg.norm(P("left_shoulder") - P("right_shoulder")) * 100.0 * 0.90
            loss = loss + ((sh - cibles["shoulder"]) / SIG) ** 2
        if "back_length" in cibles:
            dos = torch.linalg.norm((P("left_shoulder") + P("right_shoulder")) / 2
                                    - (P("left_hip") + P("right_hip")) / 2) * 100.0 * facteur_dos
            loss = loss + ((dos - cibles["back_length"]) / SIG) ** 2
        if "inseam" in cibles:
            chev_h = (P("left_ankle")[2] + P("right_ankle")[2]) / 2 * 100.0
            ej = m["inseam_cm"] - chev_h
            loss = loss + ((ej - cibles["inseam"]) / SIG) ** 2
        loss.backward()
        opt.step()
        if step % 10 == 0 or step == 39:
            print(f"step {step}: loss={float(loss):.2f} ({time.time()-t0:.0f}s)", flush=True)
    print(f"OK sonde en {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
