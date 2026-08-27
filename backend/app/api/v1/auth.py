from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.enums import UserRole
from app.models.users import ClientProfile, TailorProfile, User
from app.schemas.auth import (
    LoginIn,
    OtpRequestIn,
    OtpRequestOut,
    OtpVerifyIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    RefreshIn,
    RegisterIn,
    TokenOut,
)
from app.services import vision
from app.services.otp import generate_otp, verify_otp

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_token(user: User) -> TokenOut:
    # Un utilisateur vient de s'authentifier : c'est le moment de charger
    # MediaPipe/SAM en tâche de fond. Placé ici plutôt que dans `login` seul
    # pour couvrir aussi l'inscription et le rafraîchissement de jeton — un
    # habitué qui rouvre l'app ne repasse pas par le formulaire de connexion.
    # L'appel rend la main immédiatement et ne peut pas faire échouer
    # l'authentification (thread démonisé, au plus un par processus).
    vision.warm_up_async()
    return TokenOut(
        access_token=create_access_token(user.id, user.role.value if hasattr(user.role, "value") else user.role),
        refresh_token=create_refresh_token(user.id, user.role.value if hasattr(user.role, "value") else user.role),
        user_id=user.id,
        role=user.role,
    )


@router.post("/register", response_model=TokenOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone already registered")

    user = User(
        role=payload.role,
        phone=payload.phone,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        language=payload.language,
        photo_consent=payload.photo_consent,
    )
    db.add(user)
    db.flush()

    if payload.role == UserRole.client:
        db.add(ClientProfile(user_id=user.id))
    elif payload.role == UserRole.tailor:
        db.add(TailorProfile(
            user_id=user.id,
            tailor_type="individual",
            shop_name=payload.full_name,
            city=payload.city,
            quartier=payload.quartier,
        ))

    db.commit()
    db.refresh(user)
    return _issue_token(user)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone == payload.phone).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid phone or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    return _issue_token(user)


@router.post("/refresh", response_model=TokenOut)
def refresh(payload: RefreshIn, db: Session = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = db.get(User, data["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return _issue_token(user)


@router.post("/otp/request", response_model=OtpRequestOut)
def otp_request(payload: OtpRequestIn):
    code = generate_otp(payload.phone)
    return OtpRequestOut(sent=True, dev_code=code)


@router.post("/otp/verify")
def otp_verify(payload: OtpVerifyIn):
    ok = verify_otp(payload.phone, payload.code)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")
    return {"verified": True}


@router.post("/password/reset/request", response_model=OtpRequestOut)
def password_reset_request(payload: PasswordResetRequestIn, db: Session = Depends(get_db)):
    if not db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account with this phone number")
    code = generate_otp(payload.phone)
    return OtpRequestOut(sent=True, dev_code=code)


@router.post("/password/reset/confirm", response_model=TokenOut)
def password_reset_confirm(payload: PasswordResetConfirmIn, db: Session = Depends(get_db)):
    if not verify_otp(payload.phone, payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")
    user = db.query(User).filter(User.phone == payload.phone).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account with this phone number")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    return _issue_token(user)
