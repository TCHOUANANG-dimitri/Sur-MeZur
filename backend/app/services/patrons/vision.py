"""Analyse de la photo d'un modele par Qwen3-VL 4B : la fiche de style.

Etape 1 du pipeline (Documentation/architecture-pipeline-patron-ia.pdf) :
le modele de vision « voit le style » ; il ne mesure rien et ne dessine
rien. Les centimetres viennent des mensurations, le trace de GarmentCode.

Le modele tourne sur le VPS dans `llama-server` (llama.cpp), garde en
memoire et joignable seulement en local (deploy/contabo/surmezur-vl.service).
`settings.vl_url` vide : l'analyse est desactivee et le tailleur remplit la
fiche lui-meme, comme avant.

SCHEMA_V2 et CONSIGNE_V2 sont ceux valides lors des essais sur le VPS
(octobre 2026, 4B Q4_K_M) : 6 categories justes sur 6 sur nos vetements,
85 a 90 % des champs justes. Erreurs connues : boutons inventes sur les
tuniques, doublons, petites poches manquees, un detail invente de temps en
temps. D'ou les regles appliquees ici : doublons retires, et les DETAILS ne
sont que des suggestions, decochees, que le tailleur confirme.
"""

from __future__ import annotations

import base64
import io
import json
import urllib.error
import urllib.request

from .catalogue import BASES_PAR_ID, CATEGORIE_PAR_VISION, CATEGORIES_PAR_ID, bases_de

SCHEMA_V2: dict = {
    "type": "object",
    "properties": {
        "category": {"enum": ["kaba", "boubou", "agbada", "kaftan_tunic", "dress", "skirt", "shirt", "top", "trousers", "other"]},
        "length": {"enum": ["hip", "thigh", "knee", "midi", "ankle", "floor", "unknown"]},
        "silhouette": {"enum": ["fitted", "straight", "a_line", "flared", "loose", "tiered", "unknown"]},
        "waist": {"enum": ["fitted_waist", "no_waist_shaping", "elastic", "belt", "not_applicable", "unknown"]},
        "neckline": {"enum": ["round", "v", "slit", "square", "boat", "shirt_collar", "mandarin_collar", "not_applicable", "unknown"]},
        "sleeves": {"enum": ["sleeveless", "short", "elbow", "three_quarter", "long", "not_applicable", "unknown"]},
        "sleeve_style": {"enum": ["plain", "ruffled", "flared", "puffed", "wide", "not_applicable", "unknown"]},
        "closure": {"enum": ["front_buttons", "partial_placket", "zip", "none_visible", "unknown"]},
        "pockets": {"enum": ["none_visible", "patch_pockets_front", "chest_pocket", "side_seam_pockets", "unknown"]},
        "construction_details": {
            "type": "array", "maxItems": 4,
            "items": {"enum": ["yoke", "gathers", "ruffles", "tiers", "pleats", "darts", "front_panel_seams",
                               "embroidery", "contrast_trim", "side_slit"]},
        },
        "matching_pieces": {
            "type": "array", "maxItems": 3,
            "items": {"enum": ["trousers", "head_wrap", "cap", "inner_tunic", "none"]},
        },
    },
    "required": ["category", "length", "silhouette", "waist", "neckline", "sleeves", "sleeve_style", "closure",
                 "pockets", "construction_details", "matching_pieces"],
}

CONSIGNE_V2 = """You are helping a tailor in Cameroon. Look at the main garment in the photo and fill the JSON. Describe ONLY what you can clearly see; answer unknown otherwise.
Categories (choose carefully):
- kaba: long loose women's dress, wide body without waist, often wax print, often with a yoke, ruffles or tiers.
- boubou: very wide flowing robe falling from the shoulders (men or women), long or short sleeves.
- agbada: men's very wide outer robe with large draped sides, worn over an inner tunic and trousers.
- kaftan_tunic: men's straight long tunic without shirt collar (senator, jabador, djellaba style), thigh to ankle length, often embroidered at the neck or chest.
- shirt: ONLY a classic shirt with a shirt collar and a full front button opening.
- dress, skirt, top, trousers: western garments.
Rules: report side_slit only if an opening in the side seam is clearly visible. Pockets: look for patch pockets sewn on the front and small chest pockets. embroidery means decorative stitching. matching_pieces lists other visible garments of the same outfit."""

# Reglages des essais : temperature basse, reponse bornee.
TEMPERATURE = 0.1
MAX_TOKENS = 700
# Cote de l'image envoyee : le serveur la reduit de toute facon
# (--image-max-tokens 768) ; inutile de transferer une photo de 12 Mpx.
COTE_MAX = 1024

# --- Libelles francais, pour l'ecran du tailleur -----------------------------

LIBELLES: dict[str, dict[str, str]] = {
    "length": {"hip": "aux hanches", "thigh": "mi-cuisse", "knee": "au genou", "midi": "mi-mollet",
               "ankle": "à la cheville", "floor": "au sol"},
    "silhouette": {"fitted": "ajustée", "straight": "droite", "a_line": "trapèze", "flared": "évasée",
                   "loose": "ample", "tiered": "à étages"},
    "waist": {"fitted_waist": "taille marquée", "no_waist_shaping": "sans taille marquée", "elastic": "taille élastique",
              "belt": "ceinture"},
    "neckline": {"round": "ronde", "v": "en V", "slit": "fendue", "square": "carrée", "boat": "bateau",
                 "shirt_collar": "col chemise", "mandarin_collar": "col officier"},
    "sleeves": {"sleeveless": "sans manche", "short": "courtes", "elbow": "au coude", "three_quarter": "trois-quarts",
                "long": "longues"},
    "sleeve_style": {"plain": "simples", "ruffled": "à volant", "flared": "évasées", "puffed": "bouffantes",
                     "wide": "larges"},
    "closure": {"front_buttons": "boutonnage devant", "partial_placket": "patte de boutonnage partielle",
                "zip": "fermeture éclair", "none_visible": "aucune fermeture visible"},
    "pockets": {"patch_pockets_front": "poches plaquées devant", "chest_pocket": "poche poitrine",
                "side_seam_pockets": "poches dans les coutures", "none_visible": "aucune poche visible"},
    "construction_details": {"yoke": "empiècement", "gathers": "fronces", "ruffles": "volants", "tiers": "étages",
                             "pleats": "plis", "darts": "pinces", "front_panel_seams": "découpes devant",
                             "embroidery": "broderie", "contrast_trim": "galon contrasté", "side_slit": "fente côté"},
    "matching_pieces": {"trousers": "pantalon", "head_wrap": "foulard de tête", "cap": "bonnet",
                        "inner_tunic": "tunique de dessous"},
}

_MANCHES = {"sleeveless": "sans", "short": "courtes", "elbow": "coude", "three_quarter": "trois_quarts", "long": "longues"}
_ENCOLURES = {"round": "ronde", "v": "v", "square": "carree", "boat": "bateau"}
_AMPLEURS = {"straight": "peu", "fitted": "peu", "a_line": "moyenne", "flared": "forte", "loose": "forte"}


class AnalyseImpossible(RuntimeError):
    """Le service de vision n'a pas repondu ou a rendu une fiche illisible."""


def _image_reduite(contenu: bytes) -> bytes:
    """JPEG d'au plus COTE_MAX px de cote (photo d'origine si illisible)."""
    try:
        from PIL import Image, ImageOps

        img = ImageOps.exif_transpose(Image.open(io.BytesIO(contenu))).convert("RGB")
        img.thumbnail((COTE_MAX, COTE_MAX))
        out = io.BytesIO()
        img.save(out, "JPEG", quality=88)
        return out.getvalue()
    except Exception:
        return contenu


def _appeler(url: str, contenu: bytes, timeout_s: float) -> str:
    """Requete au serveur llama.cpp (API compatible OpenAI) ; rend le texte."""
    image = base64.b64encode(_image_reduite(contenu)).decode("ascii")
    corps = {
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image}"}},
                {"type": "text", "text": CONSIGNE_V2},
            ],
        }],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
        # La reponse est contrainte par le schema (grammaire llama.cpp) : le
        # modele ne peut repondre que par les valeurs de la liste fermee.
        "response_format": {"type": "json_schema", "json_schema": {"name": "fiche_style", "schema": SCHEMA_V2}},
    }
    req = urllib.request.Request(
        url.rstrip("/") + "/v1/chat/completions",
        data=json.dumps(corps).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as rep:
            donnees = json.loads(rep.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise AnalyseImpossible(f"Service de vision injoignable ({e})") from e
    except ValueError as e:
        raise AnalyseImpossible("Réponse illisible du service de vision") from e
    try:
        return donnees["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise AnalyseImpossible("Réponse incomplète du service de vision") from e


def nettoyer(brut: dict) -> dict:
    """Ne garde que les valeurs de la liste fermee, retire les doublons et
    « none » des listes (erreurs connues du modele)."""
    fiche: dict = {}
    for cle, regle in SCHEMA_V2["properties"].items():
        valeur = brut.get(cle)
        if "enum" in regle:
            fiche[cle] = valeur if valeur in regle["enum"] else "unknown"
        else:
            permis = regle["items"]["enum"]
            vus: list[str] = []
            for v in valeur if isinstance(valeur, list) else []:
                if v in permis and v != "none" and v not in vus:
                    vus.append(v)
            fiche[cle] = vus[: regle["maxItems"]]
    return fiche


def _choisir_base(categorie: str, fiche: dict) -> str | None:
    bases = [b.id for b in bases_de(categorie)]
    if not bases:
        return None
    sil = fiche["silhouette"]
    if categorie == "kaba" and (sil == "tiered" or "tiers" in fiche["construction_details"]) and "kaba_etages" in bases:
        return "kaba_etages"
    if categorie == "jupe":
        if sil == "flared" and "jupe_cloche" in bases:
            return "jupe_cloche"
        if sil == "a_line" and "jupe_evasee" in bases:
            return "jupe_evasee"
    if categorie == "robe" and sil in ("flared", "a_line") and "robe_evasee" in bases:
        return "robe_evasee"
    return bases[0]


def proposition(fiche: dict) -> dict:
    """Fiche de style -> ce que le formulaire « Nouveau patron » peut
    preremplir : categorie, modele de base et reglages de style (seulement
    ceux que la base accepte). Les longueurs vues (« au genou ») ne sont
    qu'indicatives : les centimetres viennent des mesures."""
    categorie = CATEGORIE_PAR_VISION.get(fiche["category"])
    base_id = _choisir_base(categorie, fiche) if categorie else None
    style: dict = {}
    if base_id:
        acceptes = BASES_PAR_ID[base_id].style_defaut
        if "manches" in acceptes and fiche["sleeves"] in _MANCHES:
            style["manches"] = _MANCHES[fiche["sleeves"]]
        if "encolure" in acceptes and fiche["neckline"] in _ENCOLURES:
            style["encolure"] = _ENCOLURES[fiche["neckline"]]
        if "ampleur" in acceptes and fiche["silhouette"] in _AMPLEURS:
            style["ampleur"] = _AMPLEURS[fiche["silhouette"]]
        if "etages" in acceptes and (fiche["silhouette"] == "tiered" or "tiers" in fiche["construction_details"]):
            style["etages"] = 2
    vus = {
        cle: LIBELLES[cle][fiche[cle]]
        for cle in ("length", "silhouette", "waist", "neckline", "sleeves", "sleeve_style", "closure", "pockets")
        if fiche[cle] in LIBELLES[cle]
    }
    suggestions = [
        {"code": d, "label": LIBELLES["construction_details"][d]} for d in fiche["construction_details"]
    ]
    if fiche["pockets"] not in ("none_visible", "unknown"):
        suggestions.append({"code": fiche["pockets"], "label": LIBELLES["pockets"][fiche["pockets"]]})
    if fiche["closure"] in ("front_buttons", "partial_placket", "zip"):
        suggestions.append({"code": fiche["closure"], "label": LIBELLES["closure"][fiche["closure"]]})
    return {
        "categorie": categorie,
        "categorie_label": CATEGORIES_PAR_ID[categorie]["label"] if categorie else None,
        "base": base_id,
        "style": style,
        "vu": vus,
        # Detail invente de temps en temps : de simples suggestions, decochees.
        "suggestions": suggestions,
        "pieces_assorties": [LIBELLES["matching_pieces"][p] for p in fiche["matching_pieces"]],
    }


def analyser(url: str, contenu: bytes, timeout_s: float = 300) -> dict:
    """Photo -> {"fiche": fiche nettoyee, "proposition": ...}."""
    texte = _appeler(url, contenu, timeout_s)
    try:
        brut = json.loads(texte)
    except ValueError as e:
        raise AnalyseImpossible("Fiche de style illisible") from e
    if not isinstance(brut, dict):
        raise AnalyseImpossible("Fiche de style illisible")
    fiche = nettoyer(brut)
    return {"fiche": fiche, "proposition": proposition(fiche)}
