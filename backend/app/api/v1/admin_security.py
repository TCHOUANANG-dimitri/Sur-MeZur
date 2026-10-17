"""
Equipe, securite du compte et reglages de l'administration web.

L'equipe est petite et chacun a tous les droits (services/admin_perms.py) :
pas de roles a gerer, seulement ajouter, desactiver ou debloquer un membre.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso
from app.core.deps import get_db, require_roles
from app.core.security import decode_token, hash_password
from app.models.admin import AdminSession
from app.models.enums import UserRole
from app.models.users import User
from app.services import audit, totp
from app.services.account_tools import temporary_password
from app.services.activity import as_utc, utcnow
from app.services.admin_perms import require_perm
from app.services.phone import normalize_phone
from app.services.platform_settings import DEFAULTS, all_settings, set_setting

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])


# --- 13.1 / 13.2 Equipe ----------------------------------------------------------------


def _member_out(u: User, sessions: int = 0) -> dict:
    return {
        "id": u.id, "full_name": u.full_name, "phone": u.phone, "email": u.email,
        "is_active": u.is_active,
        "totp_enabled": u.totp_enabled, "last_login_at": iso(u.last_login_at), "last_seen_at": iso(u.last_seen_at),
        "created_at": iso(u.created_at), "open_sessions": sessions,
    }


@router.get("/team")
def list_team(db: Session = Depends(get_db), _=Depends(require_perm("security"))):
    sessions: dict[str, int] = {}
    for (uid,) in db.query(AdminSession.user_id).filter(AdminSession.revoked_at.is_(None)).all():
        sessions[uid] = sessions.get(uid, 0) + 1
    members = db.query(User).filter(User.role == "admin").order_by(User.created_at).all()
    return {"members": [_member_out(u, sessions.get(u.id, 0)) for u in members]}


class MemberIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=6, max_length=32)
    email: str | None = None


@router.post("/team", status_code=status.HTTP_201_CREATED)
def create_member(payload: MemberIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("security"))):
    """13.2 — creer un compte administrateur. Le mot de passe provisoire est
    affiche une seule fois et doit etre change a la premiere connexion."""
    phone = normalize_phone(payload.phone)
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indiquez un numéro de téléphone")
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce numéro a déjà un compte")
    password = temporary_password()
    member = User(role=UserRole.admin, admin_role="super_admin", phone=phone, email=payload.email,
                  full_name=payload.full_name.strip(), password_hash=hash_password(password), must_change_password=True)
    db.add(member)
    db.flush()
    audit.record(db, admin, "team.create", "user", member.id, summary=member.full_name, request=request)
    db.commit()
    return {"member": _member_out(member), "temporary_password": password}


class MemberPatchIn(BaseModel):
    is_active: bool | None = None


def _active_admins(db: Session, exclude: str | None = None) -> int:
    return db.query(User).filter(User.role == "admin", User.is_active.is_(True), User.id != (exclude or "")).count()


@router.patch("/team/{user_id}")
def update_member(user_id: str, payload: MemberPatchIn, request: Request, db: Session = Depends(get_db),
                  admin: User = Depends(require_perm("security"))):
    member = get_or_404(db, User, user_id, "Membre")
    if member.role != "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ce compte n'est pas un administrateur")
    disabling = payload.is_active is False and member.is_active
    if disabling and _active_admins(db, exclude=member.id) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Il doit rester au moins un administrateur actif")
    if member.id == admin.id and disabling:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vous ne pouvez pas désactiver votre propre compte")
    changes = {}
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


# Reglages modifiables depuis l'administration. Les autres cles de DEFAULTS
# (negociation, acompte, litiges...) servent a des fonctions coupees : elles
# gardent leur valeur par defaut et ne sont plus proposees.
SETTING_LABELS = {
    "maintenance": "Mode maintenance",
    "features": "Génération de patrons",
    "cities": "Villes et quartiers",
    "guest_retention_days": "Conservation des comptes invités (jours)",
    "churn_inactivity_days": "Inactivité valant départ (jours)",
    "admin_idle_minutes": "Déconnexion des administrateurs inactifs (minutes)",
    "order_no_response_days": "Alerte : commande sans réponse du tailleur (jours)",
    "tailor_quality": "Seuils d'alerte qualité des tailleurs",
    "collecte_target": "Objectifs de la campagne de collecte",
    "signup_source_question": "Question « Comment nous avez-vous connu ? »",
}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _=Depends(require_perm("security"))):
    values = all_settings(db)
    return {"values": {k: values.get(k) for k in SETTING_LABELS}, "defaults": {k: DEFAULTS[k] for k in SETTING_LABELS},
            "labels": SETTING_LABELS}


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
                   admin: User = Depends(require_perm("security"))):
    if key not in SETTING_LABELS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Réglage inconnu")
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
