from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.operations import ReviewReport
from app.models.users import TailorProfile
from app.services.activity import utcnow
from app.models.enums import ModerationStatus, OrderStatus
from app.models.misc import Review
from app.models.orders import Order
from app.models.users import ClientProfile, User
from app.schemas.misc import ReviewCreateIn, ReviewOut, ReviewReplyIn, ReviewReportIn
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
    # Un avis signale reste visible tant que l'equipe n'a pas tranche : seul
    # un avis masque disparait.
    reviews = (
        db.query(Review)
        .filter(Review.tailor_id == tailor_id, Review.moderation_status != ModerationStatus.hidden)
        .order_by(Review.created_at.desc())
        .all()
    )
    out = []
    for r in reviews:
        item = ReviewOut.model_validate(r)
        if r.reply_status == "hidden":
            item.tailor_reply = None
            item.tailor_reply_at = None
        out.append(item)
    return out


@router.post("/reviews/{review_id}/report", status_code=status.HTTP_201_CREATED)
def report_review(
    review_id: str,
    payload: ReviewReportIn,
    user: User = Depends(require_roles("client", "tailor")),
    db: Session = Depends(get_db),
):
    """8.3 — un client ou un tailleur signale un avis ; il remonte dans la
    file de moderation de l'administration."""
    review = db.get(Review, review_id)
    if not review or review.moderation_status == ModerationStatus.hidden:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Avis introuvable")
    reason = (payload.reason or "").strip()
    if len(reason) < 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Précisez le motif du signalement")
    already = (
        db.query(ReviewReport)
        .filter(ReviewReport.review_id == review.id, ReviewReport.reporter_id == user.id, ReviewReport.status == "open")
        .first()
    )
    if not already:
        db.add(ReviewReport(review_id=review.id, reporter_id=user.id, reason=reason[:1000]))
    if review.moderation_status == ModerationStatus.visible:
        review.moderation_status = ModerationStatus.flagged
    db.commit()
    return {"reported": True}


@router.post("/reviews/{review_id}/reply", response_model=ReviewOut)
def reply_to_review(
    review_id: str,
    payload: ReviewReplyIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """8.4 — reponse publique du tailleur concerne, moderable par l'equipe."""
    review = db.get(Review, review_id)
    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not review or not tailor or review.tailor_id != tailor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Avis introuvable")
    reply = (payload.reply or "").strip()
    if not reply:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La réponse est vide")
    review.tailor_reply = reply[:2000]
    review.tailor_reply_at = utcnow()
    review.reply_status = "visible"
    db.commit()
    db.refresh(review)
    return review
