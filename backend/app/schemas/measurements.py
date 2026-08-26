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
    # Entrées brutes (squelette MediaPipe + silhouette SAM) données au modèle
    # pour prédire `data`. Colonne DB déjà peuplée par le pipeline (voir
    # vision/pipeline.py::run) mais jamais exposée jusqu'ici — ajoutée pour
    # que le client puisse afficher aussi ces mesures intermédiaires.
    features: dict | None
    confidence: dict | None
    is_active: bool


class MeasurementPatchIn(BaseModel):
    data: dict
    # Mêmes bornes qu'à la création (MeasurementSessionCreateIn) : sans elles,
    # rien n'empêchait un PATCH de fixer une taille à 0 ou négative.
    height_cm: float | None = Field(None, gt=50, lt=260)


class AvatarCreateIn(BaseModel):
    measurement_id: str
    skin_tone_hex: str = "#C68863"


class AvatarOut(ORMModel):
    id: str
    client_id: str
    measurement_id: str
    gltf_url: str | None
    morph_weights: dict | None
    skin_tone_hex: str
    name: str | None = None
    status: JobStatus
