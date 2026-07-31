from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.payments import CommissionTier

DEFAULT_TIERS = [
    (0, 15000, 0.10),
    (15001, 50000, 0.08),
    (50001, 150000, 0.06),
    (150001, None, 0.05),
]


def seed_commission_tiers(db: Session) -> None:
    if db.scalar(select(CommissionTier).limit(1)) is not None:
        return
    for min_price, max_price, rate in DEFAULT_TIERS:
        db.add(CommissionTier(min_price=min_price, max_price=max_price, rate=rate))
    db.commit()


def commission_rate_for(db: Session, amount: float) -> float:
    tiers = db.scalars(select(CommissionTier).order_by(CommissionTier.min_price)).all()
    for tier in tiers:
        lo = float(tier.min_price)
        hi = float(tier.max_price) if tier.max_price is not None else None
        if amount >= lo and (hi is None or amount <= hi):
            return float(tier.rate)
    # Plancher de secours si aucune tranche ne matche (barème mal configuré)
    return 0.05


def compute_commission(db: Session, total: float) -> tuple[float, float, float]:
    rate = commission_rate_for(db, total)
    commission_amount = round(total * rate, 2)
    net_to_tailor = round(total - commission_amount, 2)
    return rate, commission_amount, net_to_tailor
