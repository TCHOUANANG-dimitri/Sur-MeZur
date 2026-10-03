"""
Les 20 sujets pilotes du depot : photos face + profil et verite terrain au
metre ruban.

Bibliotheque standard uniquement : ce module est importe aussi bien par
l'etape de perception (venv du backend, Python 3.10) que par l'etape Anny
(venv de ce dossier, Python 3.12).

Sources (deja versionnees, rien n'est copie ici) :
  - ml/bench/sujets.json             13 sujets, photos dans backend/uploads/measurement_photos/
  - ml/bench/nouveaux_sujets_reels.json  7 sujets, photos dans IMAGES TEST/
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]  # .../Sur-MeZur-App
BENCH = RACINE / "ml" / "bench"

# Ordre et cles de ml/bench/harness.py : la comparaison se fait mesure par mesure.
TOURS = ["neck", "chest", "waist", "hips", "biceps", "thigh", "wrist", "ankle"]
LONGUEURS = ["shoulder", "sleeve_length", "inseam", "back_length"]
MESURES = TOURS + LONGUEURS

LIBELLES = {
    "neck": "Tour de cou",
    "chest": "Tour de poitrine",
    "waist": "Tour de taille",
    "hips": "Tour de hanches",
    "biceps": "Tour de bras",
    "thigh": "Tour de cuisse",
    "wrist": "Tour de poignet",
    "ankle": "Tour de cheville",
    "shoulder": "Carrure",
    "sleeve_length": "Longueur de manche",
    "inseam": "Entrejambe",
    "back_length": "Longueur de dos",
}


@dataclass
class Sujet:
    uid: str
    gender: str
    height_cm: float
    weight_kg: float
    face: Path
    profil: Path
    verite: dict[str, float]
    # Mesures dont la verite terrain est documentee comme aberrante : exclues
    # des statistiques (ex. carrure du sujet orig-5, notee dans sujets.json).
    exclues: set[str] = field(default_factory=set)


def charger() -> list[Sujet]:
    out: list[Sujet] = []

    a = json.loads((BENCH / "sujets.json").read_text(encoding="utf-8"))
    photos_a = RACINE / "backend" / "uploads" / "measurement_photos"
    for s in a["sujets"]:
        pp = a["photos"].get(str(s["id"]))
        if not pp or pp.get("incertain"):
            continue
        verite = dict(zip(TOURS, s["tours"]))
        verite.update(dict(zip(LONGUEURS, s["longueurs"])))
        out.append(
            Sujet(
                uid=f"orig-{s['id']}",
                gender=s["gender"],
                height_cm=float(s["height_cm"]),
                weight_kg=float(s["weight_kg"]),
                face=photos_a / pp["face"],
                profil=photos_a / pp["profil"],
                verite={k: float(v) for k, v in verite.items()},
                exclues={"shoulder"} if s.get("note") else set(),
            )
        )

    b = json.loads((BENCH / "nouveaux_sujets_reels.json").read_text(encoding="utf-8"))
    photos_b = RACINE / "IMAGES TEST"
    for s in b["sujets"]:
        pp = s.get("photos")
        if not pp or not pp.get("profil"):
            continue
        verite = dict(zip(TOURS, s["tours"]))
        verite.update(dict(zip(LONGUEURS, s["longueurs"])))
        out.append(
            Sujet(
                uid=f"new-{s['id']}",
                gender=s["gender"],
                height_cm=float(s["height_cm"]),
                weight_kg=float(s["weight_kg"]),
                face=photos_b / pp["face"],
                profil=photos_b / pp["profil"],
                verite={k: float(v) for k, v in verite.items()},
            )
        )
    return out


if __name__ == "__main__":
    for s in charger():
        ok = s.face.exists() and s.profil.exists()
        print(f"{s.uid:8} {s.gender:6} {s.height_cm:5.0f} cm {s.weight_kg:5.1f} kg  photos={'ok' if ok else 'MANQUANTES'}")
