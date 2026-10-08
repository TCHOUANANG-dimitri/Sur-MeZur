from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import MeasurementMethod
from app.schemas.common import ORMModel


# --- Categories -----------------------------------------------------------

class CategoryOut(ORMModel):
    id: str
    name: str
    gender: Literal["male", "female", "unisex"]


class CategoryCreateIn(BaseModel):
    name: str
    gender: Literal["male", "female", "unisex"]


class CategoryUpdateIn(BaseModel):
    name: str | None = None
    gender: Literal["male", "female", "unisex"] | None = None


# --- Garment models -------------------------------------------------------

class GarmentModelOut(ORMModel):
    id: str
    category: CategoryOut
    name: str
    description: str | None
    base_price: float | None
    style_tags: list
    thumbnail_color: str
    photo_url: str | None = None
    photos: list[str] = []
    like_count: int = 0
    liked_by_me: bool = False
    # Nul pour le catalogue officiel, identifiant de l'auteur pour un modele
    # propose par un membre. Permet a l'interface de marquer l'origine et de
    # n'ouvrir l'ajout de photos qu'a l'auteur.
    created_by: str | None = None
    # 4.3 / 4.7 : etat de moderation et mise en avant.
    status: str = "published"
    rejection_reason: str | None = None
    sort_order: int = 0
    highlight: str | None = None


class GarmentModelCreateIn(BaseModel):
    name: str
    description: str | None = None
    category_id: str
    base_price: float | None = None
    style_tags: list[str] = []
    thumbnail_color: str = "#7C3AED"
    status: Literal["published", "pending", "hidden"] = "published"
    sort_order: int = 0
    highlight: str | None = None


class CommunityModelIn(BaseModel):
    """Modele propose par un client.

    Volontairement plus etroit que `GarmentModelCreateIn` : pas de
    `base_price`, un modele etant confectionne sur mesure et son tarif
    negocie avec le tailleur. Les bornes de longueur evitent qu'un champ
    libre ne remplisse la base.
    """

    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = Field(None, max_length=2000)
    category_id: str
    style_tags: list[str] = Field(default_factory=list, max_length=8)
    thumbnail_color: str = "#7C3AED"


class GarmentModelUpdateIn(BaseModel):
    name: str | None = None
    description: str | None = None
    category_id: str | None = None
    base_price: float | None = None
    style_tags: list[str] | None = None
    thumbnail_color: str | None = None
    sort_order: int | None = None
    highlight: str | None = None


# --- Fabrics / accessories (unchanged) ------------------------------------

class FabricOut(ORMModel):
    id: str
    name: str
    type: str
    color_hex: str
    texture_url: str | None
    is_local: bool


class AccessoryOut(ORMModel):
    id: str
    name: str
    price: float
    asset_url: str | None
    compatible_categories: list


# --- Ready-to-wear --------------------------------------------------------

class ReadyToWearIn(BaseModel):
    name: str
    description: str | None = None
    photo_url: str | None = None
    price: float
    item_measurements: dict = {}
    measurement_method: MeasurementMethod = MeasurementMethod.standard
    in_stock: bool = True


class ReadyToWearOut(ORMModel):
    id: str
    tailor_id: str
    name: str
    description: str | None
    photo_url: str | None
    photos: list[str] = []
    price: float
    item_measurements: dict
    measurement_method: MeasurementMethod
    in_stock: bool
    moderation_status: str = "published"
    rejection_reason: str | None = None


class CompareIn(BaseModel):
    measurement_id: str
    ready_to_wear_id: str


class CompareOut(BaseModel):
    match: bool
    deltas: dict
    message: str
