from pydantic import BaseModel

from app.models.enums import Language, UserRole
from app.schemas.common import ORMModel


class RegisterIn(BaseModel):
    role: UserRole
    phone: str
    full_name: str
    password: str
    language: Language = Language.fr
    email: str | None = None
    photo_consent: bool = False


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
