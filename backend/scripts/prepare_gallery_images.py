"""
Prépare les images de la galerie catalogue avant import : redimensionne,
recompresse et convertit en .jpg standard.

Pourquoi ce script existe
-------------------------
Les images sources (uploads/homme/*, uploads/femme/*, hors du dépôt) sont en
`.jfif` — un conteneur JPEG valide, mais une extension moins bien reconnue
par certains CDN/serveurs que `.jpg`. Ce script les recompresse en JPEG
standard, plafonne leur plus grand côté à MAX_DIMENSION (elles font déjà
autour de 700-1300px, donc ça ne dégrade quasiment rien ici, mais protège
contre une future image importée en pleine résolution photo) et enlève les
métadonnées EXIF — gain de poids gratuit, sans intérêt pour un catalogue.

Usage :
    cd backend
    ./venv/Scripts/python.exe scripts/prepare_gallery_images.py <dossier_source> <dossier_dest>

Exemple (structure attendue identique des deux côtés — homme/femme puis
sous-dossiers de catégorie) :
    ./venv/Scripts/python.exe scripts/prepare_gallery_images.py \
        "C:/Users/Admin/Desktop/Sur-MeZur/uploads" uploads
"""

import sys
from pathlib import Path

from PIL import Image, ImageOps

MAX_DIMENSION = 1000
JPEG_QUALITY = 82
SOURCE_EXTENSIONS = {".jfif", ".jpg", ".jpeg", ".png", ".webp"}


def _slugify(name: str) -> str:
    return name.strip().lower().replace(" ", "-")


def prepare(source_root: Path, dest_root: Path) -> None:
    if not source_root.is_dir():
        print(f"Dossier source introuvable : {source_root}")
        sys.exit(1)

    total = 0
    saved_bytes = 0

    for gender_dir in sorted(source_root.iterdir()):
        if not gender_dir.is_dir():
            continue
        for category_dir in sorted(gender_dir.iterdir()):
            if not category_dir.is_dir():
                continue
            dest_dir = dest_root / gender_dir.name / _slugify(category_dir.name)
            dest_dir.mkdir(parents=True, exist_ok=True)

            for img_file in sorted(category_dir.iterdir()):
                if img_file.suffix.lower() not in SOURCE_EXTENSIONS:
                    continue
                dest_file = dest_dir / f"{img_file.stem}.jpg"

                # `ImageOps.exif_transpose` applique la rotation EXIF avant de
                # la jeter — sinon une photo prise en portrait sur téléphone
                # ressort couchée une fois les métadonnées supprimées.
                im = Image.open(img_file)
                im = ImageOps.exif_transpose(im)
                if im.mode != "RGB":
                    im = im.convert("RGB")
                im.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
                im.save(dest_file, "JPEG", quality=JPEG_QUALITY, optimize=True)

                before = img_file.stat().st_size
                after = dest_file.stat().st_size
                saved_bytes += before - after
                total += 1

            print(f"  {gender_dir.name}/{category_dir.name} : "
                  f"{len(list(dest_dir.glob('*.jpg')))} image(s)")

    print(f"\n{total} image(s) préparée(s) dans {dest_root}")
    print(f"Gain : {saved_bytes / 1024 / 1024:.1f} Mo")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage : prepare_gallery_images.py <dossier_source> <dossier_dest>")
        sys.exit(1)
    prepare(Path(sys.argv[1]), Path(sys.argv[2]))
