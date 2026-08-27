import re

from pydantic import BaseModel, field_validator

from app.models.enums import Language, UserRole
from app.schemas.common import ORMModel

PASSWORD_MIN_LENGTH = 6
PASSWORD_MAX_LENGTH = 6


def validate_password(value: str) -> str:
    if len(value) != PASSWORD_MIN_LENGTH:
        raise ValueError(
            f"Le mot de passe doit contenir {PASSWORD_MIN_LENGTH} caractères exactement"
        )
    if not re.search(r"[a-zA-Z]", value):
        raise ValueError("Le mot de passe doit contenir au moins une lettre")
    if not re.search(r"[0-9]", value):
        raise ValueError("Le mot de passe doit contenir au moins un chiffre")
    return value


class RegisterIn(BaseModel):
    role: UserRole
    phone: str
    full_name: str
    password: str
    language: Language = Language.fr
    email: str | None = None
    photo_consent: bool = False
    city: str | None = None
    quartier: str | None = None

    @field_validator("password")
    @classmethod
    def _valid_password(cls, v: str) -> str:
        return validate_password(v)

    @field_validator("role")
    @classmethod
    def _no_self_service_admin(cls, v: UserRole) -> UserRole:
        # Cette route est publique, sans authentification : accepter "admin"
        # ici revenait à laisser n'importe qui s'auto-promouvoir admin d'un
        # simple appel API. Seuls client/tailor s'inscrivent d'eux-mêmes ; un
        # admin se crée hors de cette route (script d'exploitation, ou promu
        # par un admin existant).
        if v == UserRole.admin:
            raise ValueError("Auto-inscription admin non autorisée")
        return v


class LoginIn(BaseModel):
    phone: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    role: UserRole


class OtpRequestIn(BaseModel):
    phone: str


class OtpRequestOut(BaseModel):
    sent: bool
    dev_code: str  # mocked: no SMS gateway, code is handed back directly


class OtpVerifyIn(BaseModel):
    phone: str
    code: str


class RegisterOut(ORMModel):
    token: TokenOut


class PasswordResetRequestIn(BaseModel):
    phone: str


class PasswordResetConfirmIn(BaseModel):
    phone: str
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _valid_new_password(cls, v: str) -> str:
        return validate_password(v)
