"""
Journal des actions de l'administration (13.3, exigence Q6).

Appele par chaque route admin qui modifie des donnees. La ligne est ajoutee
a la meme transaction que la modification : si celle-ci echoue, rien n'est
journalise, et inversement une action reussie est toujours tracee.

Aucune donnee personnelle superflue n'est ecrite dans `summary` (exigence
Q5) : l'identifiant de l'element suffit a retrouver le reste.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.admin import AuditLog
from app.models.users import User


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    real = request.headers.get("x-real-ip")
    if real:
        return real[:64]
    return request.client.host if request.client else None


def record(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    summary: str | None = None,
    details: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "système",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=(summary or "")[:500] or None,
        details=details or {},
        ip=client_ip(request),
    )
    db.add(entry)
    return entry
