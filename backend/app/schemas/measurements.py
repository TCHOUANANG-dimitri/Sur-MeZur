from pydantic import BaseModel, Field, field_validator

from app.models.enums import JobStatus, MeasurementSource
from app.schemas.common import ORMModel

ALLOWED_GENDERS = ("female", "male")


class MeasurementSessionCreateIn(BaseModel):
    """All three are required: the measurement estimator is driven by height,
    weight and sex, so letting any of them through empty silently degrades
    every measurement derived from the session."""

    height_cm: float = Field(..., gt=50, lt=260)
    weight_kg: float = Field(..., gt=20, lt=400)
    gender: str

    @field_validator("gender")
    @classmethod
    def _known_gender(cls, v: str) -> str:
        if v not in ALLOWED_GENDERS:
            raise ValueError(f"gender must be one of {', '.join(ALLOWED_GENDERS)}")
        return v


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
