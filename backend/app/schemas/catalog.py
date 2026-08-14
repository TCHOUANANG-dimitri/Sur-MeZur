from typing import Literal

from pydantic import BaseModel

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


class GarmentModelCreateIn(BaseModel):
    name: str
    description: str | None = None
    category_id: str
    base_price: float | None = None
    style_tags: list[str] = []
    thumbnail_color: str = "#7C3AED"


class GarmentModelUpdateIn(BaseModel):
    name: str | None = None
    description: str | None = None
    category_id: str | None = None
    base_price: float | None = None
    style_tags: list[str] | None = None
    thumbnail_color: str | None = None


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


class CompareIn(BaseModel):
    measurement_id: str
    ready_to_wear_id: str


class CompareOut(BaseModel):
    match: bool
    deltas: dict
    message: str
