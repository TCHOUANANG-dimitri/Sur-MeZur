"""
Origine des inscriptions (14.9 a 14.11).

`capture` est appele a l'inscription : il range ce que la personne a declare
et ce que le site a lu dans l'adresse d'arrivee, puis en deduit un canal et
une campagne quand c'est possible. L'equipe complete ou corrige ensuite
depuis l'administration (`qualify`).
"""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.acquisition import AcquisitionChannel, AcquisitionComment, Campaign, UserAcquisition
from app.models.users import User
from app.services.activity import utcnow

DEFAULT_CHANNELS: list[tuple[str, str, bool]] = [
    # (code, libelle, propose dans « Comment nous avez-vous connu ? »)
    ("bouche_a_oreille", "Bouche-à-oreille", True),
    ("facebook", "Facebook", True),
    ("whatsapp", "WhatsApp", True),
    ("tiktok", "TikTok", True),
    ("instagram", "Instagram", True),
    ("tailleur", "Un tailleur", True),
    ("agent_terrain", "Un agent de terrain", True),
    ("salon_evenement", "Salon ou événement", True),
    ("autre", "Autre", True),
    ("recherche_web", "Recherche Google", False),
    ("sms", "Campagne SMS", False),
    ("partenariat", "Partenariat", False),
    ("demarchage", "Démarchage", False),
]

UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


def seed_channels(db: Session) -> None:
    if db.query(AcquisitionChannel.id).first():
        return
    for i, (code, name, self_reportable) in enumerate(DEFAULT_CHANNELS):
        db.add(AcquisitionChannel(code=code, name=name, self_reportable=self_reportable, sort_order=i))
    db.commit()


def _clean(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value[:limit] or None


def _campaign_by_code(db: Session, code: str | None) -> Campaign | None:
    if not code:
        return None
    return db.query(Campaign).filter(func.lower(Campaign.code) == code.strip().lower()).first()


def _channel_by_code(db: Session, code: str | None) -> AcquisitionChannel | None:
    if not code:
        return None
    return db.query(AcquisitionChannel).filter(func.lower(AcquisitionChannel.code) == code.strip().lower()).first()


def capture(db: Session, user: User, data, platform: str) -> UserAcquisition:
    """`data` : un `AcquisitionIn` ou None."""
    row = db.query(UserAcquisition).filter(UserAcquisition.user_id == user.id).first()
    if row is None:
        row = UserAcquisition(user_id=user.id, utm={})
        db.add(row)
    row.platform = platform
    if data is None:
        return row

    utm = {k: _clean(v, 120) for k, v in (data.utm or {}).items() if k in UTM_KEYS and _clean(v, 120)}
    row.utm = utm
    row.referral_code = _clean(data.referral_code, 64)
    row.landing_path = _clean(data.landing_path, 300)

    declared = _channel_by_code(db, data.source)
    row.self_reported_code = declared.code if declared else None
    row.self_reported_other = _clean(data.source_other, 255)

    # Campagne : code promo / parrainage d'abord, puis utm_campaign.
    campaign = _campaign_by_code(db, row.referral_code) or _campaign_by_code(db, utm.get("utm_campaign"))
    row.campaign_id = campaign.id if campaign else None
    # Canal : celui de la campagne, sinon celui que nomme utm_source, sinon
    # ce que la personne a declare.
    channel = None
    if campaign and campaign.channel_id:
        channel = db.get(AcquisitionChannel, campaign.channel_id)
    channel = channel or _channel_by_code(db, utm.get("utm_source")) or declared
    row.channel_id = channel.id if channel else None
    if row.referral_code and not campaign:
        # Code de parrainage d'une personne : on le garde comme origine.
        row.referrer = row.referral_code
    return row


def qualify(
    db: Session,
    target: User,
    author: User,
    channel_id: str | None,
    campaign_id: str | None,
    referrer: str | None,
    method: str | None,
    body: str | None,
) -> AcquisitionComment:
    row = db.query(UserAcquisition).filter(UserAcquisition.user_id == target.id).first()
    if row is None:
        row = UserAcquisition(user_id=target.id, utm={}, platform=target.signup_platform)
        db.add(row)
    row.channel_id = channel_id
    row.campaign_id = campaign_id
    row.referrer = _clean(referrer, 255)
    row.qualified = True
    row.qualified_at = utcnow()
    row.qualified_by = author.id
    comment = AcquisitionComment(
        user_id=target.id,
        author_id=author.id,
        author_name=author.full_name,
        channel_id=channel_id,
        campaign_id=campaign_id,
        referrer=_clean(referrer, 255),
        method=_clean(method, 255),
        body=(body or "").strip() or None,
    )
    db.add(comment)
    return comment
