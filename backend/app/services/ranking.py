from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import ModerationStatus, OrderStatus
from app.models.misc import Review
from app.models.orders import Order
from app.models.users import TailorProfile


def recompute_tailor_ranking(db: Session, tailor_id: str) -> None:
    tailor = db.get(TailorProfile, tailor_id)
    if not tailor:
        return

    avg_stars = db.scalar(
        select(func.avg(Review.stars)).where(
            Review.tailor_id == tailor_id,
            Review.moderation_status != ModerationStatus.hidden,
        )
    )
    tailor.rating_avg = round(float(avg_stars), 2) if avg_stars is not None else 0

    completed = db.scalar(
        select(func.count(Order.id)).where(
            Order.tailor_id == tailor_id,
            Order.status == OrderStatus.finished_delivered,
        )
    )
    tailor.completed_orders_count = completed or 0

    db.commit()
