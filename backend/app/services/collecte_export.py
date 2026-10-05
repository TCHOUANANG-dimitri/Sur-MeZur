"""
Export de la campagne de collecte.

Trois sorties, un seul point de verite :

- `sujets.json`  — format EXACT de ml/bench/nouveaux_sujets_exemple.json, donc
  consommable tel quel par `python ml/bench/pipeline_ameliore.py sujets.json
  photos/`. N'y figurent QUE les fiches completes (12 mesures + face + profil) :
  le banc d'essai calcule `abs(calcul - reference)` sans garde, une mesure
  absente le ferait planter.
- `sujets.csv`   — toutes les fiches retenues par le filtre, une ligne par
  sujet, separateur virgule et point decimal (pandas, R, scripts).
- `sujets_excel.csv` — la meme chose en point-virgule et virgule decimale :
  c'est ce qu'Excel en francais sait ouvrir d'un double-clic.

Aucun nom de volontaire n'est exporte : un sujet n'est connu que par son code.
"""

from __future__ import annotations

import csv
import io
import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone

from app.core.config import settings
from app.models.collecte import DatasetSubject
from app.services.collecte_protocol import LONGUEURS, MESURES, TOURS, VUES, is_complete

LISEZ_MOI = """Sur-MeZur — export de la campagne de collecte
==============================================

Genere le {date} (UTC). {n} sujet(s) dans ce filtre, dont {n_complets} complet(s).

CONTENU
  sujets.json        Fiches COMPLETES uniquement (12 mesures + photos face et profil),
                     au format de ml/bench/nouveaux_sujets_exemple.json.
                     Evaluation directe :
                       python ml/bench/pipeline_ameliore.py sujets.json photos/
  sujets.csv         Toutes les fiches, separateur « , » et point decimal.
  sujets_excel.csv   Les memes, separateur « ; » et virgule decimale (Excel FR).
  photos/            SMZ-0001_face.jpg, SMZ-0001_profil.jpg.

UNITES
  Taille et mensurations en cm, poids en kg.

ORDRE DES LISTES DANS sujets.json (identique a ml/bench/harness.py)
  tours     = {tours}
  longueurs = {longueurs}

CONVENTIONS DE MESURE
  Le protocole complet (ou et comment chaque mesure est prise) est affiche dans
  l'application de collecte et versionne dans collecte/src/lib/protocol.ts.
  Rappel du piege deja paye : « shoulder » est la CARRURE du tailleur (entre les
  emmanchures, ~33 cm), PAS la largeur biacromiale (~40 cm).
"""


def _photo_name(subject: DatasetSubject, view: str, file_path: str) -> str:
    ext = os.path.splitext(file_path)[1] or ".jpg"
    return f"{subject.code}_{view}{ext}"


def subject_row(subject: DatasetSubject, collector_name: str | None) -> dict:
    """Une ligne a plat : colonnes stables, vides quand la valeur manque."""
    photos = {p.view: p for p in subject.photos}
    row: dict = {
        "code": subject.code,
        "statut": subject.review_status,
        "complet": is_complete(subject.measurements or {}, set(photos)),
        "sexe": subject.gender,
        "age": subject.age,
        "taille_cm": subject.height_cm,
        "poids_kg": subject.weight_kg,
    }
    for key in MESURES:
        row[key] = (subject.measurements or {}).get(key)
    row.update(
        {
            "tenue": subject.clothing,
            "ville": subject.city,
            "lieu": subject.place,
            "mesure_par": subject.measured_by,
            "date_mesure": subject.measured_at.isoformat() if subject.measured_at else None,
            "collecteur": collector_name,
            "saisi_le": subject.created_at.isoformat() if subject.created_at else None,
        }
    )
    for view in VUES:
        p = photos.get(view)
        row[f"photo_{view}"] = _photo_name(subject, view, p.file_path) if p else None
    row["notes"] = subject.notes
    row["note_relecture"] = subject.review_note
    return row


def bench_subject(subject: DatasetSubject) -> dict:
    """Entree de `sujets.json`, au format du banc d'essai."""
    m = subject.measurements or {}
    photos = {p.view: p for p in subject.photos}
    entry = {
        "id": subject.number,
        "code": subject.code,
        "height_cm": subject.height_cm,
        "weight_kg": subject.weight_kg,
        "gender": subject.gender,
        "tours": [m[k] for k in TOURS],
        "longueurs": [m[k] for k in LONGUEURS],
        "photos": {v: _photo_name(subject, v, p.file_path) for v, p in photos.items()},
    }
    # Champs supplementaires : ignores par le banc actuel, utiles au suivant.
    if subject.age is not None:
        entry["age"] = subject.age
    if subject.clothing:
        entry["tenue"] = subject.clothing
    return entry


def bench_json(subjects: list[DatasetSubject]) -> dict:
    complets = [s for s in subjects if is_complete(s.measurements or {}, {p.view for p in s.photos})]
    return {
        "_lisez_moi": [
            "Export de la campagne de collecte Sur-MeZur (fiches completes uniquement).",
            "tours = [" + ", ".join(TOURS) + "] (cm)",
            "longueurs = [" + ", ".join(LONGUEURS) + "] (cm)",
            "photos.* : noms de fichiers du dossier photos/ de l'export.",
            "Usage : python ml/bench/pipeline_ameliore.py sujets.json photos/",
        ],
        "tours": TOURS,
        "longueurs": LONGUEURS,
        "sujets": [bench_subject(s) for s in complets],
    }


def _csv_text(rows: list[dict], excel_fr: bool) -> str:
    buf = io.StringIO()
    if not rows:
        return ""
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), delimiter=";" if excel_fr else ",")
    writer.writeheader()
    for row in rows:
        out = {}
        for k, v in row.items():
            if v is None:
                out[k] = ""
            elif isinstance(v, bool):
                out[k] = "oui" if v else "non"
            elif isinstance(v, float) and excel_fr:
                out[k] = f"{v:g}".replace(".", ",")
            else:
                out[k] = v
        writer.writerow(out)
    # BOM : sans lui, Excel lit l'UTF-8 comme du Latin-1 et casse les accents.
    return "﻿" + buf.getvalue()


def csv_text(rows: list[dict], excel_fr: bool = False) -> str:
    return _csv_text(rows, excel_fr)


def build_zip(subjects: list[DatasetSubject], rows: list[dict], with_photos: bool) -> str:
    """Ecrit l'archive dans un fichier temporaire et renvoie son chemin.

    Fichier sur disque plutot qu'en memoire : avec les photos, l'archive
    atteint vite des centaines de Mo, que l'hebergement mutualise ne tiendrait
    pas en RAM. Les JPEG sont stockes sans recompression (ZIP_STORED) : ils
    sont deja compresses, et le processeur de l'hebergement est rare.
    """
    fd, path = tempfile.mkstemp(prefix="collecte-", suffix=".zip")
    os.close(fd)
    bench = bench_json(subjects)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "LISEZMOI.txt",
            LISEZ_MOI.format(
                date=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
                n=len(subjects),
                n_complets=len(bench["sujets"]),
                tours=", ".join(TOURS),
                longueurs=", ".join(LONGUEURS),
            ),
        )
        zf.writestr("sujets.json", json.dumps(bench, ensure_ascii=False, indent=2))
        zf.writestr("sujets.csv", _csv_text(rows, excel_fr=False))
        zf.writestr("sujets_excel.csv", _csv_text(rows, excel_fr=True))
        if with_photos:
            for subject in subjects:
                for photo in subject.photos:
                    src = os.path.join(settings.dataset_dir, photo.file_path)
                    if os.path.exists(src):
                        zf.write(
                            src,
                            f"photos/{_photo_name(subject, photo.view, photo.file_path)}",
                            compress_type=zipfile.ZIP_STORED,
                        )
    return path
