from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.order_helpers import require_order_participant
from app.core.deps import get_db
from app.models.enums import ChatMessageType
from app.models.orders import ChatMessage
from app.schemas.orders import ChatMessageIn, ChatMessageOut

router = APIRouter(prefix="/orders/{order_id}/chat", tags=["chat"])


@router.get("", response_model=list[ChatMessageOut])
def list_chat_messages(
    order_and_user: tuple = Depends(require_order_participant), db: Session = Depends(get_db)
):
    order, _ = order_and_user
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.order_id == order.id)
        .order_by(ChatMessage.created_at)
        .all()
    )


@router.post("", response_model=ChatMessageOut)
def send_chat_message(
    payload: ChatMessageIn,
    order_and_user: tuple = Depends(require_order_participant),
    db: Session = Depends(get_db),
):
    order, user = order_and_user
    message = ChatMessage(
        order_id=order.id, sender_id=user.id, body=payload.body, type=ChatMessageType.text
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
