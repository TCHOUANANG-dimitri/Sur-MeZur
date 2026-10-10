from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_roles
from app.models.enums import TailorType, UserRole, VerificationStatus
from app.models.operations import VerificationEvent
from app.models.users import TailorProfile, User, VerificationDocument
from app.schemas.users import TailorProfileOut, TailorProfilePublicOut, VerificationDocumentOut
from app.services.geo import haversine_km
from app.services.notify import notify
from app.services.platform_settings import get_setting as get_platform_setting
from app.services.storage import save_upload

router = APIRouter(prefix="/tailors", tags=["tailors"])


def _verification_enabled() -> bool:
    """A2.1 : la verification des tailleurs est desactivable. Quand elle est
    desactivee, ni le badge ni le statut ne sont exposes comme une garantie."""
    return bool((get_platform_setting("features") or {}).get("tailor_verification", False))


@router.post("/verification", response_model=TailorProfileOut)
def submit_verification(
    tailor_type: TailorType = Form(...),
    shop_name: str = Form(...),
    bio: str | None = Form(None),
    city: str | None = Form(None),
    quartier: str | None = Form(None),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    self_photo: UploadFile = File(...),
    id_card: UploadFile = File(...),
    atelier_photo: UploadFile = File(...),
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    profile = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not profile:
        profile = TailorProfile(user_id=user.id, tailor_type=tailor_type, shop_name=shop_name)
        db.add(profile)

    profile.tailor_type = tailor_type
    profile.shop_name = shop_name
    profile.bio = bio
    profile.city = city
    profile.quartier = quartier
    if lat is not None and lng is not None and profile.lat is None:
        # RG-13: geolocation captured once, at registration.
        profile.lat, profile.lng = lat, lng
    profile.verification_status = VerificationStatus.pending
    db.flush()
    # 3.5 : historique de verification.
    db.add(VerificationEvent(tailor_id=profile.id, action="submitted", actor_id=user.id, actor_name=user.full_name))

    # Chaque soumission remplace les 3 pièces : les anciennes traceraient une
    # décision qui ne porte plus sur les documents réellement examinés.
    db.query(VerificationDocument).filter(VerificationDocument.user_id == user.id).delete()
    for file, doc_type in ((self_photo, "self_photo"), (id_card, "id_card"), (atelier_photo, "atelier_photo")):
        url = save_upload(file, "verification")
        db.add(VerificationDocument(user_id=user.id, type=doc_type, file_url=url))
        if doc_type == "atelier_photo":
            profile.atelier_photo_url = url

    # Un admin doit être notifié à CHAQUE soumission (première fois ou
    # nouvelle tentative après refus) : sans ça, le dossier attend en
    # silence jusqu'à ce qu'un admin pense à vérifier la file d'attente.
    admin_ids = [row[0] for row in db.query(User.id).filter(User.role == UserRole.admin).all()]
    for admin_id in admin_ids:
        notify(
            db,
            admin_id,
            "verification_submitted",
            {
                "tailor_id": profile.id,
                "full_name": user.full_name,
                "shop_name": profile.shop_name,
                "phone": user.phone,
            },
        )

    db.commit()
    db.refresh(profile)
    return profile


@router.get("", response_model=list[TailorProfilePublicOut])
def search_tailors(
    lat: float | None = None,
    lng: float | None = None,
    sort: str = "rating",
    q: str | None = None,
    city: str | None = None,
    quartier: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(TailorProfile)
    if city:
        query = query.filter(TailorProfile.city.ilike(f"%{city}%"))
    if quartier:
        query = query.filter(TailorProfile.quartier.ilike(f"%{quartier}%"))
    if q:
        query = query.filter(
            or_(
                TailorProfile.shop_name.ilike(f"%{q}%"),
                TailorProfile.bio.ilike(f"%{q}%"),
                TailorProfile.city.ilike(f"%{q}%"),
                TailorProfile.quartier.ilike(f"%{q}%"),
                TailorProfile.user.has(User.full_name.ilike(f"%{q}%")),
            )
        )
    tailors = query.all()

    results = []
    for t in tailors:
        item = TailorProfilePublicOut.model_validate(t)
        item.verification_enabled = _verification_enabled()
        if lat is not None and lng is not None and t.lat is not None and t.lng is not None:
            item.distance_km = haversine_km(lat, lng, t.lat, t.lng)
        results.append(item)

    if sort == "proximity" and lat is not None and lng is not None:
        results.sort(key=lambda r: r.distance_km if r.distance_km is not None else 1e9)
    else:
        results.sort(key=lambda r: (-r.rating_avg, -r.completed_orders_count))
    # 3.7 : les tailleurs mis en avant par l'equipe passent en tete, dans
    # l'ordre choisi ; le tri demande s'applique ensuite au reste.
    featured = {t.id: (t.featured_rank if t.featured_rank is not None else 9999) for t in tailors if t.is_featured}
    results.sort(key=lambda r: (0, featured[r.id]) if r.id in featured else (1, 0))
    return results


@router.get("/me", response_model=TailorProfileOut | None)
def get_my_tailor_profile(
    user: User = Depends(require_roles("tailor")), db: Session = Depends(get_db)
):
    tp = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not tp:
        return None
    out = TailorProfileOut.model_validate(tp)
    out.verification_enabled = _verification_enabled()
    return out


class TailorProfilePatchIn(BaseModel):
    shop_name: str | None = Field(None, min_length=2, max_length=255)
    city: str | None = Field(None, max_length=120)
    quartier: str | None = Field(None, max_length=120)
    bio: str | None = Field(None, max_length=2000)


@router.patch("/me", response_model=TailorProfileOut)
def update_my_tailor_profile(
    payload: TailorProfilePatchIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Profil d'atelier modifiable depuis l'espace tailleur web, sans passer
    par la verification (desactivable, A2.1). Le profil est cree au besoin :
    un compte tailleur cree depuis un invite n'en a pas toujours."""
    tp = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not tp:
        tp = TailorProfile(user_id=user.id, tailor_type=TailorType.individual, shop_name=user.full_name)
        db.add(tp)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip() or None
        if field == "shop_name" and not value:
            continue
        setattr(tp, field, value)
    db.commit()
    db.refresh(tp)
    out = TailorProfileOut.model_validate(tp)
    out.verification_enabled = _verification_enabled()
    return out


@router.get("/{tailor_id}", response_model=TailorProfileOut)
def get_tailor(tailor_id: str, db: Session = Depends(get_db)):
    # Volontairement accessible quel que soit le statut : la recherche
    # (`GET /tailors`) liste déjà les tailleurs non vérifiés avec leur badge,
    # et bloquer l'accès par identifiant briserait le tap depuis cette liste
    # (spinner infini côté client) sans rien apporter — le badge affiché sur
    # ce même profil suffit à prévenir le client.
    tailor = db.get(TailorProfile, tailor_id)
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor not found")
    out = TailorProfileOut.model_validate(tailor)
    out.verification_enabled = _verification_enabled()
    return out
