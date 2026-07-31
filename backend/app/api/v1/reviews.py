from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.enums import ModerationStatus, OrderStatus
from app.models.misc import Review
from app.models.orders import Order
from app.models.users import ClientProfile, User
from app.schemas.misc import ReviewCreateIn, ReviewOut
from app.services.ranking import recompute_tailor_ranking

router = APIRouter(tags=["reviews"])


@router.post("/orders/{order_id}/review", response_model=ReviewOut)
def create_review(
    order_id: str,
    payload: ReviewCreateIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    order = db.get(Order, order_id)
    if not order or not client or order.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    # RG-11: seul un client ayant terminé une commande peut noter.
    if order.status != OrderStatus.finished_delivered:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Order must be delivered before rating")
    if db.query(Review).filter(Review.order_id == order.id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Order already reviewed")
    if not 1 <= payload.stars <= 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Stars must be between 1 and 5")

    review = Review(
        order_id=order.id,
        client_id=client.id,
        tailor_id=order.tailor_id,
        stars=payload.stars,
        comment=payload.comment,
        moderation_status=ModerationStatus.visible,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    recompute_tailor_ranking(db, order.tailor_id)
    return review


@router.get("/tailors/{tailor_id}/reviews", response_model=list[ReviewOut])
def list_tailor_reviews(tailor_id: str, db: Session = Depends(get_db)):
    return (
        db.query(Review)
        .filter(Review.tailor_id == tailor_id, Review.moderation_status == ModerationStatus.visible)
        .order_by(Review.created_at.desc())
        .all()
    )
