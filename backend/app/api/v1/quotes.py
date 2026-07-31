from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.order_helpers import require_order_participant
from app.core.deps import get_db
from app.models.orders import Quote
from app.models.users import ClientProfile, TailorProfile
from app.schemas.orders import QuoteCreateIn, QuoteOut
from app.services.commission import compute_commission
from app.services.notify import notify

router = APIRouter(prefix="/orders/{order_id}", tags=["quotes"])


@router.post("/quote", response_model=QuoteOut)
def create_quote(
    payload: QuoteCreateIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    order, user = order_and_user
    if user.role != "tailor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the tailor can submit a quote (RG-06)")

    total = round(sum(float(item.get("amount", 0)) for item in payload.line_items), 2)
    if total <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Quote total must be positive")
    rate, commission_amount, net_to_tailor = compute_commission(db, total)

    quote = Quote(
        order_id=order.id,
        line_items=payload.line_items,
        fabric_metrage=payload.fabric_metrage,
        total=total,
        delay_days=payload.delay_days,
        commission_rate=rate,
        commission_amount=commission_amount,
        net_to_tailor=net_to_tailor,
        accepted=False,
    )
    db.add(quote)

    client = db.get(ClientProfile, order.client_id)
    if client:
        notify(db, client.user_id, "quote_received", {"order_id": order.id, "total": total})

    db.commit()
    db.refresh(quote)
    return quote


@router.get("/quote", response_model=QuoteOut)
def get_current_quote(
    order_and_user: tuple = Depends(require_order_participant), db: Session = Depends(get_db)
):
    order, _ = order_and_user
    quote = (
        db.query(Quote).filter(Quote.order_id == order.id).order_by(Quote.created_at.desc()).first()
    )
    if not quote:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No quote yet")
    return quote


@router.post("/quote/accept", response_model=QuoteOut)
def accept_quote(
    order_and_user: tuple = Depends(require_order_participant), db: Session = Depends(get_db)
):
    order, user = order_and_user
    if user.role != "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the client can accept the quote")
    quote = (
        db.query(Quote).filter(Quote.order_id == order.id).order_by(Quote.created_at.desc()).first()
    )
    if not quote:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No quote to accept")

    # RG-06: la validation de la commande vaut acceptation du devis.
    quote.accepted = True
    order.agreed_price = quote.total

    tailor = db.get(TailorProfile, order.tailor_id)
    if tailor:
        notify(db, tailor.user_id, "quote_accepted", {"order_id": order.id, "total": float(quote.total)})

    db.commit()
    db.refresh(quote)
    return quote
