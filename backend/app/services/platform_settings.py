"""
Reglages de la plateforme modifiables depuis l'administration (13.7, 13.8,
11.2, 2.7, 14.4).

Chaque reglage a une valeur par defaut ici ; la table `platform_settings` ne
stocke que ce que l'equipe a change. Un petit cache par processus (quelques
secondes) evite une requete par appel : avec deux workers uvicorn, un
changement est vu partout en moins de `_TTL` secondes.
"""

from __future__ import annotations

import copy
import time
from typing import Any

from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.models.admin import PlatformSetting

DEFAULTS: dict[str, Any] = {
    # 2.7 — comptes invites sans inscription supprimes apres N jours.
    "guest_retention_days": 30,
    # 14.4 — un utilisateur sans activite depuis N jours est compte parti.
    "churn_inactivity_days": 30,
    # 13.5 — deconnexion d'un administrateur inactif.
    "admin_idle_minutes": 30,
    # 13.8 — mode maintenance.
    "maintenance": {"enabled": False, "message": "Sur-MeZur est en maintenance. Merci de revenir dans quelques minutes."},
    # 11.2 — bandeau en haut du site.
    "banner": {"enabled": False, "message": "", "tone": "info", "link_url": "", "link_label": "", "ends_at": None},
    # 13.7 — villes et quartiers proposes.
    "cities": [
        {"name": "Douala", "quartiers": ["Akwa", "Bonanjo", "Bonapriso", "Deido", "Bali", "Makepe", "Bonamoussadi", "Logpom", "PK8", "Ndokoti", "New Bell", "Bepanda"]},
        {"name": "Yaoundé", "quartiers": ["Bastos", "Biyem-Assi", "Mvog-Ada", "Essos", "Mokolo", "Ngoa-Ekelle", "Odza", "Mendong", "Emana", "Nlongkak"]},
        {"name": "Bafoussam", "quartiers": []},
        {"name": "Garoua", "quartiers": []},
        {"name": "Bamenda", "quartiers": []},
        {"name": "Kribi", "quartiers": []},
        {"name": "Limbé", "quartiers": []},
        {"name": "Buea", "quartiers": []},
    ],
    # 13.7 — regles de negociation et de paiement.
    "negotiation_max_rounds": 3,
    "offer_expiry_days": 7,
    "deposit_share": 0.7,
    "tailor_immediate_share": 0.4,
    # 5.5 — alertes de retard.
    "order_no_response_days": 3,
    # 7.5 — un litige ouvert depuis plus de N jours est en alerte.
    "dispute_alert_days": 7,
    # 3.6 — seuils d'alerte qualite des tailleurs.
    "tailor_quality": {"min_rating": 3.5, "max_dispute_rate": 0.15, "max_response_hours": 48, "max_late_rate": 0.3},
    # 10.5 — objectif de la campagne de collecte.
    "collecte_target": {"total": 300, "minimum": 150, "female_share": 0.5},
    # 14.9 — question « Comment nous avez-vous connu ? » a l'inscription.
    "signup_source_question": True,
    # A2 — orientation produit : bascules de fonctionnalite, lues par
    # /api/public/config dans la cle `features`. Elles permettent de rallumer
    # un service plus tard sans toucher au code.
    "features": {
        "tailor_verification": False,
        "payments": False,
        "negotiation": False,
        # "off" | "preview" | "on"  (A2.4 : moteur « preview-v0 » pour l'instant)
        "pattern_generation": "preview",
    },
}

PUBLIC_KEYS = {"banner", "maintenance", "cities", "signup_source_question", "features"}

_TTL = 10.0
_cache: dict[str, tuple[float, Any]] = {}


def _load(db: Session, key: str) -> Any:
    row = db.get(PlatformSetting, key)
    if row is None or row.value is None:
        return copy.deepcopy(DEFAULTS.get(key))
    value = row.value
    default = DEFAULTS.get(key)
    # Un reglage compose (dict) garde les cles ajoutees depuis son
    # enregistrement : la valeur stockee complete la valeur par defaut.
    if isinstance(default, dict) and isinstance(value, dict):
        merged = copy.deepcopy(default)
        merged.update(value)
        return merged
    return value


def get_setting(key: str, db: Session | None = None) -> Any:
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[0] < _TTL:
        return copy.deepcopy(hit[1])
    if db is not None:
        value = _load(db, key)
    else:
        with SessionLocal() as own:
            value = _load(own, key)
    _cache[key] = (now, value)
    return copy.deepcopy(value)


def all_settings(db: Session) -> dict[str, Any]:
    return {key: _load(db, key) for key in DEFAULTS}


def set_setting(db: Session, key: str, value: Any, user_id: str | None) -> Any:
    if key not in DEFAULTS:
        raise KeyError(key)
    row = db.get(PlatformSetting, key)
    if row is None:
        row = PlatformSetting(key=key, value=value, updated_by=user_id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = user_id
    _cache.pop(key, None)
    return value


def invalidate() -> None:
    _cache.clear()
