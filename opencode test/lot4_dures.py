"""Lot 4 — voie A + contraintes dures oracle (taille + poitrine verite).

Reprend la boucle de ajustement.ajuster (160 etapes, memes poids) en
ajoutant 2 termes de mesure : waist_cm et bust_cm differentiables cales
sur la VERITE terrain (simule des auto-mesures parfaites = borne sup
de la phase 3). Sauvegarde incrementale : opencode test/lot4.json
"""
import argparse
import json
import math
import os
import sys
import time
import traceback
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "pipeline_anny"))

os.environ.setdefault("ANNY_CACHE_DIR", "F:/smz_tools/anny_cache")
os.environ.setdefault("WARP_CACHE_PATH", "F:/smz_tools/warp_cache")

import torch  # noqa: E402

torch.set_num_threads(max(1, os.cpu_count() or 1))

from anny_pipeline import ajustement, config, mesures  # noqa: E402
from anny_pipeline.corps import CorpsAnny  # noqa: E402
from anny_pipeline.observations import depuis_observation  # noqa: E402

ICI = str(RACINE / "pipeline_anny" / "resultats")
OUT = str(RACINE / "opencode test" / "lot4.json")

SIGMA_DUR = 1.0  # contrainte dure : 1 cm d'ecart-type


def _logit(p):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def _atanh(x):
    x = min(max(x, -0.999), 0.999)
    return 0.5 * math.log((1 + x) / (1 - x))


def ajuster_dur(corps, c, dures: dict, etapes: int):
    """Copie de ajustement.ajuster + termes de mesures dures (GT)."""
    from clad_body.load.anny import load_anny_from_params
    from clad_body.measure import measure_grad

    libres = list(config.PHENO_LIBRES)
    if c.gender == "female":
        libres += config.PHENO_LIBRES_FEMME
    params = corps.parametres(libres, avec_locaux=True)
    depart = {k: v.detach().clone() for k, v in corps.brut_pheno.items()}
    opt = torch.optim.Adam(params, lr=config.AJUST_LR)

    ph0 = {lab: float(torch.sigmoid(v)) for lab, v in corps.brut_pheno.items()}
    lc0 = {lab: float(torch.tanh(v)) for lab, v in corps.brut_local.items()}
    body = load_anny_from_params(dict(ph0, _local_changes=lc0), requires_grad=False)

    fr_l = [f for f, _ in c.largeurs]
    ob_l = torch.tensor([w for _, w in c.largeurs], dtype=torch.float32)
    fr_p = [f for f, _ in c.profondeurs]
    ob_p = torch.tensor([w for _, w in c.profondeurs], dtype=torch.float32)

    with torch.no_grad():
        lm0 = ajustement._longueurs_modele(corps, corps.passe())
    longueurs, rejetees = {}, {}
    for k, v in c.longueurs.items():
        ref = float(lm0[k])
        if abs(v - ref) / ref <= config.ECART_MAX_LONGUEUR:
            longueurs[k] = v
        else:
            rejetees[k] = {"observee": v, "a_priori": round(ref, 1)}

    cles = sorted({"waist_cm", "bust_cm", "height_cm"})
    t0 = time.time()
    for etape in range(etapes):
        opt.zero_grad()
        out = corps.passe()
        termes = {}
        termes["taille"] = ((corps.hauteur_cm(out) - c.height_cm) / config.SIGMA_TAILLE_CM) ** 2
        termes["masse"] = ((corps.masse_kg(out) - c.weight_kg) / config.SIGMA_MASSE_KG) ** 2
        if fr_l:
            termes["silhouette_face"] = ajustement._borne(corps.tranches(out, fr_l, "lateral"), ob_l)
        if fr_p:
            termes["silhouette_profil"] = ajustement._borne(corps.tranches(out, fr_p, "avant"), ob_p)
        if longueurs:
            lm = ajustement._longueurs_modele(corps, out)
            ecarts = torch.stack([(lm[k] - v) / config.SIGMA_LONGUEUR_CM for k, v in longueurs.items()])
            termes["landmarks"] = config.POIDS_LONGUEURS * torch.nn.functional.huber_loss(
                ecarts, torch.zeros_like(ecarts), delta=1.0, reduction="mean")
        # --- contraintes dures oracle (auto-mesures parfaites) ---
        ph = corps.pheno()
        lc = corps.local()
        body.phenotype_kwargs = {k: v for k, v in ph.items()}
        body.local_changes_kwargs = {k: v for k, v in lc.items()}
        m = measure_grad(body, only=cles)
        for notre, cle in (("waist", "waist_cm"), ("chest", "bust_cm")):
            if notre in dures:
                termes[f"dur_{notre}"] = ((m[cle] - dures[notre]) / SIGMA_DUR) ** 2
        prior = sum(
            ((torch.sigmoid(corps.brut_pheno[k]) - torch.sigmoid(depart[k])) / config.SIGMA_PHENO) ** 2
            for k in libres if k in corps.brut_pheno)
        prior = prior + sum((torch.tanh(v) / config.SIGMA_LOCAL) ** 2
                            for v in corps.brut_local.values()) / max(1, len(corps.brut_local))
        termes["a_priori"] = prior
        loss = sum(termes.values())
        loss.backward()
        opt.step()
    with torch.no_grad():
        out = corps.passe()
        bilan = {"hauteur_cm": round(float(corps.hauteur_cm(out)), 2),
                 "masse_kg": round(float(corps.masse_kg(out)), 2)}
    return {"bilan": bilan, "duree_s": round(time.time() - t0, 1)}


def traiter(uid, o, anny_obs, etapes):
    c = depuis_observation(anny_obs)
    p = dict(config.PHENOTYPE_INITIAL)
    p["gender"] = 0.0 if c.gender == "male" else 1.0
    stored = (o.get("voie_b") or {}).get("params")
    corps = CorpsAnny(p, config.LOCAUX)
    if stored:
        for lab, v in stored.items():
            if lab == "_local_changes":
                continue
            if lab in corps.brut_pheno:
                corps.brut_pheno[lab] = torch.tensor([_logit(float(v))], dtype=torch.float32, requires_grad=True)
        for lab, v in (stored.get("_local_changes") or {}).items():
            if lab in corps.brut_local:
                corps.brut_local[lab] = torch.tensor([_atanh(float(v))], dtype=torch.float32, requires_grad=True)
    dures = {k: float(anny_obs["verite"][k]) for k in ("waist", "chest") if k in anny_obs["verite"]}
    t0 = time.time()
    fit = ajuster_dur(corps, c, dures, etapes)
    final = {lab: round(float(v), 4) for lab, v in corps.pheno().items()}
    final["_local_changes"] = {lab: round(float(v), 4) for lab, v in corps.local().items()}
    mes = mesures.extraire(corps, c.gender)
    return {"ok": True, "params": final, "mesures": mes, "bilan": fit["bilan"],
            "duree_s": round(time.time() - t0, 1), "etapes": etapes}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--etapes", type=int, default=160)
    ap.add_argument("uids", nargs="*")
    args = ap.parse_args()
    obs = json.load(open(ICI + "/observations.json", encoding="utf-8"))
    anny = json.load(open(ICI + "/anny.json", encoding="utf-8"))
    try:
        res = json.load(open(OUT, encoding="utf-8"))
    except FileNotFoundError:
        res = {}
    for uid in (args.uids or sorted(obs)):
        if uid in res:
            print(f"[{uid}] deja fait", flush=True)
            continue
        print(f"[{uid}] voie A + dures ({args.etapes} etapes)...", flush=True)
        try:
            r = traiter(uid, anny[uid], obs[uid], args.etapes)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            r = {"ok": False, "erreur": f"{type(e).__name__}: {e}"}
        res[uid] = r
        json.dump(res, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print(f"[{uid}] {'ok' if r.get('ok') else 'ECHEC'} ({r.get('duree_s', '?')}s)", flush=True)


if __name__ == "__main__":
    main()
