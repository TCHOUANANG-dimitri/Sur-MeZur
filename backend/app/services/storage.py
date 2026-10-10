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


def _magic_matches(content: bytes, content_type: str) -> bool:
    """Un `content_type` déclaré n'a aucune valeur : un exécutable renommé en
    `.jpg` le signale autant qu'une vraie photo ou qu'un `as_attachment`
    malveillant. Seuls les premiers octets du fichier (miracles) tranchent."""
    if not content:
        return False
    head = content[:16]
    if content_type == "image/jpeg":
        return head[:3] == b"\xff\xd8\xff"
    if content_type == "image/png":
        return head[:8] == b"\x89PNG\r\n\x1a\n"
    if content_type == "image/webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if content_type in ("image/heic", "image/heif"):
        return head[4:8] == b"ftyp" and any(b in head[8:16] for b in (b"heic", b"heif", b"mif1"))
    return False

# Dossiers dont le contenu est PRIVÉ (photos de corps, pièces d'identité,
# analyses de débogage) : ils sont écrits dans `protected_dir`, hors de
# `/uploads`, et ne sortent que par des routes qui vérifient le droit de voir
# (propriété pour `/measurements`, permissions pour `/admin`).
PROTECTED_SUBDIRS = {"measurement_photos", "verification", "debug"}

PROTECTED_PREFIX = "protected://"


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
    if not _magic_matches(content, file.content_type or ""):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Le contenu du fichier ne correspond pas au type déclaré",
        )

    private = subdir in PROTECTED_SUBDIRS
    root = settings.protected_dir if private else settings.upload_dir
    target_dir = os.path.join(root, subdir)
    os.makedirs(target_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    name = f"{uuid.uuid4().hex}{ext}"[:120]
    path = os.path.join(target_dir, name)
    with open(path, "wb") as out:
        out.write(content)
    if private:
        return f"{PROTECTED_PREFIX}{subdir}/{name}"
    return f"/uploads/{subdir}/{name}"


def protected_path(url: str | None, subdir: str | None = None) -> str | None:
    """Chemin disque d'un fichier privé stocké sous `protected_dir`.

    Accepte les deux formes conservées en base :
    - `protected://<dossier>/<nom>` (nouveau format, hors /uploads) ;
    - `/uploads/<dossier>/<nom>` (ancien format, avant la migration).

    Ne prend que le NOM DE FICHIER (`os.path.basename`), jamais l'URL telle
    quelle : aucun `../` ni chemin absolu ne peut sortir du dossier attendu.
    Retourne `None` quand la forme est inconnue ou que le dossier ne figure pas
    parmi les sous-dossiers privés.
    """
    if not url:
        return None
    folder = subdir
    name = None
    if url.startswith(PROTECTED_PREFIX):
        rest = url[len(PROTECTED_PREFIX):]
        if "/" in rest:
            folder, _, name = rest.partition("/")
    elif "/uploads/" in url or "/uploads/" in f"/{url}":
        relative = url.split("/uploads/", 1)[-1]
        if "/" in relative:
            folder, _, name = relative.partition("/")
    if not folder or folder not in PROTECTED_SUBDIRS or not name:
        return None
    name = os.path.basename(name)
    if not name:
        return None
    return os.path.join(settings.protected_dir, folder, name)


def delete_upload(url: str | None) -> None:
    """Supprime le fichier correspondant à une URL renvoyée par `save_upload`.

    Silencieux si `url` est vide ou ne pointe ni sous `upload_dir` ni sous
    `protected_dir` : appelé avant un ré-upload (remplacement de photo) ou en
    nettoyage, jamais sur un chemin qu'on ne contrôle pas.
    """
    if not url:
        return
    if url.startswith(PROTECTED_PREFIX):
        path = protected_path(url)
        if path:
            _remove_safe(path, settings.protected_dir)
        return
    if "/uploads/" not in url:
        return
    relative = url.split("/uploads/", 1)[-1]
    _remove_safe(os.path.join(settings.upload_dir, relative), settings.upload_dir)


def _remove_safe(path: str, root: str) -> None:
    try:
        if os.path.commonpath([os.path.abspath(path), os.path.abspath(root)]) == os.path.abspath(root):
            os.remove(path)
    except (OSError, ValueError):
        pass
