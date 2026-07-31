from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import EscrowStatus, MobileMoneyProvider, PaymentPhase, PaymentStatus
from app.models.mixins import IDMixin, TimestampMixin


class Payment(Base, IDMixin, TimestampMixin):
    __tablename__ = "payments"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    phase: Mapped[PaymentPhase] = mapped_column(String(16))
    provider: Mapped[MobileMoneyProvider] = mapped_column(String(16))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    status: Mapped[PaymentStatus] = mapped_column(String(10), default=PaymentStatus.pending)
    provider_txn_ref: Mapped[str] = mapped_column(String(64))
    psp_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)


class PaymentSplit(Base, IDMixin, TimestampMixin):
    __tablename__ = "payment_splits"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), unique=True)
    total: Mapped[float] = mapped_column(Numeric(12, 2))
    deposit_70: Mapped[float] = mapped_column(Numeric(12, 2))
    tailor_immediate_40: Mapped[float] = mapped_column(Numeric(12, 2))
    escrow_30: Mapped[float] = mapped_column(Numeric(12, 2))
    balance_30: Mapped[float] = mapped_column(Numeric(12, 2))
    escrow_status: Mapped[EscrowStatus] = mapped_column(String(10), default=EscrowStatus.held)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CommissionTier(Base, IDMixin, TimestampMixin):
    __tablename__ = "commission_tiers"

    min_price: Mapped[float] = mapped_column(Numeric(12, 2))
    max_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    rate: Mapped[float] = mapped_column(Numeric(5, 4))
