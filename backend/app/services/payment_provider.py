"""Branchable Mobile Money provider. SandboxMomoProvider simulates MTN
MoMo/Orange Money: it "initiates" a transaction synchronously, then confirms
it asynchronously (like a real PSP webhook would) via a background task, OR
immediately if /payments/webhook is called directly (useful for testing/demo).
Swapping in real MTN/Orange APIs later means replacing this one class and
pointing /payments/webhook at the real callback payload shape.
"""

import time
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.models.enums import EscrowStatus, PaymentPhase, PaymentStatus
from app.models.payments import Payment, PaymentSplit
from app.services.escrow import compute_escrow_split


class PaymentProvider(ABC):
    @abstractmethod
    def initiate(self, amount: float, phone: str) -> str:
        """Returns a provider transaction reference."""


class SandboxMomoProvider(PaymentProvider):
    def initiate(self, amount: float, phone: str) -> str:
        return f"SANDBOX-{uuid.uuid4().hex[:12].upper()}"


def get_provider() -> PaymentProvider:
    return SandboxMomoProvider()


def finalize_deposit(db: Session, payment: Payment, order_total: float) -> Payment:
    if payment.status == PaymentStatus.pending:
        payment.status = PaymentStatus.paid
        existing = db.query(PaymentSplit).filter(PaymentSplit.order_id == payment.order_id).first()
        if not existing:
            split = compute_escrow_split(order_total)
            db.add(
                PaymentSplit(
                    order_id=payment.order_id,
                    total=split.total,
                    deposit_70=split.deposit_70,
                    tailor_immediate_40=split.tailor_immediate_40,
                    escrow_30=split.escrow_30,
                    balance_30=split.balance_30,
                    escrow_status=EscrowStatus.held,
                )
            )
        db.commit()
        db.refresh(payment)
    return payment


def finalize_balance(db: Session, payment: Payment) -> Payment:
    if payment.status == PaymentStatus.pending:
        payment.status = PaymentStatus.paid
        split = db.query(PaymentSplit).filter(PaymentSplit.order_id == payment.order_id).first()
        if split:
            split.escrow_status = EscrowStatus.released
            split.released_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(payment)
    return payment


def confirm_deposit_background(payment_id: str, order_total: float) -> None:
    """Simulates the ~1.5s round trip to MTN/Orange + PSP webhook callback."""
    time.sleep(1.5)
    with SessionLocal() as db:
        payment = db.get(Payment, payment_id)
        if payment and payment.phase == PaymentPhase.deposit_70:
            finalize_deposit(db, payment, order_total)


def confirm_balance_background(payment_id: str) -> None:
    time.sleep(1.5)
    with SessionLocal() as db:
        payment = db.get(Payment, payment_id)
        if payment and payment.phase == PaymentPhase.balance_30:
            finalize_balance(db, payment)
