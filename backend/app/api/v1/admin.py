from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_roles
from app.models.enums import ModerationStatus, OrderStatus, VerificationStatus
from app.models.misc import Review
from app.models.orders import Order
from app.models.payments import CommissionTier, PaymentSplit
from app.models.users import ClientProfile, TailorProfile, User, VerificationDocument
from app.schemas.misc import DisputeResolveIn, ReviewOut, VerificationDecideIn
from app.schemas.orders import OrderOut
from app.schemas.payments import CommissionTierIn, CommissionTierOut
from app.schemas.users import TailorProfileOut, UserOut, VerificationDocumentOut
from app.services.notify import notify

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])


class UserActiveIn(BaseModel):
    is_active: bool


class AdminStatsOut(BaseModel):
    clients: int
    tailors: int
    tailors_pending: int
    suspended: int
    orders_total: int
    orders_by_status: dict[str, int]
    open_disputes: int
    pending_reviews: int
    gmv: float
    commission_earned: float


@router.get("/stats", response_model=AdminStatsOut)
def platform_stats(db: Session = Depends(get_db)):
    """Single call behind the admin overview — the counts the operator needs to
    know whether anything requires attention right now."""
    orders = db.query(Order).all()
    by_status: dict[str, int] = {}
    for o in orders:
        key = o.status.value if hasattr(o.status, "value") else str(o.status)
        by_status[key] = by_status.get(key, 0) + 1

    delivered = [o for o in orders if str(getattr(o.status, "value", o.status)) == "finished_delivered"]
    gmv = sum(float(o.agreed_price or 0) for o in delivered)

    # Commission is what the platform actually keeps, i.e. total minus what the
    # split hands to the tailor.
    commission = 0.0
    for split in db.query(PaymentSplit).all():
        to_tailor = float(split.tailor_immediate_40 or 0) + float(split.escrow_30 or 0) + float(split.balance_30 or 0)
        commission += max(0.0, float(split.total or 0) - to_tailor)

    return AdminStatsOut(
        clients=db.query(func.count(ClientProfile.id)).scalar() or 0,
        tailors=db.query(func.count(TailorProfile.id)).scalar() or 0,
        tailors_pending=db.query(func.count(TailorProfile.id))
        .filter(TailorProfile.verification_status == VerificationStatus.pending)
        .scalar()
        or 0,
        suspended=db.query(func.count(User.id)).filter(User.is_active.is_(False)).scalar() or 0,
        orders_total=len(orders),
        orders_by_status=by_status,
        open_disputes=db.query(func.count(Order.id)).filter(Order.dispute_status == "open").scalar() or 0,
        pending_reviews=db.query(func.count(Review.id))
        .filter(Review.moderation_status == ModerationStatus.visible)
        .scalar()
        or 0,
        gmv=gmv,
        commission_earned=round(commission, 2),
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    role: str | None = None,
    q: str | None = None,
    active: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if active is not None:
        query = query.filter(User.is_active.is_(active))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(User.full_name.ilike(like), User.phone.ilike(like), User.email.ilike(like)))
    return query.order_by(User.created_at.desc()).all()


@router.post("/users/{user_id}/active", response_model=UserOut)
def set_user_active(
    user_id: str,
    payload: UserActiveIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """`is_active` was already enforced at login/refresh but nothing could flip
    it — this is the missing lever, not a new rule."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vous ne pouvez pas suspendre votre propre compte")
    if target.role == "admin" and not payload.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Un compte administrateur ne peut pas être suspendu")

    target.is_active = payload.is_active
    notify(
        db,
        target.id,
        "account_suspended" if not payload.is_active else "account_reactivated",
        {"is_active": payload.is_active},
    )
    db.commit()
    db.refresh(target)
    return target


@router.get("/orders", response_model=list[OrderOut])
def list_all_orders(status_filter: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Order)
    if status_filter:
        query = query.filter(Order.status == status_filter)
    return query.order_by(Order.created_at.desc()).all()


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
