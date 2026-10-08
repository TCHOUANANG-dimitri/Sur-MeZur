from datetime import date, datetime

from pydantic import BaseModel, Field

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
    # A2.2 : budget indicatif (facultatif). Plus aucune offre ni acompte :
    # le prix convenu est fixe par le tailleur lors de l'acceptation.
    budget_amount: float | None = None
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
    budget_amount: float | None = None
    decline_reason: str | None = None
    cancelled_by: str | None = None
    cancelled_at: datetime | None = None
    current_offer_round: int
    dispute_status: str | None
    dispute_note: str | None
    dispute_category: str | None = None
    dispute_opened_at: datetime | None = None
    cancel_reason: str | None = None
    created_at: datetime


class OrderStatusIn(BaseModel):
    status: OrderStatus


class OrderAcceptIn(BaseModel):
    """A2.2 — le tailleur accepte la commande et fixe le prix convenu (pur
    element d'information, aucun paiement n'est declenche)."""

    agreed_price: float | None = None
    delivery_fee: float | None = None


class OrderDeclineIn(BaseModel):
    reason: str = Field(min_length=2, max_length=1000)


class OrderCancelIn(BaseModel):
    reason: str = Field(min_length=2, max_length=1000)


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
