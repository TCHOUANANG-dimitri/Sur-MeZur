"""
Acquisition des utilisateurs (cahier des charges, module M14, 14.9 a 14.15).

Trois sources se completent pour savoir d'ou vient chaque compte :
  - ce que la personne declare a l'inscription (« Comment nous avez-vous
    connu ? », 14.9) ;
  - ce que le site enregistre seul : parametres de campagne de l'adresse
    d'arrivee et code de parrainage ou promo (14.10) ;
  - ce que l'equipe renseigne ou corrige ensuite (14.11), seule source
    possible pour les canaux hors ligne (salon, demarchage, tailleur).
`UserAcquisition` porte l'etat retenu ; `AcquisitionComment` garde chaque
saisie de l'equipe, datee et signee.
"""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class AcquisitionChannel(Base, IDMixin, TimestampMixin):
    """14.14 — liste des canaux, modifiable par l'administrateur. `code` est
    la valeur stable envoyee par le formulaire d'inscription."""

    __tablename__ = "acquisition_channels"

    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    # Propose dans la question « Comment nous avez-vous connu ? »
    self_reportable: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Campaign(Base, IDMixin, TimestampMixin):
    """14.14 — campagne marketing. `code` sert a la fois de valeur
    `utm_campaign` dans les liens marques et de code promo / parrainage."""

    __tablename__ = "campaigns"

    name: Mapped[str] = mapped_column(String(150))
    code: Mapped[str] = mapped_column(String(64), unique=True)
    channel_id: Mapped[str | None] = mapped_column(ForeignKey("acquisition_channels.id"), nullable=True)
    starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    budget: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserAcquisition(Base, IDMixin, TimestampMixin):
    """Origine retenue d'un compte : une ligne par utilisateur."""

    __tablename__ = "user_acquisitions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    # Etat retenu (declare, puis eventuellement corrige par l'equipe).
    channel_id: Mapped[str | None] = mapped_column(ForeignKey("acquisition_channels.id"), nullable=True)
    campaign_id: Mapped[str | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)
    referrer: Mapped[str | None] = mapped_column(String(255), nullable=True)  # personne ou partenaire
    # 14.9 — reponse brute de l'utilisateur.
    self_reported_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    self_reported_other: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 14.10 — capture automatique.
    utm: Mapped[dict] = mapped_column(JSON, default=dict)
    referral_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    landing_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    platform: Mapped[str | None] = mapped_column(String(8), nullable=True)  # web | app
    # 14.12 — l'equipe a verifie / complete l'origine de ce compte.
    qualified: Mapped[bool] = mapped_column(Boolean, default=False)
    qualified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    qualified_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class AcquisitionComment(Base, IDMixin, TimestampMixin):
    """14.11 — saisie de l'equipe sur l'origine d'un compte, datee et signee.
    Garde aussi l'etat structure au moment de la saisie : l'historique reste
    lisible meme si l'origine est corrigee plus tard."""

    __tablename__ = "acquisition_comments"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    author_id: Mapped[str] = mapped_column(String(36))
    author_name: Mapped[str] = mapped_column(String(255))
    channel_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    campaign_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    referrer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    method: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)


class GrowthGoal(Base, IDMixin, TimestampMixin):
    """14.15 — objectif suivi sur le tableau de bord.

    metric : new_users | new_clients | new_tailors | active_users | churn_rate
             | orders | gmv
    period : month | week ; `comparator` : ">=" (atteindre) ou "<=" (rester
    sous, pour le churn)."""

    __tablename__ = "growth_goals"

    label: Mapped[str] = mapped_column(String(150))
    metric: Mapped[str] = mapped_column(String(32))
    period: Mapped[str] = mapped_column(String(8), default="month")
    target: Mapped[float] = mapped_column(Numeric(14, 2))
    comparator: Mapped[str] = mapped_column(String(2), default=">=")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
