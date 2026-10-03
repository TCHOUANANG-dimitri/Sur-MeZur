"""Lot 1+2 — inversion mesures->Anny.

Fit les params Anny (pheno libres + 12 locaux) sur 12 mesures cibles :
  --cible prod : mesures finales de la prod (cas reel utilisable)
  --cible gt   : verite terrain (oracle = borne sup de l'approche)
  --init B     : part des params voie B (recommande)
  --init mean  : part du corps moyen (ablation pseudo-voie B)

Sortie (incrementale) : opencode test/inversion.json
  {uid: {"prod_B": {params, mesures, residus, duree_s, etapes}, ...}}
"""
import argparse
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

from anny_pipeline import config, mesures  # noqa: E402
from anny_pipeline.corps import CorpsAnny  # noqa: E402

ICI = str(RACINE / "pipeline_anny" / "resultats")
OUT = str(RACINE / "opencode test" / "inversion.json")

GRAD_MAP = {
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


def corps_initial(gender, stored_or_none):
    from anny_pipeline import config as cfg
    p = dict(cfg.PHENOTYPE_INITIAL)
    p["gender"] = 0.0 if gender == "male" else 1.0
    corps = CorpsAnny(p, cfg.LOCAUX)
    if stored_or_none:
        for lab, v in stored_or_none.items():
            if lab == "_local_changes":
                continue
            if lab in corps.brut_pheno:
                corps.brut_pheno[lab] = torch.tensor([_logit(float(v))], dtype=torch.float32, requires_grad=True)
        for lab, v in (stored_or_none.get("_local_changes") or {}).items():
            if lab in corps.brut_local:
                corps.brut_local[lab] = torch.tensor([_atanh(float(v))], dtype=torch.float32, requires_grad=True)
    return corps


def quotidiennes(corps):
    return ({lab: float(torch.sigmoid(v)) for lab, v in corps.brut_pheno.items()},
            {lab: float(torch.tanh(v)) for lab, v in corps.brut_local.items()})


def inverser(uid, o, anny, cible, init, etapes):
    from clad_body.load.anny import load_anny_from_params
    from clad_body.measure import measure_grad

    gender = o["gender"]
    exclues = set(o.get("exclues", []))
    if cible == "prod":
        src = (o.get("production") or {}).get("final") or {}
        tg = {k: float(v) for k, v in src.items() if k in MESURES12 and v is not None}
        if not (o.get("production") or {}).get("ok"):
            return {"ok": False, "erreur": "production en echec"}
    else:
        tg = {k: float(v) for k, v in o["verite"].items() if k in MESURES12 and k not in exclues}
    if len(tg) < 10:
        return {"ok": False, "erreur": f"cibles insuffisantes ({len(tg)})"}

    stored = (anny.get(uid) or {}).get("voie_b", {}).get("params") if init == "B" else None
    corps = corps_initial(gender, stored)
    ph0, lc0 = quotidiennes(corps)
    body = load_anny_from_params(dict(ph0, _local_changes=lc0), requires_grad=False)

    libres = list(config.PHENO_LIBRES) + (config.PHENO_LIBRES_FEMME if gender == "female" else [])
    opt = torch.optim.Adam(corps.parametres(libres, avec_locaux=True), lr=0.05)
    facteur_dos = 1.0 if gender == "male" else 0.919
    cles_grad = sorted(set(GRAD_MAP.values()) | {"inseam_cm", "height_cm"})
    t0 = time.time()
    try:
        for _ in range(etapes):
            opt.zero_grad()
            ph = corps.pheno()
            lc = corps.local()
            body.phenotype_kwargs = {k: v for k, v in ph.items()}
            body.local_changes_kwargs = {k: v for k, v in lc.items()}
            m = measure_grad(body, only=cles_grad)
            loss = ((m["height_cm"] - o["height_cm"]) / 0.5) ** 2
            for notre, cle in GRAD_MAP.items():
                if notre in tg:
                    loss = loss + ((m[cle] - tg[notre]) / SIG) ** 2
            out = corps.passe()
            P = lambda lab: corps.point(out, lab)  # noqa: E731
            if "shoulder" in tg:
                sh = torch.linalg.norm(P("left_shoulder") - P("right_shoulder")) * 100.0 * 0.90
                loss = loss + ((sh - tg["shoulder"]) / SIG) ** 2
            if "back_length" in tg:
                dos = torch.linalg.norm((P("left_shoulder") + P("right_shoulder")) / 2
                                        - (P("left_hip") + P("right_hip")) / 2) * 100.0 * facteur_dos
                loss = loss + ((dos - tg["back_length"]) / SIG) ** 2
            if "inseam" in tg:
                chev_h = (P("left_ankle")[2] + P("right_ankle")[2]) / 2 * 100.0
                loss = loss + ((m["inseam_cm"] - chev_h - tg["inseam"]) / SIG) ** 2
            loss.backward()
            opt.step()
        final = {lab: round(float(v), 4) for lab, v in corps.pheno().items()}
        final["_local_changes"] = {lab: round(float(v), 4) for lab, v in corps.local().items()}
        mes = mesures.extraire(corps, gender)
        res = {k: round(mes[k] - tg[k], 1) for k in mes if k in tg}
        return {"ok": True, "params": final, "mesures": mes, "cibles": tg,
                "residus": res, "duree_s": round(time.time() - t0, 1), "etapes": etapes}
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        return {"ok": False, "erreur": f"{type(e).__name__}: {e}"}


MESURES12 = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist",
             "ankle", "shoulder", "sleeve_length", "inseam", "back_length"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cible", choices=["prod", "gt"], required=True)
    ap.add_argument("--init", choices=["B", "mean"], default="B")
    ap.add_argument("--etapes", type=int, default=40)
    ap.add_argument("uids", nargs="*")
    args = ap.parse_args()

    obs = json.load(open(ICI + "/observations.json", encoding="utf-8"))
    anny = json.load(open(ICI + "/anny.json", encoding="utf-8"))
    try:
        res = json.load(open(OUT, encoding="utf-8"))
    except FileNotFoundError:
        res = {}
    uids = args.uids or sorted(obs)
    for uid in uids:
        tag = f"{args.cible}_{args.init}"
        if uid in res and tag in res[uid]:
            print(f"[{uid}/{tag}] deja fait", flush=True)
            continue
        print(f"[{uid}/{tag}] fit {args.etapes} etapes...", flush=True)
        r = inverser(uid, obs[uid], anny, args.cible, args.init, args.etapes)
        res.setdefault(uid, {})[tag] = r
        json.dump(res, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print(f"[{uid}/{tag}] {'ok' if r.get('ok') else 'ECHEC ' + str(r.get('erreur'))} "
              f"({r.get('duree_s', '?')}s)", flush=True)
    print("-> " + OUT, flush=True)


if __name__ == "__main__":
    main()
