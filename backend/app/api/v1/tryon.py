import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.db.base import SessionLocal
from app.models.enums import JobStatus
from app.models.measurements import Avatar, TryonSession
from app.models.users import ClientProfile, User
from app.schemas.tryon import TryonCreateIn, TryonOut
from app.services.mock_ai import generate_tryon_reference

router = APIRouter(prefix="/tryon", tags=["tryon"])


def _run_tryon_job(tryon_id: str) -> None:
    time.sleep(1.5)
    with SessionLocal() as db:
        session_row = db.get(TryonSession, tryon_id)
        if not session_row:
            return
        session_row.gltf_url = generate_tryon_reference(tryon_id)
        session_row.status = JobStatus.ready
        db.commit()


@router.post("", response_model=TryonOut)
def create_tryon(
    payload: TryonCreateIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    avatar = db.get(Avatar, payload.avatar_id)
    if not avatar:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Avatar not found")

    session_row = TryonSession(
        avatar_id=payload.avatar_id,
        garment_model_id=payload.garment_model_id,
        ready_to_wear_id=payload.ready_to_wear_id,
        fabric_id=payload.fabric_id,
        accessory_ids=payload.accessory_ids,
        status=JobStatus.processing,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)

    background_tasks.add_task(_run_tryon_job, session_row.id)
    return session_row


@router.get("", response_model=list[TryonOut])
def list_my_tryons(
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    """'Mes essayages' -- every finalized try-on the client has generated,
    newest first, so they can pick one before ordering."""
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not client:
        return []
    return (
        db.query(TryonSession)
        .join(Avatar, Avatar.id == TryonSession.avatar_id)
        .filter(Avatar.client_id == client.id)
        .order_by(TryonSession.created_at.desc())
        .all()
    )


@router.get("/{tryon_id}", response_model=TryonOut)
def get_tryon(tryon_id: str, db: Session = Depends(get_db)):
    session_row = db.get(TryonSession, tryon_id)
    if not session_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tryon session not found")
    return session_row
