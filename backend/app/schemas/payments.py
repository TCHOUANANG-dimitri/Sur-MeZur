from datetime import datetime

from pydantic import BaseModel

from app.models.enums import EscrowStatus, MobileMoneyProvider, PaymentPhase, PaymentStatus
from app.schemas.common import ORMModel


class DepositIn(BaseModel):
    order_id: str
    provider: MobileMoneyProvider
    phone: str


class WebhookIn(BaseModel):
    provider_txn_ref: str
    status: PaymentStatus


class PaymentOut(ORMModel):
    id: str
    order_id: str
    phase: PaymentPhase
    provider: MobileMoneyProvider
    amount: float
    status: PaymentStatus
    provider_txn_ref: str


class PaymentSplitOut(ORMModel):
    id: str
    order_id: str
    total: float
    deposit_70: float
    tailor_immediate_40: float
    escrow_30: float
    balance_30: float
    escrow_status: EscrowStatus
    released_at: datetime | None


class CommissionTierOut(ORMModel):
    id: str
    min_price: float
    max_price: float | None
    rate: float


class CommissionTierIn(BaseModel):
    min_price: float
    max_price: float | None = None
    rate: float
