"""
Campagne de collecte : la verite terrain qui manque au modele de mesure.

POURQUOI DES TABLES A PART
`measurement_dataset` existe depuis l'origine mais decrit autre chose : des
mesures de CLIENTS, confirmees apres coup par un tailleur au fil d'une
commande. Ici, ce sont des VOLONTAIRES mesures au metre ruban par un agent de
terrain, photographies selon un protocole, sans compte client ni commande.
Les melanger aurait impose des colonnes nullables partout et des filtres a
chaque lecture.

Deux tables nouvelles : `create_all()` les cree au demarrage suivant, sans
aucune migration a lancer (il ne sait pas AJOUTER une colonne a une table
existante, mais il cree sans probleme une table absente).

Les mensurations vivent en JSON, cle par cle, avec le meme vocabulaire que la
chaine de mesure (`neck`, `chest`, ... voir app/services/collecte_protocol.py)
: l'export se compare alors directement a `pipeline.run()`.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import IDMixin, TimestampMixin


class DatasetSubject(Base, IDMixin, TimestampMixin):
    __tablename__ = "dataset_subjects"

    # Numero lisible, attribue par le serveur (1, 2, 3...) et affiche sous la
    # forme SMZ-0001. C'est lui qui nomme les photos et le dossier du sujet :
    # aucun nom de personne ne sort jamais dans un export.
    number: Mapped[int] = mapped_column(Integer, unique=True, index=True)

    # Identifiant genere sur le telephone AVANT le premier envoi. La saisie se
    # fait souvent hors reseau : une fiche peut partir deux fois (coupure
    # apres l'enregistrement, avant la reponse). Ce jeton rend la creation
    # idempotente — le second envoi retrouve la fiche au lieu de la dupliquer.
    client_uuid: Mapped[str] = mapped_column(String(36), unique=True, index=True)

    collector_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)

    gender: Mapped[str] = mapped_column(String(8))  # male | female
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_cm: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)

    # Les 12 mesures livrees par la chaine, relevees au metre ruban. Ce sont
    # les SEULES relevees : la campagne se limite a ce que l'application livre
    # au tailleur.
    measurements: Mapped[dict] = mapped_column(JSON, default=dict)

    # Contexte de prise de vue : le vetement ample est le premier facteur
    # d'erreur mesure (jusqu'a 24 cm, RAPPORT_PROJET.md §5.3).
    clothing: Mapped[str | None] = mapped_column(String(16), nullable=True)  # moulant | ajuste | ample
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    place: Mapped[str | None] = mapped_column(String(255), nullable=True)
    measured_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    measured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Consentement du volontaire : obligatoire a la creation. Le nom sert de
    # trace du consentement et n'est JAMAIS exporte.
    consent: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relecture par un administrateur avant usage pour l'entrainement.
    review_status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | validated | rejected
    review_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    photos: Mapped[list["DatasetPhoto"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan", order_by="DatasetPhoto.view"
    )

    @property
    def code(self) -> str:
        return f"SMZ-{self.number:04d}"


class DatasetPhoto(Base, IDMixin, TimestampMixin):
    __tablename__ = "dataset_photos"
    __table_args__ = (UniqueConstraint("subject_id", "view", name="uq_dataset_photo_view"),)

    subject_id: Mapped[str] = mapped_column(ForeignKey("dataset_subjects.id"), index=True)
    view: Mapped[str] = mapped_column(String(16))  # face | profil
    # Chemin RELATIF a settings.dataset_dir (ex. "SMZ-0001/SMZ-0001_face.jpg") :
    # le dossier peut etre deplace sans reecrire la base.
    file_path: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(64), default="image/jpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Empreinte du contenu : le script de telechargement ne recupere que ce
    # qui a change, et deux photos identiques sur deux sujets se reperent.
    sha256: Mapped[str] = mapped_column(String(64))

    subject: Mapped[DatasetSubject] = relationship(back_populates="photos")
