from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.auth import validate_password
from app.services.collecte_protocol import (
    CLOTHING,
    GENDERS,
    HARD_BOUNDS,
    MESURES,
    REVIEW_STATUSES,
    check_bounds,
)


def _bounded(name: str, value: float | int | None):
    if value is None:
        return value
    lo, hi = HARD_BOUNDS[name]
    if not lo <= value <= hi:
        raise ValueError(f"{name} = {value:g} est hors des bornes plausibles ({lo:g}–{hi:g})")
    return value


class _SubjectFields(BaseModel):
    """Champs communs a la creation et a la modification."""

    age: int | None = None
    clothing: str | None = None
    city: str | None = Field(default=None, max_length=120)
    place: str | None = Field(default=None, max_length=255)
    measured_by: str | None = Field(default=None, max_length=255)
    measured_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("age")
    @classmethod
    def _age(cls, v):
        return _bounded("age", v)

    @field_validator("clothing")
    @classmethod
    def _clothing(cls, v):
        if v is not None and v not in CLOTHING:
            raise ValueError("Tenue inconnue (moulant, ajuste ou ample)")
        return v


class SubjectCreateIn(_SubjectFields):
    client_uuid: str = Field(min_length=8, max_length=36)
    gender: str
    height_cm: float
    weight_kg: float
    measurements: dict[str, float | None] = Field(default_factory=dict)
    consent: bool
    consent_name: str | None = Field(default=None, max_length=255)

    @field_validator("gender")
    @classmethod
    def _gender(cls, v):
        if v not in GENDERS:
            raise ValueError("Sexe inconnu (male ou female)")
        return v

    @field_validator("height_cm")
    @classmethod
    def _height(cls, v):
        return _bounded("height_cm", v)

    @field_validator("weight_kg")
    @classmethod
    def _weight(cls, v):
        return _bounded("weight_kg", v)

    @field_validator("measurements")
    @classmethod
    def _measurements(cls, v):
        return check_bounds(v, MESURES)

    @field_validator("consent")
    @classmethod
    def _consent(cls, v):
        # Pas de photo de corps sans accord explicite du volontaire.
        if not v:
            raise ValueError("Le consentement du volontaire est obligatoire")
        return v


class SubjectUpdateIn(_SubjectFields):
    gender: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    measurements: dict[str, float | None] | None = None
    consent_name: str | None = Field(default=None, max_length=255)

    @field_validator("gender")
    @classmethod
    def _gender(cls, v):
        if v is not None and v not in GENDERS:
            raise ValueError("Sexe inconnu (male ou female)")
        return v

    @field_validator("height_cm")
    @classmethod
    def _height(cls, v):
        return _bounded("height_cm", v)

    @field_validator("weight_kg")
    @classmethod
    def _weight(cls, v):
        return _bounded("weight_kg", v)

    @field_validator("measurements")
    @classmethod
    def _measurements(cls, v):
        return None if v is None else check_bounds(v, MESURES)


class ReviewIn(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v not in REVIEW_STATUSES:
            raise ValueError("Statut inconnu (pending, validated ou rejected)")
        return v


class PhotoOut(BaseModel):
    view: str
    size_bytes: int
    width: int | None
    height: int | None
    sha256: str
    updated_at: datetime


class SubjectOut(BaseModel):
    id: str
    code: str
    number: int
    client_uuid: str
    collector_id: str
    collector_name: str | None
    gender: str
    age: int | None
    height_cm: float
    weight_kg: float
    measurements: dict[str, float]
    clothing: str | None
    city: str | None
    place: str | None
    measured_by: str | None
    measured_at: datetime | None
    notes: str | None
    consent: bool
    consent_name: str | None
    review_status: str
    review_note: str | None
    photos: list[PhotoOut]
    complete: bool
    created_at: datetime
    updated_at: datetime


class CollecteStatsOut(BaseModel):
    total: int
    complete: int
    validated: int
    rejected: int
    pending: int
    male: int
    female: int
    photos: int
    today: int


class CollectorCreateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=6, max_length=32)
    password: str

    @field_validator("password")
    @classmethod
    def _password(cls, v):
        return validate_password(v)


class CollectorOut(BaseModel):
    id: str
    full_name: str
    phone: str
    role: str
    is_active: bool
    subjects: int
    created_at: datetime


class CollectorActiveIn(BaseModel):
    is_active: bool
