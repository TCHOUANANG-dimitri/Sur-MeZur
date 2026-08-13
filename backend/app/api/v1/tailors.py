from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_roles
from app.models.enums import TailorType, UserRole, VerificationStatus
from app.models.users import TailorProfile, User, VerificationDocument
from app.schemas.users import TailorProfileOut, TailorProfilePublicOut, VerificationDocumentOut
from app.services.geo import haversine_km
from app.services.notify import notify
from app.services.storage import save_upload

router = APIRouter(prefix="/tailors", tags=["tailors"])


@router.post("/verification", response_model=TailorProfileOut)
def submit_verification(
    tailor_type: TailorType = Form(...),
    shop_name: str = Form(...),
    bio: str | None = Form(None),
    city: str | None = Form(None),
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
    if lat is not None and lng is not None and profile.lat is None:
        # RG-13: geolocation captured once, at registration.
        profile.lat, profile.lng = lat, lng
    profile.verification_status = VerificationStatus.pending
    db.flush()

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
    db: Session = Depends(get_db),
):
    query = db.query(TailorProfile)
    if q:
        query = query.filter(TailorProfile.shop_name.ilike(f"%{q}%"))
    tailors = query.all()

    results = []
    for t in tailors:
        item = TailorProfilePublicOut.model_validate(t)
        if lat is not None and lng is not None and t.lat is not None and t.lng is not None:
            item.distance_km = haversine_km(lat, lng, t.lat, t.lng)
        results.append(item)

    if sort == "proximity" and lat is not None and lng is not None:
        results.sort(key=lambda r: r.distance_km if r.distance_km is not None else 1e9)
    else:
        results.sort(key=lambda r: (-r.rating_avg, -r.completed_orders_count))
    return results


@router.get("/me", response_model=TailorProfileOut | None)
def get_my_tailor_profile(
    user: User = Depends(require_roles("tailor")), db: Session = Depends(get_db)
):
    return db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()


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
    return tailor
