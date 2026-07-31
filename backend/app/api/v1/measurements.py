import time

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_roles
from app.db.base import SessionLocal
from app.models.enums import JobStatus, MeasurementSource
from app.models.measurements import Measurement, MeasurementSession
from app.models.users import ClientProfile, User
from app.schemas.measurements import (
    MeasurementOut,
    MeasurementPatchIn,
    MeasurementSessionCreateIn,
    MeasurementSessionOut,
)
from app.services.mock_ai import generate_measurements
from app.services.storage import save_upload

router = APIRouter(prefix="/measurements", tags=["measurements"])


def _client_profile(user: User, db: Session) -> ClientProfile:
    profile = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client profile not found")
    return profile


def _run_measurement_job(session_id: str) -> None:
    time.sleep(2)  # mimics the "Analyse en cours..." wait from doc 1 §4.6
    with SessionLocal() as db:
        session_row = db.get(MeasurementSession, session_id)
        if not session_row:
            return
        try:
            data, confidence = generate_measurements(
                session_row.height_cm or 170, session_row.weight_kg, session_row.gender
            )
            measurement = Measurement(
                client_id=session_row.client_id,
                source=MeasurementSource.ai,
                version=1,
                height_cm=session_row.height_cm or 170,
                weight_kg=session_row.weight_kg,
                gender=session_row.gender,
                data=data,
                confidence=confidence,
            )
            db.add(measurement)
            db.flush()
            session_row.measurement_id = measurement.id
            session_row.status = JobStatus.ready

            client = db.get(ClientProfile, session_row.client_id)
            if client and not client.default_measurement_id:
                client.default_measurement_id = measurement.id
            db.commit()
        except Exception as exc:  # pragma: no cover - defensive
            session_row.status = JobStatus.failed
            session_row.error_message = str(exc)
            db.commit()


@router.post("/session", response_model=MeasurementSessionOut)
def create_session(
    payload: MeasurementSessionCreateIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = _client_profile(user, db)
    session_row = MeasurementSession(
        client_id=client.id,
        height_cm=payload.height_cm,
        weight_kg=payload.weight_kg,
        gender=payload.gender,
        status=JobStatus.processing,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return session_row


@router.post("/session/{session_id}/photos", response_model=MeasurementSessionOut)
def upload_photos(
    session_id: str,
    background_tasks: BackgroundTasks,
    front: UploadFile = File(...),
    side: UploadFile = File(...),
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = _client_profile(user, db)
    session_row = db.get(MeasurementSession, session_id)
    if not session_row or session_row.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    session_row.front_photo_url = save_upload(front, "measurement_photos")
    session_row.side_photo_url = save_upload(side, "measurement_photos")
    session_row.status = JobStatus.processing
    db.commit()
    db.refresh(session_row)

    background_tasks.add_task(_run_measurement_job, session_id)
    return session_row


@router.get("/session/{session_id}", response_model=MeasurementSessionOut)
def get_session(
    session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    session_row = db.get(MeasurementSession, session_id)
    if not session_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session_row


@router.get("", response_model=list[MeasurementOut])
def list_measurements(
    user: User = Depends(require_roles("client")), db: Session = Depends(get_db)
):
    client = _client_profile(user, db)
    return (
        db.query(Measurement)
        .filter(Measurement.client_id == client.id)
        .order_by(Measurement.created_at.desc())
        .all()
    )


@router.patch("/{measurement_id}", response_model=MeasurementOut)
def patch_measurement(
    measurement_id: str,
    payload: MeasurementPatchIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = _client_profile(user, db)
    measurement = db.get(Measurement, measurement_id)
    if not measurement or measurement.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Measurement not found")

    merged = dict(measurement.data)
    merged.update(payload.data)
    measurement.data = merged
    if payload.height_cm is not None:
        measurement.height_cm = payload.height_cm
    if measurement.source == MeasurementSource.ai:
        measurement.source = MeasurementSource.mixed
    db.commit()
    db.refresh(measurement)
    return measurement
