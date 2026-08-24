from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Language, TailorType, UserRole, VerificationStatus
from app.schemas.common import ORMModel


class UserOut(ORMModel):
    id: str
    role: UserRole
    phone: str
    email: str | None
    full_name: str
    language: Language
    photo_consent: bool
    is_active: bool
    created_at: datetime
    # Uniquement pertinent pour role == tailor ; None pour client/admin.
    # Peuplé manuellement par l'endpoint (pas une colonne de `User`), pour que
    # la liste admin des utilisateurs montre le statut sans écran séparé.
    verification_status: VerificationStatus | None = None


class MePatchIn(BaseModel):
    full_name: str | None = None
    email: str | None = None
    language: Language | None = None
    photo_consent: bool | None = None


class ClientProfileOut(ORMModel):
    id: str
    user_id: str
    default_measurement_id: str | None
    skin_tone_hex: str | None


class TailorVerificationIn(BaseModel):
    tailor_type: TailorType
    shop_name: str
    bio: str | None = None
    lat: float | None = None
    lng: float | None = None
    city: str | None = None
    quartier: str | None = None


class TailorProfileOut(ORMModel):
    id: str
    user_id: str
    tailor_type: TailorType
    shop_name: str
    bio: str | None
    lat: float | None
    lng: float | None
    city: str | None
    quartier: str | None
    verification_status: VerificationStatus
    rating_avg: float
    completed_orders_count: int
    avg_response_minutes: int
    atelier_photo_url: str | None


class TailorProfilePublicOut(TailorProfileOut):
    distance_km: float | None = None


class VerificationDocumentOut(ORMModel):
    id: str
    user_id: str
    type: str
    file_url: str
    status: VerificationStatus
