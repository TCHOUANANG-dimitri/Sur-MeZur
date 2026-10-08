"""
Utilisateurs (M2) et donnees personnelles (13.6) dans l'administration web.
"""

from __future__ import annotations

import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso, order_row, party_names
from app.core.deps import get_db, require_roles
from app.core.security import hash_password
from app.models.acquisition import AcquisitionChannel, AcquisitionComment, Campaign, UserAcquisition
from app.models.admin import AdminNote, LoginEvent, SupportTicket
from app.models.measurements import Measurement, MeasurementSession
from app.models.misc import Review
from app.models.orders import Order
from app.models.users import ClientProfile, TailorProfile, User
from app.services import audit
from app.services.account_tools import (
    cleanup_guests,
    export_user_data,
    find_duplicates,
    merge_clients,
    stale_guests,
    temporary_password,
)
from app.services.activity import utcnow
from app.services.admin_perms import has_perm, require_perm
from app.services.notify import notify
from app.services.platform_settings import get_setting
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response
from app.services.user_deletion import delete_user_cascade
from app.services.user_stats import local_start_utc

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])

USER_COLUMNS = [
    ("full_name", "Nom"),
    ("phone", "Téléphone"),
    ("email", "E-mail"),
    ("role", "Rôle"),
    ("status", "Statut"),
    ("city", "Ville"),
    ("platform", "Support"),
    ("channel", "Canal d'acquisition"),
    ("verification_status", "Vérification"),
    ("created_at", "Inscription"),
    ("last_login_at", "Dernière connexion"),
    ("last_seen_at", "Dernière activité"),
]


def _status_of(u: User) -> str:
    if u.is_guest:
        return "guest"
    return "active" if u.is_active else "suspended"


@router.get("/tables/users")
def users_table(
    params: TableParams = Depends(table_params),
    q: str | None = None,
    role: str | None = None,
    status_: str | None = Query(None, alias="status"),
    city: str | None = None,
    platform: str | None = None,
    channel_id: str | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    seen_from: date | None = None,
    seen_to: date | None = None,
    inactive_days: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("users.read")),
):
    """2.1 / 2.2 — liste paginee des comptes, filtres combinables."""
    query = db.query(User)
    if status_ == "guest":
        query = query.filter(User.is_guest.is_(True))
    else:
        query = query.filter(User.is_guest.is_(False))
        if status_ == "active":
            query = query.filter(User.is_active.is_(True))
        elif status_ == "suspended":
            query = query.filter(User.is_active.is_(False))
    if role:
        query = query.filter(User.role == role)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.full_name.ilike(like), User.phone.ilike(like), User.email.ilike(like)))
    if city:
        tailor_users = db.query(TailorProfile.user_id).filter(TailorProfile.city.ilike(city))
        query = query.filter(or_(User.city.ilike(city), User.id.in_(tailor_users)))
    if platform:
        query = query.filter(User.signup_platform == platform) if platform == "web" else query.filter(
            or_(User.signup_platform == platform, User.signup_platform.is_(None))
        )
    if channel_id:
        acq = db.query(UserAcquisition.user_id).filter(UserAcquisition.channel_id == channel_id)
        query = query.filter(User.id.in_(acq))
    if created_from:
        query = query.filter(User.created_at >= local_start_utc(created_from))
    if created_to:
        query = query.filter(User.created_at < local_start_utc(created_to + timedelta(days=1)))
    if seen_from:
        query = query.filter(User.last_seen_at >= local_start_utc(seen_from))
    if seen_to:
        query = query.filter(User.last_seen_at < local_start_utc(seen_to + timedelta(days=1)))
    if inactive_days:
        limit = utcnow() - timedelta(days=inactive_days)
        query = query.filter(or_(User.last_seen_at.is_(None), User.last_seen_at < limit))

    query = apply_sort(query, params, {
        "created_at": User.created_at,
        "full_name": User.full_name,
        "last_login_at": User.last_login_at,
        "last_seen_at": User.last_seen_at,
        "role": User.role,
    }, "created_at")
    rows, total = page_of(query, params)

    ids = [u.id for u in rows]
    tailors = {t.user_id: t for t in db.query(TailorProfile).filter(TailorProfile.user_id.in_(ids))} if ids else {}
    channels = {c.id: c.name for c in db.query(AcquisitionChannel).all()}
    acqs = {a.user_id: a for a in db.query(UserAcquisition).filter(UserAcquisition.user_id.in_(ids))} if ids else {}

    def serialize(u: User) -> dict:
        tp = tailors.get(u.id)
        acq = acqs.get(u.id)
        return {
            "id": u.id,
            "full_name": u.full_name,
            "phone": None if u.is_guest else u.phone,
            "email": u.email,
            "role": getattr(u.role, "value", u.role),
            "admin_role": u.admin_role,
            "status": _status_of(u),
            "is_active": u.is_active,
            "is_guest": u.is_guest,
            "city": u.city or (tp.city if tp else None),
            "platform": u.signup_platform or "app",
            "channel": channels.get(acq.channel_id) if acq and acq.channel_id else None,
            "verification_status": getattr(tp.verification_status, "value", tp.verification_status) if tp else None,
            "tailor_id": tp.id if tp else None,
            "created_at": iso(u.created_at),
            "last_login_at": iso(u.last_login_at),
            "last_seen_at": iso(u.last_seen_at),
        }

    return table_response(params, rows, total, serialize, "utilisateurs", USER_COLUMNS)


@router.get("/users/{user_id}")
def user_dossier(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_perm("users.read"))):
    """2.3 — fiche complete d'un compte."""
    u = get_or_404(db, User, user_id, "Utilisateur")
    client = db.query(ClientProfile).filter(ClientProfile.user_id == u.id).first()
    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == u.id).first()

    orders: list[Order] = []
    if client:
        orders += db.query(Order).filter(Order.client_id == client.id).all()
    if tailor:
        orders += db.query(Order).filter(Order.tailor_id == tailor.id).all()
    orders.sort(key=lambda o: o.created_at, reverse=True)
    clients, tailors = party_names(db, orders)

    measurements = []
    sessions = []
    if client:
        for m in db.query(Measurement).filter(Measurement.client_id == client.id).order_by(Measurement.created_at.desc()):
            measurements.append({
                "id": m.id, "source": getattr(m.source, "value", m.source), "version": m.version,
                "height_cm": m.height_cm, "weight_kg": m.weight_kg, "gender": m.gender, "data": m.data or {},
                "is_active": m.is_active, "is_default": client.default_measurement_id == m.id,
                "created_at": iso(m.created_at), "updated_at": iso(m.updated_at),
            })
        for s in db.query(MeasurementSession).filter(MeasurementSession.client_id == client.id).order_by(MeasurementSession.created_at.desc()).limit(20):
            sessions.append({"id": s.id, "status": getattr(s.status, "value", s.status), "error_message": s.error_message, "platform": s.platform, "created_at": iso(s.created_at)})

    reviews_given = []
    reviews_received = []
    if client:
        reviews_given = [r for r in db.query(Review).filter(Review.client_id == client.id)]
    if tailor:
        reviews_received = [r for r in db.query(Review).filter(Review.tailor_id == tailor.id)]

    def review_out(r: Review) -> dict:
        return {"id": r.id, "order_id": r.order_id, "stars": r.stars, "comment": r.comment,
                "moderation_status": getattr(r.moderation_status, "value", r.moderation_status), "created_at": iso(r.created_at)}

    acq = db.query(UserAcquisition).filter(UserAcquisition.user_id == u.id).first()
    all_channels = db.query(AcquisitionChannel).all()
    channels = {c.id: c.name for c in all_channels}
    channel_by_code = {c.code: c.name for c in all_channels}
    campaigns = {c.id: c.name for c in db.query(Campaign).all()}
    comments = db.query(AcquisitionComment).filter(AcquisitionComment.user_id == u.id).order_by(AcquisitionComment.created_at.desc()).all()

    return {
        "user": {
            "id": u.id, "full_name": u.full_name, "phone": None if u.is_guest else u.phone, "email": u.email,
            "role": getattr(u.role, "value", u.role), "admin_role": u.admin_role, "status": _status_of(u),
            "is_active": u.is_active, "is_guest": u.is_guest, "city": u.city, "language": getattr(u.language, "value", u.language),
            "photo_consent": u.photo_consent, "platform": u.signup_platform or "app",
            "must_change_password": u.must_change_password, "totp_enabled": u.totp_enabled,
            "created_at": iso(u.created_at), "last_login_at": iso(u.last_login_at), "last_seen_at": iso(u.last_seen_at),
            "guest_converted_at": iso(u.guest_converted_at),
        },
        "client_profile": {"id": client.id, "default_measurement_id": client.default_measurement_id} if client else None,
        "tailor_profile": {
            "id": tailor.id, "shop_name": tailor.shop_name, "tailor_type": getattr(tailor.tailor_type, "value", tailor.tailor_type),
            "city": tailor.city, "quartier": tailor.quartier, "bio": tailor.bio,
            "verification_status": getattr(tailor.verification_status, "value", tailor.verification_status),
            "rating_avg": float(tailor.rating_avg or 0), "completed_orders_count": tailor.completed_orders_count,
            "avg_response_minutes": tailor.avg_response_minutes, "is_featured": tailor.is_featured,
        } if tailor else None,
        "measurements": measurements,
        "measurement_sessions": sessions,
        "orders": [order_row(o, clients, tailors) for o in orders],
        "disputes": [order_row(o, clients, tailors) for o in orders if o.dispute_status],
        "reviews_given": [review_out(r) for r in reviews_given],
        "reviews_received": [review_out(r) for r in reviews_received],
        "logins": [
            {"id": e.id, "success": e.success, "method": e.method, "platform": e.platform, "ip": e.ip,
             "user_agent": e.user_agent, "created_at": iso(e.created_at)}
            for e in db.query(LoginEvent).filter(LoginEvent.user_id == u.id).order_by(LoginEvent.created_at.desc()).limit(50)
        ],
        "tickets": [
            {"id": t.id, "number": t.number, "subject": t.subject, "status": t.status, "created_at": iso(t.created_at)}
            for t in db.query(SupportTicket).filter(SupportTicket.user_id == u.id).order_by(SupportTicket.created_at.desc())
        ],
        "acquisition": {
            "channel_id": acq.channel_id, "channel": channels.get(acq.channel_id),
            "campaign_id": acq.campaign_id, "campaign": campaigns.get(acq.campaign_id),
            "referrer": acq.referrer, "self_reported": channel_by_code.get(acq.self_reported_code),
            "self_reported_code": acq.self_reported_code, "self_reported_other": acq.self_reported_other,
            "utm": acq.utm or {}, "referral_code": acq.referral_code, "landing_path": acq.landing_path,
            "platform": acq.platform, "qualified": acq.qualified, "qualified_at": iso(acq.qualified_at),
        } if acq else None,
        "acquisition_comments": [
            {"id": c.id, "author_name": c.author_name, "channel": channels.get(c.channel_id), "campaign": campaigns.get(c.campaign_id),
             "referrer": c.referrer, "method": c.method, "body": c.body, "created_at": iso(c.created_at)}
            for c in comments
        ],
        "notes_count": db.query(AdminNote).filter(AdminNote.entity_type == "user", AdminNote.entity_id == u.id).count(),
        "can": {
            "write": has_perm(admin, "users.write"),
            "delete": has_perm(admin, "users.delete"),
            "acquisition": has_perm(admin, "growth.write"),
        },
    }


class UserPatchIn(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=255)
    email: str | None = None
    city: str | None = None


@router.patch("/users/{user_id}")
def patch_user(user_id: str, payload: UserPatchIn, request: Request, db: Session = Depends(get_db),
               admin: User = Depends(require_perm("users.write"))):
    u = get_or_404(db, User, user_id, "Utilisateur")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(u, k) for k in changes}
    for k, v in changes.items():
        setattr(u, k, v)
    audit.record(db, admin, "user.update", "user", u.id, details={"avant": before, "après": changes}, request=request)
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_perm("users.write"))):
    """2.6 — mot de passe provisoire, a changer a la prochaine connexion.
    Affiche une seule fois a l'administrateur, qui le transmet a la personne."""
    u = get_or_404(db, User, user_id, "Utilisateur")
    if u.is_guest:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Un compte invité n'a pas de mot de passe")
    if getattr(u.role, "value", u.role) == "admin" and not has_perm(admin, "security"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul un super-administrateur réinitialise un administrateur")
    password = temporary_password()
    u.password_hash = hash_password(password)
    u.must_change_password = True
    notify(db, u.id, "password_reset_by_admin", {})
    audit.record(db, admin, "user.reset_password", "user", u.id, request=request)
    db.commit()
    return {"temporary_password": password}


class BulkUsersIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    action: str = Field(pattern="^(suspend|reactivate|delete)$")
    reason: str | None = None


@router.post("/users/bulk")
def bulk_users(payload: BulkUsersIn, request: Request, db: Session = Depends(get_db),
               admin: User = Depends(require_perm("users.write"))):
    """0.7 — action groupee sur des comptes."""
    if payload.action == "delete" and not has_perm(admin, "users.delete"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Suppression réservée au super-administrateur")
    done = 0
    skipped = 0
    for uid in payload.ids:
        u = db.get(User, uid)
        if not u or u.id == admin.id or getattr(u.role, "value", u.role) == "admin":
            skipped += 1
            continue
        if payload.action == "delete":
            delete_user_cascade(db, u)
        else:
            u.is_active = payload.action == "reactivate"
            notify(db, u.id, "account_reactivated" if u.is_active else "account_suspended",
                   {"is_active": u.is_active, "reason": payload.reason})
        audit.record(db, admin, f"user.{payload.action}", "user", uid, summary=payload.reason, request=request)
        done += 1
    db.commit()
    return {"done": done, "skipped": skipped}


@router.get("/users/{user_id}/export")
def export_user(user_id: str, request: Request, db: Session = Depends(get_db),
                admin: User = Depends(require_perm("users.write"))):
    """13.6 — toutes les donnees d'un utilisateur (droit d'acces), en JSON."""
    u = get_or_404(db, User, user_id, "Utilisateur")
    data = export_user_data(db, u)
    audit.record(db, admin, "user.export", "user", u.id, request=request)
    db.commit()
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2, default=str).encode("utf-8"),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="donnees-{u.id[:8]}.json"'},
    )


# --- 2.9 Mesures d'un client ------------------------------------------------------------


class MeasurementCorrectionIn(BaseModel):
    data: dict[str, float]
    height_cm: float | None = None
    reason: str = Field(min_length=3, max_length=500)


@router.patch("/measurements/{measurement_id}")
def correct_measurement(measurement_id: str, payload: MeasurementCorrectionIn, request: Request,
                        db: Session = Depends(get_db), admin: User = Depends(require_perm("users.write"))):
    m = get_or_404(db, Measurement, measurement_id, "Mesure")
    before = dict(m.data or {})
    changed = {}
    new_data = dict(before)
    for key, value in payload.data.items():
        if value is None or not (0 < float(value) < 400):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Valeur invalide pour {key}")
        if before.get(key) != value:
            changed[key] = {"avant": before.get(key), "après": value}
            new_data[key] = round(float(value), 1)
    if payload.height_cm and payload.height_cm != m.height_cm:
        changed["height_cm"] = {"avant": m.height_cm, "après": payload.height_cm}
        m.height_cm = payload.height_cm
    if not changed:
        return {"changed": 0}
    m.data = new_data
    m.version = (m.version or 1) + 1
    m.source = "mixed" if str(getattr(m.source, "value", m.source)) == "ai" else m.source
    audit.record(db, admin, "measurement.correct", "measurement", m.id, summary=payload.reason,
                 details={"modifications": changed}, request=request)
    db.commit()
    return {"changed": len(changed)}


@router.get("/measurements/{measurement_id}/history")
def measurement_history(measurement_id: str, db: Session = Depends(get_db), _=Depends(require_perm("users.read"))):
    from app.models.admin import AuditLog

    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "measurement", AuditLog.entity_id == measurement_id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    return [{"id": r.id, "actor_name": r.actor_name, "reason": r.summary, "details": r.details, "created_at": iso(r.created_at)} for r in rows]


# --- 2.7 Comptes invites ------------------------------------------------------------------


@router.get("/guests/cleanup")
def guests_cleanup_preview(db: Session = Depends(get_db), _=Depends(require_perm("users.read"))):
    days = int(get_setting("guest_retention_days", db) or 30)
    total = db.query(User).filter(User.is_guest.is_(True)).count()
    return {"retention_days": days, "guests_total": total, "to_delete": len(stale_guests(db, days))}


@router.post("/guests/cleanup")
def guests_cleanup(request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("users.delete"))):
    n = cleanup_guests(db)
    audit.record(db, admin, "guests.cleanup", summary=f"{n} compte(s) invité(s) supprimé(s)", request=request)
    db.commit()
    return {"deleted": n}


# --- 2.8 Doublons ---------------------------------------------------------------------------


@router.get("/users-duplicates")
def duplicates(db: Session = Depends(get_db), _=Depends(require_perm("users.read"))):
    return {"pairs": find_duplicates(db)}


class MergeIn(BaseModel):
    primary_id: str
    secondary_id: str


@router.post("/users-merge")
def merge(payload: MergeIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("users.delete"))):
    if payload.primary_id == payload.secondary_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choisissez deux comptes différents")
    primary = get_or_404(db, User, payload.primary_id, "Compte conservé")
    secondary = get_or_404(db, User, payload.secondary_id, "Compte fusionné")
    try:
        moved = merge_clients(db, primary, secondary)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    audit.record(db, admin, "user.merge", "user", primary.id, summary=f"fusion de {secondary.id}", details=moved, request=request)
    db.commit()
    return {"merged": True, "moved": moved}
