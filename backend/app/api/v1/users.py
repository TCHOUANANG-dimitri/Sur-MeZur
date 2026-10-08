from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.security import hash_password, verify_password
from app.models.users import ClientProfile, User
from app.schemas.auth import PasswordChangeIn
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


@router.post("/me/password")
def change_password(
    payload: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Changer son mot de passe ; obligatoire apres un mot de passe
    provisoire fixe par l'equipe (2.6)."""
    if user.is_guest:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Créez un compte d'abord")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mot de passe actuel incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choisissez un mot de passe différent du précédent")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    return {"changed": True}


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
