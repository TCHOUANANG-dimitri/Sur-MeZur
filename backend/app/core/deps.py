from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.base import SessionLocal
from app.models.users import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(creds.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def get_current_user_optional(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Like get_current_user, but returns None instead of raising -- for
    endpoints that are browsable anonymously but personalize when logged in
    (e.g. GET /models' liked_by_me)."""
    if creds is None:
        return None
    payload = decode_token(creds.credentials)
    if not payload or payload.get("type") != "access":
        return None
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        return None
    return user


def require_roles(*roles: str):
    def _checker(user: User = Depends(get_current_user)) -> User:
        # Un compte invite porte le role "client" pour reutiliser la chaine de
        # mesure telle quelle, mais il ne doit RIEN pouvoir faire d'autre :
        # ni avatar, ni essayage, ni commande, ni modele communautaire. Le
        # refus se fait ici, une fois pour toutes, plutot que route par route
        # ou un oubli ouvrirait une breche. Les seules routes ouvertes aux
        # invites passent par `require_client_or_guest`.
        if getattr(user, "is_guest", False):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Creez un compte pour acceder a cette fonctionnalite"
            )
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role permissions")
        return user

    return _checker


def require_client_or_guest(user: User = Depends(get_current_user)) -> User:
    """Client inscrit OU invite. Reservee a la prise de mesure : c'est le seul
    parcours que la version web ouvre avant l'inscription."""
    if user.role != "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role permissions")
    return user
