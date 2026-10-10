"""
A4.2 : sort les fichiers prives du dossier public /uploads et met a jour la base.

Avant ce script, les photos de corps (sessions de mesure) et les pieces
d'identite (verification des tailleurs) etaient ecrites sous
`upload_dir/measurement_photos` et `upload_dir/verification`, qui est MONTEE
en statique public sous /uploads : quiconque connaissait l'URL pouvait lire
une photo. Depuis, `save_upload` ecrit ces dossiers dans `protected_dir`
(jamais monte) et le montage statique les refuse. Ce script rattrape l'existant :

1. deplace  uploads/measurement_photos/<nom>   -> protected_store/measurement_photos/<nom>
   deplace  uploads/verification/<nom>         -> protected_store/verification/<nom>
2. reecrit  MeasurementSession.front_photo_url / side_photo_url
            VerificationDocument.file_url
   de  `/uploads/<dossier>/<nom>`  vers  `protected://<dossier>/<nom>`
3. purge    uploads/debug/*  (photos brutes d'analyse vision, transitoires)

Sans --apply, le script n'ecrit RIEN : il affiche ce qu'il ferait.
Relancable sans risque : une ligne deja au format `protected://...` est ignoree,
un fichier deja deplace est ignore (la cible existante n'est pas reecrassee).

Usage (depuis backend/) :
    ./venv/Scripts/python.exe scripts/migrer_fichiers_prives.py          # sec
    ./venv/Scripts/python.exe scripts/migrer_fichiers_prives.py --apply   # ecrit
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.core.config import settings  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.models.measurements import MeasurementSession  # noqa: E402
from app.models.users import VerificationDocument  # noqa: E402

UPLOAD = Path(settings.upload_dir)
PROTECTED = Path(settings.protected_dir)


def _move_one(name: str, folder: str, dry: bool) -> str:
    src = UPLOAD / folder / name
    dst = PROTECTED / folder / name
    if not src.exists():
        return f"introuvable (deja migre ?) : {folder}/{name}"
    if dst.exists():
        # Cible deja presente : on la garde, on signale juste que la source
        # reste (ligne non migree en base) — l'ecriture base se fera quand meme
        # si on applique, pointant vers une cible existante.
        return "cible existe deja (source a nettoyer)"
    if not dry:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
    return "deplace"


def main() -> None:
    dry = "--apply" not in sys.argv
    with SessionLocal() as db:
        stats = {"moveok": 0, "skipped": 0, "missing": 0, "dbok": 0}
        print(f"Stock prive : {PROTECTED}")
        print("=='--apply' ABSENT : apercu seul, rien n'est ecrit==\n" if dry else "")

        # 1) Sessions de mesure (photos du corps)
        sessions = db.query(MeasurementSession).filter(
            (MeasurementSession.front_photo_url.isnot(None))
            | (MeasurementSession.side_photo_url.isnot(None))
        ).all()
        for s in sessions:
            for field in ("front_photo_url", "side_photo_url"):
                url = getattr(s, field)
                if not url or url.startswith("protected://"):
                    continue
                prefix = "/uploads/"
                if "/uploads/" not in url:
                    continue
                relative = url.split(prefix, 1)[-1]
                folder, _, name = relative.partition("/")
                if folder != "measurement_photos" or not name:
                    continue
                outcome = _move_one(name, folder, dry)
                if outcome == "deplace":
                    stats["moveok"] += 1
                    if not dry:
                        setattr(s, field, f"protected://{folder}/{name}")
                elif outcome == "cible existe deja (source a nettoyer)":
                    stats["moveok"] += 1
                    if not dry:
                        setattr(s, field, f"protected://{folder}/{name}")
                else:
                    stats["missing"] += 1
                print(f"  session {s.id}:{field}: {relative} -> {outcome}")
        if not dry:
            db.commit()

        # 2) Documents de verification (pieces d'identite)
        docs = db.query(VerificationDocument).filter(
            VerificationDocument.file_url.startswith("/uploads/verification/")
        ).all()
        for d in docs:
            relative = d.file_url.split("/uploads/", 1)[-1]
            folder, _, name = relative.partition("/")
            if folder != "verification" or not name:
                continue
            if _move_one(name, folder, dry) == "deplace":
                stats["moveok"] += 1
                if not dry:
                    d.file_url = f"protected://{folder}/{name}"
            else:
                stats["missing"] += 1
            print(f"  verification {d.id}: {relative}")
        if not dry:
            db.commit()

        # 3) Purge du dossier debug transitoire (photos brutes d'analyse)
        debug_dir = UPLOAD / "debug"
        if debug_dir.exists():
            leftover = list(debug_dir.iterdir())
            if leftover:
                for p in leftover:
                    print(f"  debug/: {p.name} -> purge")
                    if not dry:
                        try:
                            p.unlink()
                        except OSError as exc:
                            print(f"    (non supprime : {exc})")
                if not dry:
                    try:
                        debug_dir.rmdir()
                    except OSError:
                        pass
                stats["moveok"] += len(leftover)

        print(f"\n=> {stats['moveok']} fichiers traites, {stats['missing']} absents, "
              f"{len(sessions)} sessions relues, {len(docs)} documents relus"
              + ("  (apercu : lancer avec --apply pour ecrire)" if dry else ""))


if __name__ == "__main__":
    main()