"""
Droits d'administration.

L'equipe est petite (trois personnes) et chacun a acces a tout : un compte
`admin` actif detient toutes les permissions. Les routes continuent de
declarer la permission qu'elles demandent (`require_perm("catalog")`) : si
des roles distincts redeviennent utiles, il suffira de les reintroduire ici.
"""

from __future__ import annotations

from fastapi import Depends

from app.core.deps import require_roles
from app.models.users import User


def has_perm(user: User, perm: str) -> bool:
    return user.role == "admin"


def require_perm(*perms: str):
    """Dependance : un administrateur (toutes les permissions)."""

    def _checker(user: User = Depends(require_roles("admin"))) -> User:
        return user

    return _checker
