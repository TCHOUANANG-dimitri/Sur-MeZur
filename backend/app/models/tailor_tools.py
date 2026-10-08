"""
Espace tailleur web (A2.3) : carnet de clients, mesures du carnet, travaux,
demandes de patron (A2.4).

Ce qui vit ici est propre au tailleur et n'a pas d'equivalent dans le parcours
client : une fiche personnelle par personne coupee, des mesures reprises ou
lues par photo, des travaux de confection — le tout hors commande plateforme
(un client peut arriver par WhatsApp, par le carnet de l'atelier, etc.).
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class TailorClient(Base, IDMixin, TimestampMixin):
    """Fiche d'une personne dans le carnet du tailleur. Un compte client
    Sur-MeZur peut etre rattache (`linked_user_id`) quand la personne en a un,
    mais ce n'est en rien obligatoire."""

    __tablename__ = "tailor_clients"

    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"), index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    linked_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)


class TailorClientMeasurement(Base, IDMixin, TimestampMixin):
    """Une prise de mesure d'un client du carnet. `data` a la meme forme que
    `measurements.data` (les 12 clefs de couture) ; `source` vaut manual ou
    photo. Quand la mesure vient de la chaine de vision, `measurement_id`
    pointe la ligne `measurements` creee pour la reutiliser dans un ordre."""

    __tablename__ = "tailor_client_measurements"

    tailor_client_id: Mapped[str] = mapped_column(ForeignKey("tailor_clients.id"), index=True)
    measurement_id: Mapped[str | None] = mapped_column(
        ForeignKey("measurements.id"), nullable=True
    )
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | photo
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)


class TailorJob(Base, IDMixin, TimestampMixin):
    """Travail de confection du carnet (hors commande plateforme). Statuts :
    todo -> in_progress -> ready -> delivered (valeurs envoyees telles

    quelles au front, libellees cote web)."""

    __tablename__ = "tailor_jobs"

    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"), index=True)
    tailor_client_id: Mapped[str | None] = mapped_column(
        ForeignKey("tailor_clients.id"), nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    garment_model_id: Mapped[str | None] = mapped_column(
        ForeignKey("garment_models.id"), nullable=True
    )
    # Photo de reference du modele (pour les modeles hors catalogue).
    reference_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    garment_type: Mapped[str | None] = mapped_column(String(24), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="todo")
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    agreed_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    # Avance regue en main propre : simple saisie du tailleur, AUCUN paiement
    # ne passe par la plateforme.
    advance_received: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TailorPatternRequest(Base, IDMixin, TimestampMixin):
    """Demande de patron a partir d'une image (A2.4). Statuts :
    processing -> ready | failed. `result` porte la fiche technique et les
    URLs SVG/pdf du moteur ; `engine` indique le moteur utilise
    (« preview-v0 » pour l'instant, le vrai calcul viendra plus tard)."""

    __tablename__ = "tailor_pattern_requests"

    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"), index=True)
    tailor_client_id: Mapped[str | None] = mapped_column(
        ForeignKey("tailor_clients.id"), nullable=True
    )
    # Image source (tenue de reference) : conservee en lecture seule.
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    garment_type: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(16), default="processing")
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    engine: Mapped[str] = mapped_column(String(32), default="preview-v0")
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)


class TailorShareToken(Base, IDMixin, TimestampMixin):
    """Jeton de partage public d'une fiche de mesures (A2.3). Le tailleur
    l'envoie au client par WhatsApp ; quiconque a le lien lit la fiche en
    lecture seule pendant 30 jours."""

    __tablename__ = "tailor_share_tokens"

    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"), index=True)
    tailor_client_id: Mapped[str] = mapped_column(ForeignKey("tailor_clients.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))