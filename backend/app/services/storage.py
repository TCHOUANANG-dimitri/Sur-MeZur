import os
import uuid

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

# Toutes les routes qui appellent save_upload() envoient des photos (mesures,
# vérification tailleur, prêt-à-porter) : aucune n'attend un autre type de
# fichier. Un contenu hors de cette liste est refusé plutôt que stocké tel
# quel — sans ce filtre, un fichier renommé en .jpg mais contenant un
# exécutable aurait été accepté et servi publiquement sous /uploads.
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

# Une photo de téléphone compressée dépasse rarement quelques Mo ; 20 Mo laisse
# une marge confortable sans permettre à une requête de remplir le disque.
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def save_upload(file: UploadFile, subdir: str) -> str:
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Type de fichier non autorisé : {file.content_type or 'inconnu'}",
        )

    # Lire une seule fois, jusqu'à MAX+1 octets : suffisant pour détecter un
    # dépassement sans jamais charger un flux arbitrairement grand en mémoire.
    content = file.file.read(_MAX_UPLOAD_BYTES + 1)
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Fichier trop volumineux (max {_MAX_UPLOAD_BYTES // (1024 * 1024)} Mo)",
        )

    target_dir = os.path.join(settings.upload_dir, subdir)
    os.makedirs(target_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(target_dir, name)
    with open(path, "wb") as out:
        out.write(content)
    return f"/uploads/{subdir}/{name}"


def delete_upload(url: str | None) -> None:
    """Supprime le fichier correspondant à une URL renvoyée par `save_upload`.

    Silencieux si `url` est vide ou ne pointe pas sous `upload_dir` : appelé
    avant un ré-upload (remplacement de photo) ou en nettoyage, jamais sur un
    chemin qu'on ne contrôle pas.
    """
    if not url or "/uploads/" not in url:
        return
    relative = url.split("/uploads/", 1)[-1]
    path = os.path.join(settings.upload_dir, relative)
    try:
        if os.path.commonpath([os.path.abspath(path), os.path.abspath(settings.upload_dir)]) == os.path.abspath(
            settings.upload_dir
        ):
            os.remove(path)
    except (OSError, ValueError):
        pass
