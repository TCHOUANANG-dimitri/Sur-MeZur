import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.db.base import SessionLocal
from app.models.enums import JobStatus
from app.models.measurements import Avatar, Measurement
from app.models.users import ClientProfile, User
from app.schemas.measurements import AvatarCreateIn, AvatarOut
from app.services.mock_ai import generate_avatar_reference

router = APIRouter(prefix="/avatars", tags=["avatars"])


def _run_avatar_job(avatar_id: str) -> None:
    time.sleep(1.5)
    with SessionLocal() as db:
        avatar = db.get(Avatar, avatar_id)
        if not avatar:
            return
        avatar.gltf_url = generate_avatar_reference(avatar_id)
        avatar.status = JobStatus.ready
        db.commit()


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
