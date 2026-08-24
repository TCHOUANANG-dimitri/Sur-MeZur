from sqlalchemy import Boolean, Float, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import Language, TailorType, UserRole, VerificationStatus
from app.models.mixins import IDMixin, TimestampMixin


class User(Base, IDMixin, TimestampMixin):
    __tablename__ = "users"

    role: Mapped[UserRole] = mapped_column(String(16))
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    language: Mapped[Language] = mapped_column(String(2), default=Language.fr)
    photo_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    client_profile: Mapped["ClientProfile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    tailor_profile: Mapped["TailorProfile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class ClientProfile(Base, IDMixin, TimestampMixin):
    __tablename__ = "client_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    default_measurement_id: Mapped[str | None] = mapped_column(
        ForeignKey("measurements.id"), nullable=True
    )
    skin_tone_hex: Mapped[str | None] = mapped_column(String(9), nullable=True)

    user: Mapped[User] = relationship(back_populates="client_profile")


class TailorProfile(Base, IDMixin, TimestampMixin):
    __tablename__ = "tailor_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    tailor_type: Mapped[TailorType] = mapped_column(String(16))
    shop_name: Mapped[str] = mapped_column(String(255))
    bio: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    quartier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        String(16), default=VerificationStatus.pending
    )
    rating_avg: Mapped[float] = mapped_column(Numeric(3, 2), default=0)
    completed_orders_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_response_minutes: Mapped[int] = mapped_column(Integer, default=0)
    atelier_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user: Mapped[User] = relationship(back_populates="tailor_profile")


class VerificationDocument(Base, IDMixin, TimestampMixin):
    __tablename__ = "verification_documents"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(32))  # id_card | portfolio | atelier_photo
    file_url: Mapped[str] = mapped_column(String(500))
    status: Mapped[VerificationStatus] = mapped_column(
        String(16), default=VerificationStatus.pending
    )
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
