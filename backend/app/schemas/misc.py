from datetime import datetime

from pydantic import BaseModel

from app.models.enums import MobileMoneyProvider, ModerationStatus, VerificationStatus
from app.schemas.common import ORMModel


class DeliveryConfirmIn(BaseModel):
    provider: MobileMoneyProvider | None = None
    phone: str | None = None


class PatternOut(ORMModel):
    id: str
    order_id: str
    svg_url: str | None
    pdf_url: str | None
    tech_sheet: dict
    source: str
    sent_at: datetime | None


class DeliveryOut(ORMModel):
    id: str
    order_id: str
    mode: str
    fee: float
    confirmed_by_client: bool
    confirmed_at: datetime | None


class ReviewCreateIn(BaseModel):
    stars: int
    comment: str | None = None


class ReviewOut(ORMModel):
    id: str
    order_id: str
    client_id: str
    tailor_id: str
    stars: int
    comment: str | None
    moderation_status: ModerationStatus
    created_at: datetime


class NotificationOut(ORMModel):
    id: str
    user_id: str
    type: str
    payload: dict
    read_at: datetime | None
    created_at: datetime


class VerificationDecideIn(BaseModel):
    status: VerificationStatus


class DisputeResolveIn(BaseModel):
    resolution: str
    note: str | None = None
