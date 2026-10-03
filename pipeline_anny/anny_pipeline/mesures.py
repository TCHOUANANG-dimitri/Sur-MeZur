"""
Extraction des mensurations sur le maillage Anny ajuste (§2, « extraction
de mesures ... selon ISO 8559 »).

clad-body lit les mesures ISO 8559-1 sur le corps en pose A. Il ne fournit
pas le tour de cheville : il est calcule ici comme le ferait un metre ruban,
perimetre de l'enveloppe convexe de la section horizontale de la jambe, au
plus fin juste au-dessus des malleoles.

ATTENTION aux definitions : ISO 8559 ne mesure pas toujours la meme chose
que nos tailleurs. Les 3 longueurs ci-dessous sont donc mesurees ici en
definition « tailleur » (comme la prod, backend/app/services/vision/
features.py), et NON reprises de clad-body :
   - shoulder      tailleur : corde d'emmanchure a emmanchure, estimee comme
                   la prod (distance articulations epaules x 0,90) ;
                   ISO (non utilise) : arc acromion -> C7 -> acromion (~40 cm).
   - inseam        tailleur : perinee -> cheville (perinee ISO moins hauteur
                   de cheville lue sur le corps) ;
                   ISO (non utilise) : perinee -> sol.
   - back_length   tailleur : corde milieu des epaules -> milieu des hanches,
                   avec le facteur sexe de la prod (1,0 H / 0,919 F) ;
                   ISO (non utilise) : 7e cervicale -> taille en suivant le dos.
"""

from __future__ import annotations

import numpy as np

from . import compat  # noqa: F401

# Facteurs repris tels quels de la prod (backend/app/services/vision/
# features.py) : la comparaison Anny/prod porte alors sur la MEME grandeur.
JOINT_TO_SHOULDER_WIDTH = 0.90
BACK_LENGTH_BY_SEX = {"male": 1.0, "female": 0.919}

# cle clad-body -> notre cle
CORRESPONDANCE = {
    "neck_cm": "neck",
    "bust_cm": "chest",
    "waist_cm": "waist",
    "hip_cm": "hips",
    "upperarm_cm": "biceps",
    "thigh_cm": "thigh",
    "wrist_cm": "wrist",
    "shoulder_width_cm": "shoulder",
    "sleeve_length_cm": "sleeve_length",
    "inseam_cm": "inseam",
    "back_neck_to_waist_cm": "back_length",
}

BANDE_CHEVILLE_M = (0.08, 0.16)


def _perimetre_convexe(points_2d: np.ndarray) -> float:
    from scipy.spatial import ConvexHull

    if len(points_2d) < 3:
        return float("nan")
    hull = ConvexHull(points_2d)
    p = points_2d[hull.vertices]
    return float(np.sum(np.linalg.norm(np.roll(p, -1, axis=0) - p, axis=1)))


def tour_cheville_cm(mesh) -> float | None:
    """Plus petit tour (enveloppe convexe) dans la bande au-dessus des
    malleoles, moyenne des deux jambes. Maillage en metres, Z vers le haut,
    pieds a z = 0."""
    v = np.asarray(mesh.vertices)
    zmin = v[:, 2].min()
    meilleur = None
    for z in np.arange(BANDE_CHEVILLE_M[0], BANDE_CHEVILLE_M[1], 0.005):
        sec = mesh.section(plane_origin=[0, 0, zmin + z], plane_normal=[0, 0, 1])
        if sec is None:
            continue
        pts = np.asarray(sec.vertices)[:, :2]
        if len(pts) < 6:
            continue
        # Deux jambes : separees selon l'axe lateral (celui de plus grande
        # etendue a cette hauteur).
        axe = int(np.argmax(np.ptp(pts, axis=0)))
        centre = np.median(pts[:, axe])
        tours = []
        for cote in (pts[pts[:, axe] < centre], pts[pts[:, axe] >= centre]):
            if len(cote) >= 3:
                tours.append(_perimetre_convexe(cote))
        if len(tours) == 2 and all(np.isfinite(tours)):
            t = float(np.mean(tours))
            if meilleur is None or t < meilleur:
                meilleur = t
    return None if meilleur is None else round(meilleur * 100.0, 1)


def extraire(corps, gender: str | None = None) -> dict[str, float]:
    """Mensurations (nos 12 cles, en cm) du corps courant.

    Les 8 tours viennent de clad-body (ISO 8559-1, definitions communes avec
    le tailleur) + cheville calculee ici. Les 3 longueurs shoulder / inseam /
    back_length sont mesurees en definition « tailleur » (voir ci-dessus),
    pas reprises de clad-body.

    Reutilise le modele deja charge (`load_anny_from_verts`) : en recreer un
    par appel (`load_anny_from_params`) coutait ~100 s sur ce poste."""
    from clad_body.load.anny import load_anny_from_verts
    from clad_body.measure import measure

    out_a = corps.passe_apose()
    body = load_anny_from_verts(
        out_a["vertices"],
        corps.model,
        phenotype_kwargs={k: v.detach() for k, v in corps.pheno().items()},
        local_changes_kwargs={k: v.detach() for k, v in corps.local().items()},
        bone_heads=out_a.get("bone_heads"),
        bone_tails=out_a.get("bone_tails"),
    )
    m = measure(body, only=list(CORRESPONDANCE) + ["height_cm", "mass_kg"])
    out = {notre: round(float(m[cle]), 1) for cle, notre in CORRESPONDANCE.items() if m.get(cle) is not None}
    cheville = tour_cheville_cm(body.mesh)
    if cheville is not None:
        out["ankle"] = cheville
    # Les 3 longueurs « tailleur » ecrasent leurs homonymes ISO.
    tailleur = longueurs_tailleur_cm(corps, inseam_iso_cm=m.get("inseam_cm"), gender=gender)
    out.update({k: v for k, v in tailleur.items() if v is not None})
    out["_hauteur_cm"] = round(float(m.get("height_cm", float("nan"))), 1)
    out["_masse_kg_iso"] = round(float(m.get("mass_kg", float("nan"))), 1)
    return out


def longueurs_tailleur_cm(corps, inseam_iso_cm: float | None = None, gender: str | None = None) -> dict[str, float]:
    """Carrure / entrejambe / dos en definition tailleur, lus sur le corps.

    - shoulder : distance entre articulations d'epaules (points COCO du
      corps, independante de la pose) x 0,90 — exactement la formule prod.
    - inseam : hauteur du perinee ISO moins hauteur de cheville lue sur le
      meme corps (moyenne des 2 chevilles COCO).
    - back_length : corde milieu des epaules -> milieu des hanches, x le
      facteur sexe de la prod.
    """
    import torch

    if gender is None:
        try:
            g = float(corps.pheno()["gender"].detach())
            gender = "female" if g > 0.5 else "male"
        except Exception:
            gender = "male"
    with torch.no_grad():
        out = corps.passe()  # pose de repos : ces 3 longueurs n'en dependent pas
        epg = corps.point(out, "left_shoulder")
        epd = corps.point(out, "right_shoulder")
        hag = corps.point(out, "left_hip")
        had = corps.point(out, "right_hip")
        chg = corps.point(out, "left_ankle")
        chd = corps.point(out, "right_ankle")
        shoulder = float(torch.linalg.norm(epg - epd) * 100.0) * JOINT_TO_SHOULDER_WIDTH
        mid_ep = (epg + epd) / 2
        mid_ha = (hag + had) / 2
        dos = float(torch.linalg.norm(mid_ep - mid_ha) * 100.0) * BACK_LENGTH_BY_SEX.get((gender or "").lower(), 1.0)
        res: dict[str, float] = {
            "shoulder": round(shoulder, 1),
            "back_length": round(dos, 1),
        }
        if inseam_iso_cm is not None:
            cheville_h = float((chg[2] + chd[2]) / 2 * 100.0)
            res["inseam"] = round(float(inseam_iso_cm) - cheville_h, 1)
    return res
