"""
Tables de l'administration web (cahier des charges, modules M0 et M11 a M13).

Toutes sont nouvelles : `create_all` les cree au demarrage sans toucher aux
tables existantes. Aucune n'est indispensable au parcours client ou tailleur,
qui fonctionnent comme avant si elles sont vides.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class AuditLog(Base, IDMixin, TimestampMixin):
    """13.3 — qui a fait quoi et quand. Une ligne par action qui modifie des
    donnees depuis l'administration (exigence Q6). `details` garde l'avant /
    apres quand il a un sens (correction de mesure, reglage modifie)."""

    __tablename__ = "audit_logs"

    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AdminNote(Base, IDMixin, TimestampMixin):
    """0.10 — note interne sur une fiche, visible seulement par l'equipe."""

    __tablename__ = "admin_notes"

    entity_type: Mapped[str] = mapped_column(String(32), index=True)  # user | order | dispute | tailor | ticket
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    author_id: Mapped[str] = mapped_column(String(36))
    author_name: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)


class PlatformSetting(Base, TimestampMixin):
    """13.7 / 13.8 / 11.2 — reglages modifiables sans toucher au code. Cle
    libre, valeur JSON ; les valeurs par defaut vivent dans
    `app.services.platform_settings.DEFAULTS`."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class AdminSession(Base, IDMixin, TimestampMixin):
    """13.5 — session d'un administrateur. Son identifiant voyage dans les
    jetons (`sid`) : revoquer la ligne coupe la session, meme si le jeton
    n'a pas encore expire."""

    __tablename__ = "admin_sessions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)


class LoginEvent(Base, IDMixin, TimestampMixin):
    """2.3 — historique des connexions d'un compte (reussies ou non)."""

    __tablename__ = "login_events"

    user_id: Mapped[str] = mapped_column(String(36), index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    method: Mapped[str] = mapped_column(String(16), default="password")  # password | refresh | register | otp
    platform: Mapped[str | None] = mapped_column(String(8), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)


class UserActivityDay(Base, IDMixin):
    """14.3 a 14.7 — un jour ou un utilisateur a utilise la plateforme.

    Une ligne par utilisateur et par jour au plus : c'est la matiere premiere
    des actifs du jour / de la semaine / du mois, du churn, des cohortes et
    des retours. Ces statistiques ne se reconstituent pas apres coup ; elles
    valent a partir du jour ou cette table commence a se remplir."""

    __tablename__ = "user_activity_days"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_activity_user_day"),)

    user_id: Mapped[str] = mapped_column(String(36), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    role: Mapped[str] = mapped_column(String(16))
    platform: Mapped[str | None] = mapped_column(String(8), nullable=True)


class Announcement(Base, IDMixin, TimestampMixin):
    """11.1 — message envoye a un groupe d'utilisateurs, depose dans leurs
    notifications."""

    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    audience: Mapped[dict] = mapped_column(JSON, default=dict)  # {role, city, active_days}
    recipients_count: Mapped[int] = mapped_column(Integer, default=0)
    author_id: Mapped[str] = mapped_column(String(36))
    author_name: Mapped[str] = mapped_column(String(255))


class MessageTemplate(Base, IDMixin, TimestampMixin):
    """11.3 — texte type (refus de verification, rejet, relance, decision)."""

    __tablename__ = "message_templates"

    category: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)


class InfoPage(Base, TimestampMixin):
    """11.4 — FAQ, conditions d'utilisation, confidentialite."""

    __tablename__ = "info_pages"

    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class SupportTicket(Base, IDMixin, TimestampMixin):
    """12.1 a 12.3 — demande d'un utilisateur (ou d'un visiteur)."""

    __tablename__ = "support_tickets"

    number: Mapped[int] = mapped_column(Integer, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(32), default="autre")
    status: Mapped[str] = mapped_column(String(16), default="new")  # new | in_progress | resolved
    assigned_to: Mapped[str | None] = mapped_column(String(36), nullable=True)
    order_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SupportMessage(Base, IDMixin, TimestampMixin):
    __tablename__ = "support_messages"

    ticket_id: Mapped[str] = mapped_column(ForeignKey("support_tickets.id"), index=True)
    author_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    author_name: Mapped[str] = mapped_column(String(255))
    from_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    body: Mapped[str] = mapped_column(Text)
