"""
Outils sur les comptes : nettoyage des invites (2.7), detection et fusion
des doublons (2.8), export des donnees d'un utilisateur (13.6).
"""

from __future__ import annotations

import logging
import re
import secrets
import string
import threading
import time
from collections import defaultdict
from datetime import timedelta
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.models.acquisition import AcquisitionComment, UserAcquisition
from app.models.admin import LoginEvent, SupportTicket, UserActivityDay
from app.models.catalog import GarmentModelLike
from app.models.measurements import Avatar, Measurement, MeasurementDataset, MeasurementSession
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


# --- 2.8 Doublons -------------------------------------------------------------------


def _digits(phone: str) -> str:
    d = re.sub(r"\D", "", phone or "")
    # Indicatif du Cameroun : 237 6xx xx xx xx et 6xx xx xx xx sont le meme numero.
    if d.startswith("237") and len(d) == 12:
        d = d[3:]
    return d


def _name_key(name: str) -> str:
    return " ".join(sorted(re.sub(r"[^a-z ]", "", (name or "").lower()).split()))


def find_duplicates(db: Session, limit: int = 200) -> list[dict]:
    users = db.query(User).filter(User.is_guest.is_(False), User.role.in_(("client", "tailor"))).all()
    pairs: dict[tuple[str, str], dict] = {}

    def add(a: User, b: User, reason: str, score: float) -> None:
        if a.id == b.id or a.role != b.role:
            return
        key = tuple(sorted((a.id, b.id)))
        entry = pairs.setdefault(key, {"users": key, "reasons": [], "score": 0.0})
        entry["reasons"].append(reason)
        entry["score"] = max(entry["score"], score)

    by_digits: dict[str, list[User]] = defaultdict(list)
    by_name: dict[str, list[User]] = defaultdict(list)
    for u in users:
        by_digits[_digits(u.phone)].append(u)
        by_name[_name_key(u.full_name)].append(u)
    for group in by_digits.values():
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                add(a, b, "même numéro (format différent)", 0.95)
    for key, group in by_name.items():
        if len(key) < 4:
            continue
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                da, dbb = _digits(a.phone), _digits(b.phone)
                close = len(da) == len(dbb) and sum(x != y for x, y in zip(da, dbb)) <= 2
                add(a, b, "même nom" + (", numéros proches" if close else ""), 0.85 if close else 0.6)
    # Noms tres proches (fautes de frappe) avec numeros proches.
    sorted_users = sorted(users, key=lambda u: _digits(u.phone))
    for a, b in zip(sorted_users, sorted_users[1:]):
        da, dbb = _digits(a.phone), _digits(b.phone)
        if len(da) == len(dbb) and sum(x != y for x, y in zip(da, dbb)) <= 1:
            if SequenceMatcher(None, _name_key(a.full_name), _name_key(b.full_name)).ratio() > 0.8:
                add(a, b, "nom et numéro très proches", 0.9)

    index = {u.id: u for u in users}
    out = []
    for entry in sorted(pairs.values(), key=lambda e: -e["score"])[:limit]:
        a, b = (index[i] for i in entry["users"])
        out.append({
            "score": entry["score"],
            "reasons": sorted(set(entry["reasons"])),
            "users": [
                {"id": u.id, "full_name": u.full_name, "phone": u.phone, "role": getattr(u.role, "value", u.role),
                 "created_at": as_utc(u.created_at).isoformat(), "is_active": u.is_active}
                for u in (a, b)
            ],
        })
    return out


def merge_clients(db: Session, primary: User, secondary: User) -> dict:
    """Rattache au compte `primary` tout ce qui appartient au client
    `secondary` (mesures, commandes, avis, j'aime...), puis supprime
    `secondary`. Reserve aux clients : un tailleur a des pieces de
    verification et un historique propres, sa fusion se traite a la main."""
    if getattr(primary.role, "value", primary.role) != "client" or getattr(secondary.role, "value", secondary.role) != "client":
        raise ValueError("La fusion automatique ne concerne que deux comptes clients")
    p = db.query(ClientProfile).filter(ClientProfile.user_id == primary.id).first()
    s = db.query(ClientProfile).filter(ClientProfile.user_id == secondary.id).first()
    if not p or not s:
        raise ValueError("Profil client manquant")
    moved = {}
    for model, column in (
        (Measurement, Measurement.client_id),
        (MeasurementSession, MeasurementSession.client_id),
        (MeasurementDataset, MeasurementDataset.client_id),
        (Avatar, Avatar.client_id),
        (Order, Order.client_id),
        (Review, Review.client_id),
    ):
        moved[model.__tablename__] = db.query(model).filter(column == s.id).update(
            {column.key: p.id}, synchronize_session=False
        )
    # J'aime : eviter les doublons (contrainte unique client + modele).
    liked = {mid for (mid,) in db.query(GarmentModelLike.garment_model_id).filter(GarmentModelLike.client_id == p.id)}
    for like in db.query(GarmentModelLike).filter(GarmentModelLike.client_id == s.id).all():
        if like.garment_model_id in liked:
            db.delete(like)
        else:
            like.client_id = p.id
    db.query(ChatMessage).filter(ChatMessage.sender_id == secondary.id).update({"sender_id": primary.id}, synchronize_session=False)
    db.query(Notification).filter(Notification.user_id == secondary.id).update({"user_id": primary.id}, synchronize_session=False)
    db.query(SupportTicket).filter(SupportTicket.user_id == secondary.id).update({"user_id": primary.id}, synchronize_session=False)
    db.query(LoginEvent).filter(LoginEvent.user_id == secondary.id).update({"user_id": primary.id}, synchronize_session=False)
    existing_days = {d for (d,) in db.query(UserActivityDay.day).filter(UserActivityDay.user_id == primary.id)}
    for row in db.query(UserActivityDay).filter(UserActivityDay.user_id == secondary.id).all():
        if row.day in existing_days:
            db.delete(row)
        else:
            row.user_id = primary.id
    db.query(AcquisitionComment).filter(AcquisitionComment.user_id == secondary.id).update({"user_id": primary.id}, synchronize_session=False)
    if not db.query(UserAcquisition).filter(UserAcquisition.user_id == primary.id).first():
        db.query(UserAcquisition).filter(UserAcquisition.user_id == secondary.id).update({"user_id": primary.id}, synchronize_session=False)
    if not p.default_measurement_id and s.default_measurement_id:
        p.default_measurement_id = s.default_measurement_id
    s.default_measurement_id = None
    if not primary.email and secondary.email:
        primary.email = secondary.email
    if not primary.city and secondary.city:
        primary.city = secondary.city
    if as_utc(secondary.created_at) < as_utc(primary.created_at):
        primary.created_at = secondary.created_at
    db.flush()
    delete_user_cascade(db, secondary)
    return moved


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
