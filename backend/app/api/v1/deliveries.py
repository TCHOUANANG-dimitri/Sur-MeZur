from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.enums import MobileMoneyProvider, OrderStatus, PaymentPhase, PaymentStatus
from app.models.misc import Delivery
from app.models.orders import Order
from app.models.payments import Payment, PaymentSplit
from app.models.users import ClientProfile, TailorProfile, User
from app.schemas.misc import DeliveryConfirmIn, DeliveryOut
from app.services.notify import notify
from app.services.payment_provider import confirm_balance_background, get_provider

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


@router.post("/{order_id}/confirm", response_model=DeliveryOut)
def confirm_delivery(
    order_id: str,
    payload: DeliveryConfirmIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    order = db.get(Order, order_id)
    if not order or not client or order.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")

    split = db.query(PaymentSplit).filter(PaymentSplit.order_id == order.id).first()
    if not split:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deposit must be paid before delivery")

    delivery = db.query(Delivery).filter(Delivery.order_id == order.id).first()
    if not delivery:
        delivery = Delivery(
            order_id=order.id, mode=order.reception_mode, fee=order.delivery_fee or 0
        )
        db.add(delivery)
    delivery.confirmed_by_client = True
    delivery.confirmed_at = datetime.now(timezone.utc)
    order.status = OrderStatus.finished_delivered

    balance_payment = db.query(Payment).filter(
        Payment.order_id == order.id, Payment.phase == PaymentPhase.balance_30
    ).first()
    if not balance_payment:
        deposit_payment = db.query(Payment).filter(
            Payment.order_id == order.id, Payment.phase == PaymentPhase.deposit_70
        ).first()
        provider = payload.provider or (deposit_payment.provider if deposit_payment else MobileMoneyProvider.mtn_momo)
        txn_ref = get_provider().initiate(float(split.balance_30), payload.phone or "")
        balance_payment = Payment(
            order_id=order.id,
            phase=PaymentPhase.balance_30,
            provider=provider,
            amount=split.balance_30,
            status=PaymentStatus.pending,
            provider_txn_ref=txn_ref,
        )
        db.add(balance_payment)

    tailor = db.get(TailorProfile, order.tailor_id)
    if tailor:
        notify(db, tailor.user_id, "delivery_confirmed", {"order_id": order.id})

    db.commit()
    db.refresh(delivery)
    db.refresh(balance_payment)

    background_tasks.add_task(confirm_balance_background, balance_payment.id)
    return delivery
