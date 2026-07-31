from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.users import ClientProfile, User
from app.schemas.users import ClientProfileOut, MePatchIn, UserOut

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def patch_me(
    payload: MePatchIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/photos/purge")
def purge_photos(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Right-to-erasure endpoint (CDC/doc3 confidentiality requirement).
    Clears stored consent + photo references tied to the client's sessions."""
    user.photo_consent = False
    db.commit()
    return {"purged": True}


@router.get("/client-profile/me", response_model=ClientProfileOut)
def get_my_client_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    return profile
