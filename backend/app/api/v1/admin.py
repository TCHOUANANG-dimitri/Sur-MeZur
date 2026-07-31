from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.enums import ModerationStatus, VerificationStatus
from app.models.misc import Review
from app.models.orders import Order
from app.models.payments import CommissionTier
from app.models.users import TailorProfile, User, VerificationDocument
from app.schemas.misc import DisputeResolveIn, ReviewOut, VerificationDecideIn
from app.schemas.orders import OrderOut
from app.schemas.payments import CommissionTierIn, CommissionTierOut
from app.schemas.users import TailorProfileOut, VerificationDocumentOut
from app.services.notify import notify

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])


@router.get("/verifications", response_model=list[TailorProfileOut])
def list_pending_verifications(db: Session = Depends(get_db)):
    return (
        db.query(TailorProfile)
        .filter(TailorProfile.verification_status == VerificationStatus.pending)
        .all()
    )


@router.get("/verifications/{tailor_id}/documents", response_model=list[VerificationDocumentOut])
def list_verification_documents(tailor_id: str, db: Session = Depends(get_db)):
    tailor = db.get(TailorProfile, tailor_id)
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor not found")
    return db.query(VerificationDocument).filter(VerificationDocument.user_id == tailor.user_id).all()


@router.post("/verifications/{tailor_id}/decide", response_model=TailorProfileOut)
def decide_verification(
    tailor_id: str, payload: VerificationDecideIn, db: Session = Depends(get_db)
):
    tailor = db.get(TailorProfile, tailor_id)
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor not found")
    tailor.verification_status = payload.status
    notify(db, tailor.user_id, "verification_decided", {"status": payload.status.value})
    db.commit()
    db.refresh(tailor)
    return tailor


@router.get("/disputes", response_model=list[OrderOut])
def list_disputes(db: Session = Depends(get_db)):
    return db.query(Order).filter(Order.dispute_status == "open").all()


@router.post("/disputes/{order_id}/resolve", response_model=OrderOut)
def resolve_dispute(order_id: str, payload: DisputeResolveIn, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    order.dispute_status = payload.resolution
    order.dispute_note = payload.note
    db.commit()
    db.refresh(order)
    return order


@router.get("/reviews", response_model=list[ReviewOut])
def list_reviews_for_moderation(db: Session = Depends(get_db)):
    return db.query(Review).order_by(Review.created_at.desc()).all()


@router.post("/reviews/{review_id}/moderate", response_model=ReviewOut)
def moderate_review(review_id: str, status_: ModerationStatus, db: Session = Depends(get_db)):
    review = db.get(Review, review_id)
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    review.moderation_status = status_
    db.commit()
    db.refresh(review)
    return review


@router.get("/commission-tiers", response_model=list[CommissionTierOut])
def list_commission_tiers(db: Session = Depends(get_db)):
    return db.query(CommissionTier).order_by(CommissionTier.min_price).all()


@router.post("/commission-tiers", response_model=CommissionTierOut)
def create_commission_tier(payload: CommissionTierIn, db: Session = Depends(get_db)):
    tier = CommissionTier(**payload.model_dump())
    db.add(tier)
    db.commit()
    db.refresh(tier)
    return tier
