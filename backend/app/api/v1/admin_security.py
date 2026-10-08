"""
Securite, acces et reglages (M13) dans l'administration web.
"""

from __future__ import annotations

import os
import shutil
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso
from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.core.security import decode_token, hash_password
from app.db.base import engine
from app.models.admin import AdminSession, AuditLog
from app.models.enums import UserRole
from app.models.users import User
from app.services import audit, totp
from app.services.account_tools import temporary_password
from app.services.activity import as_utc, utcnow
from app.services.admin_perms import ADMIN_ROLES, admin_role_of, require_perm
from app.services.phone import normalize_phone
from app.services.platform_settings import DEFAULTS, all_settings, set_setting
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response
from app.services.user_stats import local_start_utc

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])


# --- 13.1 / 13.2 Equipe ----------------------------------------------------------------


def _member_out(u: User, sessions: int = 0) -> dict:
    role = admin_role_of(u)
    return {
        "id": u.id, "full_name": u.full_name, "phone": u.phone, "email": u.email,
        "admin_role": role, "admin_role_label": ADMIN_ROLES.get(role, role), "is_active": u.is_active,
        "totp_enabled": u.totp_enabled, "last_login_at": iso(u.last_login_at), "last_seen_at": iso(u.last_seen_at),
        "created_at": iso(u.created_at), "open_sessions": sessions,
    }


@router.get("/team")
def list_team(db: Session = Depends(get_db), _=Depends(require_perm("security"))):
    sessions: dict[str, int] = {}
    for (uid,) in db.query(AdminSession.user_id).filter(AdminSession.revoked_at.is_(None)).all():
        sessions[uid] = sessions.get(uid, 0) + 1
    members = db.query(User).filter(User.role == "admin").order_by(User.created_at).all()
    return {"roles": ADMIN_ROLES, "members": [_member_out(u, sessions.get(u.id, 0)) for u in members]}


class MemberIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=6, max_length=32)
    email: str | None = None
    admin_role: str


@router.post("/team", status_code=status.HTTP_201_CREATED)
def create_member(payload: MemberIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("security"))):
    """13.2 — creer un compte administrateur. Le mot de passe provisoire est
    affiche une seule fois et doit etre change a la premiere connexion."""
    if payload.admin_role not in ADMIN_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Rôle inconnu")
    phone = normalize_phone(payload.phone)
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indiquez un numéro de téléphone")
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce numéro a déjà un compte")
    password = temporary_password()
    member = User(role=UserRole.admin, admin_role=payload.admin_role, phone=phone, email=payload.email,
                  full_name=payload.full_name.strip(), password_hash=hash_password(password), must_change_password=True)
    db.add(member)
    db.flush()
    audit.record(db, admin, "team.create", "user", member.id, summary=f"{member.full_name} ({payload.admin_role})", request=request)
    db.commit()
    return {"member": _member_out(member), "temporary_password": password}


class MemberPatchIn(BaseModel):
    admin_role: str | None = None
    is_active: bool | None = None


def _active_super_admins(db: Session, exclude: str | None = None) -> int:
    return sum(
        1 for u in db.query(User).filter(User.role == "admin", User.is_active.is_(True)).all()
        if admin_role_of(u) == "super_admin" and u.id != exclude
    )


@router.patch("/team/{user_id}")
def update_member(user_id: str, payload: MemberPatchIn, request: Request, db: Session = Depends(get_db),
                  admin: User = Depends(require_perm("security"))):
    member = get_or_404(db, User, user_id, "Membre")
    if member.role != "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ce compte n'est pas un administrateur")
    demoting = payload.admin_role and payload.admin_role != "super_admin" and admin_role_of(member) == "super_admin"
    disabling = payload.is_active is False and member.is_active
    if (demoting or disabling) and admin_role_of(member) == "super_admin" and _active_super_admins(db, exclude=member.id) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Il doit rester au moins un super-administrateur actif")
    if member.id == admin.id and disabling:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vous ne pouvez pas désactiver votre propre compte")
    changes = {}
    if payload.admin_role is not None:
        if payload.admin_role not in ADMIN_ROLES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Rôle inconnu")
        changes["admin_role"] = {"avant": admin_role_of(member), "après": payload.admin_role}
        member.admin_role = payload.admin_role
    if payload.is_active is not None:
        changes["is_active"] = {"avant": member.is_active, "après": payload.is_active}
        member.is_active = payload.is_active
        if not payload.is_active:
            db.query(AdminSession).filter(AdminSession.user_id == member.id, AdminSession.revoked_at.is_(None)).update(
                {"revoked_at": utcnow(), "revoked_reason": "account_disabled"}, synchronize_session=False
            )
    audit.record(db, admin, "team.update", "user", member.id, details=changes, request=request)
    db.commit()
    return _member_out(member)


@router.post("/team/{user_id}/reset-2fa")
def reset_member_2fa(user_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("security"))):
    """Telephone perdu : le membre se reconnecte avec son seul mot de passe,
    puis reactive la double authentification."""
    member = get_or_404(db, User, user_id, "Membre")
    member.totp_enabled = False
    member.totp_secret = None
    audit.record(db, admin, "team.reset_2fa", "user", member.id, request=request)
    db.commit()
    return {"ok": True}


# --- 13.3 Journal ---------------------------------------------------------------------------


AUDIT_COLUMNS = [("created_at", "Date"), ("actor_name", "Auteur"), ("action", "Action"), ("entity_type", "Élément"),
                 ("entity_id", "Identifiant"), ("summary", "Détail"), ("ip", "Adresse IP")]


@router.get("/tables/audit")
def audit_table(
    params: TableParams = Depends(table_params),
    actor_id: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("security")),
):
    query = db.query(AuditLog)
    if actor_id:
        query = query.filter(AuditLog.actor_id == actor_id)
    if action:
        query = query.filter(AuditLog.action.ilike(f"{action}%"))
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if date_from:
        query = query.filter(AuditLog.created_at >= local_start_utc(date_from))
    if date_to:
        query = query.filter(AuditLog.created_at < local_start_utc(date_to + timedelta(days=1)))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(AuditLog.summary.ilike(like), AuditLog.actor_name.ilike(like), AuditLog.action.ilike(like)))
    query = apply_sort(query, params, {"created_at": AuditLog.created_at, "action": AuditLog.action}, "created_at")
    rows, total = page_of(query, params)
    return table_response(params, rows, total, lambda r: {
        "id": r.id, "created_at": iso(r.created_at), "actor_id": r.actor_id, "actor_name": r.actor_name, "action": r.action,
        "entity_type": r.entity_type, "entity_id": r.entity_id, "summary": r.summary, "details": r.details, "ip": r.ip,
    }, "journal", AUDIT_COLUMNS)


@router.get("/audit/actions")
def audit_actions(db: Session = Depends(get_db), _=Depends(require_perm("security"))):
    return sorted({a for (a,) in db.query(AuditLog.action).distinct()})


# --- 13.4 Double authentification ---------------------------------------------------------------


@router.post("/me/2fa/setup")
def setup_2fa(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """Genere une cle (non active tant qu'un premier code n'est pas valide)."""
    if user.totp_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La double authentification est déjà active")
    user.totp_secret = totp.new_secret()
    db.commit()
    return {"secret": user.totp_secret, "otpauth_uri": totp.provisioning_uri(user.totp_secret, user.phone)}


class CodeIn(BaseModel):
    code: str


@router.post("/me/2fa/enable")
def enable_2fa(payload: CodeIn, request: Request, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    if not user.totp_secret or not totp.verify(user.totp_secret, payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code incorrect : vérifiez l'heure de votre téléphone et réessayez")
    user.totp_enabled = True
    audit.record(db, user, "security.2fa_enabled", "user", user.id, request=request)
    db.commit()
    return {"ok": True}


@router.post("/me/2fa/disable")
def disable_2fa(payload: CodeIn, request: Request, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    if not user.totp_enabled or not totp.verify(user.totp_secret, payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code incorrect")
    user.totp_enabled = False
    user.totp_secret = None
    audit.record(db, user, "security.2fa_disabled", "user", user.id, request=request)
    db.commit()
    return {"ok": True}


# --- 13.5 Sessions ---------------------------------------------------------------------------------


def _current_sid(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    data = decode_token(auth[7:])
    return data.get("sid") if data else None


@router.get("/sessions")
def list_sessions(request: Request, all_: bool = Query(False, alias="all"), user: User = Depends(require_roles("admin")),
                  db: Session = Depends(get_db)):
    from app.services.admin_perms import has_perm
    from app.services.platform_settings import get_setting

    idle = int(get_setting("admin_idle_minutes", db) or 0)
    query = db.query(AdminSession, User).join(User, User.id == AdminSession.user_id).filter(AdminSession.revoked_at.is_(None))
    if not (all_ and has_perm(user, "security")):
        query = query.filter(AdminSession.user_id == user.id)
    current = _current_sid(request)
    out = []
    now = utcnow()
    for s, u in query.order_by(AdminSession.last_seen_at.desc()).all():
        if idle and now - as_utc(s.last_seen_at) > timedelta(minutes=idle):
            continue  # deja expiree par inactivite, sera fermee a la prochaine requete
        out.append({"id": s.id, "user_id": u.id, "full_name": u.full_name, "ip": s.ip, "user_agent": s.user_agent,
                    "created_at": iso(s.created_at), "last_seen_at": iso(s.last_seen_at), "current": s.id == current})
    return {"sessions": out, "idle_minutes": idle}


@router.post("/sessions/{session_id}/revoke")
def revoke_session(session_id: str, request: Request, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    from app.services.admin_perms import has_perm

    s = get_or_404(db, AdminSession, session_id, "Session")
    if s.user_id != user.id and not has_perm(user, "security"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Session d'un autre administrateur")
    s.revoked_at = utcnow()
    s.revoked_reason = "revoked"
    audit.record(db, user, "security.session_revoked", "user", s.user_id, request=request)
    db.commit()
    return {"ok": True}


@router.post("/sessions/revoke-others")
def revoke_other_sessions(request: Request, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    current = _current_sid(request)
    n = db.query(AdminSession).filter(
        AdminSession.user_id == user.id, AdminSession.revoked_at.is_(None), AdminSession.id != (current or "")
    ).update({"revoked_at": utcnow(), "revoked_reason": "revoked"}, synchronize_session=False)
    audit.record(db, user, "security.sessions_revoked", "user", user.id, summary=f"{n} session(s)", request=request)
    db.commit()
    return {"revoked": n}


# --- 13.7 / 13.8 Reglages -----------------------------------------------------------------------------


SETTING_LABELS = {
    "guest_retention_days": "Conservation des comptes invités (jours)",
    "churn_inactivity_days": "Inactivité valant départ (jours)",
    "admin_idle_minutes": "Déconnexion des administrateurs inactifs (minutes)",
    "maintenance": "Mode maintenance",
    "banner": "Bandeau du site",
    "cities": "Villes et quartiers",
    "negotiation_max_rounds": "Nombre d'offres maximal par négociation",
    "offer_expiry_days": "Délai de validité d'une offre (jours)",
    "deposit_share": "Part de l'acompte",
    "tailor_immediate_share": "Part versée au tailleur à l'acompte",
    "order_no_response_days": "Alerte : commande sans réponse du tailleur (jours)",
    "dispute_alert_days": "Alerte : litige ouvert depuis (jours)",
    "tailor_quality": "Seuils d'alerte qualité des tailleurs",
    "collecte_target": "Objectifs de la campagne de collecte",
    "signup_source_question": "Question « Comment nous avez-vous connu ? »",
}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _=Depends(require_perm("security", "comms"))):
    return {"values": all_settings(db), "defaults": DEFAULTS, "labels": SETTING_LABELS}


class SettingIn(BaseModel):
    value: Any


def _validate(key: str, value: Any) -> Any:
    default = DEFAULTS[key]
    if isinstance(default, bool):
        if not isinstance(value, bool):
            raise ValueError("oui/non attendu")
        return value
    if isinstance(default, int):
        v = int(value)
        if v < 0 or v > 100_000:
            raise ValueError("nombre hors limites")
        return v
    if isinstance(default, float):
        v = float(value)
        if not 0 <= v <= 1:
            raise ValueError("une part entre 0 et 1 est attendue")
        return v
    if isinstance(default, dict):
        if not isinstance(value, dict):
            raise ValueError("objet attendu")
        return {k: value[k] for k in value if k in default}
    if isinstance(default, list):
        if not isinstance(value, list):
            raise ValueError("liste attendue")
        if key == "cities":
            clean = []
            for c in value:
                name = str(c.get("name", "")).strip() if isinstance(c, dict) else ""
                if name:
                    clean.append({"name": name, "quartiers": [str(q).strip() for q in (c.get("quartiers") or []) if str(q).strip()]})
            return clean
        return value
    return value


@router.put("/settings/{key}")
def update_setting(key: str, payload: SettingIn, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_perm("security", "comms"))):
    from app.services.admin_perms import has_perm

    if key not in DEFAULTS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Réglage inconnu")
    # Le support peut gerer le bandeau ; tout le reste est reserve au
    # super-administrateur.
    if key != "banner" and not has_perm(admin, "security"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Réglage réservé au super-administrateur")
    try:
        value = _validate(key, payload.value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Valeur invalide : {exc}")
    before = all_settings(db).get(key)
    set_setting(db, key, value, admin.id)
    audit.record(db, admin, "settings.update", "setting", None, summary=SETTING_LABELS.get(key, key),
                 details={"clé": key, "avant": before, "après": value}, request=request)
    db.commit()
    return {"key": key, "value": value}


# --- 13.9 Etat technique ------------------------------------------------------------------------------


def _latest_backup() -> dict | None:
    folder = Path(os.environ.get("BACKUP_DIR", "/srv/surmezur/backups"))
    if not folder.is_dir():
        return None
    files = [p for p in folder.rglob("*") if p.is_file()]
    if not files:
        return {"folder": str(folder), "last": None}
    latest = max(files, key=lambda p: p.stat().st_mtime)
    stamp = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
    return {"folder": str(folder), "last": stamp.isoformat(), "file": latest.name, "size_bytes": latest.stat().st_size,
            "age_hours": round((utcnow() - stamp).total_seconds() / 3600, 1), "count": len(files)}


@router.get("/system")
def system_state(db: Session = Depends(get_db), _=Depends(require_perm("security"))):
    db_state: dict[str, Any] = {"dialect": engine.dialect.name}
    try:
        db.execute(text("SELECT 1"))
        db_state["ok"] = True
        if engine.dialect.name == "postgresql":
            db_state["size_bytes"] = db.execute(text("SELECT pg_database_size(current_database())")).scalar()
        elif engine.dialect.name == "sqlite":
            path = engine.url.database
            db_state["size_bytes"] = os.path.getsize(path) if path and os.path.exists(path) else None
    except Exception as exc:  # pragma: no cover
        db_state["ok"] = False
        db_state["error"] = str(exc)[:200]
    disks = []
    for label, path in (("Photos et fichiers", settings.upload_dir), ("Jeu de données", settings.dataset_dir)):
        try:
            usage = shutil.disk_usage(path)
            disks.append({"label": label, "path": os.path.abspath(path), "total_bytes": usage.total, "free_bytes": usage.free,
                          "used_pct": round((usage.total - usage.free) / usage.total * 100, 1)})
        except OSError:
            continue
    try:
        from app.services import vision

        chain = vision.capabilities()
    except Exception as exc:  # pragma: no cover
        chain = {"error": str(exc)[:200]}
    counts = {}
    for model in (User, AuditLog):
        counts[model.__tablename__] = db.query(model).count()
    return {
        "app_version": "0.2.0",
        "server_time": utcnow().isoformat(),
        "database": db_state,
        "disks": disks,
        "backup": _latest_backup(),
        "measurement_chain": chain,
        "counts": counts,
    }
