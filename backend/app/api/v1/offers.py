from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.order_helpers import (
    NEGOTIATION_MAX_ROUNDS,
    offer_expiry,
    require_order_participant,
)
from app.core.deps import get_db
from app.models.enums import OfferStatus
from app.models.orders import Offer
from app.schemas.orders import OfferCreateIn, OfferOut

router = APIRouter(prefix="/orders/{order_id}", tags=["offers"])


@router.post("/offers", response_model=OfferOut)
def create_offer(
    payload: OfferCreateIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    order, _ = order_and_user
    if order.current_offer_round >= NEGOTIATION_MAX_ROUNDS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Negotiation cap reached (RG-05: max 3 propositions)",
        )

    # A new counter-offer supersedes the previous pending one.
    db.query(Offer).filter(Offer.order_id == order.id, Offer.status == OfferStatus.pending).update(
        {"status": OfferStatus.refused}
    )

    new_round = order.current_offer_round + 1
    offer = Offer(
        order_id=order.id,
        actor=payload.actor,
        round=new_round,
        amount=payload.amount,
        delay_days=payload.delay_days,
        status=OfferStatus.pending,
        expires_at=offer_expiry(),
    )
    order.current_offer_round = new_round
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


@router.get("/offers", response_model=list[OfferOut])
def list_offers(
    order_and_user: tuple = Depends(require_order_participant), db: Session = Depends(get_db)
):
    order, _ = order_and_user
    return db.query(Offer).filter(Offer.order_id == order.id).order_by(Offer.round).all()


@router.post("/offers/{offer_id}/accept", response_model=OfferOut)
def accept_offer(
    offer_id: str,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    order, _ = order_and_user
    offer = db.get(Offer, offer_id)
    if not offer or offer.order_id != order.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Offer not found")

    db.query(Offer).filter(Offer.order_id == order.id, Offer.id != offer.id).update(
        {"status": OfferStatus.refused}
    )
    offer.status = OfferStatus.accepted
    order.agreed_price = offer.amount
    db.commit()
    db.refresh(offer)
    return offer
