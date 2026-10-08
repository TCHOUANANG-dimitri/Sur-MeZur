from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Numeric, String
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
    # Compte invite, cree a la volee pour qu'un visiteur de la version web
    # prenne ses mesures AVANT de s'inscrire. Il n'a ni vrai telephone ni mot
    # de passe utilisable, et le serveur ne lui renvoie qu'une partie de ses
    # mensurations (voir measurements.py::_serialize_for). A l'inscription il
    # est converti sur place, ce qui evite de transferer ses mesures.
    #
    # `server_default` est indispensable : sans lui, sync_sqlite_columns.py
    # refuse d'ajouter une colonne NOT NULL a une table deja peuplee.
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    # --- Administration web (cahier des charges) ----------------------------
    # 14.3 a 14.7 : derniere utilisation de la plateforme et derniere
    # connexion. Mis a jour au plus une fois toutes les quelques minutes par
    # `app.services.activity`, pas a chaque requete.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 13.1 : niveau d'un compte `admin` (super_admin | moderator | support |
    # finance). Vide = super_admin, pour que les comptes admin existants
    # gardent tous leurs droits.
    admin_role: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 2.6 : mot de passe provisoire fixe par l'equipe, a changer a la
    # prochaine connexion.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    # 13.4 : double authentification (TOTP) des administrateurs.
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # 1.7 / 14.8 : ville declaree (les tailleurs l'ont aussi sur leur profil).
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # 14.8 : support d'inscription (web | app).
    signup_platform: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # 1.6 : date de conversion d'un compte invite en compte inscrit.
    guest_converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    # 3.7 : tailleur recommande, remonte en tete de la recherche.
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    featured_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user: Mapped[User] = relationship(back_populates="tailor_profile")


class VerificationDocument(Base, IDMixin, TimestampMixin):
    __tablename__ = "verification_documents"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(32))  # id_card | self_photo | atelier_photo
    file_url: Mapped[str] = mapped_column(String(500))
    status: Mapped[VerificationStatus] = mapped_column(
        String(16), default=VerificationStatus.pending
    )
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
