from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.orders import Order
from app.models.users import ClientProfile, TailorProfile, User

NEGOTIATION_MAX_ROUNDS = 3
OFFER_EXPIRY_DAYS = 7


def get_order_or_404(order_id: str, db: Session) -> Order:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


def require_order_participant(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[Order, User]:
    order = get_order_or_404(order_id, db)
    if user.role == "admin":
        return order, user
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    is_client_party = client is not None and order.client_id == client.id
    is_tailor_party = tailor is not None and order.tailor_id == tailor.id
    if not (is_client_party or is_tailor_party):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a party to this order")
    return order, user


def offer_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=OFFER_EXPIRY_DAYS)
