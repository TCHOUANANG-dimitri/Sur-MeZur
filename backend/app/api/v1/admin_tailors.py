"""
Tailleurs et verification (M3) dans l'administration web.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso
from app.core.deps import get_db, require_roles
from app.models.enums import VerificationStatus
from app.models.operations import VerificationEvent
from app.models.orders import Order
from app.models.users import TailorProfile, User, VerificationDocument
from app.services import audit
from app.services.activity import local_day
from app.services.admin_perms import require_perm
from app.services.notify import notify
from app.services.platform_settings import get_setting
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])

DOCUMENT_LABELS = {
    "id_card": "Pièce d'identité",
    "self_photo": "Photo du tailleur",
    "atelier_photo": "Photo de l'atelier",
}


class InfoRequestIn(BaseModel):
    missing_documents: list[str] = Field(default_factory=list)
    message: str = Field(min_length=3, max_length=2000)


@router.post("/verifications/{tailor_id}/request-info")
def request_more_info(tailor_id: str, payload: InfoRequestIn, request: Request, db: Session = Depends(get_db),
                      admin: User = Depends(require_perm("tailors"))):
    """3.4 — renvoyer la demande au tailleur avec la liste des pieces a
    fournir, sans la refuser."""
    tailor = get_or_404(db, TailorProfile, tailor_id, "Tailleur")
    tailor.verification_status = VerificationStatus.info_requested
    missing = [d for d in payload.missing_documents if d in DOCUMENT_LABELS]
    db.add(VerificationEvent(
        tailor_id=tailor.id, action="info_requested", reason=payload.message, missing_documents=missing,
        actor_id=admin.id, actor_name=admin.full_name,
    ))
    notify(db, tailor.user_id, "verification_info_requested", {
        "message": payload.message,
        "missing_documents": [DOCUMENT_LABELS[d] for d in missing],
    })
    audit.record(db, admin, "verification.info_requested", "tailor", tailor.id, summary=payload.message, request=request)
    db.commit()
    return {"ok": True, "status": "info_requested"}


@router.get("/verifications/{tailor_id}/dossier")
def verification_dossier(tailor_id: str, db: Session = Depends(get_db), _=Depends(require_perm("tailors"))):
    """3.1 / 3.5 — identite, pieces actuelles et historique des decisions."""
    tailor = get_or_404(db, TailorProfile, tailor_id, "Tailleur")
    user = db.get(User, tailor.user_id)
    docs = db.query(VerificationDocument).filter(VerificationDocument.user_id == tailor.user_id).all()
    events = (
        db.query(VerificationEvent)
        .filter(VerificationEvent.tailor_id == tailor.id)
        .order_by(VerificationEvent.created_at.desc())
        .all()
    )
    return {
        "tailor": {
            "id": tailor.id, "user_id": tailor.user_id, "shop_name": tailor.shop_name,
            "tailor_type": getattr(tailor.tailor_type, "value", tailor.tailor_type), "bio": tailor.bio,
            "city": tailor.city, "quartier": tailor.quartier, "lat": tailor.lat, "lng": tailor.lng,
            "verification_status": getattr(tailor.verification_status, "value", tailor.verification_status),
            "updated_at": iso(tailor.updated_at),
        },
        "user": {"id": user.id, "full_name": user.full_name, "phone": user.phone, "created_at": iso(user.created_at)} if user else None,
        "documents": [
            {"id": d.id, "type": d.type, "label": DOCUMENT_LABELS.get(d.type, d.type), "file_url": d.file_url,
             "status": getattr(d.status, "value", d.status), "created_at": iso(d.created_at)}
            for d in docs
        ],
        "history": [
            {"id": e.id, "action": e.action, "reason": e.reason, "missing_documents": [DOCUMENT_LABELS.get(d, d) for d in (e.missing_documents or [])],
             "actor_name": e.actor_name, "created_at": iso(e.created_at)}
            for e in events
        ],
    }


# --- 3.6 Qualite des tailleurs --------------------------------------------------------


def _quality(db: Session) -> dict[str, dict]:
    thresholds = get_setting("tailor_quality", db) or {}
    today = local_day()
    stats: dict[str, dict] = defaultdict(lambda: {"orders": 0, "disputes": 0, "late": 0, "delivered": 0})
    for o in db.query(Order).all():
        s = stats[o.tailor_id]
        s["orders"] += 1
        if o.dispute_status:
            s["disputes"] += 1
        status_ = str(getattr(o.status, "value", o.status))
        if status_ == "finished_delivered":
            s["delivered"] += 1
        if o.desired_date and o.desired_date < today and status_ in ("new", "in_progress"):
            s["late"] += 1
    out = {}
    for tid, s in stats.items():
        n = s["orders"] or 1
        s["dispute_rate"] = round(s["disputes"] / n, 3)
        s["late_rate"] = round(s["late"] / n, 3)
        out[tid] = s
    out["_thresholds"] = thresholds
    return out


def _alerts(tp: TailorProfile, q: dict, thresholds: dict) -> list[str]:
    alerts = []
    rating = float(tp.rating_avg or 0)
    if rating and rating < float(thresholds.get("min_rating", 0)):
        alerts.append("note basse")
    if q.get("orders", 0) >= 3 and q.get("dispute_rate", 0) > float(thresholds.get("max_dispute_rate", 1)):
        alerts.append("litiges fréquents")
    if q.get("orders", 0) >= 3 and q.get("late_rate", 0) > float(thresholds.get("max_late_rate", 1)):
        alerts.append("retards")
    if tp.avg_response_minutes and tp.avg_response_minutes > 60 * float(thresholds.get("max_response_hours", 10_000)):
        alerts.append("répond lentement")
    return alerts


TAILOR_COLUMNS = [
    ("shop_name", "Atelier"), ("full_name", "Tailleur"), ("phone", "Téléphone"), ("city", "Ville"),
    ("quartier", "Quartier"), ("verification_status", "Vérification"), ("rating_avg", "Note"),
    ("orders", "Commandes"), ("delivered", "Livrées"), ("dispute_rate", "Taux de litiges"),
    ("late_rate", "Taux de retard"), ("avg_response_minutes", "Délai de réponse (min)"),
    ("alerts", "Alertes"), ("is_featured", "Mis en avant"),
]


@router.get("/tables/tailors")
def tailors_table(
    params: TableParams = Depends(table_params),
    q: str | None = None,
    city: str | None = None,
    verification: str | None = None,
    featured: bool | None = None,
    alert: bool | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("tailors")),
):
    query = db.query(TailorProfile, User).join(User, User.id == TailorProfile.user_id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(TailorProfile.shop_name.ilike(like), User.full_name.ilike(like), User.phone.ilike(like)))
    if city:
        query = query.filter(TailorProfile.city.ilike(city))
    if verification:
        query = query.filter(TailorProfile.verification_status == verification)
    if featured is not None:
        query = query.filter(TailorProfile.is_featured.is_(featured))
    quality = _quality(db)
    thresholds = quality.get("_thresholds", {})
    if alert:
        flagged = [tp.id for tp, _u in query.all() if _alerts(tp, quality.get(tp.id, {}), thresholds)]
        query = query.filter(TailorProfile.id.in_(flagged))
    query = apply_sort(query, params, {
        "rating_avg": TailorProfile.rating_avg,
        "shop_name": TailorProfile.shop_name,
        "completed_orders_count": TailorProfile.completed_orders_count,
        "created_at": TailorProfile.created_at,
        "featured_rank": TailorProfile.featured_rank,
    }, "rating_avg")
    rows, total = page_of(query, params)

    def serialize(row) -> dict:
        tp, u = row
        qd = quality.get(tp.id, {})
        return {
            "id": tp.id, "user_id": u.id, "shop_name": tp.shop_name, "full_name": u.full_name, "phone": u.phone,
            "city": tp.city, "quartier": tp.quartier,
            "verification_status": getattr(tp.verification_status, "value", tp.verification_status),
            "rating_avg": float(tp.rating_avg or 0), "orders": qd.get("orders", 0), "delivered": qd.get("delivered", 0),
            "dispute_rate": qd.get("dispute_rate", 0), "late_rate": qd.get("late_rate", 0),
            "avg_response_minutes": tp.avg_response_minutes, "is_active": u.is_active,
            "alerts": ", ".join(_alerts(tp, qd, thresholds)),
            "is_featured": tp.is_featured, "featured_rank": tp.featured_rank,
        }

    return table_response(params, rows, total, serialize, "tailleurs", TAILOR_COLUMNS, extra={"thresholds": thresholds})


class FeaturedIn(BaseModel):
    is_featured: bool
    rank: int | None = None


@router.post("/tailors/{tailor_id}/featured")
def set_featured(tailor_id: str, payload: FeaturedIn, request: Request, db: Session = Depends(get_db),
                 admin: User = Depends(require_perm("tailors"))):
    """3.7 — tailleur recommande, en tete de la recherche."""
    tp = get_or_404(db, TailorProfile, tailor_id, "Tailleur")
    if payload.is_featured and str(getattr(tp.verification_status, "value", tp.verification_status)) != "approved":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seul un tailleur vérifié peut être mis en avant")
    tp.is_featured = payload.is_featured
    tp.featured_rank = payload.rank if payload.is_featured else None
    audit.record(db, admin, "tailor.featured" if payload.is_featured else "tailor.unfeatured", "tailor", tp.id, request=request)
    db.commit()
    return {"ok": True}


@router.get("/tailors/map")
def tailors_map(db: Session = Depends(get_db), _=Depends(require_perm("tailors", "dashboard"))):
    """3.8 — repartition des tailleurs verifies par ville et quartier, et
    positions connues pour la carte."""
    cities: dict[str, Counter] = defaultdict(Counter)
    points = []
    for tp in db.query(TailorProfile).all():
        verified = str(getattr(tp.verification_status, "value", tp.verification_status)) == "approved"
        city = (tp.city or "Non renseignée").strip()
        cities[city]["total"] += 1
        if verified:
            cities[city]["verified"] += 1
            cities[city][f"q:{(tp.quartier or 'Non renseigné').strip()}"] += 1
        if tp.lat is not None and tp.lng is not None:
            points.append({"id": tp.id, "shop_name": tp.shop_name, "lat": tp.lat, "lng": tp.lng, "verified": verified, "city": tp.city})
    rows = []
    for city, c in cities.items():
        rows.append({
            "city": city, "total": c["total"], "verified": c["verified"],
            "quartiers": sorted(
                [{"name": k[2:], "verified": v} for k, v in c.items() if k.startswith("q:")], key=lambda r: -r["verified"]
            ),
        })
    rows.sort(key=lambda r: -r["verified"])
    return {"cities": rows, "points": points}


@router.get("/verifications-table")
def verifications_table(
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _=Depends(require_perm("tailors")),
):
    """3.1 — demandes de verification avec identite, triees par anciennete."""
    submitted = db.query(VerificationDocument.user_id).distinct()
    query = db.query(TailorProfile, User).join(User, User.id == TailorProfile.user_id).filter(TailorProfile.user_id.in_(submitted))
    if status_filter:
        query = query.filter(TailorProfile.verification_status == status_filter)
    rows = query.order_by(TailorProfile.updated_at.asc()).all()
    return [
        {
            "id": tp.id, "user_id": u.id, "shop_name": tp.shop_name, "full_name": u.full_name, "phone": u.phone,
            "city": tp.city, "quartier": tp.quartier,
            "verification_status": getattr(tp.verification_status, "value", tp.verification_status),
            "updated_at": iso(tp.updated_at),
        }
        for tp, u in rows
    ]
