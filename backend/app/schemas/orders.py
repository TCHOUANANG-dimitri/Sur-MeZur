from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import (
    ChatMessageType,
    ModificationStatus,
    OfferActor,
    OfferStatus,
    OrderPriority,
    OrderStatus,
    OrderType,
    ReceptionMode,
)
from app.schemas.common import ORMModel


class OrderCreateIn(BaseModel):
    tailor_id: str
    type: OrderType = OrderType.custom
    garment_model_id: str | None = None
    ready_to_wear_id: str | None = None
    fabric_id: str | None = None
    measurement_id: str
    accessories: list[dict] = []
    client_notes: str | None = None
    reception_mode: ReceptionMode
    desired_date: date | None = None
    first_offer_amount: float
    delay_days: int | None = None
    priority: OrderPriority = OrderPriority.normal


class OrderOut(ORMModel):
    id: str
    client_id: str
    tailor_id: str
    type: OrderType
    garment_model_id: str | None
    ready_to_wear_id: str | None
    fabric_id: str | None
    measurement_id: str
    accessories: list
    client_notes: str | None
    status: OrderStatus
    priority: OrderPriority
    reception_mode: ReceptionMode
    desired_date: date | None
    agreed_price: float | None
    delivery_fee: float | None
    current_offer_round: int
    dispute_status: str | None
    dispute_note: str | None
    created_at: datetime


class OrderStatusIn(BaseModel):
    status: OrderStatus


class OfferCreateIn(BaseModel):
    actor: OfferActor
    amount: float
    delay_days: int | None = None


class OfferOut(ORMModel):
    id: str
    order_id: str
    actor: OfferActor
    round: int
    amount: float
    delay_days: int | None
    status: OfferStatus
    expires_at: datetime


class QuoteCreateIn(BaseModel):
    line_items: list[dict]
    fabric_metrage: str | None = None
    delay_days: int


class QuoteOut(ORMModel):
    id: str
    order_id: str
    line_items: list
    fabric_metrage: str | None
    total: float
    delay_days: int
    commission_rate: float
    commission_amount: float
    net_to_tailor: float
    accepted: bool


class ModificationCreateIn(BaseModel):
    modified_model_asset_url: str | None = None
    accessory_price_delta: float = 0
    new_garment_price: float
    justification: str


class ModificationOut(ORMModel):
    id: str
    order_id: str
    proposed_by: OfferActor
    modified_model_asset_url: str | None
    accessory_price_delta: float
    new_garment_price: float
    justification: str
    status: ModificationStatus


class ChatMessageIn(BaseModel):
    body: str


class ChatMessageOut(ORMModel):
    id: str
    order_id: str
    sender_id: str
    body: str | None
    modification_id: str | None
    type: ChatMessageType
    read_at: datetime | None
    created_at: datetime
