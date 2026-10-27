"""Nom et description des modeles du catalogue, a partir de leur photo.

Qwen3-VL 4B (le meme serveur que les patrons, `settings.vl_url`) remplit une
fiche FERMEE : la fiche de style validee lors des essais d'octobre 2026
(SCHEMA_V2 / CONSIGNE_V2, inchangees) plus deux champs, les couleurs et le
tissu. Le modele ne redige rien : le nom et la description sont composes ici,
en francais ET en anglais, pour le CLIENT (pas une fiche de tailleur) :

- nom = type + un evenement ou le porter, tire de son occasion
  (« Robe de soiree Gala », « Agbada Grand Mariage », « Kaba Marche ») ;
- description = ce qui fait le charme du modele, l'occasion ou le porter
  (deduite par des regles, `occasion()`), le concret et l'invitation a le
  faire coudre. Les tournures varient d'un modele a l'autre, de facon stable.

Rien n'est applique d'office : le resultat est une PROPOSITION
(`GarmentModel.ai_suggestion`, `ai_status = "proposed"`) que l'administrateur
valide, corrige ou ignore (Admin > Catalogue > Noms IA).

Lancement par lot : `python scripts/nommer_catalogue.py` (voir ce script).
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import unicodedata
import urllib.request
from datetime import datetime, timezone

from app.core.config import settings
from app.services.patrons import vision
from app.services.patrons.vision import CONSIGNE_V2, SCHEMA_V2, AnalyseImpossible

VERSION = 3  # 3 : noms d'événements (2 : textes côté client)
MODELE_VISION = "Qwen3-VL 4B"

COULEURS = [
    "black", "white", "cream", "beige", "brown", "red", "burgundy", "orange", "yellow", "gold",
    "green", "blue", "navy", "purple", "pink", "grey", "silver", "multicolor",
]
TISSUS = ["wax_print", "plain_cotton", "bazin", "lace", "satin", "sequins", "denim", "knit", "other", "unknown"]

SCHEMA_CATALOGUE: dict = {
    "type": "object",
    "properties": {
        **SCHEMA_V2["properties"],
        "colors": {"type": "array", "minItems": 1, "maxItems": 2, "items": {"enum": COULEURS}},
        "fabric": {"enum": TISSUS},
    },
    "required": [*SCHEMA_V2["required"], "colors", "fabric"],
}

CONSIGNE_CATALOGUE = CONSIGNE_V2 + """
Also give the 1 or 2 main colors of the garment (multicolor only when there are many colors) and its fabric:
wax_print = African printed cotton with bold patterns; bazin = shiny damask cotton, usually plain dyed; lace; satin = smooth and shiny; sequins = sparkling; plain_cotton = plain matte fabric."""

# --- Vocabulaire : francais (genre, accords) et anglais -------------------------

# Couleurs : (masculin, feminin, anglais).
_COULEUR: dict[str, tuple[str, str, str]] = {
    "black": ("noir", "noire", "black"), "white": ("blanc", "blanche", "white"),
    "cream": ("crème", "crème", "cream"), "beige": ("beige", "beige", "beige"),
    "brown": ("marron", "marron", "brown"), "red": ("rouge", "rouge", "red"),
    "burgundy": ("bordeaux", "bordeaux", "burgundy"), "orange": ("orange", "orange", "orange"),
    "yellow": ("jaune", "jaune", "yellow"), "gold": ("doré", "dorée", "gold"),
    "green": ("vert", "verte", "green"), "blue": ("bleu", "bleue", "blue"),
    "navy": ("bleu marine", "bleu marine", "navy"), "purple": ("violet", "violette", "purple"),
    "pink": ("rose", "rose", "pink"), "grey": ("gris", "grise", "grey"),
    "silver": ("argenté", "argentée", "silver"), "multicolor": ("multicolore", "multicolore", "multicolour"),
}
# Tissu -> (nom francais, feminin ?, anglais) ; None : non mentionne, la
# couleur s'accorde alors au vetement. Le wax n'est pas repete : c'est le
# tissu de la plupart des modeles du catalogue (« Kaba a etages violet »).
# Seuls les tissus qui distinguent un modele sont nommes.
_TISSU: dict[str, tuple[str, bool, str] | None] = {
    "wax_print": None, "bazin": ("bazin", False, "bazin"),
    "lace": ("dentelle", True, "lace"), "satin": ("satin", False, "satin"),
    "sequins": ("tissu pailleté", False, "sequined fabric"), "denim": ("jean", False, "denim"),
    "knit": ("maille", True, "knit"), "plain_cotton": None, "other": None, "unknown": None,
}
# Traits distinctifs : (masculin, feminin, anglais).
_TRAIT: dict[str, tuple[str, str, str]] = {
    "tiers": ("à étages", "à étages", "tiered"),
    "ruffles": ("à volants", "à volants", "ruffled"),
    "puffed": ("à manches bouffantes", "à manches bouffantes", "puff-sleeve"),
    "embroidery": ("brodé", "brodée", "embroidered"),
    "side_slit": ("fendu", "fendue", "side-slit"),
    "fitted": ("ajusté", "ajustée", "fitted"), "flared": ("évasé", "évasée", "flared"),
    "a_line": ("trapèze", "trapèze", "A-line"), "loose": ("ample", "ample", "loose"),
    "straight": ("droit", "droite", "straight"), "long": ("long", "longue", "long"),
}

def cle_nom(texte: str) -> str:
    """Forme de comparaison d'un nom (sans accents ni majuscules)."""
    return "".join(c for c in unicodedata.normalize("NFD", texte) if unicodedata.category(c) != "Mn").lower().strip()


def nom_de_base(categorie: str, genre: str, fiche: dict) -> tuple[str, bool, str]:
    """(nom francais, feminin ?, nom anglais) d'apres la categorie du
    catalogue, precisee par ce que le modele a vu (jupe ou pantalon dans
    « Bas »...)."""
    cat = cle_nom(categorie)
    vu = fiche.get("category")
    if cat == "kaba":
        return "Kaba", False, "kaba"
    if "robe" in cat:
        return ("Robe de soirée", True, "evening dress") if "soiree" in cat else ("Robe", True, "dress")
    if cat == "bas":
        if vu == "skirt":
            return "Jupe", True, "skirt"
        if vu == "trousers":
            return "Pantalon", False, "trousers"
        return "Bas", False, "bottom"
    if cat == "haut":
        if vu == "shirt":
            return "Chemise", True, "shirt"
        if vu == "kaftan_tunic":
            return "Tunique", True, "tunic"
        return "Haut", False, "top"
    if "tradition" in cat:
        if vu == "boubou":
            return "Boubou", False, "boubou"
        if vu == "agbada":
            return "Agbada", False, "agbada"
        if vu == "kaftan_tunic":
            if "trousers" in fiche.get("matching_pieces", []):
                return "Ensemble tunique et pantalon", False, "tunic and trousers set"
            return "Tunique", True, "tunic"
        if vu == "shirt":
            return "Chemise traditionnelle", True, "traditional shirt"
        if vu == "kaba":
            return "Kaba", False, "kaba"
        return "Tenue traditionnelle", True, "traditional outfit"
    nom = categorie.strip().capitalize() or "Modèle"
    return nom, genre == "female", nom.lower()


def traits(fiche: dict) -> list[str]:
    """Cles des traits distinctifs, du plus parlant au plus banal."""
    details = fiche.get("construction_details", [])
    sortie: list[str] = []
    if fiche.get("silhouette") == "tiered" or "tiers" in details:
        sortie.append("tiers")
    if "ruffles" in details:
        sortie.append("ruffles")
    if fiche.get("sleeve_style") == "puffed":
        sortie.append("puffed")
    for d in ("embroidery", "side_slit"):
        if d in details:
            sortie.append(d)
    if fiche.get("silhouette") in ("fitted", "flared", "a_line", "loose", "straight"):
        sortie.append(fiche["silhouette"])
    if fiche.get("length") in ("ankle", "floor"):
        sortie.append("long")
    return sortie


def _couleurs(fiche: dict) -> list[str]:
    return [c for c in fiche.get("colors", []) if c in _COULEUR][:2]


def _graine(*morceaux: str) -> int:
    """Nombre stable tiré du modèle : la même photo donne toujours le même
    texte, et deux modèles voisins ne prennent pas la même tournure."""
    return int(hashlib.md5("|".join(morceaux).encode("utf-8")).hexdigest()[:8], 16)


def _choisir(options: list, graine: int, rang: int = 0):
    return options[(graine // (7 ** rang)) % len(options)]


# --- Occasions (règles, pas l'IA) --------------------------------------------------

# Clé -> (français, anglais) : l'occasion citée dans la description.
OCCASIONS: dict[str, tuple[str, str]] = {
    "soiree": ("les soirées, les mariages et les galas", "evening events, weddings and galas"),
    "ceremonie": ("les mariages, les dots et les grandes cérémonies", "weddings, traditional ceremonies and big celebrations"),
    "fete": ("le culte, une dot ou les fêtes de famille", "church, a traditional wedding or family celebrations"),
    "vendredi": ("le vendredi, le culte ou les réunions de famille", "Fridays, church or family gatherings"),
    "quotidien": ("le quotidien, le marché ou les sorties entre amis", "everyday wear, the market or outings with friends"),
    "quotidien_f": ("le quotidien, le marché ou les sorties entre amies", "everyday wear, the market or outings with friends"),
    "bureau": ("le bureau, les sorties et le week-end", "the office, outings and weekends"),
}


def occasion(categorie: str, genre: str, fiche: dict) -> str:
    """Clé d'OCCASIONS, d'après le type de vêtement, le tissu et les détails."""
    base, _, _ = nom_de_base(categorie, genre, fiche)
    details = fiche.get("construction_details", [])
    brode = "embroidery" in details
    tissu = fiche.get("fabric")
    festif = brode or "ruffles" in details or "tiers" in details or fiche.get("silhouette") == "tiered" \
        or tissu in ("lace", "satin", "sequins")
    if base.startswith("Robe de soirée"):
        return "soiree"
    if base in ("Agbada",) or (tissu == "bazin" and brode):
        return "ceremonie"
    if base.startswith("Ensemble") or base == "Tunique" or base == "Chemise traditionnelle":
        return "ceremonie" if brode or tissu == "bazin" else "vendredi"
    if base in ("Kaba", "Boubou", "Tenue traditionnelle", "Robe"):
        if festif or tissu == "bazin":
            return "fete"
        return "quotidien_f" if genre == "female" else "quotidien"
    return "bureau"


# --- Noms : le type de vêtement + un événement où le porter ------------------------

# Occasion -> événements (français, anglais). Le nom dit au client QUAND il
# portera le modèle : « Robe de soirée Gala », « Agbada Grand Mariage »,
# « Kaba Marché ». Assez d'événements par occasion pour que les modèles
# voisins ne portent pas le même nom.
EVENEMENTS: dict[str, list[tuple[str, str]]] = {
    "soiree": [
        ("Gala", "Gala"), ("Cocktail", "Cocktail"), ("Soirée étoilée", "Starry Night"), ("Bal", "Ball"),
        ("Réveillon", "New Year's Eve"), ("Anniversaire", "Birthday"), ("Saint-Valentin", "Valentine"),
        ("Fiançailles", "Engagement"), ("Remise de diplômes", "Graduation"), ("Grand Soir", "Big Night"),
        ("Première", "Premiere"), ("Dîner de gala", "Gala Dinner"), ("Nuit blanche", "All-Nighter"),
        ("Soirée dansante", "Dance Night"), ("Vernissage", "Private View"),
    ],
    "ceremonie": [
        ("Grand Mariage", "Grand Wedding"), ("Mariage", "Wedding"), ("Dot", "Bride Price"), ("Tabaski", "Tabaski"),
        ("Aïd", "Eid"), ("Fiançailles", "Engagement"), ("Intronisation", "Enthronement"), ("Ngondo", "Ngondo"),
        ("Nguon", "Nguon"), ("Medumba", "Medumba"), ("Fête nationale", "National Day"), ("Noël", "Christmas"),
        ("Nouvel An", "New Year"), ("Grande Cérémonie", "Grand Ceremony"), ("Jour J", "Big Day"),
        ("Mariage coutumier", "Customary Wedding"), ("Couronnement", "Coronation"),
    ],
    "fete": [
        ("Baptême", "Christening"), ("Dot", "Bride Price"), ("Pâques", "Easter"), ("Noël", "Christmas"),
        ("Fête des mères", "Mother's Day"), ("Retrouvailles", "Reunion"), ("Dimanche", "Sunday"),
        ("Communion", "Communion"), ("Mariage civil", "Civil Wedding"), ("Anniversaire", "Birthday"),
        ("Fête de famille", "Family Party"), ("Culte", "Service"), ("Réception", "Reception"),
        ("Fête des pères", "Father's Day"), ("Nouvel An", "New Year"),
    ],
    "vendredi": [
        ("Vendredi", "Friday"), ("Réunion de famille", "Family Gathering"), ("Culte", "Service"),
        ("Dimanche", "Sunday"), ("Visite", "Visit"), ("Retrouvailles", "Reunion"), ("Prière", "Prayer"),
        ("Accueil", "Welcome"), ("Repas de famille", "Family Meal"), ("Causerie", "Gathering"),
    ],
    "quotidien": [
        ("Marché", "Market"), ("Dimanche", "Sunday"), ("Promenade", "Stroll"), ("Week-end", "Weekend"),
        ("Brunch", "Brunch"), ("Pique-nique", "Picnic"), ("Balade", "Walk"), ("Goûter", "Tea Time"),
        ("Retrouvailles", "Reunion"), ("Sortie", "Day Out"), ("Visite", "Visit"), ("Vacances", "Holiday"),
        ("Plage", "Beach"), ("Matinée", "Morning"), ("Terrasse", "Terrace"),
    ],
    "bureau": [
        ("Afterwork", "Afterwork"), ("Bureau", "Office"), ("Réunion", "Meeting"), ("Brunch", "Brunch"),
        ("Week-end", "Weekend"), ("Séminaire", "Seminar"), ("Entretien", "Interview"), ("Déjeuner", "Lunch"),
        ("Rentrée", "Back to Work"), ("Sortie", "Day Out"), ("Conférence", "Conference"), ("Lundi", "Monday"),
        ("Rendez-vous", "Appointment"), ("Terrasse", "Terrace"), ("Voyage", "Trip"),
    ],
}
EVENEMENTS["quotidien_f"] = EVENEMENTS["quotidien"]


def _nom(base: str, base_en: str, evenement: tuple[str, str], trait: str | None, fem: bool) -> tuple[str, str]:
    fr = f"{base} {evenement[0]}"
    en = f"{evenement[1]} {base_en}"
    if trait:
        fr += f" {_TRAIT[trait][1 if fem else 0]}"
        en = f"{evenement[1]} {_TRAIT[trait][2]} {base_en}"
    return fr, en[0].upper() + en[1:]


def nommer(categorie: str, genre: str, fiche: dict, deja_pris: set[str] | frozenset[str] = frozenset(),
           graine: str = "") -> tuple[str, str]:
    """(nom français, nom anglais) : « Robe de soirée Gala » / « Gala evening
    dress », « Kaba Marché » / « Market kaba ». L'événement est tiré de
    l'occasion du modèle ; un nom déjà pris essaie l'événement suivant, puis
    un trait de la coupe, puis un numéro."""
    base, fem, base_en = nom_de_base(categorie, genre, fiche)
    g = _graine(graine, categorie, json.dumps(fiche, sort_keys=True))
    liste = EVENEMENTS[occasion(categorie, genre, fiche)]
    depart = g % len(liste)
    evenements = [liste[(depart + i) % len(liste)] for i in range(len(liste))]
    candidats: list[tuple[str, str]] = [_nom(base, base_en, e, None, fem) for e in evenements]
    for t in traits(fiche)[:2]:
        candidats += [_nom(base, base_en, e, t, fem) for e in evenements[:3]]
    for fr, en in candidats:
        if cle_nom(fr) not in deja_pris:
            return fr, en
    fr, en = candidats[0]
    i = 2
    while cle_nom(f"{fr} n°{i}") in deja_pris:
        i += 1
    return f"{fr} n°{i}", f"{en} no. {i}"


# --- Descriptions : donner envie, dire quand le porter -----------------------------

# Trait -> tournures d'accroche (français, anglais).
ACCROCHES: dict[str, list[tuple[str, str]]] = {
    "tiers": [("Des étages qui dansent à chaque pas.", "Tiers that sway with every step."),
              ("Ses étages lui donnent du mouvement et du volume.", "Its tiers bring movement and volume.")],
    "ruffles": [("Des volants pleins de légèreté.", "Light, playful ruffles."),
                ("Ses volants apportent une touche joyeuse.", "Its ruffles add a joyful touch.")],
    "embroidery": [("Des broderies qui font tout son chic.", "Embroidery that makes all the difference."),
                   ("Ses broderies lui donnent une allure de fête.", "Its embroidery gives it a festive air.")],
    "side_slit": [("Une fente qui révèle juste ce qu'il faut.", "A slit that reveals just enough.")],
    "puffed": [("Des manches bouffantes qui ont du caractère.", "Puffed sleeves with plenty of character.")],
    "fitted": [("Une coupe près du corps qui met la silhouette en valeur.", "A close-fitting cut that flatters the figure.")],
    "flared": [("Une coupe évasée qui bouge avec vous.", "A flared cut that moves with you.")],
    "a_line": [("Une coupe trapèze qui flatte toutes les silhouettes.", "An A-line cut that flatters every figure.")],
    "loose": [("Une coupe ample dans laquelle on se sent libre toute la journée.", "A loose cut you feel free in all day."),
              ("Tout en ampleur et en confort.", "All about volume and comfort.")],
    "straight": [("Une coupe droite, simple et élégante.", "A straight cut, simple and elegant.")],
    "long": [("Une longueur qui donne de l'allure.", "A length that adds grace.")],
}
ACCROCHE_DEFAUT = [("Un modèle facile à porter, qui va avec tout.", "An easy-to-wear style that goes with everything.")]

# Tournures invariables (« idéal » ne s'accorderait pas avec « robe »).
INTRO_OCCASION = [("Le choix idéal pour {o}.", "Ideal for {o}."), ("Un modèle parfait pour {o}.", "Perfect for {o}."),
                  ("À porter pour {o}.", "Made for {o}.")]
INVITATIONS = [
    ("faites-{le} coudre à vos mesures", "have it sewn to your measurements"),
    ("à faire coudre à vos mesures par votre tailleur", "for your tailor to sew to your measurements"),
    ("choisissez-{le} et envoyez vos mesures à votre tailleur", "choose it and send your measurements to your tailor"),
]

_LONGUEUR = {"hip": ("aux hanches", "hip length"), "thigh": ("mi-cuisse", "mid-thigh"), "knee": ("au genou", "knee length"),
             "midi": ("mi-mollet", "midi length"), "ankle": ("à la cheville", "ankle length"),
             "floor": ("jusqu'au sol", "floor length")}
_MANCHES = {"sleeveless": ("sans manches", "sleeveless"), "short": ("manches courtes", "short sleeves"),
            "elbow": ("manches au coude", "elbow sleeves"), "three_quarter": ("manches trois-quarts", "three-quarter sleeves"),
            "long": ("manches longues", "long sleeves")}
_STYLE_MANCHES = {"puffed": ("manches bouffantes", "puffed sleeves"), "wide": ("manches larges", "wide sleeves"),
                  "ruffled": ("manches à volants", "ruffled sleeves"), "flared": ("manches évasées", "flared sleeves")}
_ASSORTI = {"trousers": ("son pantalon", "trousers"), "head_wrap": ("son foulard de tête", "head wrap"),
            "cap": ("son bonnet", "cap"), "inner_tunic": ("sa tunique de dessous", "inner tunic")}


def _en_couleurs(fiche: dict) -> tuple[str, str]:
    """« En bazin blanc » / « In white bazin », « En violet et jaune » / « In purple and yellow »."""
    tissu = _TISSU.get(fiche.get("fabric", "unknown"))
    cs = _couleurs(fiche)
    if tissu:
        fem = tissu[1]
        teinte = " et ".join(_COULEUR[c][1 if fem else 0] for c in cs)
        return (f"en {tissu[0]} {teinte}".strip(), " ".join(x for x in ["in", " and ".join(_COULEUR[c][2] for c in cs), tissu[2]] if x))
    if not cs:
        return "", ""
    if cs == ["multicolor"]:
        return "tout en couleurs", "full of colour"
    return "en " + " et ".join(_COULEUR[c][0] for c in cs), "in " + " and ".join(_COULEUR[c][2] for c in cs)


def decrire(categorie: str, genre: str, fiche: dict, langue: str = "fr", graine: str = "") -> str:
    """Trois ou quatre phrases courtes, côté client : l'accroche (ce qui fait
    le charme du modèle), l'occasion, le concret et l'invitation à le faire
    coudre, puis les pièces assorties."""
    en = langue == "en"
    i = 1 if en else 0
    base, fem, _ = nom_de_base(categorie, genre, fiche)
    g = _graine(graine, categorie, json.dumps(fiche, sort_keys=True))

    t = traits(fiche)
    accroche = _choisir(ACCROCHES.get(t[0], ACCROCHE_DEFAUT) if t else ACCROCHE_DEFAUT, g, 0)[i]
    occ = OCCASIONS[occasion(categorie, genre, fiche)][i]
    p2 = _choisir(INTRO_OCCASION, g, 1)[i].format(o=occ)

    concret = []
    couleur = _en_couleurs(fiche)[i]
    if couleur:
        concret.append(couleur)
    style = fiche.get("sleeve_style")
    if style in _STYLE_MANCHES and "puffed" not in t[:1]:
        concret.append(_STYLE_MANCHES[style][i])
    elif fiche.get("sleeves") in _MANCHES:
        concret.append(_MANCHES[fiche["sleeves"]][i])
    if fiche.get("length") in _LONGUEUR:
        concret.append(_LONGUEUR[fiche["length"]][i])
    invitation = _choisir(INVITATIONS, g, 2)[i].replace("{le}", "la" if fem else "le")
    if concret:
        texte = ", ".join(concret)
        p3 = f"{texte[0].upper()}{texte[1:]}{':' if en else ' :'} {invitation}."
    else:
        p3 = f"{invitation[0].upper()}{invitation[1:]}."

    assorties = [_ASSORTI[p] for p in fiche.get("matching_pieces", []) if p in _ASSORTI]
    p4 = ""
    if assorties and not base.startswith("Ensemble"):
        if en:
            noms_en = [a[1] for a in assorties]
            liste_en = noms_en[0] if len(noms_en) == 1 else ", ".join(noms_en[:-1]) + " and " + noms_en[-1]
            p4 = f"Worn with its matching {liste_en}."
        else:
            noms = [a[0] for a in assorties]
            liste = noms[0] if len(noms) == 1 else ", ".join(noms[:-1]) + " et " + noms[-1]
            p4 = f"À porter avec {liste} assorti{'s' if len(noms) > 1 else ''}."
    return " ".join(x for x in [accroche, p2, p3, p4] if x)[:2000]


# --- Vision ----------------------------------------------------------------------

def _appeler(url: str, contenu: bytes, timeout_s: float) -> str:
    """Meme requete que les patrons, avec la fiche du catalogue."""
    image = base64.b64encode(vision._image_reduite(contenu)).decode("ascii")
    corps = {
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image}"}},
                {"type": "text", "text": CONSIGNE_CATALOGUE},
            ],
        }],
        "temperature": vision.TEMPERATURE,
        "max_tokens": vision.MAX_TOKENS + 60,
        "response_format": {"type": "json_schema", "json_schema": {"name": "fiche_catalogue", "schema": SCHEMA_CATALOGUE}},
    }
    req = urllib.request.Request(
        url.rstrip("/") + "/v1/chat/completions",
        data=json.dumps(corps).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as rep:
            donnees = json.loads(rep.read().decode("utf-8"))
        return donnees["choices"][0]["message"]["content"]
    except (OSError, TimeoutError) as e:
        raise AnalyseImpossible(f"Service de vision injoignable ({e})") from e
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise AnalyseImpossible("Réponse illisible du service de vision") from e


def nettoyer(brut: dict) -> dict:
    """Fiche de style nettoyee (vision.nettoyer) + couleurs et tissu."""
    fiche = vision.nettoyer(brut)
    couleurs: list[str] = []
    for c in brut.get("colors") if isinstance(brut.get("colors"), list) else []:
        if c in COULEURS and c not in couleurs:
            couleurs.append(c)
    fiche["colors"] = couleurs[:2]
    fiche["fabric"] = brut.get("fabric") if brut.get("fabric") in TISSUS else "unknown"
    return fiche


def analyser(contenu: bytes, url: str | None = None, timeout_s: float | None = None) -> dict:
    """Photo -> fiche du catalogue nettoyee."""
    url = url or settings.vl_url
    if not url:
        raise AnalyseImpossible("Service de vision non configuré (VL_URL)")
    texte = _appeler(url, contenu, timeout_s or settings.vl_timeout_s)
    try:
        brut = json.loads(texte)
    except ValueError as e:
        raise AnalyseImpossible("Fiche illisible") from e
    if not isinstance(brut, dict):
        raise AnalyseImpossible("Fiche illisible")
    return nettoyer(brut)


def proposition(categorie: str, genre: str, fiche: dict, deja_pris: set[str] | frozenset[str] = frozenset(),
                graine: str = "") -> dict:
    """Ce qui est enregistre dans `GarmentModel.ai_suggestion`. `graine`
    (l'identifiant du modele) fait varier les tournures d'un modele a l'autre."""
    nom, nom_en = nommer(categorie, genre, fiche, deja_pris, graine)
    return {
        "name": nom,
        "description": decrire(categorie, genre, fiche, "fr", graine),
        "name_en": nom_en,
        "description_en": decrire(categorie, genre, fiche, "en", graine),
        "occasion": occasion(categorie, genre, fiche),
        "fiche": fiche,
        "modele": MODELE_VISION,
        "version": VERSION,
        "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def lire_photo(photo_url: str) -> bytes:
    """Contenu de la couverture : fichier local (/uploads/...) ou adresse web."""
    if photo_url.startswith("/uploads/"):
        chemin = os.path.join(settings.upload_dir, *photo_url[len("/uploads/"):].split("/"))
        with open(chemin, "rb") as f:
            return f.read()
    if photo_url.startswith(("http://", "https://")):
        with urllib.request.urlopen(photo_url, timeout=60) as rep:
            return rep.read()
    raise FileNotFoundError(photo_url)
