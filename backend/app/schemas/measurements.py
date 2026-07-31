from pydantic import BaseModel

from app.models.enums import JobStatus, MeasurementSource
from app.schemas.common import ORMModel


class MeasurementSessionCreateIn(BaseModel):
    height_cm: float
    weight_kg: float | None = None
    gender: str | None = None


class MeasurementSessionOut(ORMModel):
    id: str
    status: JobStatus
    measurement_id: str | None
    height_cm: float | None
    error_message: str | None


class MeasurementOut(ORMModel):
    id: str
    client_id: str
    source: MeasurementSource
    version: int
    height_cm: float
    weight_kg: float | None
    gender: str | None
    data: dict
    confidence: dict | None
    is_active: bool


class MeasurementPatchIn(BaseModel):
    data: dict
    height_cm: float | None = None


class AvatarCreateIn(BaseModel):
    measurement_id: str
    skin_tone_hex: str = "#C68863"


class AvatarOut(ORMModel):
    id: str
    client_id: str
    measurement_id: str
    gltf_url: str | None
    skin_tone_hex: str
    status: JobStatus
