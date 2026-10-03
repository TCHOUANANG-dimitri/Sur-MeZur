"""
Voie B (initialisation) et voie A (ajustement) de la specification.

VOIE B — telle qu'implementee ici
  La specification prevoit un regresseur photo pre-entraine (SAM 3D Body ->
  MHR, ou de type SHAPY). Il n'est pas utilisable sur ce poste : poids
  soumis a autorisation sur Hugging Face, detectron2 a compiler, modele de
  631 a 840 M de parametres sans GPU (voir README). L'initialisation retenue
  est donc l'A PRIORI ANTHROPOMETRIQUE d'Anny : seuls les phenotypes taille
  et poids bougent, pour reproduire la taille et le poids mesures. C'est le
  « corps moyen pour ce gabarit », point de depart que la voie A ancre
  ensuite sur les photos. Ses mesures sont aussi evaluees seules : c'est la
  reference « Anny sans photo » (deja testee en aout, exp14).

VOIE A — ajustement (§4)
  Cout additionne, chaque terme branche sur une observation :
    - taille : la hauteur du maillage doit valoir la taille mesuree ;
    - masse : volume x densite doit valoir le poids mesure. C'est ce qui
      remplace l'epaisseur de vetement de la production : le corps doit
      peser son poids tout en restant DANS la silhouette ;
    - silhouette comme borne : a chaque tranche du tronc, largeur (face) et
      profondeur (profil) du corps ne doivent pas depasser la silhouette
      observee ; en deca, penalite faible au-dela d'une tolerance ;
    - landmarks : longueurs des segments (epaules, hanches, bras,
      avant-bras, cuisse, jambe, tronc) entre points COCO d'Anny et points
      MediaPipe de la photo de face ;
    - a priori de forme : rappel des parametres vers l'initialisation.

  Ecart assume avec la specification : pas de rendu differentiable
  PyTorch3D (non installable sans compilateur C++ sur ce poste). Le role
  qu'il joue — comparer le corps projete a la silhouette — est tenu par la
  comparaison tranche par tranche des largeurs/profondeurs du tronc, qui est
  exactement l'information que la silhouette porte sur les tours. Les
  landmarks sont compares en LONGUEURS plutot qu'en positions 2D : cela
  dispense d'estimer la pose et la camera de chaque photo, et une longueur
  de segment ne depend pas de la pose.
"""

from __future__ import annotations

import time

import torch

from . import config
from .corps import CorpsAnny
from .observations import Cibles


def _phenotypes_initiaux(gender: str) -> dict[str, float]:
    p = dict(config.PHENOTYPE_INITIAL)
    # Anny : ancres gender = ["male", "female"], donc 0 = homme, 1 = femme
    # (l'inverse de l'ancienne convention MakeHuman ; clad-body lit de meme
    # « femme si gender > 0,5 »).
    p["gender"] = 0.0 if gender == "male" else 1.0
    return p


def initialiser(c: Cibles) -> tuple[CorpsAnny, dict]:
    """Voie B (a priori) : taille et poids reproduits, le reste a la moyenne."""
    corps = CorpsAnny(_phenotypes_initiaux(c.gender), config.LOCAUX)
    params = corps.parametres(["height", "weight"], avec_locaux=False)
    opt = torch.optim.Adam(params, lr=config.INIT_LR)
    t0 = time.time()
    for _ in range(config.INIT_ETAPES):
        opt.zero_grad()
        out = corps.passe()
        h = corps.hauteur_cm(out)
        m = corps.masse_kg(out)
        loss = ((h - c.height_cm) / config.SIGMA_TAILLE_CM) ** 2 + ((m - c.weight_kg) / config.SIGMA_MASSE_KG) ** 2
        loss.backward()
        opt.step()
    with torch.no_grad():
        out = corps.passe()
        info = {
            "hauteur_cm": round(float(corps.hauteur_cm(out)), 2),
            "masse_kg": round(float(corps.masse_kg(out)), 2),
            "duree_s": round(time.time() - t0, 1),
        }
    return corps, info


def _longueurs_modele(corps: CorpsAnny, out: dict) -> dict[str, torch.Tensor]:
    P = lambda lab: corps.point(out, lab)  # noqa: E731
    d = lambda a, b: torch.linalg.norm(P(a) - P(b)) * 100.0  # noqa: E731
    mid = lambda a, b: (P(a) + P(b)) / 2  # noqa: E731
    return {
        "epaules": d("left_shoulder", "right_shoulder"),
        "hanches": d("left_hip", "right_hip"),
        "bras": (d("left_shoulder", "left_elbow") + d("right_shoulder", "right_elbow")) / 2,
        "avant_bras": (d("left_elbow", "left_wrist") + d("right_elbow", "right_wrist")) / 2,
        "cuisse": (d("left_hip", "left_knee") + d("right_hip", "right_knee")) / 2,
        "jambe": (d("left_knee", "left_ankle") + d("right_knee", "right_ankle")) / 2,
        "tronc": torch.linalg.norm(mid("left_shoulder", "right_shoulder") - mid("left_hip", "right_hip")) * 100.0,
    }


def _borne(modele: torch.Tensor, observe: torch.Tensor) -> torch.Tensor:
    """Silhouette comme borne : forte penalite au-dessus, faible en dessous."""
    ok = ~torch.isnan(modele)
    m, o = modele[ok], observe[ok]
    if m.numel() == 0:
        return modele.new_zeros(())
    depasse = torch.relu(m - o) / config.SIGMA_DEPASSE_CM
    en_deca = torch.relu(o - m - config.TOLERANCE_VETEMENT_CM) / config.SIGMA_EN_DECA_CM
    return (depasse**2).mean() + (en_deca**2).mean()


def ajuster(corps: CorpsAnny, c: Cibles, etapes: int | None = None) -> dict:
    """Voie A : ancre le corps initialise sur les observations photo."""
    etapes = etapes or config.AJUST_ETAPES
    libres = list(config.PHENO_LIBRES)
    if c.gender == "female":
        libres += config.PHENO_LIBRES_FEMME
    params = corps.parametres(libres, avec_locaux=True)
    depart = {k: v.detach().clone() for k, v in corps.brut_pheno.items()}
    opt = torch.optim.Adam(params, lr=config.AJUST_LR)

    fr_l = [f for f, _ in c.largeurs]
    ob_l = torch.tensor([w for _, w in c.largeurs], dtype=torch.float32)
    fr_p = [f for f, _ in c.profondeurs]
    ob_p = torch.tensor([w for _, w in c.profondeurs], dtype=torch.float32)

    # Rejet des longueurs incompatibles avec le corps a priori (config).
    with torch.no_grad():
        lm0 = _longueurs_modele(corps, corps.passe())
    longueurs = {}
    rejetees = {}
    for k, v in c.longueurs.items():
        ref = float(lm0[k])
        if abs(v - ref) / ref <= config.ECART_MAX_LONGUEUR:
            longueurs[k] = v
        else:
            rejetees[k] = {"observee": v, "a_priori": round(ref, 1)}

    historique = []
    t0 = time.time()
    for etape in range(etapes):
        opt.zero_grad()
        out = corps.passe()
        termes = {}
        termes["taille"] = ((corps.hauteur_cm(out) - c.height_cm) / config.SIGMA_TAILLE_CM) ** 2
        termes["masse"] = ((corps.masse_kg(out) - c.weight_kg) / config.SIGMA_MASSE_KG) ** 2
        if fr_l:
            termes["silhouette_face"] = _borne(corps.tranches(out, fr_l, "lateral"), ob_l)
        if fr_p:
            termes["silhouette_profil"] = _borne(corps.tranches(out, fr_p, "avant"), ob_p)
        if longueurs:
            lm = _longueurs_modele(corps, out)
            ecarts = torch.stack([(lm[k] - v) / config.SIGMA_LONGUEUR_CM for k, v in longueurs.items()])
            termes["landmarks"] = config.POIDS_LONGUEURS * torch.nn.functional.huber_loss(
                ecarts, torch.zeros_like(ecarts), delta=1.0, reduction="mean"
            )
        prior = sum(
            ((torch.sigmoid(corps.brut_pheno[k]) - torch.sigmoid(depart[k])) / config.SIGMA_PHENO) ** 2
            for k in libres
            if k in corps.brut_pheno
        )
        prior = prior + sum((torch.tanh(v) / config.SIGMA_LOCAL) ** 2 for v in corps.brut_local.values()) / max(
            1, len(corps.brut_local)
        )
        termes["a_priori"] = prior
        loss = sum(termes.values())
        loss.backward()
        opt.step()
        if etape % 20 == 0 or etape == etapes - 1:
            historique.append({k: round(float(v), 3) for k, v in termes.items()} | {"etape": etape})

    with torch.no_grad():
        out = corps.passe()
        bilan = {
            "hauteur_cm": round(float(corps.hauteur_cm(out)), 2),
            "masse_kg": round(float(corps.masse_kg(out)), 2),
            "largeurs_modele": [round(float(x), 1) for x in corps.tranches(out, fr_l, "lateral")] if fr_l else [],
            "largeurs_observees": [round(float(x), 1) for x in ob_l] if fr_l else [],
            "profondeurs_modele": [round(float(x), 1) for x in corps.tranches(out, fr_p, "avant")] if fr_p else [],
            "profondeurs_observees": [round(float(x), 1) for x in ob_p] if fr_p else [],
            "longueurs_modele": {k: round(float(v), 1) for k, v in _longueurs_modele(corps, out).items()},
            "longueurs_observees": c.longueurs,
            "longueurs_rejetees": rejetees,
        }
    return {"historique": historique, "bilan": bilan, "duree_s": round(time.time() - t0, 1)}
