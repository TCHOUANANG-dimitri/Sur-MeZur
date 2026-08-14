from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import JobStatus, MeasurementSource
from app.models.mixins import IDMixin, TimestampMixin


class MeasurementSession(Base, IDMixin, TimestampMixin):
    """Async capture->mock-AI job. Not in the original doc-2 schema; added to support
    the POST /measurements/session (create) + GET .../session/{id} (poll) contract
    from doc 3 without a real Celery/Redis broker."""

    __tablename__ = "measurement_sessions"

    client_id: Mapped[str] = mapped_column(ForeignKey("client_profiles.id"))
    status: Mapped[JobStatus] = mapped_column(String(16), default=JobStatus.processing)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    front_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    side_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    measurement_id: Mapped[str | None] = mapped_column(
        ForeignKey("measurements.id"), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)


class Measurement(Base, IDMixin, TimestampMixin):
    __tablename__ = "measurements"

    client_id: Mapped[str] = mapped_column(ForeignKey("client_profiles.id"))
    source: Mapped[MeasurementSource] = mapped_column(String(20))
    version: Mapped[int] = mapped_column(Integer, default=1)
    height_cm: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    features: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Avatar(Base, IDMixin, TimestampMixin):
    __tablename__ = "avatars"

    client_id: Mapped[str] = mapped_column(ForeignKey("client_profiles.id"))
    measurement_id: Mapped[str] = mapped_column(ForeignKey("measurements.id"))
    # Ancien pipeline (un GLB généré par Blender par client) : conservé pour
    # les avatars déjà en base, mais plus jamais écrit par de nouvelles
    # générations — voir morph_weights ci-dessous.
    gltf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Nouveau pipeline : {"gender", "height_cm", "base_height_cm", "weights"},
    # voir services/avatar/morph_weights.py. Calculé en Python pur (aucun
    # Blender en production) et appliqué côté mobile sur le maillage de base
    # embarqué dans l'app (mobile/assets/avatar-base-{gender}.glb).
    morph_weights: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    skin_tone_hex: Mapped[str] = mapped_column(String(9), default="#C68863")
    status: Mapped[JobStatus] = mapped_column(String(16), default=JobStatus.processing)


class TryonSession(Base, IDMixin, TimestampMixin):
    """Backs POST /tryon + GET /tryon/{id}."""

    __tablename__ = "tryon_sessions"

    avatar_id: Mapped[str] = mapped_column(ForeignKey("avatars.id"))
    garment_model_id: Mapped[str | None] = mapped_column(
        ForeignKey("garment_models.id"), nullable=True
    )
    ready_to_wear_id: Mapped[str | None] = mapped_column(
        ForeignKey("ready_to_wear.id"), nullable=True
    )
    fabric_id: Mapped[str | None] = mapped_column(ForeignKey("fabrics.id"), nullable=True)
    accessory_ids: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[JobStatus] = mapped_column(String(16), default=JobStatus.processing)
    gltf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class MeasurementDataset(Base, IDMixin, TimestampMixin):
    __tablename__ = "measurement_dataset"

    client_id: Mapped[str | None] = mapped_column(
        ForeignKey("client_profiles.id"), nullable=True
    )
    front_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    side_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ai_measurements: Mapped[dict] = mapped_column(JSON, default=dict)
    tailor_confirmed_measurements: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id"), nullable=True)
    consent: Mapped[bool] = mapped_column(Boolean, default=False)
    usable_for_training: Mapped[bool] = mapped_column(Boolean, default=False)
