from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.misc import Notification
from app.models.users import User
from app.schemas.misc import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )


@router.post("/read")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.read_at.is_(None)
    ).update({"read_at": now})
    db.commit()
    return {"marked_read": True}
