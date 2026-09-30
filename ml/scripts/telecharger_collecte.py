"""
Synchronise la campagne de collecte sur le poste de travail.

Recupere depuis l'API (GET /api/collecte/export?format=manifest) toutes les
fiches et range, dans ml/data/collecte/ :

    sujets.json   fiches COMPLETES au format ml/bench (tours, longueurs, photos)
    sujets.csv    toutes les fiches, une ligne par sujet
    photos/       SMZ-0001_face.jpg, SMZ-0001_profil.jpg, ...

Incremental : une photo deja presente avec la meme empreinte sha256 n'est pas
retelechargee. Relancer le script ne coute donc que les nouveautes.

Evaluation immediate sur la chaine de production :

    python ml/bench/pipeline_ameliore.py ml/data/collecte/sujets.json ml/data/collecte/photos/

Usage :
    python ml/scripts/telecharger_collecte.py                       # demande numero et mot de passe
    python ml/scripts/telecharger_collecte.py --statut validated    # fiches validees seulement

Variables d'environnement facultatives : SMZ_API (defaut
http://api.gitingeniering.com), SMZ_PHONE, SMZ_PASSWORD. Compte administrateur
requis. Aucune dependance hors bibliotheque standard.

ml/data/collecte/ est exclu de git : ce sont des photos de volontaires.
"""

from __future__ import annotations

import argparse
import csv
import getpass
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
SORTIE = RACINE / "ml" / "data" / "collecte"


def _request(url: str, token: str | None = None, body: dict | None = None) -> bytes:
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default=os.environ.get("SMZ_API", "http://api.gitingeniering.com"))
    parser.add_argument(
        "--statut",
        default="non_rejected",
        choices=["non_rejected", "validated", "pending", "rejected", "all"],
    )
    parser.add_argument("--sortie", default=str(SORTIE))
    args = parser.parse_args()

    api = args.api.rstrip("/")
    sortie = Path(args.sortie)
    photos_dir = sortie / "photos"
    photos_dir.mkdir(parents=True, exist_ok=True)

    phone = os.environ.get("SMZ_PHONE") or input("Numero (ex. +2376...) : ").strip()
    password = os.environ.get("SMZ_PASSWORD") or getpass.getpass("Mot de passe : ")

    try:
        token = json.loads(_request(f"{api}/api/auth/login", body={"phone": phone, "password": password}))["access_token"]
    except urllib.error.HTTPError as e:
        print(f"Connexion refusee ({e.code}). Compte administrateur requis.", file=sys.stderr)
        return 1

    try:
        manifest = json.loads(_request(f"{api}/api/collecte/export?format=manifest&statut={args.statut}", token))
    except urllib.error.HTTPError as e:
        print(f"Export refuse ({e.code}) : ce compte n'est pas administrateur ?", file=sys.stderr)
        return 1

    (sortie / "sujets.json").write_text(
        json.dumps(manifest["sujets_json"], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    rows = manifest["rows"]
    if rows:
        with (sortie / "sujets.csv").open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            for row in rows:
                writer.writerow({k: ("" if v is None else v) for k, v in row.items()})

    nouvelles, inchangees = 0, 0
    attendues = set()
    for p in manifest["photos"]:
        cible = photos_dir / p["file_name"]
        attendues.add(cible.name)
        if cible.exists() and _sha256(cible) == p["sha256"]:
            inchangees += 1
            continue
        contenu = _request(f"{api}/api/collecte/subjects/{p['subject_id']}/photos/{p['view']}", token)
        if hashlib.sha256(contenu).hexdigest() != p["sha256"]:
            print(f"  ! empreinte inattendue pour {p['file_name']} (photo remplacee pendant la synchro ?)")
        tmp = cible.with_suffix(cible.suffix + ".part")
        tmp.write_bytes(contenu)
        tmp.replace(cible)
        nouvelles += 1
        print(f"  + {p['file_name']}")

    # Photos locales qui ne sont plus dans l'export (fiche supprimee, rejetee,
    # ou vue retiree) : signalees, jamais effacees d'office.
    orphelines = sorted(f.name for f in photos_dir.iterdir() if f.is_file() and f.name not in attendues)

    complets = len(manifest["sujets_json"]["sujets"])
    print(
        f"\n{len(rows)} fiche(s), dont {complets} complete(s) dans sujets.json. "
        f"Photos : {nouvelles} telechargee(s), {inchangees} deja a jour."
    )
    if orphelines:
        print(f"{len(orphelines)} photo(s) locale(s) absente(s) de cet export (non supprimees) : {', '.join(orphelines[:8])}...")
    print(f"Dossier : {sortie}")
    print(f"Evaluation : python ml/bench/pipeline_ameliore.py {sortie / 'sujets.json'} {photos_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
