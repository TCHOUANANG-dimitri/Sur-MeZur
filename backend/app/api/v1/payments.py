import hashlib
import hmac

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.v1.order_helpers import require_order_participant
from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.models.enums import PaymentPhase, PaymentStatus
from app.models.orders import Order, Quote
from app.models.payments import Payment, PaymentSplit
from app.models.users import ClientProfile, User
from app.schemas.payments import DepositIn, PaymentOut, PaymentSplitOut, WebhookIn
from app.services.escrow import compute_escrow_split
from app.services.payment_provider import (
    confirm_balance_background,
    confirm_deposit_background,
    finalize_balance,
    finalize_deposit,
    get_provider,
)
from app.services.platform_settings import get_setting as get_platform_setting


def require_payments_enabled() -> None:
    """A2.2 : plus aucune transaction d'argent dans la plateforme pour
    l'instant (features.payments=false). Tout /payments/* repond 404 ;
    le code reste intact pour une reactivation laterale."""
    if not (get_platform_setting("features") or {}).get("payments", False):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiements désactivés")


router = APIRouter(
    prefix="/payments",
    tags=["payments"],
    dependencies=[Depends(require_payments_enabled)],
)


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

    amount = compute_escrow_split(float(quote.total)).deposit_70
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
def list_order_payments(order_and_user: tuple = Depends(require_order_participant), db: Session = Depends(get_db)):
    order, _ = order_and_user
    return db.query(Payment).filter(Payment.order_id == order.id).all()


@router.get("/order/{order_id}/split", response_model=PaymentSplitOut)
def get_payment_split(order_and_user: tuple = Depends(require_order_participant), db: Session = Depends(get_db)):
    order, _ = order_and_user
    split = db.query(PaymentSplit).filter(PaymentSplit.order_id == order.id).first()
    if not split:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No payment split yet")
    return split


@router.post("/webhook", response_model=PaymentOut)
async def payment_webhook(request: Request, db: Session = Depends(get_db)):
    """Callback de fournisseur de paiement, protege par signature HMAC-SHA256
    (en-tete X-SurMeZur-Signature, secret PAYMENT_WEBHOOK_SECRET).

    La route reste hors service tant que `features.payments=false` (le router
    la bloque) et tant qu'aucun secret n'est configure : on ne peut donc pas la
    rejouer pour falsifier un paiement avant la reactivation reelle."""
    secret = settings.payment_webhook_secret
    if not secret:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paiements désactivés")
    raw = await request.body()
    provided = request.headers.get("x-surmezur-signature", "")
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Signature invalide")
    payload = WebhookIn.model_validate_json(raw)

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
