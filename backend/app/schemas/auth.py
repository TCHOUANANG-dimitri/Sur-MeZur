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


class AcquisitionIn(BaseModel):
    """14.9 / 14.10 — origine d'une inscription, toute facultative."""

    # Code d'un canal propose (« Comment nous avez-vous connu ? »).
    source: str | None = None
    source_other: str | None = None
    # Parametres de campagne lus dans l'adresse d'arrivee (utm_source...).
    utm: dict[str, str] | None = None
    referral_code: str | None = None
    landing_path: str | None = None


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
    # Jeton (acces ou renouvellement) du compte invite avec lequel la personne
    # a pris ses mesures : s'il est valide, ce compte est converti sur place
    # et les mesures suivent sans aucun transfert.
    guest_token: str | None = None
    acquisition: AcquisitionIn | None = None

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
    # Meme role qu'a l'inscription, pour quelqu'un qui avait deja un compte :
    # les mesures prises en invite sont rattachees au compte existant.
    guest_token: str | None = None


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    role: UserRole
    # 2.6 — mot de passe provisoire : l'interface demande d'en choisir un.
    must_change_password: bool = False
    # 13.4 — le mot de passe est bon mais un code de double authentification
    # est attendu : `access_token` et `refresh_token` sont alors vides, et
    # `mfa_token` s'echange contre de vrais jetons via /auth/mfa.
    mfa_required: bool = False
    mfa_token: str | None = None


class MfaIn(BaseModel):
    mfa_token: str
    code: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _valid_new_password(cls, v: str) -> str:
        return validate_password(v)


class OtpRequestIn(BaseModel):
    phone: str


class OtpRequestOut(BaseModel):
    sent: bool
    # Mode developpement uniquement (OTP_DEV_CODE=true) : aucune passerelle SMS
    # n'existe, le code est alors rendu directement. En production le champ est
    # toujours null.
    dev_code: str | None = None


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
