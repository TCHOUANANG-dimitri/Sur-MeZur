import logging
import os
import time
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.db.base import SessionLocal
from app.models.enums import JobStatus
from app.models.measurements import Avatar, Measurement
from app.models.users import ClientProfile, User
from app.schemas.measurements import AvatarCreateIn, AvatarOut
from app.services import avatar as avatar_service
from app.services.mock_ai import generate_avatar_reference

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/avatars", tags=["avatars"])


def _run_avatar_job(avatar_id: str) -> None:
    """
    Background task : génère le vrai avatar 3D via Blender + MPFB2.

    En cas d'échec (Blender absent, timeout, etc.), le service se replie
    sur le mock pour que l'application reste fonctionnelle.
    """
    with SessionLocal() as db:
        avatar = db.get(Avatar, avatar_id)
        if not avatar:
            return

        try:
            measurement = db.get(Measurement, avatar.measurement_id)
            if not measurement:
                logger.error("Measurement %s introuvable pour avatar %s", avatar.measurement_id, avatar_id)
                avatar.gltf_url = generate_avatar_reference(avatar_id)
                avatar.status = JobStatus.ready
                db.commit()
                return

            # Tenter la génération réelle
            gltf_path = avatar_service.generate_avatar(
                measurement=measurement,
                skin_tone_hex=avatar.skin_tone_hex,
            )

            if gltf_path:
                avatar.gltf_url = f"/uploads/{gltf_path}"
                avatar.status = JobStatus.ready
                logger.info("Avatar %s généré avec succès : %s", avatar_id, gltf_path)
            else:
                # Fallback sur le mock
                logger.warning("Génération Blender échouée pour avatar %s — repli mock", avatar_id)
                avatar.gltf_url = generate_avatar_reference(avatar_id)
                avatar.status = JobStatus.ready

        except Exception:
            logger.exception("Erreur inattendue lors de la génération de l'avatar %s", avatar_id)
            # Fallback sur le mock pour ne pas bloquer le client
            avatar.gltf_url = generate_avatar_reference(avatar_id)
            avatar.status = JobStatus.ready

        db.commit()


@router.get("/capabilities")
def capabilities():
    """Diagnostic : état du système d'avatar 3D."""
    return avatar_service.avatar_capabilities()


@router.post("", response_model=AvatarOut)
def create_avatar(
    payload: AvatarCreateIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client profile not found")
    measurement = db.get(Measurement, payload.measurement_id)
    if not measurement or measurement.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Measurement not found")

    avatar = Avatar(
        client_id=client.id,
        measurement_id=payload.measurement_id,
        skin_tone_hex=payload.skin_tone_hex,
        status=JobStatus.processing,
    )
    db.add(avatar)
    if not client.skin_tone_hex:
        client.skin_tone_hex = payload.skin_tone_hex
    db.commit()
    db.refresh(avatar)

    background_tasks.add_task(_run_avatar_job, avatar.id)
    return avatar


@router.get("/{avatar_id}", response_model=AvatarOut)
def get_avatar(avatar_id: str, db: Session = Depends(get_db)):
    avatar = db.get(Avatar, avatar_id)
    if not avatar:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Avatar not found")
    return avatar


@router.get("/{avatar_id}/glb")
def get_avatar_glb(
    avatar_id: str,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    """
    Télécharge le fichier GLB de l'avatar.

    Vérifie que l'utilisateur est le propriétaire de l'avatar et que le
    fichier existe bien sur le disque. Renvoie le fichier avec le bon
    Content-Type pour un chargement Three.js.
    """
    avatar = db.get(Avatar, avatar_id)
    if not avatar:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Avatar not found")

    # Vérifier la propriété
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not avatar.client_id or avatar.client_id != (client.id if client else None):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your avatar")

    if not avatar.gltf_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GLB not ready yet")

    # Extraire le chemin du fichier depuis l'URL
    # gltf_url = "/uploads/avatars/avatar_xxx.glb"
    if avatar.gltf_url.startswith("/uploads/"):
        relative = avatar.gltf_url[len("/uploads/"):]
        file_path = Path(os.environ.get("UPLOAD_DIR", "./uploads")) / relative
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid GLB URL")

    if not file_path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GLB file not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type="model/gltf-binary",
        filename=f"avatar_{avatar_id[:8]}.glb",
    )
