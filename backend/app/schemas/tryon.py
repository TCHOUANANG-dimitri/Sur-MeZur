from pydantic import BaseModel

from app.models.enums import JobStatus
from app.schemas.common import ORMModel


class TryonCreateIn(BaseModel):
    avatar_id: str
    garment_model_id: str | None = None
    ready_to_wear_id: str | None = None
    fabric_id: str | None = None
    accessory_ids: list[str] = []


class TryonOut(ORMModel):
    id: str
    avatar_id: str
    garment_model_id: str | None
    ready_to_wear_id: str | None
    fabric_id: str | None
    accessory_ids: list
    status: JobStatus
    gltf_url: str | None
