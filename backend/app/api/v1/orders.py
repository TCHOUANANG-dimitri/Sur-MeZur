from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.order_helpers import offer_expiry, require_order_participant
from app.core.deps import get_db, require_roles
from app.models.enums import OfferActor, OfferStatus, OrderStatus
from app.models.orders import Offer, Order
from app.models.users import ClientProfile, TailorProfile, User
from pydantic import BaseModel

from app.schemas.orders import OrderCreateIn, OrderOut, OrderStatusIn
from app.services.notify import notify


class DisputeOpenIn(BaseModel):
    note: str

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderOut)
def create_order(
    payload: OrderCreateIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client profile not found")
    tailor = db.get(TailorProfile, payload.tailor_id)
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor not found")

    order = Order(
        client_id=client.id,
        tailor_id=payload.tailor_id,
        type=payload.type,
        garment_model_id=payload.garment_model_id,
        ready_to_wear_id=payload.ready_to_wear_id,
        fabric_id=payload.fabric_id,
        measurement_id=payload.measurement_id,
        accessories=payload.accessories,
        client_notes=payload.client_notes,
        status=OrderStatus.new,
        priority=payload.priority,
        reception_mode=payload.reception_mode,
        desired_date=payload.desired_date,
        current_offer_round=1,
    )
    db.add(order)
    db.flush()

    # RG-05: c'est le client qui fait la première offre.
    db.add(
        Offer(
            order_id=order.id,
            actor=OfferActor.client,
            round=1,
            amount=payload.first_offer_amount,
            delay_days=payload.delay_days,
            status=OfferStatus.pending,
            expires_at=offer_expiry(),
        )
    )
    notify(
        db,
        tailor.user_id,
        "order_received",
        {"order_id": order.id, "amount": payload.first_offer_amount},
    )
    db.commit()
    db.refresh(order)
    return order


@router.get("", response_model=list[OrderOut])
def list_orders(
    status_filter: OrderStatus | None = None,
    user: User = Depends(require_roles("client", "tailor")),
    db: Session = Depends(get_db),
):
    query = db.query(Order)
    if user.role == "client":
        client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
        query = query.filter(Order.client_id == client.id if client else Order.id.is_(None))
    else:
        tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
        query = query.filter(Order.tailor_id == tailor.id if tailor else Order.id.is_(None))
    if status_filter:
        query = query.filter(Order.status == status_filter)
    return query.order_by(Order.created_at.desc()).all()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_and_user: tuple = Depends(require_order_participant)):
    order, _ = order_and_user
    return order


@router.post("/{order_id}/status", response_model=OrderOut)
def set_order_status(
    payload: OrderStatusIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    order, user = order_and_user
    if user.role not in ("tailor", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the tailor can update order status")
    order.status = payload.status
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/dispute", response_model=OrderOut)
def open_dispute(
    payload: DisputeOpenIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    """Compensates the absence of full escrow (CDC §10.2 'Litiges'): either
    party can flag a non-delivery/dispute for admin review."""
    order, _user = order_and_user
    order.dispute_status = "open"
    order.dispute_note = payload.note
    db.commit()
    db.refresh(order)
    return order
