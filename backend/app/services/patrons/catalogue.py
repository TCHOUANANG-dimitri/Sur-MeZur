"""Catalogue fixe des vetements : une seule liste pour l'IA, l'app et les patrons.

Trois niveaux :

- **categorie** : ce que l'IA reconnait sur une photo et ce que le tailleur
  choisit en premier (jupe, kaba...). `vision` est l'identifiant renvoye par le
  modele de vision (schema_v2), `description_ia` la definition donnee dans sa
  consigne ;
- **modele de base** : un patron que le moteur sait tracer (jupe droite,
  kaba simple...). Chaque base appartient a une categorie ;
- **style** : les reglages d'une base (longueur, manches, encolure, ampleur).
  C'est ce que la fiche de style (photo + IA, validee par le tailleur) remplit.

Les aisances par defaut sont PROVISOIRES : elles seront remplacees par les
recettes recueillies aupres des tailleurs (questionnaire d'enquete,
`MESURES_AISANCE` : chest, waist, hips, biceps, thigh).
"""

from __future__ import annotations

from dataclasses import dataclass, field

CATEGORIES: list[dict] = [
    {"id": "jupe", "label": "Jupe", "vision": "skirt",
     "description_ia": "skirt: western skirt, from the waist down."},
    {"id": "robe", "label": "Robe", "vision": "dress",
     "description_ia": "dress: western one-piece dress, shaped at the waist."},
    {"id": "kaba", "label": "Kaba", "vision": "kaba",
     "description_ia": "kaba: long loose women's dress, wide body without waist, often wax print, "
                       "often with a yoke, ruffles or tiers."},
    {"id": "boubou", "label": "Boubou", "vision": "boubou",
     "description_ia": "boubou: very wide flowing robe falling from the shoulders (men or women), "
                       "long or short sleeves."},
    {"id": "agbada", "label": "Agbada", "vision": "agbada",
     "description_ia": "agbada: men's very wide outer robe with large draped sides, worn over an "
                       "inner tunic and trousers."},
    {"id": "tunique", "label": "Tunique homme", "vision": "kaftan_tunic",
     "description_ia": "kaftan_tunic: men's straight long tunic without shirt collar (senator, jabador, "
                       "djellaba style), thigh to ankle length, often embroidered at the neck or chest."},
    {"id": "chemise", "label": "Chemise", "vision": "shirt",
     "description_ia": "shirt: ONLY a classic shirt with a shirt collar and a full front button opening."},
    {"id": "haut", "label": "Haut / blouse", "vision": "top",
     "description_ia": "top: western top or blouse, ending around the waist or hips."},
    {"id": "pantalon", "label": "Pantalon", "vision": "trousers",
     "description_ia": "trousers: trousers with two legs."},
]

CATEGORIES_PAR_ID = {c["id"]: c for c in CATEGORIES}
CATEGORIE_PAR_VISION = {c["vision"]: c["id"] for c in CATEGORIES}

# --- Reglages de style -------------------------------------------------------

MANCHES = {  # fraction de la longueur de bras (epaule -> poignet)
    "sans": None,
    "courtes": 0.25,
    "coude": 0.5,
    "trois_quarts": 0.75,
    "longues": 1.0,
}
ENCOLURES = {
    "ronde": "CircleNeckHalf",
    "v": "VNeckHalf",
    "carree": "SquareNeckHalf",
    "bateau": "CircleNeckHalf",  # ronde, plus large et peu profonde (voir moteur)
}
AMPLEURS = ("peu", "moyenne", "forte")

STYLES: dict[str, dict] = {
    "longueur_cm": {"label": "Longueur", "type": "nombre", "unite": "cm"},
    "manches": {"label": "Manches", "type": "choix", "choix": list(MANCHES)},
    "encolure": {"label": "Encolure", "type": "choix", "choix": list(ENCOLURES)},
    "ampleur": {"label": "Ampleur", "type": "choix", "choix": list(AMPLEURS)},
    "fente_cm": {"label": "Fente dos", "type": "nombre", "unite": "cm"},
    "etages": {"label": "Nombre d'étages", "type": "choix", "choix": [2, 3]},
}

LONGUEUR_DEPUIS = {
    "taille": "de la taille à l'ourlet",
    "nuque": "de la nuque (dos) à l'ourlet",
}


@dataclass(frozen=True)
class ModeleBase:
    id: str
    categorie: str
    label: str
    genre: str  # "femme" | "homme" : gabarit de corps utilise pour les mesures manquantes
    description: str
    programme: str  # recette GarmentCode, voir moteur._design
    longueur_depuis: str  # "taille" | "nuque"
    style_defaut: dict = field(default_factory=dict)
    aisances: dict = field(default_factory=dict)  # cm ajoutes au tour complet
    statut: str = "disponible"  # "disponible" | "experimental"

    @property
    def styles(self) -> list[str]:
        return list(self.style_defaut)


BASES: list[ModeleBase] = [
    ModeleBase(
        "jupe_droite", "jupe", "Jupe droite", "femme",
        "Jupe ajustée à pinces, ceinture droite, fente dos possible.",
        "jupe_ajustee", "taille",
        {"longueur_cm": 60, "fente_cm": 0},
        {"waist": 1, "hips": 4},
    ),
    ModeleBase(
        "jupe_evasee", "jupe", "Jupe évasée (trapèze)", "femme",
        "Jupe ajustée aux hanches puis évasée vers l'ourlet, ceinture droite.",
        "jupe_ajustee", "taille",
        {"longueur_cm": 65, "ampleur": "moyenne"},
        {"waist": 1, "hips": 4},
    ),
    ModeleBase(
        "jupe_cloche", "jupe", "Jupe cloche (cercle)", "femme",
        "Jupe en arc de cercle, sans pince ; l'ampleur règle la part de cercle.",
        "jupe_cloche", "taille",
        {"longueur_cm": 65, "ampleur": "moyenne"},
        {"waist": 1},
    ),
    ModeleBase(
        "robe_droite", "robe", "Robe droite", "femme",
        "Corsage ajusté à pinces et jupe droite, manches et encolure au choix.",
        "robe_ajustee", "nuque",
        {"longueur_cm": 100, "manches": "courtes", "encolure": "ronde", "fente_cm": 0},
        {"chest": 6, "waist": 4, "hips": 4},
    ),
    ModeleBase(
        "robe_evasee", "robe", "Robe évasée", "femme",
        "Corsage ajusté à pinces et jupe cloche.",
        "robe_cloche", "nuque",
        {"longueur_cm": 100, "manches": "courtes", "encolure": "ronde", "ampleur": "moyenne"},
        {"chest": 6, "waist": 4},
    ),
    ModeleBase(
        "kaba_simple", "kaba", "Kaba simple", "femme",
        "Robe longue ample sans taille, évasée vers le bas.",
        "ample", "nuque",
        {"longueur_cm": 135, "manches": "courtes", "encolure": "ronde", "ampleur": "moyenne"},
        {"chest": 20},
    ),
    ModeleBase(
        "kaba_etages", "kaba", "Kaba à étages", "femme",
        "Haut ample prolongé par une jupe à étages froncés.",
        "ample_etages", "nuque",
        {"longueur_cm": 135, "manches": "courtes", "encolure": "ronde", "etages": 2},
        {"chest": 20},
        statut="experimental",
    ),
    ModeleBase(
        "haut_ajuste", "haut", "Haut ajusté", "femme",
        "Corsage ajusté à pinces jusqu'à la taille.",
        "haut_ajuste", "nuque",
        {"manches": "courtes", "encolure": "ronde"},
        {"chest": 6, "waist": 4},
    ),
    ModeleBase(
        "tunique_droite", "tunique", "Tunique homme droite", "homme",
        "Tunique droite sans col, manches montées.",
        "ample", "nuque",
        {"longueur_cm": 100, "manches": "longues", "encolure": "ronde", "ampleur": "peu"},
        {"chest": 16},
    ),
    ModeleBase(
        "pantalon_droit", "pantalon", "Pantalon droit", "homme",
        "Pantalon à pinces dos, ceinture droite ; l'aisance de cuisse est déjà prévue par le tracé.",
        "pantalon", "taille",
        {"longueur_cm": 102},
        {"waist": 1, "hips": 6},
    ),
]

BASES_PAR_ID = {b.id: b for b in BASES}

# Categories sans modele de base pour l'instant : le moteur d'apercu prend le relais.
A_VENIR = {
    "boubou": "grand rectangle plié aux épaules : tracé simple, à faire sans GarmentCode",
    "agbada": "pièces drapées très larges : recette à recueillir auprès des tailleurs",
    "chemise": "col chemise et patte de boutonnage absents de GarmentCode",
}

# Type de vetement de l'API historique (POST /tailor/patterns) -> base par defaut.
BASE_PAR_DEFAUT = {
    "jupe": "jupe_droite",
    "robe": "robe_droite",
    "kaba": "kaba_simple",
    "pantalon": "pantalon_droit",
    "haut": "haut_ajuste",
    "tunique": "tunique_droite",
}


def bases_de(categorie: str) -> list[ModeleBase]:
    return [b for b in BASES if b.categorie == categorie]


def catalogue_public() -> dict:
    """Le catalogue tel que l'app et l'IA le consomment (JSON)."""
    return {
        "categories": [
            {
                **c,
                "bases": [
                    {
                        "id": b.id, "label": b.label, "genre": b.genre, "description": b.description,
                        "statut": b.statut, "longueur_depuis": LONGUEUR_DEPUIS[b.longueur_depuis],
                        "style_defaut": b.style_defaut, "aisances_cm": b.aisances,
                    }
                    for b in bases_de(c["id"])
                ],
                "a_venir": A_VENIR.get(c["id"]),
            }
            for c in CATEGORIES
        ],
        "styles": STYLES,
    }
