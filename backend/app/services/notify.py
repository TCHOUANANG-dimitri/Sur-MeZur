from sqlalchemy.orm import Session

from app.models.misc import Notification


def notify(db: Session, user_id: str, type_: str, payload: dict) -> None:
    db.add(Notification(user_id=user_id, type=type_, payload=payload))
