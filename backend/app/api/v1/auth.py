import secrets
import uuid

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
from app.models.measurements import Measurement, MeasurementSession
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


def _guest_from_token(token: str | None, db: Session) -> User | None:
    """Compte invite designe par un jeton, ou None.

    Accepte un jeton d'acces comme de renouvellement : le front envoie le
    second, qui vit 30 jours, pour que l'inscription reste possible longtemps
    apres la prise de mesure. Tout ce qui n'est pas un invite actif est ignore
    plutot que refuse — un jeton perime ne doit pas empecher de s'inscrire.
    """
    if not token:
        return None
    data = decode_token(token)
    if not data or data.get("type") not in ("access", "refresh"):
        return None
    user = db.get(User, data.get("sub"))
    if not user or not user.is_active or not user.is_guest:
        return None
    return user


@router.post("/guest", response_model=TokenOut)
def create_guest(db: Session = Depends(get_db)):
    """Compte invite, pour prendre ses mesures avant de s'inscrire.

    Il reutilise tel quel le role client et donc toute la chaine de mesure
    (session, worker, rattachement du resultat), ce qui evite de rendre
    `client_id` facultatif — une modification de colonne que SQLite ne sait
    pas faire sans reconstruire la table en production.

    Ses droits sont bornes ailleurs : `require_roles` le refuse partout, seules
    les routes de mesure l'acceptent, et ses mensurations lui sont renvoyees
    en partie seulement.
    """
    user = User(
        role=UserRole.client,
        # Identifiant interne unique, impossible a saisir comme numero de
        # telephone : un invite ne peut donc pas se connecter.
        phone=f"guest-{uuid.uuid4().hex[:24]}",
        # Mot de passe aleatoire jamais communique : le compte n'est
        # utilisable que par ses jetons.
        password_hash=hash_password(secrets.token_urlsafe(32)),
        full_name="Invite",
        is_guest=True,
        # Prendre ses mesures, c'est envoyer ses photos pour analyse : le
        # consentement est donne par le geste lui-meme. Il est redemande
        # explicitement a l'inscription.
        photo_consent=True,
    )
    db.add(user)
    db.flush()
    db.add(ClientProfile(user_id=user.id))
    db.commit()
    db.refresh(user)
    return _issue_token(user)


def _transfer_guest_measurements(db: Session, guest: User, target: User) -> None:
    """Rattache les mesures d'un invite a un compte client EXISTANT.

    Utilise a la connexion, quand la personne avait deja un compte : le
    compte invite ne peut pas etre converti, puisque le numero est deja pris.
    """
    guest_profile = db.query(ClientProfile).filter(ClientProfile.user_id == guest.id).first()
    target_profile = db.query(ClientProfile).filter(ClientProfile.user_id == target.id).first()
    if not guest_profile or not target_profile:
        return
    db.query(MeasurementSession).filter(MeasurementSession.client_id == guest_profile.id).update(
        {"client_id": target_profile.id}
    )
    db.query(Measurement).filter(Measurement.client_id == guest_profile.id).update(
        {"client_id": target_profile.id}
    )
    if not target_profile.default_measurement_id and guest_profile.default_measurement_id:
        target_profile.default_measurement_id = guest_profile.default_measurement_id
    # Desactive plutot que supprime : les notifications et le profil vide y
    # font encore reference, et rien n'impose de les nettoyer ici.
    guest.is_active = False


@router.post("/register", response_model=TokenOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone already registered")

    guest = _guest_from_token(payload.guest_token, db) if payload.role == UserRole.client else None
    if guest:
        # Conversion sur place : le profil client, la session et les mesures
        # restent attaches au meme identifiant, rien n'est a transferer.
        guest.phone = payload.phone
        guest.email = payload.email
        guest.password_hash = hash_password(payload.password)
        guest.full_name = payload.full_name
        guest.language = payload.language
        guest.photo_consent = payload.photo_consent
        guest.is_guest = False
        db.commit()
        db.refresh(guest)
        return _issue_token(guest)

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
    guest = _guest_from_token(payload.guest_token, db)
    if guest and guest.id != user.id and user.role == UserRole.client:
        _transfer_guest_measurements(db, guest, user)
        db.commit()
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
