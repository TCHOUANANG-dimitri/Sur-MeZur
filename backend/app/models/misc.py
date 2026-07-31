from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ModerationStatus, ReceptionMode
from app.models.mixins import IDMixin, TimestampMixin


class Pattern(Base, IDMixin, TimestampMixin):
    __tablename__ = "patterns"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), unique=True)
    svg_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tech_sheet: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(16), default="freesewing")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Delivery(Base, IDMixin, TimestampMixin):
    __tablename__ = "deliveries"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), unique=True)
    mode: Mapped[ReceptionMode] = mapped_column(String(10))
    fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    confirmed_by_client: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Review(Base, IDMixin, TimestampMixin):
    __tablename__ = "reviews"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), unique=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("client_profiles.id"))
    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"))
    stars: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    moderation_status: Mapped[ModerationStatus] = mapped_column(
        String(10), default=ModerationStatus.visible
    )


class Notification(Base, IDMixin, TimestampMixin):
    __tablename__ = "notifications"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
