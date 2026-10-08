from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_token(
    subject: str, role: str, expires_delta: timedelta, token_type: str, extra: dict | None = None
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    # `sid` (session administrateur, 13.5) ou `mfa` (etape de double
    # authentification en attente, 13.4).
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str, role: str, sid: str | None = None) -> str:
    return _create_token(
        user_id,
        role,
        timedelta(minutes=settings.access_token_expire_minutes),
        "access",
        {"sid": sid} if sid else None,
    )


def create_refresh_token(user_id: str, role: str, sid: str | None = None) -> str:
    return _create_token(
        user_id,
        role,
        timedelta(days=settings.refresh_token_expire_days),
        "refresh",
        {"sid": sid} if sid else None,
    )


def create_mfa_token(user_id: str, role: str) -> str:
    """Jeton court entre le mot de passe et le code de double
    authentification : il ne donne acces a aucune route."""
    return _create_token(user_id, role, timedelta(minutes=5), "mfa")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
