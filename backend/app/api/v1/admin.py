"""
Routes d'administration historiques, partagees par l'administration mobile et
l'administration web. Leurs formats de reponse ne changent pas (l'application
mobile en depend) ; elles gagnent les controles de role (13.1) et le journal
des actions (13.3). Les ecrans propres a l'administration web vivent dans les
routeurs `admin_*.py`.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.api.v1.admin_common import iso
from app.models.catalog import Category, GarmentModel, GarmentModelLike
from app.models.enums import ModerationStatus, VerificationStatus
from app.models.measurements import TryonSession
from app.models.misc import Review
from app.models.operations import VerificationEvent
from app.models.orders import Order
from app.models.payments import CommissionTier
from app.models.users import ClientProfile, TailorProfile, User, VerificationDocument
from app.schemas.catalog import (
    CategoryCreateIn,
    CategoryOut,
    CategoryUpdateIn,
    GarmentModelCreateIn,
    GarmentModelOut,
    GarmentModelUpdateIn,
)
from app.schemas.misc import DisputeResolveIn, ReviewOut, VerificationDecideIn
from app.schemas.orders import OrderOut
from app.schemas.payments import CommissionTierIn, CommissionTierOut
from app.schemas.users import TailorProfileOut, UserOut
from app.services import audit
from app.services.admin_perms import require_perm
from app.services.notify import notify
from app.services.storage import delete_upload, save_upload
from app.services.user_deletion import delete_user_cascade
from app.services.user_stats import money_between

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])


class UserActiveIn(BaseModel):
    is_active: bool
    reason: str | None = None


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
def platform_stats(db: Session = Depends(get_db), _=Depends(require_perm("dashboard"))):
    """Single call behind the admin overview — the counts the operator needs to
    know whether anything requires attention right now."""
    by_status: dict[str, int] = {}
    gmv = 0.0
    for status_, price in db.query(Order.status, Order.agreed_price).all():
        key = status_.value if hasattr(status_, "value") else str(status_)
        by_status[key] = by_status.get(key, 0) + 1
        if key == "finished_delivered":
            gmv += float(price or 0)

    # Commission : ce que la plateforme garde, lu sur le devis accepte des
    # commandes dont l'acompte est paye. (L'ancien calcul partait du
    # sequestre, qui reverse 100 % au tailleur, et affichait toujours 0.)
    _cash, commission = money_between(db, datetime(2000, 1, 1).date(), datetime.now(timezone.utc).date())

    return AdminStatsOut(
        clients=db.query(func.count(ClientProfile.id))
        .join(User, User.id == ClientProfile.user_id)
        .filter(User.is_guest.is_(False))
        .scalar()
        or 0,
        tailors=db.query(func.count(TailorProfile.id)).scalar() or 0,
        tailors_pending=db.query(func.count(TailorProfile.id))
        .filter(TailorProfile.verification_status == VerificationStatus.pending)
        .filter(TailorProfile.user_id.in_(db.query(VerificationDocument.user_id)))
        .scalar()
        or 0,
        suspended=db.query(func.count(User.id))
        .filter(User.is_active.is_(False), User.is_guest.is_(False))
        .scalar()
        or 0,
        orders_total=sum(by_status.values()),
        orders_by_status=by_status,
        open_disputes=db.query(func.count(Order.id)).filter(Order.dispute_status == "open").scalar() or 0,
        pending_reviews=db.query(func.count(Review.id))
        .filter(Review.moderation_status == ModerationStatus.flagged)
        .scalar()
        or 0,
        gmv=gmv,
        commission_earned=commission,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    role: str | None = None,
    q: str | None = None,
    active: bool | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("users.read")),
):
    query = db.query(User).filter(User.is_guest.is_(False))
    if role:
        query = query.filter(User.role == role)
    if active is not None:
        query = query.filter(User.is_active.is_(active))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(User.full_name.ilike(like), User.phone.ilike(like), User.email.ilike(like)))
    users = query.order_by(User.created_at.desc()).all()

    tailor_status = {
        tp.user_id: VerificationStatus(tp.verification_status)
        for tp in db.query(TailorProfile.user_id, TailorProfile.verification_status).filter(
            TailorProfile.user_id.in_([u.id for u in users])
        )
    }
    out = []
    for u in users:
        item = UserOut.model_validate(u)
        item.verification_status = tailor_status.get(u.id)
        out.append(item)
    return out


@router.post("/users/{user_id}/active", response_model=UserOut)
def set_user_active(
    user_id: str,
    payload: UserActiveIn,
    request: Request,
    current: User = Depends(require_perm("users.write")),
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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Un compte administrateur se désactive depuis la page Équipe")

    target.is_active = payload.is_active
    notify(
        db,
        target.id,
        "account_suspended" if not payload.is_active else "account_reactivated",
        {"is_active": payload.is_active, "reason": payload.reason},
    )
    audit.record(
        db, current, "user.suspend" if not payload.is_active else "user.reactivate", "user", target.id,
        summary=payload.reason, request=request,
    )
    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    request: Request,
    current: User = Depends(require_perm("users.delete")),
    db: Session = Depends(get_db),
):
    """
    Suppression DÉFINITIVE d'un compte et de tout ce qui lui appartient
    (commandes, mesures, avatars, messages, documents de vérification...).

    Contrairement à `/users/{id}/active`, il n'y a pas de retour en arrière —
    voir `app.services.user_deletion` pour le détail de ce qui est purgé.
    """
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vous ne pouvez pas supprimer votre propre compte")

    try:
        role = getattr(target.role, "value", target.role)
        delete_user_cascade(db, target)
        audit.record(db, current, "user.delete", "user", user_id, summary=f"compte {role} supprimé", request=request)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Échec de la suppression — rien n'a été modifié")


@router.get("/orders", response_model=list[OrderOut])
def list_all_orders(
    status_filter: str | None = None, db: Session = Depends(get_db), _=Depends(require_perm("orders.read"))
):
    query = db.query(Order)
    if status_filter:
        query = query.filter(Order.status == status_filter)
    return query.order_by(Order.created_at.desc()).all()


@router.get("/verifications", response_model=list[TailorProfileOut])
def list_verifications(
    status_filter: VerificationStatus | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("tailors")),
):
    """Tailleurs ayant soumis au moins un document, du plus récemment mis à
    jour au plus ancien. Sans `status_filter` : toutes les décisions passées
    restent consultables (un tailleur approuvé/refusé ne doit pas disparaître
    de cet écran, seul son statut change). Exclut les tailleurs qui n'ont
    encore rien soumis — ils sont `pending` par défaut dès l'inscription, ce
    qui les rendrait indiscernables d'un vrai dossier en attente."""
    submitted_user_ids = db.query(VerificationDocument.user_id).distinct()
    query = db.query(TailorProfile).filter(TailorProfile.user_id.in_(submitted_user_ids))
    if status_filter:
        query = query.filter(TailorProfile.verification_status == status_filter)
    return query.order_by(TailorProfile.updated_at.desc()).all()


@router.get("/verifications/{tailor_id}/documents")
def list_verification_documents(tailor_id: str, db: Session = Depends(get_db), _=Depends(require_perm("tailors"))):
    tailor = db.get(TailorProfile, tailor_id)
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor not found")
    docs = db.query(VerificationDocument).filter(VerificationDocument.user_id == tailor.user_id).all()
    # `file_url` pointe vers la route controlee (voir admin_tailors.py) : le
    # chemin disque des pieces d'identite ne sort jamais.
    return [
        {
            "id": d.id, "user_id": d.user_id, "type": d.type,
            "file_url": f"/api/admin/verification-documents/{d.id}",
            "status": getattr(d.status, "value", d.status),
            "created_at": iso(d.created_at),
        }
        for d in docs
    ]


@router.post("/verifications/{tailor_id}/decide", response_model=TailorProfileOut)
def decide_verification(
    tailor_id: str,
    payload: VerificationDecideIn,
    request: Request,
    db: Session = Depends(get_db),
    reviewer: User = Depends(require_perm("tailors")),
):
    tailor = db.get(TailorProfile, tailor_id)
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor not found")
    if payload.status not in (VerificationStatus.approved, VerificationStatus.rejected):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Décision inconnue")
    if payload.status == VerificationStatus.rejected and not (payload.reason or "").strip():
        # 3.2 : le tailleur doit savoir quoi corriger.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Le motif du refus est obligatoire")
    tailor.verification_status = payload.status
    # Les documents joints suivent la décision et tracent qui a statué :
    # sans cela ils restaient "pending" indéfiniment.
    for doc in (
        db.query(VerificationDocument)
        .filter(VerificationDocument.user_id == tailor.user_id)
        .all()
    ):
        doc.status = payload.status
        doc.reviewed_by = reviewer.id
    db.add(VerificationEvent(
        tailor_id=tailor.id,
        action=payload.status.value,
        reason=payload.reason,
        actor_id=reviewer.id,
        actor_name=reviewer.full_name,
    ))
    notify(db, tailor.user_id, "verification_decided", {
        "status": payload.status.value,
        "reason": payload.reason,
    })
    audit.record(
        db, reviewer, f"verification.{payload.status.value}", "tailor", tailor.id,
        summary=payload.reason, request=request,
    )
    db.commit()
    db.refresh(tailor)
    return tailor


@router.get("/disputes", response_model=list[OrderOut])
def list_disputes(db: Session = Depends(get_db), _=Depends(require_perm("disputes"))):
    return db.query(Order).filter(Order.dispute_status == "open").all()


@router.post("/disputes/{order_id}/resolve", response_model=OrderOut)
def resolve_dispute(
    order_id: str,
    payload: DisputeResolveIn,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("disputes")),
):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    order.dispute_status = payload.resolution
    order.dispute_note = payload.note
    order.dispute_resolved_at = datetime.now(timezone.utc)
    audit.record(db, current, "dispute.resolve", "order", order.id, summary=payload.resolution, request=request)
    db.commit()
    db.refresh(order)
    return order


@router.get("/reviews", response_model=list[ReviewOut])
def list_reviews_for_moderation(db: Session = Depends(get_db), _=Depends(require_perm("reviews"))):
    return db.query(Review).order_by(Review.created_at.desc()).all()


@router.post("/reviews/{review_id}/moderate", response_model=ReviewOut)
def moderate_review(
    review_id: str,
    status_: ModerationStatus,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("reviews")),
):
    review = db.get(Review, review_id)
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    review.moderation_status = status_
    audit.record(db, current, f"review.{status_.value}", "review", review.id, request=request)
    db.commit()
    db.refresh(review)
    return review


@router.get("/commission-tiers", response_model=list[CommissionTierOut])
def list_commission_tiers(db: Session = Depends(get_db), _=Depends(require_perm("payments", "dashboard"))):
    return db.query(CommissionTier).order_by(CommissionTier.min_price).all()


@router.post("/commission-tiers", response_model=CommissionTierOut)
def create_commission_tier(
    payload: CommissionTierIn,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("payments")),
):
    tier = CommissionTier(**payload.model_dump())
    db.add(tier)
    db.flush()
    audit.record(db, current, "commission.create", "commission_tier", tier.id, details=payload.model_dump(), request=request)
    db.commit()
    db.refresh(tier)
    return tier


@router.patch("/commission-tiers/{tier_id}", response_model=CommissionTierOut)
def update_commission_tier(
    tier_id: str,
    payload: CommissionTierIn,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("payments")),
):
    tier = db.get(CommissionTier, tier_id)
    if not tier:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tranche introuvable")
    before = {"min_price": float(tier.min_price), "max_price": float(tier.max_price) if tier.max_price is not None else None, "rate": float(tier.rate)}
    for field, value in payload.model_dump().items():
        setattr(tier, field, value)
    audit.record(
        db, current, "commission.update", "commission_tier", tier.id,
        details={"avant": before, "après": payload.model_dump()}, request=request,
    )
    db.commit()
    db.refresh(tier)
    return tier


@router.delete("/commission-tiers/{tier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_commission_tier(
    tier_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("payments")),
):
    tier = db.get(CommissionTier, tier_id)
    if not tier:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tranche introuvable")
    audit.record(db, current, "commission.delete", "commission_tier", tier.id, details={"rate": float(tier.rate)}, request=request)
    db.delete(tier)
    db.commit()


# ---------------------------------------------------------------------------
# Categories CRUD
# ---------------------------------------------------------------------------


@router.post("/categories", response_model=CategoryOut)
def create_category(
    payload: CategoryCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("catalog")),
):
    existing = (
        db.query(Category)
        .filter(Category.name == payload.name, Category.gender == payload.gender)
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cette catégorie existe déjà")
    cat = Category(name=payload.name, gender=payload.gender)
    db.add(cat)
    db.flush()
    audit.record(db, current, "category.create", "category", cat.id, summary=cat.name, request=request)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/categories/{cat_id}", response_model=CategoryOut)
def update_category(
    cat_id: str,
    payload: CategoryUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("catalog")),
):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catégorie introuvable")
    if payload.name is not None:
        cat.name = payload.name
    if payload.gender is not None:
        cat.gender = payload.gender
    audit.record(db, current, "category.update", "category", cat.id, summary=cat.name, request=request)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    cat_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("catalog")),
):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catégorie introuvable")
    model_count = db.query(func.count(GarmentModel.id)).filter(GarmentModel.category_id == cat_id).scalar()
    if model_count:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Catégorie utilisée par {model_count} modèle(s) — réaffectez-les avant de supprimer.",
        )
    audit.record(db, current, "category.delete", "category", cat.id, summary=cat.name, request=request)
    db.delete(cat)
    db.commit()


# ---------------------------------------------------------------------------
# Garment models CRUD
# ---------------------------------------------------------------------------


def _get_model_or_404(model_id: str, db: Session) -> GarmentModel:
    model = db.get(GarmentModel, model_id)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable")
    return model


@router.post("/models", response_model=GarmentModelOut)
def admin_create_model(
    payload: GarmentModelCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("catalog")),
):
    if not db.get(Category, payload.category_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catégorie introuvable")
    model = GarmentModel(**payload.model_dump())
    db.add(model)
    db.flush()
    audit.record(db, current, "model.create", "model", model.id, summary=model.name, request=request)
    db.commit()
    db.refresh(model)
    return model


@router.patch("/models/{model_id}", response_model=GarmentModelOut)
def admin_update_model(
    model_id: str,
    payload: GarmentModelUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("catalog")),
):
    model = _get_model_or_404(model_id, db)
    if payload.category_id is not None and not db.get(Category, payload.category_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catégorie introuvable")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(model, field, value)
    audit.record(db, current, "model.update", "model", model.id, summary=model.name, details={"champs": sorted(changes)}, request=request)
    db.commit()
    db.refresh(model)
    return model


@router.post("/models/{model_id}/photos", response_model=GarmentModelOut)
def admin_upload_model_photos(
    model_id: str,
    request: Request,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("catalog")),
):
    model = _get_model_or_404(model_id, db)
    saved = [save_upload(f, "garment-models") for f in files if f is not None]
    if not saved:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucun fichier reçu")
    model.photos = list(model.photos or []) + saved
    if not model.photo_url:
        model.photo_url = model.photos[0]
    audit.record(db, current, "model.photos_add", "model", model.id, summary=f"{len(saved)} photo(s)", request=request)
    db.commit()
    db.refresh(model)
    return model


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_model(
    model_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_perm("catalog")),
):
    model = _get_model_or_404(model_id, db)
    # Une commande garde une reference vers son modele : le supprimer
    # casserait son dossier. On masque plutot.
    if db.query(Order.id).filter(Order.garment_model_id == model_id).first():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Ce modèle est utilisé par des commandes : masquez-le plutôt que de le supprimer.",
        )
    # Cascade sûre : supprimer les likes et détacher les sessions tryon
    db.query(GarmentModelLike).filter(GarmentModelLike.garment_model_id == model_id).delete(
        synchronize_session=False
    )
    db.query(TryonSession).filter(TryonSession.garment_model_id == model_id).update(
        {"garment_model_id": None}, synchronize_session=False
    )
    # Supprimer les fichiers photo
    for url in {model.photo_url, *(model.photos or [])}:
        delete_upload(url)
    audit.record(db, current, "model.delete", "model", model.id, summary=model.name, request=request)
    db.delete(model)
    db.commit()
