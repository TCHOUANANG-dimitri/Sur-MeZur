from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.order_helpers import require_order_participant
from app.core.deps import get_current_user, get_db
from app.models.enums import ChatMessageType, ModificationStatus, OfferActor
from app.models.orders import ChatMessage, Modification, Order
from app.models.users import ClientProfile, TailorProfile, User
from app.schemas.orders import ModificationCreateIn, ModificationOut
from app.services.notify import notify

router = APIRouter(tags=["modifications"])


def _counterpart_user_id(order: Order, actor: OfferActor, db: Session) -> str | None:
    if actor == OfferActor.tailor:
        client = db.get(ClientProfile, order.client_id)
        return client.user_id if client else None
    tailor = db.get(TailorProfile, order.tailor_id)
    return tailor.user_id if tailor else None


@router.post("/orders/{order_id}/modifications", response_model=ModificationOut)
def propose_modification(
    payload: ModificationCreateIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    order, user = order_and_user
    actor = OfferActor.tailor if user.role == "tailor" else OfferActor.client

    modification = Modification(
        order_id=order.id,
        proposed_by=actor,
        modified_model_asset_url=payload.modified_model_asset_url,
        accessory_price_delta=payload.accessory_price_delta,
        new_garment_price=payload.new_garment_price,
        justification=payload.justification,
        status=ModificationStatus.proposed,
    )
    db.add(modification)
    db.flush()

    db.add(
        ChatMessage(
            order_id=order.id,
            sender_id=user.id,
            body=payload.justification,
            modification_id=modification.id,
            type=ChatMessageType.modification,
        )
    )

    counterpart_id = _counterpart_user_id(order, actor, db)
    if counterpart_id:
        notify(db, counterpart_id, "modification_proposed", {"order_id": order.id, "modification_id": modification.id})

    db.commit()
    db.refresh(modification)
    return modification


@router.get("/orders/{order_id}/modifications", response_model=list[ModificationOut])
def list_modifications(
    order_and_user: tuple = Depends(require_order_participant), db: Session = Depends(get_db)
):
    order, _ = order_and_user
    return (
        db.query(Modification)
        .filter(Modification.order_id == order.id)
        .order_by(Modification.created_at.desc())
        .all()
    )


def _get_modification_and_order(modification_id: str, user: User, db: Session) -> tuple[Modification, Order]:
    modification = db.get(Modification, modification_id)
    if not modification:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modification not found")
    # require_order_participant is a plain function under the FastAPI decorator;
    # calling it positionally here (outside dependency injection) reuses the
    # same participant/403 check.
    order, _ = require_order_participant(modification.order_id, user, db)
    return modification, order


@router.post("/modifications/{modification_id}/accept", response_model=ModificationOut)
def accept_modification(
    modification_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    modification, order = _get_modification_and_order(modification_id, user, db)

    modification.status = ModificationStatus.accepted
    order.agreed_price = modification.new_garment_price
    db.add(
        ChatMessage(
            order_id=order.id,
            sender_id=user.id,
            body="Modification acceptée.",
            modification_id=modification.id,
            type=ChatMessageType.system,
        )
    )
    db.commit()
    db.refresh(modification)
    return modification


@router.post("/modifications/{modification_id}/refuse", response_model=ModificationOut)
def refuse_modification(
    modification_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    modification, _order = _get_modification_and_order(modification_id, user, db)

    # RG-18: refus -> non appliqué, aucune retenue au client (le tailleur assume).
    modification.status = ModificationStatus.refused
    db.add(
        ChatMessage(
            order_id=modification.order_id,
            sender_id=user.id,
            body="Modification refusée : le prix et le modèle initiaux restent en vigueur.",
            modification_id=modification.id,
            type=ChatMessageType.system,
        )
    )
    db.commit()
    db.refresh(modification)
    return modification
