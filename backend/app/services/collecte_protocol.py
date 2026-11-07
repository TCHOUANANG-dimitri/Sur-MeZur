"""
Protocole de la campagne de collecte : vocabulaire, bornes et vues.

Source unique cote serveur. L'application `collecte/` en porte une copie
(collecte/src/lib/protocol.ts) pour afficher les consignes hors reseau ; les
CLES et les BORNES DURES doivent rester identiques des deux cotes.

Deux protocoles coexistent :

- `tailleur` (actuel, depuis le 07/11/2026) : les mesures du tailleur
  convenues le 30/10/2026, 20 pour l'homme et 26 pour la femme, avec les cles
  de pipeline_v4/mesures_v4/definitions.py, et trois photos (face, profil,
  dos). Les longueurs « jusqu'a l'arret choisi » (haut, jupe) s'arretent
  toujours au genou.
- `v1` (ancien) : les 12 mesures de la chaine de production, cles et ordre de
  ml/bench/harness.py (TOURS, LONGUEURS), photos face et profil. Garde pour
  lire, corriger et exporter les fiches deja saisies.

Le protocole d'une fiche se deduit de ses cles : une fiche qui porte une cle
v1 est v1, toute autre est `tailleur`. Les deux jeux de cles sont disjoints.
"""

TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]
MESURES = TOURS + LONGUEURS  # protocole v1

# Protocole `tailleur` : cle -> sexes concernes, dans l'ordre de la seance.
_H, _F, _HF = ("male",), ("female",), ("male", "female")
MESURES_TAILLEUR: dict[str, tuple[str, ...]] = {
    # cou, epaules, bras
    "tour_cou": _HF,
    "longueur_epaule": _HF,
    "carrure_devant": _HF,
    "carrure_dos": _F,
    "longueur_manche": _HF,
    "tour_biceps": _HF,
    "tour_poignet": _HF,
    # poitrine
    "tour_poitrine": _HF,
    "tour_dessus_poitrine": _F,
    "tour_dessous_poitrine": _F,
    "ecart_poitrine": _F,
    "hauteur_poitrine": _HF,
    "hauteur_dessus_poitrine": _F,
    "hauteur_dessous_poitrine": _F,
    # taille et bassin
    "tour_taille": _HF,
    "taille_devant": _HF,
    "taille_dos": _HF,
    "tour_bassin": _HF,
    "hauteur_bassin": _HF,
    "hauteur_fessier": _F,
    "hauteur_braguette": _HF,
    # longueurs et jambes
    "longueur_haut": _H,
    "longueur_jupe": _F,
    "longueur_pantalon": _HF,
    "tour_cuisse": _HF,
    "hauteur_cuisse": _HF,
    "hauteur_genou": _H,
    "tour_cheville": _HF,
}


def mesures_du_sexe(gender: str) -> list[str]:
    """Cles du protocole `tailleur` pour un sexe (20 homme, 26 femme)."""
    return [k for k, sexes in MESURES_TAILLEUR.items() if gender in sexes]


# Bornes DURES : au-dela, la valeur est une faute de saisie certaine (78
# tape 7,8 ou 780) et le serveur la refuse. Les bornes de VRAISEMBLANCE, plus
# serrees, ne donnent qu'un avertissement dans l'application : un sujet hors
# norme est precisement ce qui manque au jeu de donnees, il ne faut pas
# l'empecher d'entrer.
HARD_BOUNDS: dict[str, tuple[float, float]] = {
    "height_cm": (100, 230),
    "weight_kg": (25, 250),
    "age": (10, 100),
    # v1
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
    # tailleur
    "tour_cou": (20, 70),
    "longueur_epaule": (20, 70),
    "carrure_devant": (18, 65),
    "carrure_dos": (18, 65),
    "longueur_manche": (30, 90),
    "tour_biceps": (12, 65),
    "tour_poignet": (9, 30),
    "tour_poitrine": (50, 180),
    "tour_dessus_poitrine": (50, 170),
    "tour_dessous_poitrine": (45, 170),
    "ecart_poitrine": (5, 45),
    "hauteur_poitrine": (10, 50),
    "hauteur_dessus_poitrine": (1, 30),
    "hauteur_dessous_poitrine": (1, 30),
    "tour_taille": (40, 180),
    "taille_devant": (18, 95),
    "taille_dos": (18, 95),
    "tour_bassin": (50, 190),
    "hauteur_bassin": (5, 40),
    "hauteur_fessier": (12, 55),
    "hauteur_braguette": (12, 60),
    "longueur_haut": (60, 150),
    "longueur_jupe": (12, 70),
    "longueur_pantalon": (55, 140),
    "tour_cuisse": (25, 100),
    "hauteur_cuisse": (3, 35),
    "hauteur_genou": (30, 80),
    "tour_cheville": (18, 55),
}

# Vues : face et profil pour les deux protocoles, dos en plus pour `tailleur`
# (la chaine v4 lit la carrure dos sur cette photo).
VUES = ["face", "profil", "dos"]
VUES_OBLIGATOIRES = {"v1": ["face", "profil"], "tailleur": ["face", "profil", "dos"]}

GENDERS = {"male", "female"}
CLOTHING = {"moulant", "ajuste", "ample"}
REVIEW_STATUSES = {"pending", "validated", "rejected"}

TOUTES_LES_CLES = MESURES + list(MESURES_TAILLEUR)


def protocole(measurements: dict | None) -> str:
    """`v1` si la fiche porte une cle de l'ancien protocole, `tailleur` sinon."""
    return "v1" if any(k in MESURES for k in (measurements or {})) else "tailleur"


def cles_attendues(measurements: dict | None, gender: str) -> list[str]:
    return MESURES if protocole(measurements) == "v1" else mesures_du_sexe(gender)


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


def check_protocole(measurements: dict, gender: str | None) -> None:
    """Refuse une fiche qui melange les deux protocoles, ou une mesure reservee
    a l'autre sexe (tour de dessous de poitrine sur un homme...)."""
    keys = set(measurements or {})
    v1, tailleur = keys & set(MESURES), keys & set(MESURES_TAILLEUR)
    if v1 and tailleur:
        raise ValueError("Fiche incohérente : anciennes et nouvelles mesures mélangées")
    if gender and tailleur:
        autres = sorted(tailleur - set(mesures_du_sexe(gender)))
        if autres:
            sexe = "un homme" if gender == "male" else "une femme"
            raise ValueError(f"Mesure(s) non prévue(s) pour {sexe} : {', '.join(autres)}")


def is_complete(measurements: dict, photo_views: set[str], gender: str) -> bool:
    """Fiche exploitable : toutes les mesures de son protocole et ses vues."""
    m = measurements or {}
    return all(k in m for k in cles_attendues(m, gender)) and all(
        v in photo_views for v in VUES_OBLIGATOIRES[protocole(m)]
    )
