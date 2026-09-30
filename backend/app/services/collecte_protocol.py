"""
Protocole de la campagne de collecte : vocabulaire, bornes et vues.

Source unique cote serveur. L'application `collecte/` en porte une copie
(collecte/src/lib/protocol.ts) pour afficher les consignes hors reseau ; les
CLES et les BORNES DURES doivent rester identiques des deux cotes.

Les cles et leur ORDRE reprennent exactement ml/bench/harness.py (TOURS,
LONGUEURS) : l'export `sujets.json` se consomme tel quel par
`ml/bench/pipeline_ameliore.py` et par le harnais.
"""

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]
MESURES = TOURS + LONGUEURS

# Bornes DURES : au-dela, la valeur est une faute de saisie certaine (78
# tape 7,8 ou 780) et le serveur la refuse. Les bornes de VRAISEMBLANCE, plus
# serrees, ne donnent qu'un avertissement dans l'application : un sujet hors
# norme est precisement ce qui manque au jeu de donnees, il ne faut pas
# l'empecher d'entrer.
HARD_BOUNDS: dict[str, tuple[float, float]] = {
    "height_cm": (100, 230),
    "weight_kg": (25, 250),
    "age": (10, 100),
    "neck": (20, 70),
    "chest": (50, 180),
    "waist": (40, 180),
    "hips": (50, 190),
    "biceps": (12, 65),
    "thigh": (25, 100),
    "wrist": (9, 30),
    "ankle": (12, 45),
    "shoulder": (20, 65),
    "sleeve_length": (30, 90),
    "inseam": (40, 115),
    "back_length": (25, 75),
}

# Vues photographiques. Face et profil sont celles de la chaine de production
# (et les seules exigees pour qu'une fiche soit complete) ; dos et trois-quarts
# sont facultatives et servent la recherche (piste « 3e photo a 45° »,
# RAPPORT_PROJET.md §6bis).
VUES_OBLIGATOIRES = ["face", "profil"]
VUES = VUES_OBLIGATOIRES + ["dos", "trois_quarts"]

GENDERS = {"male", "female"}
CLOTHING = {"moulant", "ajuste", "ample"}
REVIEW_STATUSES = {"pending", "validated", "rejected"}


def check_bounds(values: dict[str, float | None], allowed: list[str]) -> dict[str, float]:
    """Filtre et valide un dictionnaire de mesures.

    Cle inconnue ou valeur hors bornes dures -> ValueError (message en
    francais, affiche tel quel par l'application). Valeur vide -> ignoree :
    une mesure non relevee est une absence, pas un zero.
    """
    out: dict[str, float] = {}
    for key, raw in (values or {}).items():
        if key not in allowed:
            raise ValueError(f"Mesure inconnue : {key}")
        if raw is None or raw == "":
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"Valeur non numerique pour {key}")
        lo, hi = HARD_BOUNDS[key]
        if not lo <= value <= hi:
            raise ValueError(f"{key} = {value:g} cm est hors des bornes plausibles ({lo:g}–{hi:g})")
        out[key] = round(value, 1)
    return out


def is_complete(measurements: dict, photo_views: set[str]) -> bool:
    """Fiche exploitable par le banc d'essai : 12 mesures et les 2 vues."""
    return all(k in measurements for k in MESURES) and all(v in photo_views for v in VUES_OBLIGATOIRES)
