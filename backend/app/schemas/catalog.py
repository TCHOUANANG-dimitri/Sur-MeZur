from pydantic import BaseModel

from app.models.enums import GarmentCategory, MeasurementMethod
from app.schemas.common import ORMModel


class GarmentModelOut(ORMModel):
    id: str
    category: GarmentCategory
    name: str
    description: str | None
    base_price: float | None
    style_tags: list
    thumbnail_color: str
    like_count: int = 0
    liked_by_me: bool = False


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
