"""
Outils partages par les routeurs de l'administration web.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.orders import Order
from app.models.users import ClientProfile, TailorProfile, User
from app.services.activity import as_utc


def get_or_404(db: Session, model, ident: str, label: str = "Élément"):
    row = db.get(model, ident)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} introuvable")
    return row


def enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, date) and not hasattr(value, "hour"):
        return value.isoformat()
    return as_utc(value).isoformat()


def user_brief(u: User | None) -> dict | None:
    if u is None:
        return None
    return {
        "id": u.id,
        "full_name": u.full_name,
        "phone": None if u.is_guest else u.phone,
        "role": enum_value(u.role),
        "is_active": u.is_active,
        "is_guest": u.is_guest,
    }


def party_names(db: Session, orders: list[Order]) -> tuple[dict[str, User], dict[str, tuple[TailorProfile, User]]]:
    """Clients et tailleurs d'une liste de commandes, en deux requetes."""
    client_ids = {o.client_id for o in orders}
    tailor_ids = {o.tailor_id for o in orders}
    clients: dict[str, User] = {}
    if client_ids:
        for cp, u in db.query(ClientProfile, User).join(User, User.id == ClientProfile.user_id).filter(
            ClientProfile.id.in_(client_ids)
        ):
            clients[cp.id] = u
    tailors: dict[str, tuple[TailorProfile, User]] = {}
    if tailor_ids:
        for tp, u in db.query(TailorProfile, User).join(User, User.id == TailorProfile.user_id).filter(
            TailorProfile.id.in_(tailor_ids)
        ):
            tailors[tp.id] = (tp, u)
    return clients, tailors


def order_row(o: Order, clients: dict[str, User], tailors: dict[str, tuple[TailorProfile, User]]) -> dict:
    client = clients.get(o.client_id)
    tailor = tailors.get(o.tailor_id)
    return {
        "id": o.id,
        "ref": o.id[:8].upper(),
        "status": enum_value(o.status),
        "type": enum_value(o.type),
        "client_id": o.client_id,
        "client_user_id": client.id if client else None,
        "client_name": client.full_name if client else None,
        "tailor_id": o.tailor_id,
        "tailor_user_id": tailor[1].id if tailor else None,
        "tailor_name": (tailor[0].shop_name or tailor[1].full_name) if tailor else None,
        "city": tailor[0].city if tailor else None,
        "agreed_price": float(o.agreed_price) if o.agreed_price is not None else None,
        "desired_date": iso(o.desired_date),
        "dispute_status": o.dispute_status,
        "dispute_category": o.dispute_category,
        "dispute_opened_at": iso(o.dispute_opened_at),
        "created_at": iso(o.created_at),
        "updated_at": iso(o.updated_at),
    }
