from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
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
from app.models.mixins import IDMixin, TimestampMixin


class Order(Base, IDMixin, TimestampMixin):
    __tablename__ = "orders"

    client_id: Mapped[str] = mapped_column(ForeignKey("client_profiles.id"))
    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"))
    type: Mapped[OrderType] = mapped_column(String(16), default=OrderType.custom)
    garment_model_id: Mapped[str | None] = mapped_column(
        ForeignKey("garment_models.id"), nullable=True
    )
    ready_to_wear_id: Mapped[str | None] = mapped_column(
        ForeignKey("ready_to_wear.id"), nullable=True
    )
    fabric_id: Mapped[str | None] = mapped_column(ForeignKey("fabrics.id"), nullable=True)
    measurement_id: Mapped[str] = mapped_column(ForeignKey("measurements.id"))
    accessories: Mapped[list] = mapped_column(JSON, default=list)  # [{accessory_id, price}]
    client_notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    status: Mapped[OrderStatus] = mapped_column(String(24), default=OrderStatus.new)
    priority: Mapped[OrderPriority] = mapped_column(String(8), default=OrderPriority.normal)
    reception_mode: Mapped[ReceptionMode] = mapped_column(String(10))
    desired_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    agreed_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    delivery_fee: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    current_offer_round: Mapped[int] = mapped_column(Integer, default=1)
    dispute_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    dispute_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)


class Offer(Base, IDMixin, TimestampMixin):
    __tablename__ = "offers"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    actor: Mapped[OfferActor] = mapped_column(String(8))
    round: Mapped[int] = mapped_column(Integer)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    delay_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[OfferStatus] = mapped_column(String(10), default=OfferStatus.pending)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Quote(Base, IDMixin, TimestampMixin):
    __tablename__ = "quotes"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    line_items: Mapped[list] = mapped_column(JSON, default=list)  # [{label, amount}]
    fabric_metrage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    total: Mapped[float] = mapped_column(Numeric(12, 2))
    delay_days: Mapped[int] = mapped_column(Integer)
    commission_rate: Mapped[float] = mapped_column(Numeric(5, 4))
    commission_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    net_to_tailor: Mapped[float] = mapped_column(Numeric(12, 2))
    accepted: Mapped[bool] = mapped_column(default=False)


class Modification(Base, IDMixin, TimestampMixin):
    __tablename__ = "modifications"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    proposed_by: Mapped[OfferActor] = mapped_column(String(8))
    modified_model_asset_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    accessory_price_delta: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    new_garment_price: Mapped[float] = mapped_column(Numeric(12, 2))
    justification: Mapped[str] = mapped_column(String(2000))
    status: Mapped[ModificationStatus] = mapped_column(
        String(10), default=ModificationStatus.proposed
    )


class ChatMessage(Base, IDMixin, TimestampMixin):
    __tablename__ = "chat_messages"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    modification_id: Mapped[str | None] = mapped_column(
        ForeignKey("modifications.id"), nullable=True
    )
    type: Mapped[ChatMessageType] = mapped_column(String(16), default=ChatMessageType.text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
