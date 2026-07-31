import os
import uuid

from fastapi import UploadFile

from app.core.config import settings


def save_upload(file: UploadFile, subdir: str) -> str:
    target_dir = os.path.join(settings.upload_dir, subdir)
    os.makedirs(target_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(target_dir, name)
    with open(path, "wb") as out:
        out.write(file.file.read())
    return f"/uploads/{subdir}/{name}"
