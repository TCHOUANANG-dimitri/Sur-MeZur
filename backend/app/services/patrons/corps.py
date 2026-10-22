"""Mesures Sur-MeZur -> mesures du corps GarmentCode (26 valeurs, en cm).

Nos mesures (carnet du tailleur, chaine photo, questionnaire) n'en couvrent
qu'une partie. Chaque valeur GarmentCode recoit une provenance :

- `mesuree` : prise telle quelle d'une de nos mesures ;
- `deduite` : calculee a partir de plusieurs de nos mesures ;
- `estimee` : valeur du corps moyen GarmentCode (femme ou homme) mise a
  l'echelle de la personne (tour de poitrine, de hanches, taille ou longueur
  de dos selon la mesure).

Le tailleur voit cette provenance dans la fiche du patron : une valeur estimee
est une valeur a verifier.
"""

from __future__ import annotations

from pathlib import Path

import yaml

GABARITS_DIR = Path(__file__).resolve().parents[3] / "third_party" / "garmentcode" / "assets" / "bodies"

# Notre cle -> cle GarmentCode (meme definition de mesure).
DIRECTES = {
    "height": "height",
    "chest": "bust",
    "underbust": "underbust",
    "waist": "waist",
    "hips": "hips",
    "thigh": "leg_circ",
    "wrist": "wrist",
    "shoulder": "shoulder_w",
    "sleeve_length": "arm_length",
    "back_length": "waist_line",
    "waist_hip_height": "hips_line",
}
# Autres noms rencontres dans les donnees (carnet, ancienne chaine).
ALIAS = {
    "height_total": "height",
    "taille": "height",
    "sleeve": "sleeve_length",
    "bust": "chest",
}
LIBELLES = {
    "height": "Taille (hauteur)", "chest": "Tour de poitrine", "underbust": "Tour sous-poitrine",
    "waist": "Tour de taille", "hips": "Tour de hanches", "thigh": "Tour de cuisse",
    "wrist": "Tour de poignet", "shoulder": "Largeur d'épaules", "sleeve_length": "Longueur de bras",
    "back_length": "Longueur dos (nuque-taille)", "waist_hip_height": "Hauteur taille-hanches",
    "neck": "Tour de cou", "inseam": "Entrejambe", "outseam": "Longueur taille-sol",
    "ankle": "Tour de cheville", "biceps": "Tour de bras", "height_total": "Taille (hauteur)",
}
# Plages plausibles (cm) : au-dela, on refuse plutot que de tracer n'importe quoi.
PLAGES = {
    "height": (120, 215), "chest": (60, 170), "underbust": (55, 160), "waist": (45, 170),
    "hips": (65, 180), "thigh": (35, 100), "wrist": (11, 26), "shoulder": (26, 60),
    "sleeve_length": (35, 80), "back_length": (28, 60), "waist_hip_height": (10, 35),
    "neck": (26, 55), "inseam": (55, 100), "outseam": (75, 130),
}
# Mesure GarmentCode estimee -> notre mesure qui donne l'echelle.
ECHELLE = {
    "underbust": "chest", "back_width": "chest", "bust_points": "chest", "neck_w": "chest",
    "waist_back_width": "waist",
    "hip_back_width": "hips", "bum_points": "hips", "leg_circ": "hips",
    "shoulder_w": "chest", "wrist": "chest",
    # longueurs du buste : longueur de dos si connue, sinon hauteur
    "bust_line": "back_length", "vert_bust_line": "back_length",
    "waist_over_bust_line": "back_length", "armscye_depth": "back_length",
    "waist_line": "height", "hips_line": "height", "head_l": "height",
    "arm_length": "height", "crotch_hip_diff": "height",
}
# Angles : on garde ceux du gabarit.
ANGLES = ("arm_pose_angle", "hip_inclination", "shoulder_incl")
# Largeur de cou GarmentCode ~ 0,52 x tour de cou (corps moyens GarmentCode).
RAPPORT_COU = 0.52


class MesuresInvalides(ValueError):
    pass


def gabarit(genre: str) -> dict:
    nom = "mean_male.yaml" if genre == "homme" else "mean_female.yaml"
    with open(GABARITS_DIR / nom, encoding="utf-8") as f:
        return dict(yaml.safe_load(f)["body"])


def normaliser(mesures: dict) -> dict:
    """Garde les valeurs numeriques, applique les alias, verifie les plages."""
    propres: dict[str, float] = {}
    for cle, val in (mesures or {}).items():
        cle = ALIAS.get(cle, cle)
        try:
            v = float(val)
        except (TypeError, ValueError):
            continue
        if v <= 0:
            continue
        propres.setdefault(cle, v)
    hors = [
        f"{LIBELLES.get(k, k)} : {v:g} cm (attendu {a}-{b})"
        for k, v in propres.items()
        if k in PLAGES and not (PLAGES[k][0] <= v <= PLAGES[k][1])
        for a, b in [PLAGES[k]]
    ]
    if hors:
        raise MesuresInvalides("Mesures hors limites : " + " ; ".join(hors))
    return propres


def corps_garmentcode(mesures: dict, genre: str = "femme") -> tuple[dict, dict]:
    """Rend (mesures GarmentCode, provenance par mesure GarmentCode)."""
    m = normaliser(mesures)
    manquantes = [k for k in ("waist",) if k not in m]
    if manquantes:
        raise MesuresInvalides("Le tour de taille est indispensable.")
    g = gabarit(genre)
    gc: dict[str, float] = {}
    prov: dict[str, str] = {}

    for notre, cle in DIRECTES.items():
        if notre in m:
            gc[cle] = m[notre]
            prov[cle] = "mesuree"
    if "neck" in m:
        gc["neck_w"] = round(RAPPORT_COU * m["neck"], 2)
        prov["neck_w"] = "deduite"

    # Rapports personne / gabarit pour mettre a l'echelle ce qui manque.
    ref_gc = {"chest": "bust", "waist": "waist", "hips": "hips", "height": "height", "back_length": "waist_line"}
    rapports = {}
    for notre, cle in ref_gc.items():
        rapports[notre] = (m[notre] / g[cle]) if notre in m else None
    # A defaut de la mesure de reference, on se rabat sur une voisine.
    replis = {"chest": ["hips", "waist"], "hips": ["chest", "waist"], "back_length": ["height"],
              "height": ["back_length"], "waist": []}
    for notre in list(rapports):
        if rapports[notre] is None:
            rapports[notre] = next((rapports[r] for r in replis[notre] if rapports.get(r)), 1.0)

    for cle, ref in ECHELLE.items():
        if cle not in gc:
            gc[cle] = round(g[cle] * rapports[ref], 2)
            prov[cle] = "estimee"
    for cle in ANGLES:
        gc[cle] = g[cle]
        prov[cle] = "estimee"
    for cle in g:
        if cle not in gc:
            gc[cle] = round(g[cle] * rapports["height"], 2)
            prov[cle] = "estimee"

    # Entrejambe connu : la difference hanches-entrejambe s'en deduit.
    if "inseam" in m:
        hauteur_hanches = gc["height"] - gc["head_l"] - gc["waist_line"] - gc["hips_line"]
        diff = hauteur_hanches - m["inseam"]
        if 3 <= diff <= 20:
            gc["crotch_hip_diff"] = round(diff, 2)
            prov["crotch_hip_diff"] = "deduite"

    # Coherences minimales (le dos ne peut pas faire tout le tour).
    gc["waist_back_width"] = min(gc["waist_back_width"], 0.6 * gc["waist"])
    gc["hip_back_width"] = min(gc["hip_back_width"], 0.6 * gc["hips"])
    gc["back_width"] = min(gc["back_width"], 0.6 * gc["bust"])
    return gc, prov


def avec_aisances(gc: dict, aisances: dict) -> dict:
    """Ajoute les aisances (cm, tour complet) aux tours GarmentCode, en gardant
    les memes proportions devant/dos."""
    out = dict(gc)
    paires = {"chest": ("bust", "back_width"), "waist": ("waist", "waist_back_width"),
              "hips": ("hips", "hip_back_width"), "thigh": ("leg_circ", None)}
    for notre, ajout in (aisances or {}).items():
        if notre not in paires or not ajout:
            continue
        tour, dos = paires[notre]
        facteur = (out[tour] + ajout) / out[tour]
        out[tour] = round(out[tour] + ajout, 2)
        if dos:
            out[dos] = round(out[dos] * facteur, 2)
    if "chest" in (aisances or {}) and aisances["chest"]:
        out["underbust"] = round(out["underbust"] + aisances["chest"], 2)
    return out
