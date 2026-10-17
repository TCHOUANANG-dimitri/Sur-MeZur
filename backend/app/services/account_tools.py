"""
Outils sur les comptes : mot de passe provisoire (2.6), nettoyage des
invites (2.7), export des donnees d'un utilisateur (13.6).
"""

from __future__ import annotations

import logging
import secrets
import string
import threading
import time
from datetime import timedelta

from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.models.acquisition import UserAcquisition
from app.models.admin import LoginEvent, SupportTicket
from app.models.measurements import Measurement, MeasurementSession
from app.models.misc import Notification, Review
from app.models.operations import FitFeedback
from app.models.orders import ChatMessage, Order
from app.models.users import ClientProfile, TailorProfile, User
from app.services.activity import as_utc, utcnow
from app.services.platform_settings import get_setting
from app.services.user_deletion import delete_user_cascade

logger = logging.getLogger(__name__)


# --- 2.6 Mot de passe provisoire -----------------------------------------------


def temporary_password() -> str:
    """6 caracteres, au moins une lettre et un chiffre : la regle des mots de
    passe de la plateforme (schemas/auth.py)."""
    alphabet = "abcdefghjkmnpqrstuvwxyz"  # sans i, l, o : lisibles au telephone
    digits = "23456789"
    chars = [secrets.choice(alphabet), secrets.choice(digits)] + [
        secrets.choice(alphabet + digits) for _ in range(4)
    ]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


# --- 2.7 Nettoyage des invites ---------------------------------------------------


def stale_guests(db: Session, days: int | None = None) -> list[User]:
    days = int(days if days is not None else get_setting("guest_retention_days", db) or 30)
    limit = utcnow() - timedelta(days=days)
    return [
        u for u in db.query(User).filter(User.is_guest.is_(True)).all()
        if as_utc(u.last_seen_at or u.created_at) < limit
    ]


def cleanup_guests(db: Session, days: int | None = None) -> int:
    """Supprime les comptes invites inactifs depuis `days` jours, avec leurs
    photos et mesures. Renvoie le nombre de comptes supprimes."""
    count = 0
    for guest in stale_guests(db, days):
        try:
            delete_user_cascade(db, guest)
            db.commit()
            count += 1
        except Exception:  # pragma: no cover - defensif
            db.rollback()
            logger.exception("Nettoyage de l'invite %s impossible", guest.id)
    return count


_cleanup_started = False


def start_guest_cleanup_loop(interval_hours: float = 24.0) -> None:
    """Nettoyage automatique une fois par jour, dans le processus de l'API.
    Avec plusieurs workers, chacun tourne sa boucle : sans effet de bord, une
    suppression deja faite ne trouve simplement plus rien."""
    global _cleanup_started
    if _cleanup_started:
        return
    _cleanup_started = True

    def _loop() -> None:
        time.sleep(120)  # laisser le demarrage se terminer
        while True:
            try:
                with SessionLocal() as db:
                    n = cleanup_guests(db)
                    if n:
                        from app.services import audit

                        audit.record(db, None, "guests.cleanup", summary=f"{n} compte(s) invité(s) supprimé(s)")
                        db.commit()
                        logger.info("Nettoyage des invites : %s compte(s) supprime(s)", n)
            except Exception:  # pragma: no cover
                logger.exception("Nettoyage automatique des invites en erreur")
            time.sleep(interval_hours * 3600)

    threading.Thread(target=_loop, name="guest-cleanup", daemon=True).start()


# --- 13.6 Export des donnees d'un utilisateur ------------------------------------------


def _row(obj, exclude: tuple[str, ...] = ()) -> dict:
    out = {}
    for col in obj.__table__.columns:
        if col.key in exclude:
            continue
        value = getattr(obj, col.key)
        if hasattr(value, "isoformat"):
            value = value.isoformat()
        elif hasattr(value, "value"):
            value = value.value
        elif value is not None and not isinstance(value, (str, int, float, bool, list, dict)):
            value = float(value) if str(value).replace(".", "", 1).lstrip("-").isdigit() else str(value)
        out[col.key] = value
    return out


def export_user_data(db: Session, user: User) -> dict:
    data: dict = {
        "generated_at": utcnow().isoformat(),
        "account": _row(user, exclude=("password_hash", "totp_secret")),
    }
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if client:
        data["client_profile"] = _row(client)
        data["measurements"] = [_row(m) for m in db.query(Measurement).filter(Measurement.client_id == client.id)]
        data["measurement_sessions"] = [_row(m) for m in db.query(MeasurementSession).filter(MeasurementSession.client_id == client.id)]
        data["orders_as_client"] = [_row(o) for o in db.query(Order).filter(Order.client_id == client.id)]
        data["reviews_written"] = [_row(r) for r in db.query(Review).filter(Review.client_id == client.id)]
    if tailor:
        data["tailor_profile"] = _row(tailor)
        data["orders_as_tailor"] = [_row(o) for o in db.query(Order).filter(Order.tailor_id == tailor.id)]
        data["reviews_received"] = [_row(r) for r in db.query(Review).filter(Review.tailor_id == tailor.id)]
    order_ids = [o["id"] for o in data.get("orders_as_client", []) + data.get("orders_as_tailor", [])]
    if order_ids:
        data["fit_feedbacks"] = [_row(f) for f in db.query(FitFeedback).filter(FitFeedback.order_id.in_(order_ids))]
    data["messages_sent"] = [_row(m) for m in db.query(ChatMessage).filter(ChatMessage.sender_id == user.id)]
    data["notifications"] = [_row(n) for n in db.query(Notification).filter(Notification.user_id == user.id)]
    data["logins"] = [_row(e) for e in db.query(LoginEvent).filter(LoginEvent.user_id == user.id)]
    data["support_tickets"] = [_row(t) for t in db.query(SupportTicket).filter(SupportTicket.user_id == user.id)]
    acq = db.query(UserAcquisition).filter(UserAcquisition.user_id == user.id).first()
    if acq:
        data["acquisition"] = _row(acq)
    return data


ALNUM = string.ascii_letters + string.digits
