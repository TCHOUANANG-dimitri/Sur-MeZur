from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.enums import PaymentPhase, PaymentStatus
from app.models.orders import Order, Quote
from app.models.payments import Payment, PaymentSplit
from app.models.users import ClientProfile, User
from app.schemas.payments import DepositIn, PaymentOut, PaymentSplitOut, WebhookIn
from app.services.payment_provider import (
    confirm_balance_background,
    confirm_deposit_background,
    finalize_balance,
    finalize_deposit,
    get_provider,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/deposit", response_model=PaymentOut)
def initiate_deposit(
    payload: DepositIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    order = db.get(Order, payload.order_id)
    if not order or not client or order.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")

    quote = db.query(Quote).filter(Quote.order_id == order.id).order_by(Quote.created_at.desc()).first()
    if not quote or not quote.accepted:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Quote must be accepted before paying (RG-06)")

    existing = db.query(Payment).filter(
        Payment.order_id == order.id, Payment.phase == PaymentPhase.deposit_70
    ).first()
    if existing:
        return existing

    amount = round(float(quote.total) * 0.7, 2)
    txn_ref = get_provider().initiate(amount, payload.phone)
    payment = Payment(
        order_id=order.id,
        phase=PaymentPhase.deposit_70,
        provider=payload.provider,
        amount=amount,
        status=PaymentStatus.pending,
        provider_txn_ref=txn_ref,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    background_tasks.add_task(confirm_deposit_background, payment.id, float(quote.total))
    return payment


@router.post("/balance", response_model=PaymentOut)
def initiate_balance(
    payload: DepositIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    order = db.get(Order, payload.order_id)
    if not order or not client or order.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")

    split = db.query(PaymentSplit).filter(PaymentSplit.order_id == order.id).first()
    if not split:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deposit must be paid first")

    existing = db.query(Payment).filter(
        Payment.order_id == order.id, Payment.phase == PaymentPhase.balance_30
    ).first()
    if existing:
        return existing

    amount = float(split.balance_30)
    txn_ref = get_provider().initiate(amount, payload.phone)
    payment = Payment(
        order_id=order.id,
        phase=PaymentPhase.balance_30,
        provider=payload.provider,
        amount=amount,
        status=PaymentStatus.pending,
        provider_txn_ref=txn_ref,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    background_tasks.add_task(confirm_balance_background, payment.id)
    return payment


@router.get("/order/{order_id}", response_model=list[PaymentOut])
def list_order_payments(order_id: str, db: Session = Depends(get_db)):
    return db.query(Payment).filter(Payment.order_id == order_id).all()


@router.get("/order/{order_id}/split", response_model=PaymentSplitOut)
def get_payment_split(order_id: str, db: Session = Depends(get_db)):
    split = db.query(PaymentSplit).filter(PaymentSplit.order_id == order_id).first()
    if not split:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No payment split yet")
    return split


@router.post("/webhook", response_model=PaymentOut)
def payment_webhook(payload: WebhookIn, db: Session = Depends(get_db)):
    """Real-PSP-shaped callback endpoint. Also usable to finalize a sandbox
    payment immediately instead of waiting for the background simulation."""
    payment = db.query(Payment).filter(Payment.provider_txn_ref == payload.provider_txn_ref).first()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    if payload.status != PaymentStatus.paid:
        payment.status = payload.status
        db.commit()
        return payment

    order = db.get(Order, payment.order_id)
    if payment.phase == PaymentPhase.deposit_70:
        quote = (
            db.query(Quote).filter(Quote.order_id == order.id).order_by(Quote.created_at.desc()).first()
        )
        finalize_deposit(db, payment, float(quote.total))
    else:
        finalize_balance(db, payment)
    return payment
