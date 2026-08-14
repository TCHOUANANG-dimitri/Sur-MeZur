from sqlalchemy import Boolean, ForeignKey, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AssetType, MeasurementMethod
from app.models.mixins import IDMixin, TimestampMixin


class Category(Base, IDMixin, TimestampMixin):
    """
    Catégorie de vêtement, propre à un genre — gérée par l'admin (créer,
    renommer, supprimer), remplace l'ancien enum figé `GarmentCategory`
    (top/bottom/dress/traditional/other) qui ne pouvait être étendu que par
    un déploiement de code. Un modèle hérite son genre de sa catégorie plutôt
    que de porter son propre champ `gender` — évite qu'un modèle et sa
    catégorie se contredisent.
    """
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("name", "gender", name="uq_category_name_gender"),)

    name: Mapped[str] = mapped_column(String(100))
    gender: Mapped[str] = mapped_column(String(16))  # "male" | "female" | "unisex"


class GarmentModel(Base, IDMixin, TimestampMixin):
    __tablename__ = "garment_models"

    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    base_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    style_tags: Mapped[list] = mapped_column(JSON, default=list)
    # Vignette de repli tant qu'aucune photo n'est encore associée — voir
    # photo_url ci-dessous, seule source d'image réelle depuis l'admin.
    thumbnail_color: Mapped[str] = mapped_column(String(9), default="#7C3AED")
    # Même convention que ReadyToWear.photo_url/photos : `photo_url` est la
    # couverture (toujours le premier élément de `photos`), `photos` la
    # galerie complète.
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    category: Mapped["Category"] = relationship("Category")


class GarmentModelLike(Base, IDMixin, TimestampMixin):
    __tablename__ = "garment_model_likes"
    __table_args__ = (UniqueConstraint("client_id", "garment_model_id", name="uq_client_model_like"),)

    client_id: Mapped[str] = mapped_column(ForeignKey("client_profiles.id"))
    garment_model_id: Mapped[str] = mapped_column(ForeignKey("garment_models.id"))


class GarmentAsset(Base, IDMixin, TimestampMixin):
    __tablename__ = "garment_assets"

    garment_model_id: Mapped[str] = mapped_column(ForeignKey("garment_models.id"))
    asset_type: Mapped[AssetType] = mapped_column(String(20))
    url: Mapped[str] = mapped_column(String(500))
    lod: Mapped[str | None] = mapped_column(String(8), nullable=True)
    template_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Fabric(Base, IDMixin, TimestampMixin):
    __tablename__ = "fabrics"

    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(32))  # wax, pagne, bazin, uni...
    color_hex: Mapped[str] = mapped_column(String(9))
    texture_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_local: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_tailor_id: Mapped[str | None] = mapped_column(
        ForeignKey("tailor_profiles.id"), nullable=True
    )


class Accessory(Base, IDMixin, TimestampMixin):
    __tablename__ = "accessories"

    name: Mapped[str] = mapped_column(String(255))
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    asset_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    compatible_categories: Mapped[list] = mapped_column(JSON, default=list)


class ReadyToWear(Base, IDMixin, TimestampMixin):
    __tablename__ = "ready_to_wear"

    tailor_id: Mapped[str] = mapped_column(ForeignKey("tailor_profiles.id"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # Kept as the "cover" for existing clients/screens; `photos` is the full
    # gallery and always holds the cover as its first entry.
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    item_measurements: Mapped[dict] = mapped_column(JSON, default=dict)
    measurement_method: Mapped[MeasurementMethod] = mapped_column(
        String(16), default=MeasurementMethod.standard
    )
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
