"""
Catalogue (M4) dans l'administration web : moderation, recherche, photos,
mise en avant, statistiques, tissus et accessoires, pret-a-porter, import.
"""

from __future__ import annotations

import csv
import io
from pathlib import PurePath

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.api.v1.admin_common import get_or_404, iso
from app.core.deps import get_db, require_roles
from app.models.catalog import Accessory, Category, Fabric, GarmentModel, GarmentModelLike, ReadyToWear
from app.models.orders import Order
from app.models.users import TailorProfile, User
from app.services import audit
from app.services.admin_perms import require_perm
from app.services.notify import notify
from app.services.storage import delete_upload, save_upload
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])

MODEL_COLUMNS = [
    ("name", "Nom"), ("category", "Catégorie"), ("gender", "Genre"), ("status", "Statut"),
    ("author", "Auteur"), ("highlight", "Mise en avant"), ("sort_order", "Ordre"),
    ("views", "Vues"), ("likes", "J'aime"), ("selections", "Sélections"), ("orders", "Commandes"),
    ("created_at", "Créé le"),
]


def _model_stats(db: Session, ids: list[str]) -> tuple[dict, dict]:
    if not ids:
        return {}, {}
    likes = dict(
        db.query(GarmentModelLike.garment_model_id, func.count(GarmentModelLike.id))
        .filter(GarmentModelLike.garment_model_id.in_(ids)).group_by(GarmentModelLike.garment_model_id).all()
    )
    orders = dict(
        db.query(Order.garment_model_id, func.count(Order.id))
        .filter(Order.garment_model_id.in_(ids)).group_by(Order.garment_model_id).all()
    )
    return likes, orders


@router.get("/tables/models")
def models_table(
    params: TableParams = Depends(table_params),
    q: str | None = None,
    category_id: str | None = None,
    gender: str | None = None,
    status_: str | None = Query(None, alias="status"),
    author: str | None = Query(None, pattern="^(team|community)$"),
    highlight: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("catalog")),
):
    """4.4 — recherche et filtres du catalogue."""
    query = db.query(GarmentModel).options(joinedload(GarmentModel.category)).join(Category)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(GarmentModel.name.ilike(like), GarmentModel.description.ilike(like)))
    if category_id:
        query = query.filter(GarmentModel.category_id == category_id)
    if gender:
        query = query.filter(Category.gender == gender)
    if status_:
        query = query.filter(GarmentModel.status == status_)
    if author == "team":
        query = query.filter(GarmentModel.created_by.is_(None))
    elif author == "community":
        query = query.filter(GarmentModel.created_by.isnot(None))
    if highlight:
        query = query.filter(GarmentModel.highlight == highlight)
    query = apply_sort(query, params, {
        "created_at": GarmentModel.created_at,
        "name": GarmentModel.name,
        "sort_order": GarmentModel.sort_order,
        "views": GarmentModel.view_count,
        "selections": GarmentModel.select_count,
    }, "created_at")
    rows, total = page_of(query, params)
    likes, orders = _model_stats(db, [m.id for m in rows])
    authors = {u.id: u.full_name for u in db.query(User).filter(User.id.in_({m.created_by for m in rows if m.created_by}))}

    def serialize(m: GarmentModel) -> dict:
        return {
            "id": m.id, "name": m.name, "description": m.description,
            "category_id": m.category_id, "category": m.category.name if m.category else None,
            "gender": m.category.gender if m.category else None,
            "status": m.status, "rejection_reason": m.rejection_reason,
            "created_by": m.created_by, "author": authors.get(m.created_by, "Équipe") if m.created_by else "Équipe",
            "highlight": m.highlight, "sort_order": m.sort_order,
            "photo_url": m.photo_url, "photos": m.photos or [], "style_tags": m.style_tags or [],
            "base_price": float(m.base_price) if m.base_price is not None else None,
            "thumbnail_color": m.thumbnail_color,
            "views": m.view_count or 0, "likes": likes.get(m.id, 0), "selections": m.select_count or 0,
            "orders": orders.get(m.id, 0), "created_at": iso(m.created_at),
        }

    return table_response(params, rows, total, serialize, "modeles", MODEL_COLUMNS)


class ModerateIn(BaseModel):
    status: str = Field(pattern="^(published|rejected|hidden|pending)$")
    reason: str | None = None


def _moderate(db: Session, m: GarmentModel, payload: ModerateIn, admin: User, request: Request) -> None:
    if payload.status == "rejected" and not (payload.reason or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Le motif du refus est obligatoire")
    previous = m.status
    m.status = payload.status
    m.rejection_reason = payload.reason if payload.status == "rejected" else None
    if m.created_by and previous != payload.status and payload.status in ("published", "rejected"):
        notify(db, m.created_by, f"model_{payload.status}", {"model_id": m.id, "name": m.name, "reason": payload.reason})
    audit.record(db, admin, f"model.{payload.status}", "model", m.id, summary=payload.reason or m.name, request=request)


@router.post("/models/{model_id}/moderate")
def moderate_model(model_id: str, payload: ModerateIn, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_perm("catalog"))):
    """4.3 — publier, refuser ou masquer un modele."""
    m = get_or_404(db, GarmentModel, model_id, "Modèle")
    _moderate(db, m, payload, admin, request)
    db.commit()
    return {"ok": True, "status": m.status}


class BulkModelsIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    action: str = Field(pattern="^(publish|hide|reject|delete)$")
    reason: str | None = None


@router.post("/models/bulk")
def bulk_models(payload: BulkModelsIn, request: Request, db: Session = Depends(get_db),
                admin: User = Depends(require_perm("catalog"))):
    done = skipped = 0
    for mid in payload.ids:
        m = db.get(GarmentModel, mid)
        if not m:
            skipped += 1
            continue
        if payload.action == "delete":
            if db.query(Order.id).filter(Order.garment_model_id == mid).first():
                skipped += 1
                continue
            db.query(GarmentModelLike).filter(GarmentModelLike.garment_model_id == mid).delete(synchronize_session=False)
            for url in {m.photo_url, *(m.photos or [])}:
                delete_upload(url)
            audit.record(db, admin, "model.delete", "model", mid, summary=m.name, request=request)
            db.delete(m)
        else:
            target = {"publish": "published", "hide": "hidden", "reject": "rejected"}[payload.action]
            _moderate(db, m, ModerateIn(status=target, reason=payload.reason or ("Refus groupé" if target == "rejected" else None)), admin, request)
        done += 1
    db.commit()
    return {"done": done, "skipped": skipped}


class PhotosOrderIn(BaseModel):
    photos: list[str]


@router.put("/models/{model_id}/photos")
def reorder_photos(model_id: str, payload: PhotosOrderIn, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_perm("catalog"))):
    """4.5 — ordre des photos ; la premiere devient la couverture. Une photo
    retiree de la liste est supprimee du disque."""
    m = get_or_404(db, GarmentModel, model_id, "Modèle")
    current = list(m.photos or ([m.photo_url] if m.photo_url else []))
    if not set(payload.photos) <= set(current):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo inconnue pour ce modèle")
    for url in set(current) - set(payload.photos):
        delete_upload(url)
    m.photos = payload.photos
    m.photo_url = payload.photos[0] if payload.photos else None
    audit.record(db, admin, "model.photos_order", "model", m.id, request=request)
    db.commit()
    return {"photos": m.photos, "photo_url": m.photo_url}


@router.get("/models/{model_id}/stats")
def model_stats(model_id: str, db: Session = Depends(get_db), _=Depends(require_perm("catalog"))):
    """4.8 — vues, j'aime, selections dans une fiche, commandes."""
    m = get_or_404(db, GarmentModel, model_id, "Modèle")
    likes, orders = _model_stats(db, [m.id])
    return {"views": m.view_count or 0, "likes": likes.get(m.id, 0), "selections": m.select_count or 0, "orders": orders.get(m.id, 0)}


# --- 4.11 Import en masse ----------------------------------------------------------------


def _title_from_filename(name: str) -> str:
    stem = PurePath(name).stem.replace("_", " ").replace("-", " ").strip()
    return (stem[:1].upper() + stem[1:]) if stem else "Modèle"


@router.post("/models/import")
async def import_models(
    request: Request,
    files: list[UploadFile] = File(...),
    category_id: str = Form(...),
    status_: str = Form("pending", alias="status"),
    table: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_perm("catalog")),
):
    """Importe un lot de photos : un modele par photo, nomme d'apres le
    fichier. Un tableau CSV facultatif (colonnes `fichier;nom;description;
    categorie;tags`) precise nom, description, categorie et mots-cles par
    fichier."""
    if status_ not in ("published", "pending", "hidden"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Statut inconnu")
    default_cat = get_or_404(db, Category, category_id, "Catégorie")
    categories = {c.name.lower(): c for c in db.query(Category).all()}
    meta: dict[str, dict] = {}
    if table is not None:
        raw = (await table.read()).decode("utf-8-sig", errors="replace")
        dialect = csv.Sniffer().sniff(raw.splitlines()[0] if raw else ";", delimiters=";,\t")
        for row in csv.DictReader(io.StringIO(raw), dialect=dialect):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            if row.get("fichier"):
                meta[row["fichier"].lower()] = row
    created = []
    errors = []
    for f in files:
        if not f or not f.filename:
            continue
        if not (f.content_type or "").startswith("image/"):
            errors.append(f"{f.filename} : ce n'est pas une image")
            continue
        info = meta.get(f.filename.lower(), {})
        cat = categories.get(info.get("categorie", "").lower()) or default_cat
        url = save_upload(f, "garment-models")
        tags = [t.strip() for t in info.get("tags", "").replace(",", "|").split("|") if t.strip()]
        model = GarmentModel(
            category_id=cat.id, name=(info.get("nom") or _title_from_filename(f.filename))[:255],
            description=info.get("description") or None, style_tags=tags[:8],
            photo_url=url, photos=[url], status=status_,
        )
        db.add(model)
        created.append(model)
    db.flush()
    audit.record(db, admin, "model.import", "model", None, summary=f"{len(created)} modèle(s) importé(s)", request=request)
    db.commit()
    return {"created": len(created), "errors": errors}


# --- 4.9 Tissus et accessoires -------------------------------------------------------------


class FabricIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=32)
    color_hex: str = Field(pattern="^#[0-9A-Fa-f]{6,8}$")
    is_local: bool = False


class AccessoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    price: float = Field(ge=0)
    compatible_categories: list[str] = Field(default_factory=list)


def _fabric_out(f: Fabric) -> dict:
    return {"id": f.id, "name": f.name, "type": f.type, "color_hex": f.color_hex, "texture_url": f.texture_url,
            "is_local": f.is_local, "owner_tailor_id": f.owner_tailor_id}


def _accessory_out(a: Accessory) -> dict:
    return {"id": a.id, "name": a.name, "price": float(a.price), "asset_url": a.asset_url,
            "compatible_categories": a.compatible_categories or []}


@router.get("/fabrics")
def list_fabrics(db: Session = Depends(get_db), _=Depends(require_perm("catalog"))):
    return [_fabric_out(f) for f in db.query(Fabric).order_by(Fabric.type, Fabric.name)]


@router.post("/fabrics")
def create_fabric(payload: FabricIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("catalog"))):
    f = Fabric(**payload.model_dump())
    db.add(f)
    db.flush()
    audit.record(db, admin, "fabric.create", "fabric", f.id, summary=f.name, request=request)
    db.commit()
    return _fabric_out(f)


@router.patch("/fabrics/{fabric_id}")
def update_fabric(fabric_id: str, payload: FabricIn, request: Request, db: Session = Depends(get_db),
                  admin: User = Depends(require_perm("catalog"))):
    f = get_or_404(db, Fabric, fabric_id, "Tissu")
    for k, v in payload.model_dump().items():
        setattr(f, k, v)
    audit.record(db, admin, "fabric.update", "fabric", f.id, summary=f.name, request=request)
    db.commit()
    return _fabric_out(f)


@router.post("/fabrics/{fabric_id}/texture")
def upload_fabric_texture(fabric_id: str, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                          admin: User = Depends(require_perm("catalog"))):
    f = get_or_404(db, Fabric, fabric_id, "Tissu")
    delete_upload(f.texture_url)
    f.texture_url = save_upload(file, "fabrics")
    audit.record(db, admin, "fabric.texture", "fabric", f.id, request=request)
    db.commit()
    return _fabric_out(f)


@router.delete("/fabrics/{fabric_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fabric(fabric_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("catalog"))):
    f = get_or_404(db, Fabric, fabric_id, "Tissu")
    if db.query(Order.id).filter(Order.fabric_id == fabric_id).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ce tissu est utilisé par des commandes")
    delete_upload(f.texture_url)
    audit.record(db, admin, "fabric.delete", "fabric", f.id, summary=f.name, request=request)
    db.delete(f)
    db.commit()


@router.get("/accessories")
def list_accessories(db: Session = Depends(get_db), _=Depends(require_perm("catalog"))):
    return [_accessory_out(a) for a in db.query(Accessory).order_by(Accessory.name)]


@router.post("/accessories")
def create_accessory(payload: AccessoryIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("catalog"))):
    a = Accessory(**payload.model_dump())
    db.add(a)
    db.flush()
    audit.record(db, admin, "accessory.create", "accessory", a.id, summary=a.name, request=request)
    db.commit()
    return _accessory_out(a)


@router.patch("/accessories/{accessory_id}")
def update_accessory(accessory_id: str, payload: AccessoryIn, request: Request, db: Session = Depends(get_db),
                     admin: User = Depends(require_perm("catalog"))):
    a = get_or_404(db, Accessory, accessory_id, "Accessoire")
    for k, v in payload.model_dump().items():
        setattr(a, k, v)
    audit.record(db, admin, "accessory.update", "accessory", a.id, summary=a.name, request=request)
    db.commit()
    return _accessory_out(a)


@router.delete("/accessories/{accessory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_accessory(accessory_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("catalog"))):
    a = get_or_404(db, Accessory, accessory_id, "Accessoire")
    audit.record(db, admin, "accessory.delete", "accessory", a.id, summary=a.name, request=request)
    db.delete(a)
    db.commit()


# --- 4.10 Pret-a-porter ------------------------------------------------------------------------


RTW_COLUMNS = [("name", "Article"), ("tailor", "Tailleur"), ("price", "Prix"), ("in_stock", "En stock"),
               ("moderation_status", "Statut"), ("created_at", "Publié le")]


@router.get("/tables/ready-to-wear")
def rtw_table(
    params: TableParams = Depends(table_params),
    q: str | None = None,
    status_: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _=Depends(require_perm("catalog")),
):
    query = db.query(ReadyToWear, TailorProfile).join(TailorProfile, TailorProfile.id == ReadyToWear.tailor_id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(ReadyToWear.name.ilike(like), TailorProfile.shop_name.ilike(like)))
    if status_:
        query = query.filter(ReadyToWear.moderation_status == status_)
    query = apply_sort(query, params, {"created_at": ReadyToWear.created_at, "price": ReadyToWear.price, "name": ReadyToWear.name}, "created_at")
    rows, total = page_of(query, params)

    def serialize(row) -> dict:
        item, tp = row
        return {
            "id": item.id, "name": item.name, "description": item.description, "tailor": tp.shop_name, "tailor_user_id": tp.user_id,
            "price": float(item.price), "in_stock": item.in_stock, "photo_url": item.photo_url, "photos": item.photos or [],
            "moderation_status": item.moderation_status, "rejection_reason": item.rejection_reason, "created_at": iso(item.created_at),
        }

    return table_response(params, rows, total, serialize, "pret-a-porter", RTW_COLUMNS)


@router.post("/ready-to-wear/{item_id}/moderate")
def moderate_rtw(item_id: str, payload: ModerateIn, request: Request, db: Session = Depends(get_db),
                 admin: User = Depends(require_perm("catalog"))):
    item = get_or_404(db, ReadyToWear, item_id, "Article")
    if payload.status == "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Statut inconnu")
    if payload.status == "rejected" and not (payload.reason or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Le motif est obligatoire")
    item.moderation_status = payload.status
    item.rejection_reason = payload.reason if payload.status != "published" else None
    tp = db.get(TailorProfile, item.tailor_id)
    if tp and payload.status != "published":
        notify(db, tp.user_id, "ready_to_wear_moderated", {"item_id": item.id, "name": item.name, "status": payload.status, "reason": payload.reason})
    audit.record(db, admin, f"rtw.{payload.status}", "ready_to_wear", item.id, summary=payload.reason or item.name, request=request)
    db.commit()
    return {"ok": True}
