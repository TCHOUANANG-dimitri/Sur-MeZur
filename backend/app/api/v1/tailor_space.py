"""
Espace tailleur web (A2.3) + patrons apercus (A2.4).

Prefixe `/tailor`, role `tailor` : carnet de clients, mesures du carnet
(saisie manuelle ou photo via la chaine de vision), travaux hors plateforme,
tableau de bord, partage public d'une fiche, et demandes de patron
(moteur « preview-v0 » pour l'instant).

Le contrat exact expose a l'Agent B est fige dans CONTRAT_API_TAILLEUR.md.
"""

from __future__ import annotations

import os
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.measurements import _run_measurement_job
from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.db.base import SessionLocal
from app.models.enums import JobStatus
from app.models.measurements import MeasurementSession
from app.models.orders import Order
from app.models.tailor_tools import (
    TailorClient,
    TailorClientMeasurement,
    TailorIncomeEntry,
    TailorJob,
    TailorPatternRequest,
    TailorShareToken,
    TailorStyleAnalysis,
)
from app.models.users import TailorProfile, User
from app.services.patrons import vision
from app.services.activity import platform_of, utcnow
from app.services import patrons, tailor_finance
from app.services.pattern_engine import GARMENT_TYPES, PREVIEW_NOTE, preview_files
from app.services.phone import normalize_phone
from app.services.platform_settings import get_setting as get_platform_setting
from app.services.storage import delete_upload, save_upload

router = APIRouter(prefix="/tailor", tags=["tailor-space"], dependencies=[Depends(require_roles("tailor"))])

# Les 12 clefs de couture du parcours de mesure.
MEASURE_KEYS = (
    "neck", "chest", "waist", "hips", "biceps", "thigh",
    "wrist", "ankle", "shoulder", "sleeve_length", "inseam", "back_length",
)
JOB_STATUSES = ("todo", "in_progress", "ready", "delivered")
JOB_STATUS_LABELS = {"todo": "À faire", "in_progress": "En cours", "ready": "Prêt", "delivered": "Livré"}
SHARE_DAYS = 30
MAX_IMAGE_BYTES = 10 * 1024 * 1024
_IMAGE_MAGIC = (
    (b"\xff\xd8\xff", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", ".png"),
    (b"RIFF", ".webp"),  # WEBP : RIFF....WEBP, verifie ci-dessous
    (b"GIF87a", ".gif"),
    (b"GIF89a", ".gif"),
)


def _role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else user.role


def _tailor(user: User, db: Session) -> TailorProfile:
    tp = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not tp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profil tailleur introuvable")
    return tp


def _owned_client(tailor_id: str, client_id: str, db: Session) -> TailorClient:
    c = db.get(TailorClient, client_id)
    if not c or c.tailor_id != tailor_id or not c.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client introuvable")
    return c


def _image_ext(content: bytes) -> str:
    for magic, ext in _IMAGE_MAGIC:
        if content.startswith(magic):
            if ext == ".webp" and content[8:12] != b"WEBP":
                continue
            return ext
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Envoyez une vraie photo (JPEG, PNG, WEBP ou GIF)")


def _tailor_store(*parts: str) -> Path:
    """Dossier prive de l'espace tailleur (hors `/uploads` public)."""
    base = Path(settings.upload_dir).resolve().parent / "tailor_store"
    path = base.joinpath(*parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


# Mesures acceptees en plus pour une demande de patron « libre » (hors carnet) :
# le moteur garmentcode-v1 s'en sert pour les longueurs.
PATTERN_EXTRA_KEYS = ("height", "underbust", "waist_hip_height", "outseam")


def _clean_measure_data(data: dict, extra: tuple[str, ...] = ()) -> dict:
    if not isinstance(data, dict) or not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indiquez au moins une mesure")
    unknown = [k for k in data if k not in MEASURE_KEYS and k not in extra]
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mesures inconnues : {', '.join(sorted(unknown))}")
    out: dict[str, float] = {}
    for k, v in data.items():
        try:
            f = float(v)
        except (TypeError, ValueError):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mesure {k} invalide")
        if not 5 <= f <= 300:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mesure {k} hors limites (5-300 cm)")
        out[k] = round(f, 1)
    return out


def _status_value(s) -> str:
    return s.value if hasattr(s, "value") else s


def _client_out(c: TailorClient, db: Session) -> dict:
    last = (
        db.query(TailorClientMeasurement)
        .filter(TailorClientMeasurement.tailor_client_id == c.id)
        .order_by(TailorClientMeasurement.created_at.desc())
        .first()
    )
    jobs_open = (
        db.query(TailorJob)
        .filter(TailorJob.tailor_client_id == c.id, TailorJob.status != "delivered")
        .count()
    )
    return {
        "id": c.id,
        "full_name": c.full_name,
        "phone": c.phone,
        "gender": c.gender,
        "notes": c.notes,
        "linked_user_id": c.linked_user_id,
        "created_at": c.created_at,
        "last_measurement_at": last.created_at if last else None,
        "last_measurement_source": last.source if last else None,
        "open_jobs": jobs_open,
    }


def _measurement_out(m: TailorClientMeasurement) -> dict:
    return {
        "id": m.id,
        "data": m.data,
        "source": m.source,
        "height_cm": m.height_cm,
        "weight_kg": m.weight_kg,
        "note": m.note,
        "measurement_id": m.measurement_id,
        "created_at": m.created_at,
    }


# --- Carnet de clients -------------------------------------------------------


class TailorClientIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(None, max_length=32)
    gender: str | None = Field(None, max_length=16)
    notes: str | None = Field(None, max_length=2000)
    linked_user_id: str | None = None


class TailorClientPatchIn(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    phone: str | None = Field(None, max_length=32)
    gender: str | None = Field(None, max_length=16)
    notes: str | None = Field(None, max_length=2000)
    linked_user_id: str | None = None


@router.get("/clients")
def list_clients(
    q: str | None = None,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Carnet : recherche par nom ou numero, les plus recents d'abord."""
    tp = _tailor(user, db)
    query = db.query(TailorClient).filter(TailorClient.tailor_id == tp.id, TailorClient.is_active.is_(True))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            TailorClient.full_name.ilike(like) | TailorClient.phone.ilike(like)
        )
    rows = query.order_by(TailorClient.created_at.desc()).limit(200).all()
    return [_client_out(c, db) for c in rows]


@router.post("/clients", status_code=status.HTTP_201_CREATED)
def create_client(
    payload: TailorClientIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    linked = None
    if payload.linked_user_id:
        linked = db.get(User, payload.linked_user_id)
        if not linked or _role(linked) != "client":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Compte client lie introuvable")
    c = TailorClient(
        tailor_id=tp.id,
        full_name=payload.full_name.strip(),
        phone=normalize_phone(payload.phone) if payload.phone else None,
        gender=(payload.gender or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        linked_user_id=linked.id if linked else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _client_out(c, db)


@router.get("/clients/{client_id}")
def get_client(
    client_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    c = _owned_client(tp.id, client_id, db)
    out = _client_out(c, db)
    out["measurements"] = [
        _measurement_out(m)
        for m in db.query(TailorClientMeasurement)
        .filter(TailorClientMeasurement.tailor_client_id == c.id)
        .order_by(TailorClientMeasurement.created_at.desc())
        .limit(50)
        .all()
    ]
    out["jobs"] = [
        _job_out(j)
        for j in db.query(TailorJob)
        .filter(TailorJob.tailor_client_id == c.id)
        .order_by(TailorJob.created_at.desc())
        .all()
    ]
    return out


@router.patch("/clients/{client_id}")
def update_client(
    client_id: str,
    payload: TailorClientPatchIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    c = _owned_client(tp.id, client_id, db)
    if payload.full_name is not None:
        c.full_name = payload.full_name.strip()
    if payload.phone is not None:
        c.phone = normalize_phone(payload.phone) or None
    if payload.gender is not None:
        c.gender = payload.gender.strip() or None
    if payload.notes is not None:
        c.notes = payload.notes.strip() or None
    if payload.linked_user_id is not None:
        if payload.linked_user_id:
            linked = db.get(User, payload.linked_user_id)
            if not linked or _role(linked) != "client":
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Compte client lie introuvable")
            c.linked_user_id = linked.id
        else:
            c.linked_user_id = None
    db.commit()
    db.refresh(c)
    return _client_out(c, db)


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Retire la fiche du carnet sans effacer l'historique (mesures, travaux)."""
    tp = _tailor(user, db)
    c = _owned_client(tp.id, client_id, db)
    c.is_active = False
    db.commit()


# --- Mesures du carnet -------------------------------------------------------


class TailorMeasurementIn(BaseModel):
    data: dict
    height_cm: float | None = Field(None, gt=50, lt=260)
    weight_kg: float | None = Field(None, gt=20, lt=400)
    note: str | None = Field(None, max_length=1000)


class TailorMeasureSessionIn(BaseModel):
    height_cm: float = Field(..., gt=50, lt=260)
    weight_kg: float = Field(..., gt=20, lt=400)
    gender: str = Field(..., pattern="^(female|male)$")


@router.post("/clients/{client_id}/measurements", status_code=status.HTTP_201_CREATED)
def add_manual_measurement(
    client_id: str,
    payload: TailorMeasurementIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Saisie manuelle au metre ruban."""
    tp = _tailor(user, db)
    c = _owned_client(tp.id, client_id, db)
    m = TailorClientMeasurement(
        tailor_client_id=c.id,
        data=_clean_measure_data(payload.data),
        source="manual",
        height_cm=payload.height_cm,
        weight_kg=payload.weight_kg,
        note=(payload.note or "").strip() or None,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _measurement_out(m)


@router.post("/clients/{client_id}/measure-session", status_code=status.HTTP_201_CREATED)
def create_measure_session(
    client_id: str,
    payload: TailorMeasureSessionIn,
    request: Request,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Ouvre une session de mesure par photo pour un client du carnet."""
    tp = _tailor(user, db)
    c = _owned_client(tp.id, client_id, db)
    session_row = MeasurementSession(
        client_id=None,
        tailor_client_id=c.id,
        height_cm=payload.height_cm,
        weight_kg=payload.weight_kg,
        gender=payload.gender,
        status=JobStatus.processing,
        platform=platform_of(request),
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return {"id": session_row.id, "status": _status_value(session_row.status), "tailor_client_id": c.id}


@router.post("/measure-session/{session_id}/photos")
def upload_measure_photos(
    session_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    front: UploadFile = File(...),
    side: UploadFile | None = File(None),
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Envoie les photos d'une session du carnet et lance l'analyse."""
    tp = _tailor(user, db)
    session_row = db.get(MeasurementSession, session_id)
    if (
        not session_row
        or not session_row.tailor_client_id
        or db.get(TailorClient, session_row.tailor_client_id).tailor_id != tp.id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session introuvable")
    _check_image_upload(front)
    if side is not None:
        _check_image_upload(side)
    delete_upload(session_row.front_photo_url)
    delete_upload(session_row.side_photo_url)
    session_row.front_photo_url = save_upload(front, "tailor_measurements")
    session_row.side_photo_url = save_upload(side, "tailor_measurements") if side is not None else None
    session_row.status = JobStatus.processing
    session_row.error_message = None
    session_row.started_at = utcnow()
    session_row.finished_at = None
    db.commit()
    db.refresh(session_row)
    if settings.measurement_worker_mode == "cron":
        from app.worker_measurements import spawn_now
        spawn_now(session_id)
    else:
        background_tasks.add_task(_run_measurement_job, session_id)
    return {"id": session_row.id, "status": _status_value(session_row.status)}


def _check_image_upload(f: UploadFile) -> None:
    if (getattr(f, "size", None) or 0) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo trop lourde (10 Mo maximum)")
    head = f.file.read(12) if hasattr(f.file, "read") else b""
    try:
        if hasattr(f.file, "seek"):
            f.file.seek(0)
    except Exception:
        pass
    if head:
        _image_ext(head)


@router.get("/measure-session/{session_id}")
def get_measure_session(
    session_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Statut d'une session du carnet, comme /measurements/session/{id}."""
    tp = _tailor(user, db)
    session_row = db.get(MeasurementSession, session_id)
    if (
        not session_row
        or not session_row.tailor_client_id
        or db.get(TailorClient, session_row.tailor_client_id).tailor_id != tp.id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session introuvable")
    out = {
        "id": session_row.id,
        "status": _status_value(session_row.status),
        "measurement_id": session_row.measurement_id,
        "error_message": session_row.error_message,
        "tailor_client_id": session_row.tailor_client_id,
        "measurement": None,
    }
    if session_row.measurement_id:
        row = (
            db.query(TailorClientMeasurement)
            .filter(
                TailorClientMeasurement.tailor_client_id == session_row.tailor_client_id,
                TailorClientMeasurement.measurement_id == session_row.measurement_id,
            )
            .order_by(TailorClientMeasurement.created_at.desc())
            .first()
        )
        out["measurement"] = _measurement_out(row) if row else None
    return out


# --- Partage public d'une fiche ----------------------------------------------


@router.post("/clients/{client_id}/share", status_code=status.HTTP_201_CREATED)
def share_client_sheet(
    client_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Cree (ou renouvelle) le lien public de la fiche, valable 30 jours."""
    tp = _tailor(user, db)
    c = _owned_client(tp.id, client_id, db)
    token = secrets.token_urlsafe(24)
    db.add(TailorShareToken(
        token=token,
        tailor_id=tp.id,
        tailor_client_id=c.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=SHARE_DAYS),
    ))
    db.commit()
    return {
        "url": f"/api/public/fiches/{token}",
        "token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=SHARE_DAYS)).isoformat(),
    }


# --- Travaux (commandes hors plateforme) -------------------------------------


class TailorJobIn(BaseModel):
    tailor_client_id: str | None = None
    description: str | None = Field(None, max_length=2000)
    garment_model_id: str | None = None
    garment_type: str | None = Field(None, max_length=24)
    status: str = "todo"
    delivery_date: date | None = None
    agreed_price: float | None = Field(None, ge=0)
    advance_received: float | None = Field(None, ge=0)


class TailorJobPatchIn(BaseModel):
    tailor_client_id: str | None = None
    description: str | None = Field(None, max_length=2000)
    garment_model_id: str | None = None
    garment_type: str | None = Field(None, max_length=24)
    status: str | None = None
    delivery_date: date | None = None
    agreed_price: float | None = Field(None, ge=0)
    advance_received: float | None = Field(None, ge=0)


def _job_out(j: TailorJob) -> dict:
    return {
        "id": j.id,
        "tailor_client_id": j.tailor_client_id,
        "description": j.description,
        "garment_model_id": j.garment_model_id,
        "garment_type": j.garment_type,
        "status": j.status,
        "status_label": JOB_STATUS_LABELS.get(j.status, j.status),
        "delivery_date": j.delivery_date.isoformat() if j.delivery_date else None,
        "agreed_price": float(j.agreed_price) if j.agreed_price is not None else None,
        "advance_received": float(j.advance_received) if j.advance_received is not None else None,
        "reference_photo_url": f"/api/tailor/jobs/{j.id}/photo" if j.reference_photo_url else None,
        "finished_at": j.finished_at,
        "created_at": j.created_at,
    }


def _check_job_client(tailor_id: str, tailor_client_id: str | None, db: Session) -> None:
    if tailor_client_id:
        _owned_client(tailor_id, tailor_client_id, db)


def _check_job_amounts(price: float | None, advance: float | None) -> None:
    # Simple note de calcul, mais une avance superieure au prix rendrait le
    # « reste a payer » negatif : c'est une faute de saisie.
    if price is not None and advance is not None and float(advance) > float(price):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "L'avance ne peut pas dépasser le prix convenu")


@router.get("/jobs")
def list_jobs(
    status: str | None = None,
    due: str | None = None,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Travaux du carnet. `due=week` (a livrer sous 7 jours) ou `due=late`
    (en retard) ; les deux ne retiennent que les travaux non livres."""
    tp = _tailor(user, db)
    query = db.query(TailorJob).filter(TailorJob.tailor_id == tp.id)
    if status:
        if status not in JOB_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Statut inconnu")
        query = query.filter(TailorJob.status == status)
    if due in ("week", "late"):
        today = date.today()
        query = query.filter(TailorJob.status != "delivered", TailorJob.delivery_date.is_not(None))
        if due == "week":
            query = query.filter(TailorJob.delivery_date >= today, TailorJob.delivery_date <= today + timedelta(days=7))
        else:
            query = query.filter(TailorJob.delivery_date < today)
        query = query.order_by(TailorJob.delivery_date)
        return [_job_out(j) for j in query.all()]
    return [_job_out(j) for j in query.order_by(TailorJob.created_at.desc()).limit(200).all()]


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_job(
    payload: TailorJobIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    _check_job_client(tp.id, payload.tailor_client_id, db)
    if payload.status not in JOB_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Statut inconnu")
    _check_job_amounts(payload.agreed_price, payload.advance_received)
    j = TailorJob(
        tailor_id=tp.id,
        tailor_client_id=payload.tailor_client_id,
        description=(payload.description or "").strip() or None,
        garment_model_id=payload.garment_model_id,
        garment_type=(payload.garment_type or "").strip() or None,
        status=payload.status,
        delivery_date=payload.delivery_date,
        agreed_price=payload.agreed_price,
        advance_received=payload.advance_received,
    )
    db.add(j)
    db.flush()
    # L'avance d'un travail vaut la somme de ses recettes : l'avance saisie a
    # la creation devient donc une entree du carnet, et non une valeur a part.
    if payload.advance_received and float(payload.advance_received) > 0:
        db.add(
            TailorIncomeEntry(
                tailor_id=tp.id,
                job_id=j.id,
                amount=float(payload.advance_received),
                received_on=date.today(),
                label="Avance",
                method="cash",
            )
        )
    db.commit()
    db.refresh(j)
    return _job_out(j)


def _owned_job(tailor_id: str, job_id: str, db: Session) -> TailorJob:
    j = db.get(TailorJob, job_id)
    if not j or j.tailor_id != tailor_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Travail introuvable")
    return j


@router.patch("/jobs/{job_id}")
def update_job(
    job_id: str,
    payload: TailorJobPatchIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    j = _owned_job(tp.id, job_id, db)
    if payload.tailor_client_id is not None:
        _check_job_client(tp.id, payload.tailor_client_id, db)
        j.tailor_client_id = payload.tailor_client_id
    if payload.description is not None:
        j.description = payload.description.strip() or None
    if payload.garment_model_id is not None:
        j.garment_model_id = payload.garment_model_id or None
    if payload.garment_type is not None:
        j.garment_type = payload.garment_type.strip() or None
    if payload.status is not None:
        if payload.status not in JOB_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Statut inconnu")
        j.status = payload.status
        j.finished_at = utcnow() if payload.status == "delivered" else None
    if payload.delivery_date is not None:
        j.delivery_date = payload.delivery_date
    if payload.agreed_price is not None:
        j.agreed_price = payload.agreed_price
    if payload.advance_received is not None:
        # L'avance est CALCULEE : elle vaut la somme des recettes du travail.
        # Une avance modifiee en direct devient donc une entree de difference
        # (« Ajustement de l'avance »), jamais une ecriture silencieuse qui
        # desaccorderait le carnet et l'affichage.
        tailor_finance.ensure_job_reprise(db, j)
        current = tailor_finance.job_entries_total(db, j.id)
        target = float(payload.advance_received)
        if target > current + tailor_finance.EPSILON:
            db.add(
                TailorIncomeEntry(
                    tailor_id=tp.id,
                    job_id=j.id,
                    amount=target - current,
                    received_on=date.today(),
                    label="Ajustement de l'avance",
                    method="cash",
                )
            )
            db.flush()
        elif target < current - tailor_finance.EPSILON:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Pour reduire l'avance, supprimez une recette du carnet de recettes.",
            )
        tailor_finance.sync_job_advance(db, j)
    _check_job_amounts(j.agreed_price, j.advance_received)
    db.commit()
    db.refresh(j)
    return _job_out(j)


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    j = _owned_job(tp.id, job_id, db)
    if j.reference_photo_url:
        try:
            os.remove(_tailor_store("jobs", os.path.basename(j.reference_photo_url)))
        except OSError:
            pass
    # Les recettes attachees a ce travail partent avec lui : une recette de
    # travail supprime n'a plus de travail ou porter.
    for entry in db.query(TailorIncomeEntry).filter(TailorIncomeEntry.job_id == j.id).all():
        db.delete(entry)
    db.delete(j)
    db.commit()


@router.post("/jobs/{job_id}/photo")
def set_job_photo(
    job_id: str,
    photo: UploadFile = File(...),
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Photo de reference d'un modele hors catalogue (protegee, lue par route)."""
    tp = _tailor(user, db)
    j = _owned_job(tp.id, job_id, db)
    content = photo.file.read(MAX_IMAGE_BYTES + 1) if hasattr(photo.file, "read") else b""
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo trop lourde (10 Mo maximum)")
    ext = _image_ext(content[:12])
    dest = _tailor_store("jobs", f"{j.id}{ext}")
    for stale in dest.parent.glob(f"{j.id}.*"):
        if stale != dest:
            stale.unlink(missing_ok=True)
    dest.write_bytes(content)
    j.reference_photo_url = f"tailor_store/jobs/{dest.name}"
    db.commit()
    return _job_out(j)


@router.get("/jobs/{job_id}/photo")
def get_job_photo(
    job_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    j = _owned_job(tp.id, job_id, db)
    if not j.reference_photo_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pas de photo")
    path = _tailor_store("jobs", os.path.basename(j.reference_photo_url))
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pas de photo")
    return FileResponse(path)


# --- Tableau de bord ---------------------------------------------------------


@router.get("/dashboard")
def tailor_dashboard(
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    orders_by_status: dict[str, int] = {}
    for (st,) in db.query(Order.status).filter(Order.tailor_id == tp.id).all():
        key = st.value if hasattr(st, "value") else st
        orders_by_status[key] = orders_by_status.get(key, 0) + 1
    today = date.today()
    base = db.query(TailorJob).filter(TailorJob.tailor_id == tp.id, TailorJob.status != "delivered")
    due_week = (
        base.filter(
            TailorJob.delivery_date.is_not(None),
            TailorJob.delivery_date >= today,
            TailorJob.delivery_date <= today + timedelta(days=7),
        )
        .order_by(TailorJob.delivery_date)
        .all()
    )
    late = (
        base.filter(TailorJob.delivery_date.is_not(None), TailorJob.delivery_date < today)
        .order_by(TailorJob.delivery_date)
        .all()
    )
    clients_count = (
        db.query(TailorClient)
        .filter(TailorClient.tailor_id == tp.id, TailorClient.is_active.is_(True))
        .count()
    )
    return {
        "orders_by_status": orders_by_status,
        "jobs_due_week": [_job_out(j) for j in due_week],
        "jobs_late": [_job_out(j) for j in late],
        "clients_count": clients_count,
    }


# --- Patrons (A2.4, moteur preview-v0) ---------------------------------------


def _pattern_out(r: TailorPatternRequest) -> dict:
    return {
        "id": r.id,
        "garment_type": r.garment_type,
        "tailor_client_id": r.tailor_client_id,
        "status": r.status,
        "engine": r.engine,
        "result": r.result,
        "error_message": r.error_message,
        "image_url": f"/api/tailor/patterns/{r.id}/image" if r.image_url else None,
        "svg_url": f"/api/tailor/patterns/{r.id}/svg" if r.status == "ready" else None,
        # Tout patron pret a ses PDF (moteur ou apercu) ; un ancien apercu,
        # genere avant l'export commun, n'en a pas : on ne liste que l'existant.
        "pdf_urls": (
            {k: f"/api/tailor/patterns/{r.id}/pdf?type={k}" for k in PATTERN_PDFS
             if _tailor_store("patterns", f"{r.id}_{k}.pdf").exists()} or None
            if r.status == "ready" else None
        ),
        "created_at": r.created_at,
    }


# PDF du moteur garmentcode-v1 (stockes sous patterns/<id>_<type>.pdf).
PATTERN_PDFS = {
    "tracage": "fiche de traçage (une page par pièce, cotes et points)",
    "a4": "patron 1:1 en pages A4 à assembler",
    "plein": "patron 1:1 sur une seule page (traceur, imprimerie)",
}
_GENRE = {"female": "femme", "male": "homme", "femme": "femme", "homme": "homme", "f": "femme", "m": "homme"}


def _owned_pattern(tailor_id: str, pattern_id: str, db: Session) -> TailorPatternRequest:
    r = db.get(TailorPatternRequest, pattern_id)
    if not r or r.tailor_id != tailor_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patron introuvable")
    return r


def _run_pattern_job(request_id: str) -> None:
    """Moteur preview-v0 en tache de fond : patron de base depuis les mesures."""
    with SessionLocal() as db:
        r = db.get(TailorPatternRequest, request_id)
        if not r:
            return
        try:
            measurements: dict = {}
            adhoc = (r.result or {}).get("adhoc_measurements") if r.result else None
            if isinstance(adhoc, dict) and adhoc:
                measurements = dict(adhoc)
            elif r.tailor_client_id:
                row = (
                    db.query(TailorClientMeasurement)
                    .filter(TailorClientMeasurement.tailor_client_id == r.tailor_client_id)
                    .order_by(TailorClientMeasurement.created_at.desc())
                    .first()
                )
                if row:
                    measurements = dict(row.data or {})
                    if row.height_cm:
                        measurements.setdefault("height_total", row.height_cm)
            demande = dict((r.result or {}).get("demande") or {})
            if r.engine == patrons.MOTEUR:
                genre = demande.get("genre")
                if not genre and r.tailor_client_id:
                    c = db.get(TailorClient, r.tailor_client_id)
                    genre = _GENRE.get((c.gender or "").lower()) if c else None
                patron = patrons.generer(demande["base"], measurements, demande.get("style"), genre)
                for nom, contenu in patrons.fichiers(patron).items():
                    _tailor_store("patterns", f"{r.id}.svg" if nom == "svg" else f"{r.id}_{nom}").write_bytes(contenu)
                tech = patron.fiche()
            else:
                contenus, tech = preview_files(r.garment_type, measurements, title=f"Patron — {r.garment_type}")
                for nom, contenu in contenus.items():
                    _tailor_store("patterns", f"{r.id}.svg" if nom == "svg" else f"{r.id}_{nom}").write_bytes(contenu)
                tech["note"] = PREVIEW_NOTE
            if demande:
                tech["demande"] = demande
            r.result = tech
            r.status = "ready"
            db.commit()
        except patrons.PatronImpossible as e:
            # Message destine au tailleur (mesure hors limites, reglage impossible).
            db.rollback()
            r = db.get(TailorPatternRequest, request_id)
            if r:
                r.status = "failed"
                r.error_message = str(e)[:500]
                db.commit()
        except Exception:
            db.rollback()
            r = db.get(TailorPatternRequest, request_id)
            if r:
                r.status = "failed"
                r.error_message = "La génération a échoué, réessayez."
                db.commit()


@router.post("/patterns", status_code=status.HTTP_201_CREATED)
def create_pattern(
    background_tasks: BackgroundTasks,
    image: UploadFile | None = File(None),
    garment_type: str = Form(...),
    tailor_client_id: str | None = Form(None),
    measurements: str | None = Form(None),
    base: str | None = Form(None),
    style: str | None = Form(None),
    genre: str | None = Form(None),
    fiche: str | None = Form(None),
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Demande de patron : type (categorie) + mesures (client du carnet OU
    JSON `{"chest": 94, ...}`), image de reference.

    Reglage `features.pattern_generation` :
    - "preview"     : apercu rectangulaire (preview-v0), image obligatoire ;
    - "on"          : vrai patron (garmentcode-v1) si la categorie a un modele
      de base, image facultative ; `base` choisit le modele (sinon celui par
      defaut), `style` est un JSON de reglages (`{"longueur_cm": 60}`),
      `genre` (femme/homme) le gabarit des mesures manquantes.

    `fiche` : fiche de style validee par le tailleur (JSON), issue de
    l'analyse de la photo ; conservee avec la demande, pour tracer d'ou
    viennent les reglages.
    """
    tp = _tailor(user, db)
    features = get_platform_setting("features") or {}
    mode = features.get("pattern_generation", "on")
    if mode == "off":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patrons désactivés")
    gtype = (garment_type or "").strip().lower()
    if gtype not in GARMENT_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Type inconnu ({', '.join(GARMENT_TYPES)})",
        )
    demande: dict = {}
    if mode in ("on", "garmentcode"):
        base_id = (base or "").strip() or patrons.BASE_PAR_DEFAUT.get(gtype)
        if base_id:
            b = patrons.BASES_PAR_ID.get(base_id)
            if b is None or b.categorie != gtype:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Modèle de base inconnu pour « {gtype} »")
            demande["base"] = base_id
        if style:
            import json

            try:
                parsed_style = json.loads(style)
            except ValueError:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Style JSON invalide")
            if not isinstance(parsed_style, dict):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Style JSON invalide")
            demande["style"] = parsed_style
        if genre:
            if genre not in ("femme", "homme"):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Genre : femme ou homme")
            demande["genre"] = genre
    if fiche:
        import json

        try:
            parsed_fiche = json.loads(fiche)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fiche de style JSON invalide")
        if not isinstance(parsed_fiche, dict) or len(fiche) > 4000:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fiche de style JSON invalide")
        demande["fiche_style"] = parsed_fiche
    engine = patrons.MOTEUR if demande.get("base") else "preview-v0"
    if image is None and engine == "preview-v0":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image de référence requise")
    if tailor_client_id:
        _owned_client(tp.id, tailor_client_id, db)
    else:
        if not measurements:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Indiquez tailor_client_id ou des mensurations",
            )
    content = b""
    if image is not None:
        content = image.file.read(MAX_IMAGE_BYTES + 1) if hasattr(image.file, "read") else b""
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image trop lourde (10 Mo maximum)")
    ext = _image_ext(content[:12]) if content else None
    r = TailorPatternRequest(
        tailor_id=tp.id,
        tailor_client_id=tailor_client_id,
        garment_type=gtype,
        status="processing",
        engine=engine,
    )
    db.add(r)
    db.flush()
    if content:
        dest = _tailor_store("patterns", f"{r.id}{ext}")
        dest.write_bytes(content)
        r.image_url = f"tailor_store/patterns/{dest.name}"
    if measurements and not tailor_client_id:
        import json

        try:
            parsed = json.loads(measurements)
        except ValueError:
            db.rollback()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mensurations JSON invalides")
        # Mesures « libres » (hors carnet) : conservees sur la demande, lues
        # par le moteur ; rien n'est ecrit dans le carnet.
        r.result = {"adhoc_measurements": _clean_measure_data(parsed, PATTERN_EXTRA_KEYS)}
    if demande:
        r.result = {**(r.result or {}), "demande": demande}
    db.commit()
    db.refresh(r)
    background_tasks.add_task(_run_pattern_job, r.id)
    return _pattern_out(r)


@router.get("/patterns/catalogue")
def pattern_catalogue(user: User = Depends(require_roles("tailor"))):
    """Categories, modeles de base et reglages de style du moteur de patrons,
    avec le mode actif (`preview` ou `garmentcode`)."""
    features = get_platform_setting("features") or {}
    return {"mode": features.get("pattern_generation", "on"), "pdfs": PATTERN_PDFS,
            # Analyse de la photo par le modele de vision disponible ?
            "vision": bool(settings.vl_url),
            **patrons.catalogue_public()}


# --- Fiche de style : analyse de la photo du modele (Qwen3-VL) ---------------

def _analyse_out(a: TailorStyleAnalysis) -> dict:
    return {"id": a.id, "status": a.status, "error_message": a.error_message, **(a.result or {})}


def _run_style_analysis(analysis_id: str, contenu: bytes) -> None:
    """Tache de fond : 1 a 3 minutes sur le processeur du VPS. La photo
    n'existe qu'en memoire, le temps de l'appel."""
    try:
        result = vision.analyser(settings.vl_url, contenu, settings.vl_timeout_s)
        statut, erreur = "ready", None
    except vision.AnalyseImpossible as e:
        result, statut, erreur = None, "failed", str(e)[:500]
    except Exception:
        result, statut, erreur = None, "failed", "L'analyse a échoué."
    with SessionLocal() as db:
        a = db.get(TailorStyleAnalysis, analysis_id)
        if a:
            a.status, a.result, a.error_message = statut, result, erreur
            db.commit()


@router.post("/patterns/analyse", status_code=status.HTTP_202_ACCEPTED)
def analyse_pattern_photo(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Lance l'analyse de la photo d'un modele ; le resultat se lit ensuite
    sur GET /patterns/analyse/{id} (fiche de style + proposition pour le
    formulaire de patron). 503 si le modele de vision n'est pas configure."""
    if not settings.vl_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Analyse de photo indisponible")
    tp = _tailor(user, db)
    contenu = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(contenu) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image trop lourde (10 Mo maximum)")
    _image_ext(contenu[:12])  # refuse ce qui n'est pas une photo
    a = TailorStyleAnalysis(tailor_id=tp.id, status="processing")
    db.add(a)
    db.commit()
    db.refresh(a)
    background_tasks.add_task(_run_style_analysis, a.id, contenu)
    return _analyse_out(a)


@router.get("/patterns/analyse/{analysis_id}")
def get_pattern_photo_analysis(
    analysis_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    a = db.get(TailorStyleAnalysis, analysis_id)
    if not a or a.tailor_id != tp.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analyse introuvable")
    return _analyse_out(a)


@router.get("/patterns")
def list_patterns(
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    rows = (
        db.query(TailorPatternRequest)
        .filter(TailorPatternRequest.tailor_id == tp.id)
        .order_by(TailorPatternRequest.created_at.desc())
        .limit(100)
        .all()
    )
    return [_pattern_out(r) for r in rows]


@router.get("/patterns/{pattern_id}")
def get_pattern_request(
    pattern_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    return _pattern_out(_owned_pattern(tp.id, pattern_id, db))


@router.get("/patterns/{pattern_id}/svg")
def get_pattern_svg(
    pattern_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    r = _owned_pattern(tp.id, pattern_id, db)
    path = _tailor_store("patterns", f"{r.id}.svg")
    if r.status != "ready" or not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patron pas encore prêt")
    return FileResponse(path, media_type="image/svg+xml")


@router.get("/patterns/{pattern_id}/pdf")
def get_pattern_pdf(
    pattern_id: str,
    type: str = "tracage",
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    r = _owned_pattern(tp.id, pattern_id, db)
    if type not in PATTERN_PDFS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Type : {', '.join(PATTERN_PDFS)}")
    path = _tailor_store("patterns", f"{r.id}_{type}.pdf")
    if r.status != "ready" or not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "PDF indisponible pour ce patron")
    return FileResponse(path, media_type="application/pdf", filename=f"patron-{r.garment_type}-{type}.pdf")


@router.get("/patterns/{pattern_id}/image")
def get_pattern_image(
    pattern_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    r = _owned_pattern(tp.id, pattern_id, db)
    if not r.image_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pas d'image")
    path = _tailor_store("patterns", os.path.basename(r.image_url))
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pas d'image")
    return FileResponse(path)


@router.delete("/patterns/{pattern_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pattern(
    pattern_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tp = _tailor(user, db)
    r = _owned_pattern(tp.id, pattern_id, db)
    noms = [f"{r.id}.svg", os.path.basename(r.image_url) if r.image_url else ""]
    noms += [f"{r.id}_{k}.pdf" for k in PATTERN_PDFS]
    for name in noms:
        if name:
            try:
                os.remove(_tailor_store("patterns", name))
            except OSError:
                pass
    db.delete(r)
    db.commit()
