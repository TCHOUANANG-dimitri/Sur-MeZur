"""
Routes de la campagne de collecte (application `collecte/`).

Qui fait quoi
- `collector` (agent de terrain) : cree des sujets, les complete, envoie les
  photos. Ne voit et ne modifie QUE ses propres fiches, et plus une fois
  qu'elles sont validees.
- `admin` : voit tout, relit (valide / rejette), exporte, gere les agents.

Les photos ne sont JAMAIS servies en statique : elles vivent dans
`settings.dataset_dir`, hors de /uploads, et ne sortent que par
GET /collecte/subjects/{id}/photos/{vue}, apres controle du role.
"""

import hashlib
import io
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from starlette.background import BackgroundTask

from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.services.admin_perms import require_perm
from app.core.security import hash_password
from app.models.collecte import DatasetPhoto, DatasetSubject
from app.models.enums import UserRole
from app.models.users import User
from app.schemas.collecte import (
    CollecteStatsOut,
    CollectorActiveIn,
    CollectorCreateIn,
    CollectorOut,
    PhotoOut,
    ReviewIn,
    SubjectCreateIn,
    SubjectOut,
    SubjectUpdateIn,
)
from app.services.collecte_export import bench_json, build_zip, csv_text, subject_row
from app.services.collecte_protocol import VUES, is_complete

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/collecte", tags=["collecte"])

require_collecte = require_roles("collector", "admin")
# 13.1 : la relecture, l'export et les agents relevent de la permission
# « collecte » (moderateur ou super-administrateur).
require_admin = require_perm("collecte")

_ALLOWED_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}
# L'application reduit deja les photos (2048 px, JPEG 0,9 : ~0,5 Mo). 25 Mo
# laisse passer un original de telephone envoye tel quel sans ouvrir la porte
# a un fichier arbitraire.
_MAX_PHOTO_BYTES = 25 * 1024 * 1024


def _is_admin(user: User) -> bool:
    return (user.role.value if hasattr(user.role, "value") else user.role) == "admin"


def _serialize(subject: DatasetSubject, names: dict[str, str]) -> SubjectOut:
    return SubjectOut(
        id=subject.id,
        code=subject.code,
        number=subject.number,
        client_uuid=subject.client_uuid,
        collector_id=subject.collector_id,
        collector_name=names.get(subject.collector_id),
        gender=subject.gender,
        age=subject.age,
        height_cm=subject.height_cm,
        weight_kg=subject.weight_kg,
        measurements=subject.measurements or {},
        clothing=subject.clothing,
        city=subject.city,
        place=subject.place,
        measured_by=subject.measured_by,
        measured_at=subject.measured_at,
        notes=subject.notes,
        consent=subject.consent,
        consent_name=subject.consent_name,
        review_status=subject.review_status,
        review_note=subject.review_note,
        photos=[
            PhotoOut(
                view=p.view,
                size_bytes=p.size_bytes,
                width=p.width,
                height=p.height,
                sha256=p.sha256,
                updated_at=p.updated_at,
            )
            for p in subject.photos
        ],
        complete=is_complete(subject.measurements or {}, {p.view for p in subject.photos}),
        created_at=subject.created_at,
        updated_at=subject.updated_at,
    )


def _collector_names(db: Session, subjects: list[DatasetSubject]) -> dict[str, str]:
    ids = {s.collector_id for s in subjects}
    if not ids:
        return {}
    return {u.id: u.full_name for u in db.query(User).filter(User.id.in_(ids)).all()}


def _get_visible(db: Session, subject_id: str, user: User) -> DatasetSubject:
    subject = (
        db.query(DatasetSubject)
        .options(selectinload(DatasetSubject.photos))
        .filter(DatasetSubject.id == subject_id)
        .first()
    )
    # 404 aussi pour la fiche d'un autre agent : ne pas confirmer qu'elle existe.
    if not subject or (not _is_admin(user) and subject.collector_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable")
    return subject


def _ensure_editable(subject: DatasetSubject, user: User) -> None:
    if not _is_admin(user) and subject.review_status == "validated":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cette fiche a été validée : seul un administrateur peut encore la modifier.",
        )


def _scoped_query(db: Session, user: User):
    q = db.query(DatasetSubject)
    if not _is_admin(user):
        q = q.filter(DatasetSubject.collector_id == user.id)
    return q


# ---------------------------------------------------------------------------
# Tableau de bord
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=CollecteStatsOut)
def stats(db: Session = Depends(get_db), user: User = Depends(require_collecte)):
    subjects = _scoped_query(db, user).options(selectinload(DatasetSubject.photos)).all()
    today = datetime.now(timezone.utc).date()

    def created_today(s: DatasetSubject) -> bool:
        created = s.created_at
        if created is None:
            return False
        if created.tzinfo is None:  # SQLite rend des dates naives
            created = created.replace(tzinfo=timezone.utc)
        return created.date() == today

    return CollecteStatsOut(
        total=len(subjects),
        complete=sum(1 for s in subjects if is_complete(s.measurements or {}, {p.view for p in s.photos})),
        validated=sum(1 for s in subjects if s.review_status == "validated"),
        rejected=sum(1 for s in subjects if s.review_status == "rejected"),
        pending=sum(1 for s in subjects if s.review_status == "pending"),
        male=sum(1 for s in subjects if s.gender == "male"),
        female=sum(1 for s in subjects if s.gender == "female"),
        photos=sum(len(s.photos) for s in subjects),
        today=sum(1 for s in subjects if created_today(s)),
    )


# ---------------------------------------------------------------------------
# Fiches
# ---------------------------------------------------------------------------


@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(
    review_status: str | None = Query(default=None, alias="statut"),
    gender: str | None = Query(default=None, alias="sexe"),
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_collecte),
):
    query = _scoped_query(db, user).options(selectinload(DatasetSubject.photos))
    if review_status:
        query = query.filter(DatasetSubject.review_status == review_status)
    if gender:
        query = query.filter(DatasetSubject.gender == gender)
    subjects = query.order_by(DatasetSubject.number.desc()).all()
    if q:
        needle = q.strip().lower().replace("smz-", "").lstrip("0")
        subjects = [
            s
            for s in subjects
            if needle in str(s.number)
            or needle in (s.city or "").lower()
            or needle in (s.place or "").lower()
        ]
    names = _collector_names(db, subjects)
    return [_serialize(s, names) for s in subjects]


@router.post("/subjects", response_model=SubjectOut)
def create_subject(payload: SubjectCreateIn, db: Session = Depends(get_db), user: User = Depends(require_collecte)):
    # Renvoi d'une fiche deja recue (reprise apres coupure) : on la rend telle
    # quelle au lieu d'en creer une seconde.
    existing = (
        db.query(DatasetSubject)
        .options(selectinload(DatasetSubject.photos))
        .filter(DatasetSubject.client_uuid == payload.client_uuid)
        .first()
    )
    if existing:
        if existing.collector_id != user.id and not _is_admin(user):
            raise HTTPException(status.HTTP_409_CONFLICT, "Identifiant de fiche deja utilise")
        return _serialize(existing, _collector_names(db, [existing]))

    data = payload.model_dump()
    # Numero sequentiel : max + 1, avec reprise si deux agents envoient au meme
    # instant (contrainte d'unicite sur `number`).
    for _attempt in range(5):
        number = (db.query(func.max(DatasetSubject.number)).scalar() or 0) + 1
        subject = DatasetSubject(number=number, collector_id=user.id, **data)
        db.add(subject)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            again = db.query(DatasetSubject).filter(DatasetSubject.client_uuid == payload.client_uuid).first()
            if again:
                subject = again
                break
    else:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Numérotation indisponible, réessayez")

    db.refresh(subject)
    return _serialize(subject, _collector_names(db, [subject]))


@router.get("/subjects/{subject_id}", response_model=SubjectOut)
def get_subject(subject_id: str, db: Session = Depends(get_db), user: User = Depends(require_collecte)):
    subject = _get_visible(db, subject_id, user)
    return _serialize(subject, _collector_names(db, [subject]))


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: str,
    payload: SubjectUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_collecte),
):
    subject = _get_visible(db, subject_id, user)
    _ensure_editable(subject, user)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(subject, field, value)
    # Une fiche rejetee puis corrigee par l'agent repart en relecture.
    if changes and subject.review_status == "rejected" and not _is_admin(user):
        subject.review_status = "pending"
    db.commit()
    db.refresh(subject)
    return _serialize(subject, _collector_names(db, [subject]))


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(subject_id: str, db: Session = Depends(get_db), user: User = Depends(require_collecte)):
    subject = _get_visible(db, subject_id, user)
    _ensure_editable(subject, user)
    folder = os.path.join(settings.dataset_dir, subject.code)
    for photo in subject.photos:
        _remove_file(photo.file_path)
    db.delete(subject)
    db.commit()
    try:
        os.rmdir(folder)
    except OSError:
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/subjects/{subject_id}/review", response_model=SubjectOut)
def review_subject(
    subject_id: str,
    payload: ReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    subject = _get_visible(db, subject_id, user)
    subject.review_status = payload.status
    subject.review_note = payload.note
    subject.reviewed_by = user.id
    db.commit()
    db.refresh(subject)
    return _serialize(subject, _collector_names(db, [subject]))


# ---------------------------------------------------------------------------
# Photos
# ---------------------------------------------------------------------------


def _safe_path(relative: str) -> str:
    root = os.path.abspath(settings.dataset_dir)
    path = os.path.abspath(os.path.join(root, relative))
    if os.path.commonpath([path, root]) != root:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chemin invalide")
    return path


def _remove_file(relative: str) -> None:
    try:
        os.remove(_safe_path(relative))
    except (OSError, HTTPException):
        pass


def _image_size(content: bytes) -> tuple[int | None, int | None]:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(content)) as img:
            return img.width, img.height
    except Exception:
        # Pillow absent (dependance de requirements-vision.txt) ou format non
        # lisible (HEIC) : la photo est gardee, seules ses dimensions manquent.
        return None, None


@router.put("/subjects/{subject_id}/photos/{view}", response_model=SubjectOut)
def upload_photo(
    subject_id: str,
    view: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_collecte),
):
    if view not in VUES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Vue inconnue : {view}")
    subject = _get_visible(db, subject_id, user)
    _ensure_editable(subject, user)

    ext = _ALLOWED_PHOTO_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Type de fichier non autorisé : {file.content_type or 'inconnu'}",
        )
    content = file.file.read(_MAX_PHOTO_BYTES + 1)
    if len(content) > _MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Photo trop volumineuse (max 25 Mo)")
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo vide")

    relative = f"{subject.code}/{subject.code}_{view}{ext}"
    target = _safe_path(relative)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    # Ecriture dans un fichier voisin puis renommage : une coupure pendant
    # l'envoi ne laisse jamais une photo tronquee a la place de la bonne.
    tmp = f"{target}.part"
    with open(tmp, "wb") as out:
        out.write(content)
    os.replace(tmp, target)

    width, height = _image_size(content)
    photo = next((p for p in subject.photos if p.view == view), None)
    if photo and photo.file_path != relative:
        _remove_file(photo.file_path)  # ancienne extension (png -> jpg)
    if photo is None:
        photo = DatasetPhoto(subject_id=subject.id, view=view, file_path=relative, sha256="")
        db.add(photo)
    photo.file_path = relative
    photo.content_type = file.content_type or "image/jpeg"
    photo.size_bytes = len(content)
    photo.width, photo.height = width, height
    photo.sha256 = hashlib.sha256(content).hexdigest()
    photo.updated_at = datetime.now(timezone.utc)
    if subject.review_status == "rejected" and not _is_admin(user):
        subject.review_status = "pending"
    db.commit()
    db.refresh(subject)
    return _serialize(subject, _collector_names(db, [subject]))


@router.get("/subjects/{subject_id}/photos/{view}")
def get_photo(subject_id: str, view: str, db: Session = Depends(get_db), user: User = Depends(require_collecte)):
    subject = _get_visible(db, subject_id, user)
    photo = next((p for p in subject.photos if p.view == view), None)
    if not photo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo absente")
    path = _safe_path(photo.file_path)
    if not os.path.exists(path):
        logger.error("Photo de collecte manquante sur disque : %s", path)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fichier introuvable sur le serveur")
    return FileResponse(
        path,
        media_type=photo.content_type,
        filename=os.path.basename(path),
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/subjects/{subject_id}/photos/{view}", response_model=SubjectOut)
def delete_photo(subject_id: str, view: str, db: Session = Depends(get_db), user: User = Depends(require_collecte)):
    subject = _get_visible(db, subject_id, user)
    _ensure_editable(subject, user)
    photo = next((p for p in subject.photos if p.view == view), None)
    if photo:
        _remove_file(photo.file_path)
        db.delete(photo)
        db.commit()
        db.refresh(subject)
    return _serialize(subject, _collector_names(db, [subject]))


# ---------------------------------------------------------------------------
# Export (administrateur)
# ---------------------------------------------------------------------------


@router.get("/export")
def export(
    fmt: str = Query(default="zip", alias="format", pattern="^(zip|csv|json|manifest)$"),
    review_status: str = Query(default="non_rejected", alias="statut"),
    photos: bool = True,
    excel: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """
    - `zip`      : sujets.json (format ml/bench) + CSV + photos/
    - `csv`      : le tableau seul (`excel=true` pour Excel en francais)
    - `json`     : le sujets.json seul
    - `manifest` : toutes les fiches avec l'empreinte de chaque photo, pour
                   ml/scripts/telecharger_collecte.py (synchronisation locale)

    `statut` : non_rejected (defaut), validated, pending, rejected, all.
    """
    query = db.query(DatasetSubject).options(selectinload(DatasetSubject.photos))
    if review_status == "non_rejected":
        query = query.filter(DatasetSubject.review_status != "rejected")
    elif review_status != "all":
        query = query.filter(DatasetSubject.review_status == review_status)
    subjects = query.order_by(DatasetSubject.number).all()
    names = _collector_names(db, subjects)
    rows = [subject_row(s, names.get(s.collector_id)) for s in subjects]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    if fmt == "csv":
        return Response(
            content=csv_text(rows, excel_fr=excel),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="collecte-{stamp}.csv"'},
        )
    if fmt == "json":
        return JSONResponse(
            bench_json(subjects),
            headers={"Content-Disposition": f'attachment; filename="sujets-{stamp}.json"'},
        )
    if fmt == "manifest":
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "sujets_json": bench_json(subjects),
            "rows": rows,
            "photos": [
                {
                    "subject_id": s.id,
                    "code": s.code,
                    "view": p.view,
                    "file_name": os.path.basename(p.file_path),
                    "sha256": p.sha256,
                    "size_bytes": p.size_bytes,
                }
                for s in subjects
                for p in s.photos
            ],
        }

    path = build_zip(subjects, rows, with_photos=photos)
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"collecte-surmezur-{stamp}.zip",
        background=BackgroundTask(lambda: os.path.exists(path) and os.remove(path)),
    )


# ---------------------------------------------------------------------------
# Agents de terrain (administrateur)
# ---------------------------------------------------------------------------


def _collector_out(db: Session, u: User) -> CollectorOut:
    count = db.query(func.count(DatasetSubject.id)).filter(DatasetSubject.collector_id == u.id).scalar() or 0
    return CollectorOut(
        id=u.id,
        full_name=u.full_name,
        phone=u.phone,
        role=u.role.value if hasattr(u.role, "value") else u.role,
        is_active=u.is_active,
        subjects=count,
        created_at=u.created_at,
    )


@router.get("/collectors", response_model=list[CollectorOut])
def list_collectors(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    users = (
        db.query(User)
        .filter(User.role.in_([UserRole.collector.value, UserRole.admin.value]))
        .order_by(User.created_at.desc())
        .all()
    )
    return [_collector_out(db, u) for u in users]


@router.post("/collectors", response_model=CollectorOut, status_code=status.HTTP_201_CREATED)
def create_collector(payload: CollectorCreateIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    phone = payload.phone.strip()
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Un compte existe déjà avec ce numéro")
    collector = User(
        role=UserRole.collector,
        phone=phone,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(collector)
    db.commit()
    db.refresh(collector)
    return _collector_out(db, collector)


@router.patch("/collectors/{user_id}", response_model=CollectorOut)
def set_collector_active(
    user_id: str,
    payload: CollectorActiveIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    target = db.get(User, user_id)
    role = target.role.value if target and hasattr(target.role, "value") else (target.role if target else None)
    # Seuls les agents se desactivent ici : un compte admin ou client ne doit
    # pas pouvoir etre coupe par cette porte laterale.
    if not target or role != UserRole.collector.value:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent introuvable")
    target.is_active = payload.is_active
    db.commit()
    db.refresh(target)
    return _collector_out(db, target)
