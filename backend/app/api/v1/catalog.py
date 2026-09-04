from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user_optional, get_db, require_roles
from app.services.storage import save_upload
from app.models.catalog import Accessory, Category, Fabric, GarmentModel, GarmentModelLike, ReadyToWear
from app.models.enums import VerificationStatus
from app.models.measurements import Measurement
from app.models.users import ClientProfile, TailorProfile, User
from app.schemas.catalog import (
    AccessoryOut,
    CategoryOut,
    CommunityModelIn,
    CompareIn,
    CompareOut,
    FabricOut,
    GarmentModelOut,
    ReadyToWearIn,
    ReadyToWearOut,
)

router = APIRouter(tags=["catalog"])

_COMPARE_TOLERANCE_CM = 3.0
_COMPARE_KEYS = ["chest", "waist", "hips", "shoulder"]


def _client_profile_or_none(user: User | None, db: Session) -> ClientProfile | None:
    if not user or user.role != "client":
        return None
    return db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()


def _serialize_models(
    models: list[GarmentModel], db: Session, client: ClientProfile | None
) -> list[GarmentModelOut]:
    if not models:
        return []
    model_ids = [m.id for m in models]
    counts = dict(
        db.query(GarmentModelLike.garment_model_id, func.count(GarmentModelLike.id))
        .filter(GarmentModelLike.garment_model_id.in_(model_ids))
        .group_by(GarmentModelLike.garment_model_id)
        .all()
    )
    liked_ids: set[str] = set()
    if client:
        liked_ids = {
            row[0]
            for row in db.query(GarmentModelLike.garment_model_id)
            .filter(GarmentModelLike.client_id == client.id, GarmentModelLike.garment_model_id.in_(model_ids))
            .all()
        }
    results = []
    for m in models:
        item = GarmentModelOut.model_validate(m)
        item.like_count = counts.get(m.id, 0)
        item.liked_by_me = m.id in liked_ids
        results.append(item)
    return results


# --- Categories (public) --------------------------------------------------

@router.get("/categories", response_model=list[CategoryOut])
def list_categories(gender: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Category)
    if gender:
        query = query.filter(Category.gender == gender)
    return query.order_by(Category.name).all()


# --- Models ---------------------------------------------------------------

@router.get("/models", response_model=list[GarmentModelOut])
def list_models(
    category_id: str | None = None,
    gender: str | None = None,
    q: str | None = None,
    sort: str = "recent",
    liked_only: bool = False,
    limit: int | None = None,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    client = _client_profile_or_none(user, db)
    query = db.query(GarmentModel).options(joinedload(GarmentModel.category))
    if category_id:
        query = query.filter(GarmentModel.category_id == category_id)
    if gender:
        query = query.join(Category).filter(Category.gender == gender)
    if q:
        query = query.filter(
            or_(
                GarmentModel.name.ilike(f"%{q}%"),
                GarmentModel.description.ilike(f"%{q}%"),
                GarmentModel.style_tags.cast(db.String).ilike(f"%{q}%"),
                GarmentModel.category.has(Category.name.ilike(f"%{q}%")),
            )
        )
    if liked_only:
        if not client:
            return []
        query = query.join(GarmentModelLike, GarmentModelLike.garment_model_id == GarmentModel.id).filter(
            GarmentModelLike.client_id == client.id
        )

    if sort == "popular":
        query = (
            query.outerjoin(GarmentModelLike, GarmentModelLike.garment_model_id == GarmentModel.id)
            .group_by(GarmentModel.id)
            .order_by(func.count(GarmentModelLike.id).desc())
        )
    else:
        query = query.order_by(GarmentModel.created_at.desc())

    if limit:
        query = query.limit(limit)

    return _serialize_models(query.all(), db, client)


@router.get("/models/{model_id}", response_model=GarmentModelOut)
def get_model(
    model_id: str,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    model = (
        db.query(GarmentModel)
        .options(joinedload(GarmentModel.category))
        .filter(GarmentModel.id == model_id)
        .first()
    )
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    client = _client_profile_or_none(user, db)
    return _serialize_models([model], db, client)[0]


@router.post("/models", response_model=GarmentModelOut, status_code=status.HTTP_201_CREATED)
def create_community_model(
    payload: CommunityModelIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    """Modele propose par un client, verse au catalogue commun.

    La colonne `created_by` existait deja sur GarmentModel sans qu'aucune
    route ne la renseigne : seul l'admin pouvait creer un modele. Elle porte
    ici l'auteur, ce qui permet de distinguer le catalogue officiel des
    propositions de la communaute et de n'autoriser l'ajout de photos qu'a
    l'auteur (voir upload_community_model_photos).

    Le prix est volontairement absent du schema d'entree : un modele est
    confectionne sur mesure et son tarif se negocie avec le tailleur.
    """
    if not db.get(Category, payload.category_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categorie introuvable")
    model = GarmentModel(**payload.model_dump(), created_by=user.id)
    db.add(model)
    db.commit()
    db.refresh(model)
    client = _client_profile_or_none(user, db)
    return _serialize_models([model], db, client)[0]


@router.post("/models/{model_id}/photos", response_model=GarmentModelOut)
def upload_community_model_photos(
    model_id: str,
    files: list[UploadFile] = File(...),
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    """Ajout de photos par l'AUTEUR du modele uniquement.

    Sans ce controle, n'importe quel client pourrait deposer des images sur
    le modele d'un autre, ou sur le catalogue officiel (dont `created_by` est
    nul) — c'est la route d'ecriture la plus exposee de ce module.
    """
    model = db.get(GarmentModel, model_id)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    if model.created_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ce modele n'est pas le votre")

    saved = [save_upload(f, "garment-models") for f in files if f is not None]
    if not saved:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucun fichier recu")
    model.photos = list(model.photos or []) + saved
    if not model.photo_url:
        model.photo_url = model.photos[0]
    db.commit()
    db.refresh(model)
    client = _client_profile_or_none(user, db)
    return _serialize_models([model], db, client)[0]


@router.post("/models/{model_id}/like", response_model=GarmentModelOut)
def like_model(
    model_id: str,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    model = (
        db.query(GarmentModel)
        .options(joinedload(GarmentModel.category))
        .filter(GarmentModel.id == model_id)
        .first()
    )
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    existing = (
        db.query(GarmentModelLike)
        .filter(GarmentModelLike.client_id == client.id, GarmentModelLike.garment_model_id == model_id)
        .first()
    )
    if not existing:
        db.add(GarmentModelLike(client_id=client.id, garment_model_id=model_id))
        db.commit()
    return _serialize_models([model], db, client)[0]


@router.delete("/models/{model_id}/like", response_model=GarmentModelOut)
def unlike_model(
    model_id: str,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    model = (
        db.query(GarmentModel)
        .options(joinedload(GarmentModel.category))
        .filter(GarmentModel.id == model_id)
        .first()
    )
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    db.query(GarmentModelLike).filter(
        GarmentModelLike.client_id == client.id, GarmentModelLike.garment_model_id == model_id
    ).delete()
    db.commit()
    return _serialize_models([model], db, client)[0]


# --- Fabrics / accessories ------------------------------------------------

@router.get("/fabrics", response_model=list[FabricOut])
def list_fabrics(type: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Fabric)
    if type:
        query = query.filter(Fabric.type == type)
    return query.all()


@router.get("/accessories", response_model=list[AccessoryOut])
def list_accessories(db: Session = Depends(get_db)):
    return db.query(Accessory).all()


# --- Ready-to-wear --------------------------------------------------------

@router.post("/ready-to-wear", response_model=ReadyToWearOut)
def create_ready_to_wear(
    payload: ReadyToWearIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor profile not found")
    if tailor.verification_status != VerificationStatus.approved:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Seuls les tailleurs vérifiés peuvent publier du prêt-à-porter.",
        )
    item = ReadyToWear(tailor_id=tailor.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/ready-to-wear/mine", response_model=list[ReadyToWearOut])
def list_my_ready_to_wear(
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """The tailor's own stock — unlike the public listing this also returns
    out-of-stock items, since that's what the management screen edits."""
    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not tailor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tailor profile not found")
    return (
        db.query(ReadyToWear)
        .filter(ReadyToWear.tailor_id == tailor.id)
        .order_by(ReadyToWear.created_at.desc())
        .all()
    )


@router.post("/ready-to-wear/{item_id}/photos", response_model=ReadyToWearOut)
def upload_ready_to_wear_photos(
    item_id: str,
    files: list[UploadFile] = File(...),
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    item = db.get(ReadyToWear, item_id)
    if not item or not tailor or item.tailor_id != tailor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")

    saved = [save_upload(f, "ready-to-wear") for f in files if f is not None]
    if not saved:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No file received")

    item.photos = list(item.photos or []) + saved
    if not item.photo_url:
        item.photo_url = item.photos[0]
    db.commit()
    db.refresh(item)
    return item


@router.delete("/ready-to-wear/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ready_to_wear(
    item_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    item = db.get(ReadyToWear, item_id)
    if not item or not tailor or item.tailor_id != tailor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    db.delete(item)
    db.commit()


@router.get("/ready-to-wear", response_model=list[ReadyToWearOut])
def list_ready_to_wear(tailor_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(ReadyToWear).filter(ReadyToWear.in_stock.is_(True))
    if tailor_id:
        query = query.filter(ReadyToWear.tailor_id == tailor_id)
    return query.all()


@router.get("/ready-to-wear/{item_id}", response_model=ReadyToWearOut)
def get_ready_to_wear(item_id: str, db: Session = Depends(get_db)):
    item = db.get(ReadyToWear, item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return item


@router.post("/compare", response_model=CompareOut)
def compare_measurements(payload: CompareIn, db: Session = Depends(get_db)):
    """Moteur 'Comparer' (CDC §4.6): matches client measurements against a
    ready-to-wear item's measurements within a tolerance."""
    measurement = db.get(Measurement, payload.measurement_id)
    item = db.get(ReadyToWear, payload.ready_to_wear_id)
    if not measurement or not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Measurement or item not found")

    deltas: dict[str, float] = {}
    match = True
    for key in _COMPARE_KEYS:
        client_val = measurement.data.get(key)
        item_val = item.item_measurements.get(key)
        if client_val is None or item_val is None:
            continue
        delta = round(abs(client_val - item_val), 1)
        deltas[key] = delta
        if delta > _COMPARE_TOLERANCE_CM:
            match = False

    message = (
        "Correspondance trouvée : vous pouvez acheter directement."
        if match
        else "Pas de correspondance exacte : une commande personnalisée est recommandée."
    )
    return CompareOut(match=match, deltas=deltas, message=message)
