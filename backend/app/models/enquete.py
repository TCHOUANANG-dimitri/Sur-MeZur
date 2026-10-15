"""
Enquete patrons : recueil, aupres de tailleurs partenaires, de leur maniere de
construire des modeles qu'ils maitrisent (mesures prises, aisance, marges,
pieces, trace). Ces fiches nourrissent le futur moteur de patrons.

Aucun compte : chaque tailleur recoit un lien personnel (`EnqueteInvite.token`)
cree depuis l'administration. Le lien ouvre l'application `enquete/` ; tout
ce que le tailleur saisit est rattache a son invitation.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class EnqueteInvite(Base, IDMixin, TimestampMixin):
    """Lien personnel d'un tailleur. `profil` porte ce qu'il dit de lui-meme
    (nom, ville, experience, consentement) ; `label` est le libelle interne
    donne par l'equipe a la creation du lien."""

    __tablename__ = "enquete_invites"

    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    profil: Mapped[dict] = mapped_column(JSON, default=dict)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EnqueteModele(Base, IDMixin, TimestampMixin):
    """Une fiche « modele » remplie par un tailleur.

    `source` : `cousu` (un modele qu'il a deja realise, photos a l'appui) ou
    `galerie` (choisi dans le catalogue de l'application, mesures estimees).
    `data` suit le schema `schema_version` du questionnaire (voir
    enquete/src/lib/questionnaire.ts) ; `photos` liste les fichiers deposes :
    [{id, kind: vetement|patron|autre, file, legende, created_at}].
    """

    __tablename__ = "enquete_modeles"

    invite_id: Mapped[str] = mapped_column(ForeignKey("enquete_invites.id"), index=True)
    source: Mapped[str] = mapped_column(String(12))
    garment_model_id: Mapped[str | None] = mapped_column(ForeignKey("garment_models.id"), nullable=True)
    schema_version: Mapped[int] = mapped_column(default=1)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(12), default="brouillon")  # brouillon | envoye
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Lecture par l'equipe : a_lire | retenu | a_completer | ecarte
    review_status: Mapped[str] = mapped_column(String(16), default="a_lire")
    review_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
