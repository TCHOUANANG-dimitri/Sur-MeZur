"""
Import en masse d'images de la galerie depuis le dossier uploads/.

Structure attendue :
    backend/uploads/
    ├── homme/
    │   ├── chemises/
    │   │   ├── classique.jpg
    │   │   └── elegante.png
    │   └── pantalons/
    │       └── droit.jpg
    └── femme/
        └── robes/
            └── soiree.jpg

Chaque sous-dossier de genre (homme/femme) contient des sous-dossiers de
catégorie.  Pour chaque image : un GarmentModel est créé avec la catégorie
correspondante.  Les fichiers restent à leur emplacement d'origine — seuls
les chemins relatifs sous uploads/ sont enregistrés en base.

Usage :
    cd backend
    ./venv/Scripts/python.exe scripts/import_gallery_images.py
"""

import os
import sys
from pathlib import Path

# Ajouter le répertoire parent au path pour importer les modules de l'app
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.db.base import Base, engine
from app.models.catalog import Category, GarmentModel
from app.models.mixins import IDMixin, TimestampMixin  # noqa: F401 — ensure mixins loaded
from sqlalchemy.orm import Session

# Mapping nom de dossier → genre
GENDER_MAP = {
    "homme": "male",
    "male": "male",
    "femme": "female",
    "female": "female",
    "unisex": "unisex",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def run():
    # Réutilise le moteur déjà configuré depuis settings.database_url (voir
    # app/db/base.py) plutôt que d'en reconstruire un à partir d'un chemin
    # deviné : un script à part qui se connecterait à la mauvaise base (ex.
    # en production, où le fichier ne s'appelle pas forcément sur_mezur.db à
    # la racine) importerait tout dans le vide sans qu'aucune erreur ne le
    # signale.
    Base.metadata.create_all(bind=engine)

    uploads_dir = Path(settings.upload_dir)
    if not uploads_dir.is_dir():
        print(f"Dossier uploads introuvable : {uploads_dir}")
        sys.exit(1)

    created_categories = 0
    created_models = 0
    skipped = 0

    with Session(engine) as db:
        for entry in sorted(uploads_dir.iterdir()):
            if not entry.is_dir():
                continue

            gender = GENDER_MAP.get(entry.name.lower())
            if gender is None:
                # Pas un dossier de genre (debug/, avatars/, etc.) — ignorer
                continue

            print(f"\n📂 {entry.name}/ (genre: {gender})")

            for category_dir in sorted(entry.iterdir()):
                if not category_dir.is_dir():
                    continue

                category_name = category_dir.name.replace("-", " ").replace("_", " ").title()

                # get_or_create la catégorie
                cat = (
                    db.query(Category)
                    .filter(Category.name == category_name, Category.gender == gender)
                    .first()
                )
                if not cat:
                    cat = Category(name=category_name, gender=gender)
                    db.add(cat)
                    db.flush()
                    created_categories += 1
                    print(f"  ✚ Catégorie créée : {category_name} ({gender})")

                # Parcourir les images
                for img_file in sorted(category_dir.iterdir()):
                    if img_file.suffix.lower() not in IMAGE_EXTENSIONS:
                        continue

                    # Chemin relatif depuis uploads/
                    rel_path = f"/uploads/{entry.name}/{category_dir.name}/{img_file.name}"

                    # Vérifier si déjà importé
                    existing = db.query(GarmentModel).filter(GarmentModel.photo_url == rel_path).first()
                    if existing:
                        skipped += 1
                        continue

                    model_name = img_file.stem.replace("-", " ").replace("_", " ").title()
                    model = GarmentModel(
                        name=model_name,
                        category_id=cat.id,
                        photo_url=rel_path,
                        photos=[rel_path],
                    )
                    db.add(model)
                    created_models += 1
                    print(f"    📷 {model_name} → {rel_path}")

        db.commit()

    print(f"\n✅ Terminé : {created_categories} catégorie(s) créée(s), {created_models} modèle(s) importé(s), {skipped} ignoré(s)")


if __name__ == "__main__":
    run()
