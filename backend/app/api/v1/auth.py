import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db
from app.core.security import (
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.admin import AdminSession
from app.models.enums import UserRole
from app.models.measurements import Measurement, MeasurementSession
from app.models.users import ClientProfile, TailorProfile, User
from app.schemas.auth import (
    LoginIn,
    MfaIn,
    OtpRequestIn,
    OtpRequestOut,
    OtpVerifyIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    RefreshIn,
    RegisterIn,
    TokenOut,
)
from app.services import activity, totp, vision
from app.services.acquisition import capture as capture_acquisition
from app.services.otp import generate_otp, verify_otp
from app.services.phone import normalize_phone
from app.services.platform_settings import get_setting
from app.services import rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])

# Message unique quand la reinitialisation en libre-service est fermee : aucun
# code n'est envoye (pas de passerelle SMS) et le seul secours est humain.
RESET_DISABLED_MESSAGE = (
    "Contactez le support : un mot de passe provisoire vous sera communiqué."
)


def _role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else user.role


def _issue_token(
    user: User,
    db: Session | None = None,
    request: Request | None = None,
    sid: str | None = None,
) -> TokenOut:
    # Un utilisateur vient de s'authentifier : c'est le moment de charger
    # MediaPipe/SAM en tâche de fond. Placé ici plutôt que dans `login` seul
    # pour couvrir aussi l'inscription et le rafraîchissement de jeton — un
    # habitué qui rouvre l'app ne repasse pas par le formulaire de connexion.
    # L'appel rend la main immédiatement et ne peut pas faire échouer
    # l'authentification (thread démonisé, au plus un par processus).
    vision.warm_up_async()
    # 13.5 : chaque connexion d'un administrateur ouvre une session, dont
    # l'identifiant voyage dans les jetons et peut etre revoquee.
    if _role(user) == "admin" and sid is None and db is not None:
        sid = activity.open_admin_session(db, user, request).id
        db.commit()
    return TokenOut(
        access_token=create_access_token(user.id, _role(user), sid),
        refresh_token=create_refresh_token(user.id, _role(user), sid),
        user_id=user.id,
        role=user.role,
        must_change_password=bool(user.must_change_password),
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
def create_guest(request: Request, db: Session = Depends(get_db)):
    """Compte invite, pour prendre ses mesures avant de s'inscrire.

    Il reutilise tel quel le role client et donc toute la chaine de mesure
    (session, worker, rattachement du resultat), ce qui evite de rendre
    `client_id` facultatif — une modification de colonne que SQLite ne sait
    pas faire sans reconstruire la table en production.

    Ses droits sont bornes ailleurs : `require_roles` le refuse partout, seules
    les routes de mesure l'acceptent, et ses mensurations lui sont renvoyees
    en partie seulement.
    """
    rate_limit.check("guest_ip", rate_limit.client_ip(request))
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
        signup_platform="web",
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
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    rate_limit.check("register_ip", rate_limit.client_ip(request))
    phone = normalize_phone(payload.phone)
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indiquez un numéro de téléphone")
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone already registered")

    guest = _guest_from_token(payload.guest_token, db) if payload.role == UserRole.client else None
    if guest:
        # Conversion sur place : le profil client, la session et les mesures
        # restent attaches au meme identifiant, rien n'est a transferer.
        guest.phone = phone
        guest.email = payload.email
        guest.password_hash = hash_password(payload.password)
        guest.full_name = payload.full_name
        guest.language = payload.language
        guest.photo_consent = payload.photo_consent
        guest.is_guest = False
        guest.city = payload.city
        guest.signup_platform = activity.platform_of(request)
        guest.guest_converted_at = activity.utcnow()
        # L'anciennete d'un compte part de son inscription : les statistiques
        # d'utilisateurs (14.2) le comptent le jour ou il devient un vrai
        # compte, pas le jour de sa mesure en invite.
        guest.created_at = activity.utcnow()
        capture_acquisition(db, guest, payload.acquisition, guest.signup_platform)
        activity.record_login(db, guest, request, "register")
        db.commit()
        db.refresh(guest)
        return _issue_token(guest, db, request)

    user = User(
        role=payload.role,
        phone=phone,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        language=payload.language,
        photo_consent=payload.photo_consent,
        city=payload.city,
        signup_platform=activity.platform_of(request),
    )
    db.add(user)
    db.flush()
    capture_acquisition(db, user, payload.acquisition, user.signup_platform)
    activity.record_login(db, user, request, "register")

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
    return _issue_token(user, db, request)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    # 1.5 : 10 essais par 15 min, par numero ET par IP.
    ip = rate_limit.client_ip(request)
    rate_limit.check("login_phone", normalize_phone(payload.phone))
    rate_limit.check("login_ip", ip)
    user = db.query(User).filter(User.phone == normalize_phone(payload.phone)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        if user:
            activity.record_login(db, user, request, "password", success=False)
            db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid phone or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    guest = _guest_from_token(payload.guest_token, db)
    if guest and guest.id != user.id and user.role == UserRole.client:
        _transfer_guest_measurements(db, guest, user)
        db.commit()
    if _role(user) == "admin" and user.totp_enabled and user.totp_secret:
        # 13.4 : le mot de passe ne suffit pas, le code est demande ensuite.
        return TokenOut(
            access_token="",
            refresh_token="",
            user_id=user.id,
            role=user.role,
            mfa_required=True,
            mfa_token=create_mfa_token(user.id, _role(user)),
        )
    activity.record_login(db, user, request, "password")
    db.commit()
    return _issue_token(user, db, request)


@router.post("/mfa", response_model=TokenOut)
def login_mfa(payload: MfaIn, request: Request, db: Session = Depends(get_db)):
    """Seconde etape de connexion d'un administrateur protege par la double
    authentification (13.4)."""
    rate_limit.check("mfa_token", payload.mfa_token)
    data = decode_token(payload.mfa_token)
    if not data or data.get("type") != "mfa":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Étape de connexion expirée, recommencez")
    user = db.get(User, data["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if not totp.verify(user.totp_secret, payload.code):
        activity.record_login(db, user, request, "mfa", success=False)
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code incorrect")
    activity.record_login(db, user, request, "mfa")
    db.commit()
    return _issue_token(user, db, request)


@router.post("/refresh", response_model=TokenOut)
def refresh(payload: RefreshIn, request: Request, db: Session = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = db.get(User, data["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    sid = data.get("sid")
    if _role(user) == "admin" and sid:
        # Le renouvellement automatique du jeton ne prolonge pas la session :
        # seule une action reelle le fait. Un administrateur parti de son
        # poste est donc bien deconnecte au bout du delai d'inactivite.
        error = activity.check_admin_session(
            db, sid, user, request, int(get_setting("admin_idle_minutes", db) or 0), extend=False
        )
        if error:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, error)
    return _issue_token(user, db, request, sid=sid)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshIn, db: Session = Depends(get_db)):
    """Ferme la session administrateur designee par le jeton (13.5). Sans
    effet pour les autres comptes, dont les jetons sont sans etat."""
    data = decode_token(payload.refresh_token)
    sid = data.get("sid") if data else None
    if sid:
        session = db.get(AdminSession, sid)
        if session and session.revoked_at is None:
            session.revoked_at = activity.utcnow()
            session.revoked_reason = "logout"
            db.commit()


@router.post("/otp/request", response_model=OtpRequestOut)
def otp_request(payload: OtpRequestIn):
    phone = normalize_phone(payload.phone)
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indiquez un numéro de téléphone")
    code = generate_otp(phone)
    return OtpRequestOut(sent=True, dev_code=code if settings.otp_dev_code else None)


@router.post("/otp/verify")
def otp_verify(payload: OtpVerifyIn):
    ok = verify_otp(normalize_phone(payload.phone), payload.code)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")
    return {"verified": True}


@router.post("/password/reset/request", response_model=OtpRequestOut)
def password_reset_request(payload: PasswordResetRequestIn, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indiquez un numéro de téléphone")
    user = db.query(User).filter(User.phone == phone).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account with this phone number")
    if _role(user) == "admin":
        # Tant qu'aucun SMS n'est envoye, le code est renvoye a l'ecran : le
        # laisser fonctionner pour un administrateur permettrait a quiconque
        # connait son numero de prendre la main sur l'administration. Un
        # administrateur passe par un super-administrateur (2.6).
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Un compte administrateur se réinitialise depuis l'administration, par un super-administrateur",
        )
    if not settings.otp_dev_code:
        # 1.3 : plus de reinitialisation en libre-service en production. Le
        # code ne peut pas etre remis a l'ecran (prise de controle de compte)
        # et aucun SMS n'est envoye : on ferme la route et on renvoie vers le
        # support, qui cree un mot de passe provisoire (fonction 2.6).
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, RESET_DISABLED_MESSAGE)
    code = generate_otp(phone)
    return OtpRequestOut(sent=True, dev_code=code)


@router.post("/password/reset/confirm", response_model=TokenOut)
def password_reset_confirm(payload: PasswordResetConfirmIn, db: Session = Depends(get_db)):
    if not settings.otp_dev_code:
        # Sans code remis ni SMS, cette route ne doit pas non plus rester
        # ouverte : la reinitialisation en libre-service est fermee (1.3).
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, RESET_DISABLED_MESSAGE)
    if not verify_otp(normalize_phone(payload.phone), payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")
    user = db.query(User).filter(User.phone == normalize_phone(payload.phone)).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account with this phone number")
    if _role(user) == "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Opération non autorisée pour un administrateur")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    db.refresh(user)
    return _issue_token(user)
