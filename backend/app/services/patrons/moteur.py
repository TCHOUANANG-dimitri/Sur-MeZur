"""Moteur « garmentcode-v1 » : modele de base + style + mesures -> patron.

    generer("jupe_droite", {"waist": 72, "hips": 100, ...}, style={"longueur_cm": 60})

Etapes :
1. mesures -> corps GarmentCode (corps.py), puis aisances ajoutees aux tours ;
2. modele de base + style -> parametres GarmentCode (`_design`) ; les
   longueurs en cm sont converties dans les fractions qu'attend GarmentCode ;
3. GarmentCode trace les panneaux (copie dans third_party/garmentcode) ;
4. geometrie.py en fait des pieces de coupe, export.py les dessine ;
5. controles : contours fermes, coutures de meme longueur, longueur au sol.

GarmentCode est importe a la demande : le backend demarre sans lui.
"""

from __future__ import annotations

import copy
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path

from . import catalogue as cat
from .corps import LIBELLES, RAPPORT_COU, MesuresInvalides, avec_aisances, corps_garmentcode
from .export import cotes_piece, horodatage, pdf_echelle, pdf_tracage, points_tracage, svg_patron
from .geometrie import ouvrir_pli, preparer, rectangle

MOTEUR = "garmentcode-v1"
GC_DIR = Path(__file__).resolve().parents[3] / "third_party" / "garmentcode"
VALEUR_COUTURE_CM = 1.0

# Chemise (cm). Croisure : ce qui depasse du milieu devant pour boutonner.
CROISURE_CM = 1.75
PIED_DE_COL_H = 3.0
COL_H = 4.5
POIGNET_H = 6.0
POIGNET_AISANCE = 5.0  # autour du poignet, plus la croisure
ESPACE_BOUTONS = 9.0
ENC_DEVANT_CM = 8.0  # profondeur d'encolure de chemise, sous le point de cou
ENC_DOS_CM = 2.0

_verrou = threading.Lock()
_gc: dict = {}


class PatronImpossible(ValueError):
    """Demande impossible a tracer (base inconnue, mesures, style)."""


def _charger():
    """Importe GarmentCode une seule fois (il s'installe dans sys.path sous les
    noms `pygarment` et `assets`, comme dans son depot d'origine)."""
    with _verrou:
        if not _gc:
            if str(GC_DIR) not in sys.path:
                sys.path.insert(0, str(GC_DIR))
            import yaml
            from assets.bodies.body_params import BodyParameters
            from assets.garment_programs.meta_garment import MetaGarment, TotalLengthError

            with open(GC_DIR / "assets" / "design_params" / "default.yaml", encoding="utf-8") as f:
                _gc["defaut"] = yaml.safe_load(f)["design"]
            _gc.update(MetaGarment=MetaGarment, BodyParameters=BodyParameters, TotalLengthError=TotalLengthError)
    return _gc


@dataclass
class Patron:
    base: cat.ModeleBase
    style: dict
    pieces: list
    coutures: list
    corps: dict
    provenance: dict
    mesures: dict
    aisances: dict
    controles: list = field(default_factory=list)
    remarques: list = field(default_factory=list)

    @property
    def lignes_cartouche(self) -> list[str]:
        estimees = sorted(k for k, v in self.provenance.items() if v == "estimee")
        return [
            f"Patron Sur-MeZur — {self.base.label}",
            "Échelle 1:1, cotes en cm sur la ligne de couture — valeur de couture "
            f"{_fmt(VALEUR_COUTURE_CM)} cm comprise dans la ligne de coupe (sauf pliure).",
            "Mesures : " + ", ".join(f"{LIBELLES.get(k, k)} {_fmt(v)}" for k, v in self.mesures.items()),
            "Aisances : " + (", ".join(f"{LIBELLES.get(k, k)} +{_fmt(v)}" for k, v in self.aisances.items() if v) or "aucune")
            + f" — {len(estimees)} valeur(s) du corps estimée(s) — {horodatage()}",
        ]

    def fiche(self) -> dict:
        """Fiche technique (JSON) rangee dans TailorPatternRequest.result."""
        return {
            "engine": MOTEUR,
            "base": {"id": self.base.id, "label": self.base.label, "categorie": self.base.categorie,
                     "statut": self.base.statut},
            "style": self.style,
            "scale": "1:1 mm",
            "seam_allowance_mm": VALEUR_COUTURE_CM * 10,
            "mesures_cm": self.mesures,
            "aisances_cm": self.aisances,
            "corps_garmentcode": {k: {"valeur": round(v, 1), "provenance": self.provenance.get(k)}
                                  for k, v in sorted(self.corps.items()) if not k.startswith("_")},
            "estimated_values": any(v == "estimee" for k, v in self.provenance.items()
                                    if k in ("bust", "waist", "hips", "waist_line", "height")),
            "pieces": [
                {"nom": p.nom, "consigne": p.consigne, "quantite": p.quantite, **cotes_piece(p),
                 "points": [{k: v for k, v in pt.items() if k != "_p"} for pt in points_tracage(p)]}
                for p in self.pieces
            ],
            "coutures": self.coutures,
            "controles": self.controles,
            "remarques": self.remarques,
        }


def _fmt(v: float) -> str:
    return f"{v:g}".replace(".", ",")


def _regler(design: dict, chemin: str, valeur) -> None:
    noeud = design
    for p in chemin.split("."):
        noeud = noeud[p]
    lo_hi = noeud.get("range")
    if noeud.get("type") in ("float", "int") and lo_hi:
        valeur = min(max(valeur, lo_hi[0]), lo_hi[1])
    noeud["v"] = valeur


def _manches(d: dict, style: dict) -> None:
    frac = cat.MANCHES.get(style.get("manches", "courtes"), 0.25)
    if frac is None:
        _regler(d, "sleeve.sleeveless", True)
        return
    _regler(d, "sleeve.sleeveless", False)
    _regler(d, "sleeve.length", frac)
    if frac >= 0.75:
        _regler(d, "sleeve.end_width", 0.8)


def _encolure(d: dict, style: dict) -> None:
    e = style.get("encolure", "ronde")
    _regler(d, "collar.f_collar", cat.ENCOLURES.get(e, "CircleNeckHalf"))
    _regler(d, "collar.b_collar", "CircleNeckHalf")
    if e == "v":
        _regler(d, "collar.fc_depth", 0.6)
    elif e == "bateau":
        _regler(d, "collar.width", 0.7)
        _regler(d, "collar.fc_depth", 0.3)


def _design(base: cat.ModeleBase, style: dict, corps: dict, remarques: list) -> dict:
    """Parametres GarmentCode pour cette base et ce style. Les longueurs (cm)
    deviennent les fractions de GarmentCode, bornees a ses plages."""
    d = copy.deepcopy(_charger()["defaut"])
    jambe = corps["height"] - corps["head_l"] - corps["waist_line"] - corps["hips_line"]  # _leg_length
    niveau_taille = jambe + corps["hips_line"]
    L = float(style.get("longueur_cm") or 0)
    sol = corps["height"] - corps["head_l"]  # nuque -> sol

    # Au plus 3 cm au-dessus du sol (GarmentCode compte aussi la pente d'epaule).
    maxi = niveau_taille - 3 if base.longueur_depuis == "taille" else sol - 6
    if L > maxi:
        remarques.append(f"Longueur ramenée de {_fmt(L)} à {_fmt(round(maxi))} cm pour ne pas toucher le sol.")
        L = maxi
    # Partie jupe d'une robe : longueur depuis la taille.
    L_jupe = L - corps["waist_line"] if base.longueur_depuis == "nuque" else L
    frac_jupe = (L_jupe - corps["hips_line"]) / jambe

    prog = base.programme
    if prog in ("jupe_ajustee", "robe_ajustee"):
        _regler(d, "meta.bottom", "PencilSkirt")
        _regler(d, "pencil-skirt.length", frac_jupe)
        evase = {"peu": 1.15, "moyenne": 1.3, "forte": 1.45}.get(style.get("ampleur"), 1.0)
        _regler(d, "pencil-skirt.flare", evase)
        fente = float(style.get("fente_cm") or 0)
        if fente > 0:
            _regler(d, "pencil-skirt.back_slit", fente / max(frac_jupe * jambe, 1))
    if prog in ("jupe_cloche", "robe_cloche"):
        _regler(d, "meta.bottom", "SkirtCircle")
        _regler(d, "flare-skirt.length", frac_jupe)
        _regler(d, "flare-skirt.suns", {"peu": 0.35, "moyenne": 0.5, "forte": 1.0}.get(style.get("ampleur"), 0.5))
    if prog in ("jupe_ajustee", "jupe_cloche", "pantalon"):
        _regler(d, "meta.wb", "StraightWB")
    if prog in ("robe_ajustee", "robe_cloche", "haut_ajuste"):
        _regler(d, "meta.upper", "FittedShirt")
        _manches(d, style)
        _encolure(d, style)
    if prog in ("ample", "ample_etages", "chemise"):
        _regler(d, "meta.upper", "Shirt")
        _regler(d, "shirt.width", 1.0)  # l'aisance est deja dans le tour de poitrine
        _manches(d, style)
        _encolure(d, style)
    if prog == "chemise":
        # Encolure de chemise : au ras du cou (largeur = celle du cou), creusee
        # devant, presque droite au dos. Le pied de col s'y monte.
        _regler(d, "collar.f_collar", "CircleNeckHalf")
        _regler(d, "collar.b_collar", "CircleNeckHalf")
        # Largeur d'encolure de chemise ~ tour de cou / 3 + 2 cm (encolure ~ cou
        # + 2 cm, pour boutonner sans serrer) ; GarmentCode
        # l'exprime en fraction (negative) de sa largeur de cou.
        tour_cou = corps["neck_w"] / RAPPORT_COU
        cible = tour_cou / 3 + 2
        d["collar"]["width"]["v"] = max(-0.5, min(0.0, cible / corps["neck_w"] - 1))
        # Profondeurs : premiere passe a 0, corrigees ensuite (generer).
        d["collar"]["fc_depth"]["v"] = 0.0
        d["collar"]["bc_depth"]["v"] = 0.0
        _regler(d, "shirt.length", L / corps["waist_line"])
        _regler(d, "shirt.flare", 1.0)
        if style.get("manches") == "longues":
            # La manche s'arrete au poignet rapporte (un peu de blousant garde).
            _regler(d, "sleeve.length", max(0.6, 1 - (POIGNET_H - 1) / corps["arm_length"]))
    if prog == "ample":
        _regler(d, "shirt.length", L / corps["waist_line"])
        _regler(d, "shirt.flare", {"peu": 1.0, "moyenne": 1.25, "forte": 1.5}.get(style.get("ampleur"), 1.0))
    if prog == "ample_etages":
        _regler(d, "shirt.length", 1.0)
        _regler(d, "meta.bottom", "SkirtLevels")
        _regler(d, "levels-skirt.base", "Skirt2")
        _regler(d, "levels-skirt.level", "Skirt2")
        etages = int(style.get("etages") or 2)  # etages en tout, jupe de base comprise
        _regler(d, "levels-skirt.num_levels", etages - 1)
        _regler(d, "levels-skirt.level_ruffle", 1.3)
        _regler(d, "levels-skirt.base_length_frac", 1 / etages)
        _regler(d, "levels-skirt.length", frac_jupe)
        _regler(d, "skirt.ruffle", 1.0)
    if prog == "pantalon":
        _regler(d, "meta.bottom", "Pants")
        _regler(d, "pants.length", frac_jupe)
        _regler(d, "pants.width", 1.0)
        _regler(d, "pants.flare", 1.0)
    return d


def _verifier_style(base: cat.ModeleBase, style: dict | None) -> dict:
    propre = dict(base.style_defaut)
    for k, v in (style or {}).items():
        if k not in base.style_defaut:
            continue  # reglage sans effet sur cette base : ignore
        regle = cat.STYLES[k]
        if regle["type"] == "choix":
            if v not in regle["choix"]:
                raise PatronImpossible(f"{regle['label']} : « {v} » n'est pas un choix possible.")
        else:
            try:
                v = float(v)
            except (TypeError, ValueError):
                raise PatronImpossible(f"{regle['label']} : nombre attendu.")
            if v < 0 or v > 200:
                raise PatronImpossible(f"{regle['label']} : valeur hors limites.")
        propre[k] = v
    return propre


def generer(base_id: str, mesures: dict, style: dict | None = None, genre: str | None = None,
            aisances: dict | None = None) -> Patron:
    base = cat.BASES_PAR_ID.get(base_id)
    if base is None:
        raise PatronImpossible(f"Modèle de base inconnu : {base_id}")
    demande = dict(style or {})
    style = _verifier_style(base, style)
    genre = genre if genre in ("femme", "homme") else base.genre
    try:
        corps, provenance = corps_garmentcode(mesures, genre)
    except MesuresInvalides as e:
        raise PatronImpossible(str(e))
    ais = dict(base.aisances)
    ais.update({k: float(v) for k, v in (aisances or {}).items() if k in ("chest", "waist", "hips", "thigh")})
    corps_aise = avec_aisances(corps, ais)
    if base.programme == "ample_etages":
        # Kaba : pas de taille marquee. La jupe a etages part de la largeur du
        # haut (GarmentCode la prendrait au tour de taille, plus etroit).
        corps_aise["waist"] = corps_aise["bust"]
        corps_aise["waist_back_width"] = corps_aise["back_width"]
    # Longueur par defaut d'un pantalon : longueur taille-sol mesuree si connue.
    if base.programme == "pantalon" and "longueur_cm" not in demande and _num((mesures or {}).get("outseam")):
        style["longueur_cm"] = float(mesures["outseam"])

    remarques: list[str] = []
    if base.programme == "agbada":
        pieces, coutures = _pieces_agbada(corps_aise, style, remarques)
        _reperes_et_notes(pieces, corps_aise, base, remarques)
        controles = _controles(pieces, coutures, corps_aise, base)
        mes = {k: round(float(v), 1) for k, v in mesures.items() if isinstance(v, (int, float)) or _num(v)}
        return Patron(base, style, pieces, coutures, corps_aise, provenance, mes, ais, controles, remarques)
    gc = _charger()
    design = _design(base, style, corps_aise, remarques)
    body = gc["BodyParameters"](GC_DIR / "assets" / "bodies" / ("mean_male.yaml" if genre == "homme" else "mean_female.yaml"))
    body.load_from_dict(corps_aise)
    # GarmentCode reecrit certaines valeurs du design en place : une copie par trace.
    vetement = gc["MetaGarment"](base.id, body, copy.deepcopy(design))
    if base.programme == "chemise":
        # GarmentCode ajoute la pente d'epaule a la profondeur demandee : on
        # mesure la premiere passe, puis on corrige pour obtenir les
        # profondeurs d'une chemise (8 cm devant, 2 cm dos sous le point de cou).
        essai, _ = preparer(vetement.assembly().pattern, VALEUR_COUTURE_CM)
        pente = body["_bust_line"]
        for nom, cle, voulu in (("Devant", "fc_depth", ENC_DEVANT_CM), ("Dos", "bc_depth", ENC_DOS_CM)):
            piece = next((p for p in essai if p.nom == nom), None)
            if piece is not None:
                design["collar"][cle]["v"] += (voulu - _profondeur_encolure(piece)) / pente
        vetement = gc["MetaGarment"](base.id, body, copy.deepcopy(design))
    controles = []
    try:
        vetement.assert_total_length()
        controles.append({"controle": "longueur", "statut": "ok", "detail": "le vêtement ne dépasse pas le sol"})
    except gc["TotalLengthError"]:
        controles.append({"controle": "longueur", "statut": "a_verifier", "detail": "le vêtement touche le sol"})
    spec = vetement.assembly().pattern
    if vetement.is_self_intersecting():
        controles.append({"controle": "contours", "statut": "echec", "detail": "une pièce se recoupe"})

    pieces, coutures = preparer(spec, VALEUR_COUTURE_CM)
    if base.programme == "ample_etages":
        _nommer_etages(pieces, coutures)
    if base.programme == "chemise":
        pieces += _pieces_chemise(pieces, corps_aise, style, remarques)
    _reperes_et_notes(pieces, corps_aise, base, remarques)
    controles += _controles(pieces, coutures, corps_aise, base)

    mes = {k: round(float(v), 1) for k, v in mesures.items() if isinstance(v, (int, float)) or _num(v)}
    return Patron(base, style, pieces, coutures, corps_aise, provenance, mes, ais, controles, remarques)


def _profondeur_encolure(piece) -> float:
    """Profondeur d'encolure d'une piece au pli : du point de cou (haut de
    l'epaule) au haut de la pliure."""
    pli = next(a for a in piece.aretes if a.role == "pli")
    haut_pli = max(pli.pts[0][1], pli.pts[-1][1])
    return float(piece.anneau()[:, 1].max() - haut_pli)


def _bord_d_encolure(piece) -> float:
    """Longueur du bord d'encolure d'une piece au pli : le bord qui part du
    haut de la pliure (milieu devant ou dos)."""
    import numpy as np

    pli = next(a for a in piece.aretes if a.role == "pli")
    haut = pli.pts[0] if pli.pts[0][1] > pli.pts[-1][1] else pli.pts[-1]
    for a in piece.aretes:
        if a is pli:
            continue
        if np.allclose(a.pts[0], haut, atol=0.05) or np.allclose(a.pts[-1], haut, atol=0.05):
            return a.longueur
    raise PatronImpossible("Encolure introuvable sur la pièce " + piece.nom)


def _pieces_chemise(pieces, corps, style, remarques) -> list:
    """Chemise : devants ouverts (milieu devant + croisure), puis les pieces
    que GarmentCode ne trace pas — pied de col, col, patte de boutonnage,
    poignets — en rectangles cotes, a partir de l'encolure reellement tracee."""
    devant = next(p for p in pieces if p.nom == "Devant")
    dos = next(p for p in pieces if p.nom == "Dos")
    encolure = 2 * (_bord_d_encolure(devant) + _bord_d_encolure(dos))
    hauteur_milieu = next(a for a in devant.aretes if a.role == "pli").longueur

    milieu = ouvrir_pli(devant, CROISURE_CM, VALEUR_COUTURE_CM)
    devant.quantite = 2
    devant.consigne = "Couper 2 (en vis-à-vis)"
    if milieu is not None:
        devant.reperes.append((milieu, "milieu devant — boutons"))

    ajout = [
        rectangle("pied_de_col", "Pied de col", round(encolure + 2 * CROISURE_CM, 1), PIED_DE_COL_H, 2,
                  "Couper 2 (+ 1 en entoilage)", VALEUR_COUTURE_CM),
        rectangle("col", "Col", round(encolure + 2, 1), COL_H, 2,
                  "Couper 2 (+ 1 en entoilage)", VALEUR_COUTURE_CM),
        rectangle("patte", "Patte de boutonnage", 2 * CROISURE_CM, round(hauteur_milieu, 1), 2,
                  "Couper 2 (+ 2 en entoilage)", VALEUR_COUTURE_CM),
    ]
    longues = style.get("manches") == "longues"
    if longues:
        poignet = round(float(corps.get("wrist") or 17) + POIGNET_AISANCE + 2 * CROISURE_CM, 1)
        ajout.append(rectangle("poignet", "Poignet", poignet, POIGNET_H, 4,
                               "Couper 4 (+ 2 en entoilage)", VALEUR_COUTURE_CM))

    n_boutons = max(4, round(hauteur_milieu / ESPACE_BOUTONS))
    remarques.append(
        f"Encolure tracée : {_fmt(round(encolure, 1))} cm (tour complet). Le pied de col fait l'encolure "
        f"+ {_fmt(2 * CROISURE_CM)} cm de croisure ; le col se monte sur le pied de col, "
        "milieux dos l'un sur l'autre."
    )
    remarques.append(
        f"Devant : le bord est à {_fmt(CROISURE_CM)} cm du milieu devant (croisure). La patte se coud "
        "endroit contre endroit sur ce bord, puis se retourne vers l'intérieur. Boutons et boutonnières "
        f"sur le milieu devant : {n_boutons} boutons, le premier sur le pied de col, puis tous les "
        f"{_fmt(round(hauteur_milieu / n_boutons, 1))} cm environ (boutonnières à droite pour un homme, "
        "à gauche pour une femme)."
    )
    if longues:
        remarques.append(
            f"Poignet : {_fmt(POIGNET_H)} cm de haut fini, 4 pièces (dessus et dessous de 2 poignets). Fente de manche de 10 cm au bas de la couture "
            "arrière ; répartir l'excédent du bas de manche en 2 plis vers la fente."
        )
    return ajout


def _pieces_agbada(corps, style, remarques):
    """Agbada : deux grands panneaux au pli (devant, dos) qui vont de l'axe du
    corps jusqu'au poignet, avec l'encolure. Coupe traditionnelle, tracee
    sans GarmentCode (qui ne sait pas faire des « ailes » aussi larges)."""
    import numpy as np

    from .geometrie import Arete, Piece, ligne_de_coupe, redresser

    sol = corps["height"] - corps["head_l"]
    L = min(float(style.get("longueur_cm") or 130), sol - 6)
    W = round(corps["shoulder_w"] / 2 + 0.95 * corps["arm_length"], 1)  # axe -> poignet
    cou = corps["neck_w"] / RAPPORT_COU
    demi_enc = cou / 6 + 1.5

    def panneau(cle, nom, profondeur):
        t = np.linspace(0, np.pi / 2, 24)
        encolure = np.column_stack([demi_enc * np.sin(t), L - profondeur * np.cos(t)])  # pli -> epaule
        aretes = [
            Arete(np.array([[0.0, 0.0], [W, 0.0]]), False, (cle, 0)),          # bas
            Arete(np.array([[W, 0.0], [W, L]]), False, (cle, 1)),              # cote (poignet -> bas)
            Arete(np.array([[W, L], [demi_enc, L]]), False, (cle, 2)),         # epaule
            Arete(encolure[::-1].copy(), True, (cle, 3)),                       # encolure
            Arete(np.array([[0.0, L - profondeur], [0.0, 0.0]]), False, (cle, 4), role="pli"),
        ]
        piece = Piece(cle, nom, aretes, 1, "Couper 1 au pli")
        piece.coupe = ligne_de_coupe(piece, VALEUR_COUTURE_CM)
        redresser(piece)
        return piece

    devant, dos = panneau("agbada_f", "Devant", 12.0), panneau("agbada_b", "Dos", 2.0)
    for p, lettre in ((devant, "A"), (dos, "A")):
        p.aretes[2].lettre = lettre
    for p in (devant, dos):
        p.aretes[1].lettre = "B"
    long_epaule = round(devant.aretes[2].longueur, 1)
    coutures = [
        {"lettre": "A", "piece_1": "Devant", "longueur_1": long_epaule, "piece_2": "Dos",
         "longueur_2": round(dos.aretes[2].longueur, 1), "manche": False, "bords": 2},
        {"lettre": "B", "piece_1": "Devant", "longueur_1": round(L, 1), "piece_2": "Dos",
         "longueur_2": round(L, 1), "manche": False, "bords": 2},
    ]
    remarques.append(
        f"Panneaux de {_fmt(round(2 * W))} cm de large (d'un poignet à l'autre) : coudre les épaules (A) "
        "de l'encolure au poignet."
    )
    return [devant, dos], coutures


def _nommer_etages(pieces, coutures) -> None:
    """Jupe a etages : GarmentCode nomme la jupe de base « skirt » puis les
    etages 0, 1... ; pour le tailleur, etage 1 = celui du haut."""
    import re

    def renomme(nom: str) -> str:
        if nom.startswith("Jupe "):
            return "Étage 1 " + nom[5:]
        m = re.match(r"Étage (\d+) (.*)", nom)
        return f"Étage {int(m.group(1)) + 2} {m.group(2)}" if m else nom

    for p in pieces:
        p.nom = renomme(p.nom)
    for c in coutures:
        c["piece_1"], c["piece_2"] = renomme(c["piece_1"]), renomme(c["piece_2"])


def _reperes_et_notes(pieces, corps, base, remarques) -> None:
    """Ligne des hanches sur les jupes droites et pantalons, et consignes
    pratiques que le trace seul ne dit pas."""
    import numpy as np
    from shapely.geometry import LineString

    if base.programme in ("jupe_ajustee", "robe_ajustee", "pantalon"):
        for p in pieces:
            if not p.nom.startswith(("Jupe", "Pantalon")):
                continue
            anneau = p.anneau()
            y = anneau[:, 1].max() - corps["hips_line"]
            ligne = LineString([(anneau[:, 0].min() - 1, y), (anneau[:, 0].max() + 1, y)]).intersection(p.polygone())
            if ligne.geom_type == "LineString" and not ligne.is_empty:
                p.reperes.append((np.asarray(ligne.coords), "ligne des hanches"))
    ceinture = next((p for p in pieces if p.nom.startswith("Ceinture")), None)
    if ceinture is not None:
        h = float(np.ptp(ceinture.anneau()[:, 1]))
        remarques.append(f"Ceinture : hauteur finie {_fmt(round(h, 1))} cm. Si elle est pliée en deux, "
                         "tracer le double de hauteur (plus les coutures).")
    if base.programme in ("robe_ajustee", "robe_cloche", "haut_ajuste", "jupe_ajustee"):
        remarques.append("Fermeture : les pièces sont tracées au pli. Pour une fermeture éclair au milieu dos, "
                         f"couper le dos en 2 et ajouter {_fmt(VALEUR_COUTURE_CM)} cm de couture au milieu.")
    if base.id == "boubou_simple":
        remarques.append("Côtés : laisser une fente de 25 à 30 cm au bas de chaque couture de côté.")
    if base.id == "agbada_simple":
        remarques.append("Côtés : coudre seulement les 40 cm du bas ; le haut reste ouvert pour passer les bras, "
                         "les pans tombent sur les bras. Ourler les bords ouverts.")
    remarques.append(f"Ourlet : la valeur de couture du bas est de {_fmt(VALEUR_COUTURE_CM)} cm ; "
                     "ajouter la hauteur d'ourlet voulue sous la ligne du bas.")


def _num(v) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def _controles(pieces, coutures, corps, base) -> list[dict]:
    out = []
    invalides = [p.nom for p in pieces if not p.polygone().is_valid]
    out.append({"controle": "contours", "statut": "echec" if invalides else "ok",
                "detail": ("pièce(s) mal fermée(s) : " + ", ".join(invalides)) if invalides else "toutes les pièces sont fermées"})
    haut = lambda n: n.startswith("Ceinture") or n in ("Devant", "Dos")  # noqa: E731
    bas = lambda n: n.split()[0] in ("Jupe", "Pantalon") or n.startswith("Étage 1 ")  # noqa: E731
    taille = [c for c in coutures if (haut(c["piece_1"]) and bas(c["piece_2"])) or (bas(c["piece_1"]) and haut(c["piece_2"]))]
    if taille:
        t_haut = sum(c["longueur_1"] if haut(c["piece_1"]) else c["longueur_2"] for c in taille)
        t_bas = sum(c["longueur_2"] if haut(c["piece_1"]) else c["longueur_1"] for c in taille)
        ok = abs(t_haut - t_bas) <= 0.6
        out.append({"controle": "couture de taille", "statut": "ok" if ok else "a_verifier",
                    "detail": f"haut {_fmt(round(t_haut, 1))} cm / bas {_fmt(round(t_bas, 1))} cm (demi-tours, pièces au pli)"})
    for c in coutures:
        ecart = c["longueur_1"] - c["longueur_2"]
        noms = (c["piece_1"], c["piece_2"])
        dos_devant = all(n.split()[0] in ("Jupe", "Pantalon") for n in noms) and any(n.endswith("dos") for n in noms)
        if abs(ecart) <= 0.5:
            statut, detail = "ok", "même longueur"
        elif c in taille:
            statut, detail = "info", (f"écart de {_fmt(round(abs(ecart), 1))} cm : les coutures de côté du haut et du bas "
                                      "sont décalées d'autant, seul le tour total compte (voir couture de taille)")
        elif dos_devant and abs(ecart) <= 3:
            statut, detail = "info", (f"dos plus long de {_fmt(round(abs(ecart), 1))} cm vers la hanche : embu prévu "
                                      "par le tracé, à répartir en cousant (ou recouper le dos)")
        elif c["manche"] and 0 < abs(ecart) <= 4.5:
            statut, detail = "ok", f"embu de manche {_fmt(round(abs(ecart), 1))} cm (normal)"
        elif max(c["longueur_1"], c["longueur_2"]) / max(min(c["longueur_1"], c["longueur_2"]), 0.1) > 1.15:
            statut, detail = "ok", "fronces prévues (un bord plus long que l'autre)"
        else:
            statut, detail = "a_verifier", f"écart de {_fmt(round(abs(ecart), 1))} cm"
        out.append({"controle": f"couture {c['lettre']}", "statut": statut,
                    "detail": f"{c['piece_1']} {_fmt(c['longueur_1'])} / {c['piece_2']} {_fmt(c['longueur_2'])} cm — {detail}"})
    ceintures = [p for p in pieces if p.nom.startswith("Ceinture")]
    if ceintures:
        tour = sum(cotes_piece(p)["largeur_cm"] * (2 if p.consigne.endswith("au pli") else p.quantite) for p in ceintures)
        attendu = corps["waist"]
        ok = abs(tour - attendu) <= 1.5
        out.append({"controle": "tour de taille", "statut": "ok" if ok else "a_verifier",
                    "detail": f"ceinture {_fmt(round(tour, 1))} cm pour {_fmt(round(attendu, 1))} cm attendus (taille + aisance)"})
    return out


def fichiers(patron: Patron) -> dict[str, bytes]:
    """Les fichiers a stocker : svg (ecran), pdf A4 a assembler, pdf pleine
    taille, fiche de tracage."""
    lignes = patron.lignes_cartouche
    a4, _ = pdf_echelle(patron.pieces, lignes)
    plein, _ = pdf_echelle(patron.pieces, lignes, pleine_page=True)
    return {
        "svg": svg_patron(patron.pieces, lignes).encode("utf-8"),
        "a4.pdf": a4,
        "plein.pdf": plein,
        "tracage.pdf": pdf_tracage(patron.pieces, lignes, VALEUR_COUTURE_CM, patron.coutures, patron.remarques),
    }
