"""
Roles d'administration (13.1).

Un compte `admin` porte en plus un `admin_role`. Chaque route admin declare
la permission dont elle a besoin ; le serveur la verifie (exigence Q5),
l'interface ne fait que masquer ce qui n'est pas accessible.

Un `admin_role` vide vaut super_admin : les comptes admin crees avant
l'introduction des roles gardent tous leurs droits.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.core.deps import require_roles
from app.models.users import User

ADMIN_ROLES: dict[str, str] = {
    "super_admin": "Super-administrateur",
    "moderator": "Modérateur",
    "support": "Support",
    "finance": "Finances",
}

# Permission -> roles qui la detiennent (super_admin les a toutes).
PERMISSIONS: dict[str, set[str]] = {
    "dashboard": {"moderator", "support", "finance"},
    "users.read": {"moderator", "support", "finance"},
    "users.write": {"support"},
    # Suppression definitive et fusion : super-administrateur seulement.
    "users.delete": set(),
    "tailors": {"moderator"},
    "catalog": {"moderator"},
    "orders.read": {"support", "finance", "moderator"},
    "orders.write": {"support"},
    "payments": {"finance"},
    "disputes": {"support"},
    "reviews": {"moderator"},
    "measure": {"support", "moderator"},
    "collecte": {"moderator"},
    "comms": {"support"},
    "support": {"support"},
    "growth": {"support", "finance", "moderator"},
    "growth.write": {"support"},
    "security": set(),
}


def admin_role_of(user: User) -> str:
    return user.admin_role or "super_admin"


def has_perm(user: User, perm: str) -> bool:
    if user.role != "admin":
        return False
    role = admin_role_of(user)
    if role == "super_admin":
        return True
    return role in PERMISSIONS.get(perm, set())


def permissions_of(user: User) -> list[str]:
    return sorted(p for p in PERMISSIONS if has_perm(user, p))


def require_perm(*perms: str):
    """Dependance : un admin qui detient AU MOINS une des permissions."""

    def _checker(user: User = Depends(require_roles("admin"))) -> User:
        if not any(has_perm(user, p) for p in perms):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Votre rôle d'administration ne donne pas accès à cette action")
        return user

    return _checker
