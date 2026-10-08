from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.v1.order_helpers import offer_expiry, require_order_participant
from app.core.deps import get_db, require_roles
from app.models.enums import OfferActor, OfferStatus, OrderStatus
from app.models.operations import DisputeMessage, FitFeedback
from app.models.orders import Offer, Order
from app.services.storage import save_upload
from app.models.users import ClientProfile, TailorProfile, User
from pydantic import BaseModel

from app.schemas.orders import (
    OrderAcceptIn,
    OrderCancelIn,
    OrderCreateIn,
    OrderDeclineIn,
    OrderOut,
    OrderStatusIn,
)
from app.services.activity import utcnow
from app.services.notify import notify
from app.services.platform_settings import get_setting as get_platform_setting


class DisputeOpenIn(BaseModel):
    note: str
    # 7.5 : cause du litige (retard, mesures, qualite, non_livraison,
    # paiement, autre), pour les statistiques des causes frequentes.
    category: str | None = None


class DisputeMessageIn(BaseModel):
    body: str


class FitFeedbackIn(BaseModel):
    result: str  # good | alteration | too_tight | too_loose
    adjustments: list[dict] = []
    comment: str | None = None


DISPUTE_CATEGORIES = {"retard", "mesures", "qualite", "non_livraison", "paiement", "communication", "autre"}
FIT_RESULTS = {"good", "alteration", "too_tight", "too_loose"}

# A2.2 — parcours simple sans negociation : le tailleur avance la commande
# d'un statut a l'autre. L'acceptation et le refus passent par des routes
# dediees (/accept, /decline) ; l'admin garde toute liberte sur /status.
_ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.new: {OrderStatus.in_progress},
    OrderStatus.in_progress: {OrderStatus.ready_for_pickup},
    OrderStatus.ready_for_pickup: {OrderStatus.finished_delivered, OrderStatus.finished_not_delivered},
    OrderStatus.finished_not_delivered: {OrderStatus.finished_delivered},
    OrderStatus.finished_delivered: set(),
    OrderStatus.cancelled: set(),
    OrderStatus.declined: set(),
}

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderOut)
def create_order(
    payload: OrderCreateIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client profile not found")
    tailor = db.get(TailorProfile, payload.tailor_id)
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor not found")

    order = Order(
        client_id=client.id,
        tailor_id=payload.tailor_id,
        type=payload.type,
        garment_model_id=payload.garment_model_id,
        ready_to_wear_id=payload.ready_to_wear_id,
        fabric_id=payload.fabric_id,
        measurement_id=payload.measurement_id,
        accessories=payload.accessories,
        client_notes=payload.client_notes,
        status=OrderStatus.new,
        priority=payload.priority,
        reception_mode=payload.reception_mode,
        desired_date=payload.desired_date,
        budget_amount=payload.budget_amount,
        current_offer_round=1,
    )
    db.add(order)
    db.flush()

    features = get_platform_setting("features") or {}
    if features.get("negotiation", False):
        # Ancien parcours (negociation) : le client fait la premiere offre.
        db.add(
            Offer(
                order_id=order.id,
                actor=OfferActor.client,
                round=1,
                amount=payload.budget_amount or 0,
                status=OfferStatus.pending,
                expires_at=offer_expiry(),
            )
        )
    notify(
        db,
        tailor.user_id,
        "order_received",
        {"order_id": order.id, "budget_amount": payload.budget_amount},
    )
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/accept", response_model=OrderOut)
def accept_order(
    payload: OrderAcceptIn = OrderAcceptIn(),
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    """A2.2 — le tailleur accepte une commande en attente et fixe le prix
    convenu (element d'information, sans aucun paiement)."""
    order, user = order_and_user
    if user.role != "tailor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le tailleur peut accepter la commande")
    if order.status != OrderStatus.new:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cette commande n'est plus en attente")
    order.status = OrderStatus.in_progress
    order.agreed_price = payload.agreed_price
    order.delivery_fee = payload.delivery_fee
    client = db.get(ClientProfile, order.client_id)
    if client:
        notify(db, client.user_id, "order_accepted", {"order_id": order.id, "agreed_price": payload.agreed_price})
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/decline", response_model=OrderOut)
def decline_order(
    payload: OrderDeclineIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    """A2.2 — le tailleur refuse une commande en attente, avec une raison."""
    order, user = order_and_user
    if user.role != "tailor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le tailleur peut refuser la commande")
    if order.status != OrderStatus.new:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cette commande n'est plus en attente")
    order.status = OrderStatus.declined
    order.decline_reason = payload.reason
    client = db.get(ClientProfile, order.client_id)
    if client:
        notify(db, client.user_id, "order_declined", {"order_id": order.id, "reason": payload.reason})
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order(
    payload: OrderCancelIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    """A2.2 — le client annule sa commande tant qu'elle est en attente."""
    order, user = order_and_user
    if user.role not in ("client", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le client (ou un administrateur) peut annuler")
    if order.status != OrderStatus.new:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cette commande n'est plus en attente")
    order.status = OrderStatus.cancelled
    order.cancel_reason = payload.reason
    order.cancelled_by = user.role.value if hasattr(user.role, "value") else user.role
    order.cancelled_at = utcnow()
    tailor = db.get(TailorProfile, order.tailor_id)
    if user.role == "client" and tailor:
        notify(db, tailor.user_id, "order_cancelled", {"order_id": order.id})
    db.commit()
    db.refresh(order)
    return order


@router.get("", response_model=list[OrderOut])
def list_orders(
    status_filter: OrderStatus | None = None,
    user: User = Depends(require_roles("client", "tailor")),
    db: Session = Depends(get_db),
):
    query = db.query(Order)
    if user.role == "client":
        client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
        query = query.filter(Order.client_id == client.id if client else Order.id.is_(None))
    else:
        tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
        query = query.filter(Order.tailor_id == tailor.id if tailor else Order.id.is_(None))
    if status_filter:
        query = query.filter(Order.status == status_filter)
    return query.order_by(Order.created_at.desc()).all()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_and_user: tuple = Depends(require_order_participant)):
    order, _ = order_and_user
    return order


@router.post("/{order_id}/status", response_model=OrderOut)
def set_order_status(
    payload: OrderStatusIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    order, user = order_and_user
    if user.role not in ("tailor", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the tailor can update order status")

    previous = order.status if isinstance(order.status, OrderStatus) else OrderStatus(order.status)
    # A2.2 : parcours en escalier sans negociation. L'acceptation et le refus
    # passent par les routes dediees ; l'admin, lui, reste libre de tout
    # rattrapage de statut (annulation, remboursement, correction).
    if payload.status != previous and user.role != "admin":
        if payload.status not in _ALLOWED_TRANSITIONS.get(previous, set()):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Transition {previous.value} -> {payload.status.value} impossible",
            )
    order.status = payload.status

    # Keep the client informed of every step the tailor takes, not just pickup:
    # tracking is only useful if each transition reaches them.
    if payload.status != previous:
        client = db.get(ClientProfile, order.client_id)
        if client:
            notification_type = {
                OrderStatus.in_progress: "order_in_progress",
                OrderStatus.ready_for_pickup: "order_ready_for_pickup",
                OrderStatus.finished_delivered: "order_delivered",
                OrderStatus.finished_not_delivered: "order_not_delivered",
            }.get(payload.status)
            if notification_type:
                notify(
                    db,
                    client.user_id,
                    notification_type,
                    {"order_id": order.id, "status": payload.status.value},
                )

    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/dispute", response_model=OrderOut)
def open_dispute(
    payload: DisputeOpenIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    """Compensates the absence of full escrow (CDC §10.2 'Litiges'): either
    party can flag a non-delivery/dispute for admin review."""
    order, user = order_and_user
    order.dispute_status = "open"
    order.dispute_note = payload.note
    order.dispute_opened_at = datetime.now(timezone.utc)
    order.dispute_opened_by = "tailor" if user.role == "tailor" else "client"
    order.dispute_category = payload.category if payload.category in DISPUTE_CATEGORIES else "autre"
    order.dispute_resolved_at = None
    db.commit()
    db.refresh(order)
    return order


def _party_role(order: Order, user: User, db: Session) -> str:
    if user.role == "tailor":
        return "tailor"
    if user.role == "admin":
        return "admin"
    return "client"


@router.get("/{order_id}/dispute/messages")
def list_dispute_messages(
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    """7.3 — echanges du litige vus par une partie : les messages qui lui
    sont adresses et ceux qu'elle a ecrits."""
    order, user = order_and_user
    role = _party_role(order, user, db)
    rows = (
        db.query(DisputeMessage)
        .filter(DisputeMessage.order_id == order.id)
        .order_by(DisputeMessage.created_at)
        .all()
    )
    visible = [
        m for m in rows
        if role == "admin" or m.author_id == user.id or (m.author_role == "admin" and m.audience in (role, "both"))
    ]
    return [
        {
            "id": m.id,
            "author_name": m.author_name,
            "author_role": m.author_role,
            "body": m.body,
            "attachment_url": m.attachment_url,
            "requests_photo": m.requests_photo,
            "created_at": m.created_at,
        }
        for m in visible
    ]


@router.post("/{order_id}/dispute/messages", status_code=status.HTTP_201_CREATED)
def post_dispute_message(
    body: str = Form(...),
    photo: UploadFile | None = File(None),
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    """7.3 — reponse d'une partie a l'equipe, avec photo facultative."""
    order, user = order_and_user
    if not order.dispute_status:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucun litige sur cette commande")
    text = (body or "").strip()
    if not text and photo is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Message vide")
    url = save_upload(photo, "disputes") if photo is not None else None
    role = _party_role(order, user, db)
    db.add(DisputeMessage(
        order_id=order.id,
        author_id=user.id,
        author_name=user.full_name,
        author_role=role,
        audience="admin",
        body=text or "(photo)",
        attachment_url=url,
    ))
    db.commit()
    return {"sent": True}


@router.post("/{order_id}/fit-feedback", status_code=status.HTTP_201_CREATED)
def client_fit_feedback(
    payload: FitFeedbackIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    """5.6 — retour d'essayage donne par le client ou le tailleur."""
    order, user = order_and_user
    if payload.result not in FIT_RESULTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Résultat inconnu")
    db.add(FitFeedback(
        order_id=order.id,
        result=payload.result,
        adjustments=payload.adjustments[:20],
        comment=(payload.comment or "")[:2000] or None,
        source="tailor" if user.role == "tailor" else "client",
        author_id=user.id,
    ))
    db.commit()
    return {"recorded": True}
