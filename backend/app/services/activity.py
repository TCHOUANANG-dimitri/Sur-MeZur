"""
Activite des utilisateurs (14.3 a 14.7, 2.3) et sessions administrateur
(13.5).

`touch` est appele a chaque requete authentifiee mais n'ecrit qu'au plus une
fois toutes les `TOUCH_EVERY` par utilisateur, et une ligne
`user_activity_days` par jour : le cout reste negligeable meme sur un
serveur modeste.

Le « jour » est celui du Cameroun (UTC+1, sans heure d'ete) : un client qui
utilise l'application a 0 h 30 a Douala est actif ce jour-la, pas la veille.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.admin import AdminSession, LoginEvent, UserActivityDay
from app.models.users import User
from app.services.audit import client_ip

TOUCH_EVERY = timedelta(minutes=5)
SESSION_TOUCH_EVERY = timedelta(seconds=30)
LOCAL_OFFSET = timedelta(hours=1)  # Africa/Douala


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite rend des dates sans fuseau : elles ont ete ecrites en UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def local_day(value: datetime | None = None) -> date:
    return ((as_utc(value) or utcnow()) + LOCAL_OFFSET).date()


def platform_of(request: Request | None) -> str:
    """`web` quand la requete vient du site (en-tete pose par le client
    d'API web), `app` sinon : l'application mobile n'envoie pas l'en-tete."""
    if request is None:
        return "app"
    value = (request.headers.get("x-smz-platform") or "").lower()
    return "web" if value == "web" else "app"


def is_background(request: Request | None) -> bool:
    """Requetes de rafraichissement automatique (compteurs du menu) : elles
    ne comptent ni comme activite d'un utilisateur, ni pour garder une
    session admin ouverte."""
    return bool(request and request.headers.get("x-smz-background") == "1")


def touch(db: Session, user: User, request: Request | None) -> None:
    now = utcnow()
    last = as_utc(user.last_seen_at)
    today = local_day(now)
    if last and now - last < TOUCH_EVERY and local_day(last) == today:
        return
    role = "guest" if user.is_guest else str(getattr(user.role, "value", user.role))
    try:
        if not last or local_day(last) != today:
            exists = (
                db.query(UserActivityDay.id)
                .filter(UserActivityDay.user_id == user.id, UserActivityDay.day == today)
                .first()
            )
            if not exists:
                db.add(UserActivityDay(user_id=user.id, day=today, role=role, platform=platform_of(request)))
        user.last_seen_at = now
        db.commit()
    except IntegrityError:
        # Deux requetes simultanees du meme utilisateur : l'autre a deja
        # ecrit la ligne du jour.
        db.rollback()


def record_login(
    db: Session,
    user: User,
    request: Request | None,
    method: str = "password",
    success: bool = True,
) -> None:
    db.add(
        LoginEvent(
            user_id=user.id,
            success=success,
            method=method,
            platform=platform_of(request),
            ip=client_ip(request),
            user_agent=(request.headers.get("user-agent") or "")[:300] if request else None,
        )
    )
    if success:
        user.last_login_at = utcnow()


def open_admin_session(db: Session, user: User, request: Request | None) -> AdminSession:
    session = AdminSession(
        user_id=user.id,
        last_seen_at=utcnow(),
        ip=client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:300] if request else None,
    )
    db.add(session)
    db.flush()
    return session


def check_admin_session(
    db: Session,
    sid: str,
    user: User,
    request: Request | None,
    idle_minutes: int,
    extend: bool = True,
) -> str | None:
    """Renvoie un message d'erreur si la session n'est plus valable, None
    sinon (et la prolonge si la requete vient d'une action reelle)."""
    session = db.get(AdminSession, sid)
    if session is None or session.user_id != user.id:
        return "Session inconnue, veuillez vous reconnecter"
    if session.revoked_at is not None:
        return "Session fermée, veuillez vous reconnecter"
    now = utcnow()
    last = as_utc(session.last_seen_at)
    if idle_minutes > 0 and last and now - last > timedelta(minutes=idle_minutes):
        session.revoked_at = now
        session.revoked_reason = "idle"
        db.commit()
        return "Session expirée après inactivité, veuillez vous reconnecter"
    if extend and not is_background(request) and (not last or now - last > SESSION_TOUCH_EVERY):
        session.last_seen_at = now
        db.commit()
    return None
