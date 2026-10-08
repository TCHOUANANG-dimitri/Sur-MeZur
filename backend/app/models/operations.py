"""
Tables de suivi des operations (cahier des charges, modules M3, M5 a M8).
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class VerificationEvent(Base, IDMixin, TimestampMixin):
    """3.5 — historique de la verification d'un tailleur : chaque depot de
    pieces, chaque decision, chaque demande de complement, et son auteur."""

    __tablename__ = "verification_events"

    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"), index=True)
    action: Mapped[str] = mapped_column(String(24))  # submitted | approved | rejected | info_requested | suspended
    reason: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    missing_documents: Mapped[list] = mapped_column(JSON, default=list)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class FitFeedback(Base, IDMixin, TimestampMixin):
    """5.6 — retour d'essayage a la livraison.

    result : good | alteration | too_tight | too_loose
    adjustments : [{measure, delta_cm, note}] — delta positif = il fallait
    plus d'aisance (vetement trop serre). C'est la verite terrain continue de
    la specification de mesure (Jeu 3), reprise par 9.4."""

    __tablename__ = "fit_feedbacks"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    result: Mapped[str] = mapped_column(String(16))
    adjustments: Mapped[list] = mapped_column(JSON, default=list)
    comment: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    source: Mapped[str] = mapped_column(String(8), default="admin")  # admin | client | tailor
    author_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class DisputeMessage(Base, IDMixin, TimestampMixin):
    """7.3 — echange entre l'equipe et les parties d'un litige.

    `audience` : client | tailor | both (message de l'equipe) ; pour un
    message d'une partie, `author_role` vaut client ou tailor."""

    __tablename__ = "dispute_messages"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    author_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    author_name: Mapped[str] = mapped_column(String(255))
    author_role: Mapped[str] = mapped_column(String(8))  # admin | client | tailor
    audience: Mapped[str] = mapped_column(String(8), default="both")
    body: Mapped[str] = mapped_column(Text)
    attachment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    requests_photo: Mapped[bool] = mapped_column(default=False)


class ReviewReport(Base, IDMixin, TimestampMixin):
    """8.3 — signalement d'un avis par un utilisateur."""

    __tablename__ = "review_reports"

    review_id: Mapped[str] = mapped_column(ForeignKey("reviews.id"), index=True)
    reporter_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | upheld | dismissed
    handled_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class Refund(Base, IDMixin, TimestampMixin):
    """6.5 — remboursement d'un client, lie a une commande et souvent a un
    litige. Tant que le fournisseur Mobile Money est simule, `status` passe a
    `completed` quand l'equipe confirme l'envoi."""

    __tablename__ = "refunds"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    payment_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    reason: Mapped[str] = mapped_column(String(1000))
    origin: Mapped[str] = mapped_column(String(10), default="order")  # order | dispute
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | completed | failed | cancelled
    provider_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    requested_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TailorPayout(Base, IDMixin, TimestampMixin):
    """6.4 — versement a un tailleur (part immediate a l'acompte, solde et
    sequestre a la livraison)."""

    __tablename__ = "tailor_payouts"

    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"), index=True)
    order_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    kind: Mapped[str] = mapped_column(String(12), default="manual")  # deposit | delivery | manual
    status: Mapped[str] = mapped_column(String(10), default="paid")  # pending | paid | failed
    reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recorded_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
