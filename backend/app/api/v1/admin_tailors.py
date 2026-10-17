"""
Tailleurs (M3) dans l'administration web : liste avec indicateurs de suivi
(commandes, livraisons, retards, delai de reponse), mise en avant, et
repartition par ville et quartier.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404
from app.core.deps import get_db, require_roles
from app.models.orders import Order
from app.models.users import TailorProfile, User
from app.services import audit
from app.services.activity import local_day
from app.services.admin_perms import require_perm
from app.services.platform_settings import get_setting
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])


# --- 3.6 Suivi des tailleurs -----------------------------------------------------------


def _quality(db: Session) -> dict[str, dict]:
    today = local_day()
    stats: dict[str, dict] = defaultdict(lambda: {"orders": 0, "late": 0, "delivered": 0})
    for o in db.query(Order).all():
        s = stats[o.tailor_id]
        s["orders"] += 1
        status_ = str(getattr(o.status, "value", o.status))
        if status_ == "finished_delivered":
            s["delivered"] += 1
        if o.desired_date and o.desired_date < today and status_ in ("new", "in_progress"):
            s["late"] += 1
    for s in stats.values():
        s["late_rate"] = round(s["late"] / (s["orders"] or 1), 3)
    return stats


def _alerts(tp: TailorProfile, q: dict, thresholds: dict) -> list[str]:
    alerts = []
    if q.get("orders", 0) >= 3 and q.get("late_rate", 0) > float(thresholds.get("max_late_rate", 1)):
        alerts.append("retards")
    if tp.avg_response_minutes and tp.avg_response_minutes > 60 * float(thresholds.get("max_response_hours", 10_000)):
        alerts.append("répond lentement")
    return alerts


TAILOR_COLUMNS = [
    ("shop_name", "Atelier"), ("full_name", "Tailleur"), ("phone", "Téléphone"), ("city", "Ville"),
    ("quartier", "Quartier"), ("orders", "Commandes"), ("delivered", "Livrées"),
    ("late_rate", "Taux de retard"), ("avg_response_minutes", "Délai de réponse (min)"),
    ("alerts", "Alertes"), ("is_featured", "Mis en avant"),
]


@router.get("/tables/tailors")
def tailors_table(
    params: TableParams = Depends(table_params),
    q: str | None = None,
    city: str | None = None,
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
    if featured is not None:
        query = query.filter(TailorProfile.is_featured.is_(featured))
    quality = _quality(db)
    thresholds = get_setting("tailor_quality", db) or {}
    if alert:
        flagged = [tp.id for tp, _u in query.all() if _alerts(tp, quality.get(tp.id, {}), thresholds)]
        query = query.filter(TailorProfile.id.in_(flagged))
    query = apply_sort(query, params, {
        "shop_name": TailorProfile.shop_name,
        "completed_orders_count": TailorProfile.completed_orders_count,
        "created_at": TailorProfile.created_at,
        "featured_rank": TailorProfile.featured_rank,
    }, "created_at")
    rows, total = page_of(query, params)

    def serialize(row) -> dict:
        tp, u = row
        qd = quality.get(tp.id, {})
        return {
            "id": tp.id, "user_id": u.id, "shop_name": tp.shop_name, "full_name": u.full_name, "phone": u.phone,
            "city": tp.city, "quartier": tp.quartier,
            "orders": qd.get("orders", 0), "delivered": qd.get("delivered", 0), "late_rate": qd.get("late_rate", 0),
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
    tp.is_featured = payload.is_featured
    tp.featured_rank = payload.rank if payload.is_featured else None
    audit.record(db, admin, "tailor.featured" if payload.is_featured else "tailor.unfeatured", "tailor", tp.id, request=request)
    db.commit()
    return {"ok": True}


@router.get("/tailors/map")
def tailors_map(db: Session = Depends(get_db), _=Depends(require_perm("tailors", "dashboard"))):
    """3.8 — repartition des tailleurs par ville et quartier, et positions
    connues pour la carte."""
    cities: dict[str, Counter] = defaultdict(Counter)
    points = []
    for tp in db.query(TailorProfile).all():
        city = (tp.city or "Non renseignée").strip()
        cities[city]["total"] += 1
        cities[city][f"q:{(tp.quartier or 'Non renseigné').strip()}"] += 1
        if tp.lat is not None and tp.lng is not None:
            points.append({"id": tp.id, "shop_name": tp.shop_name, "lat": tp.lat, "lng": tp.lng, "city": tp.city})
    rows = [
        {
            "city": city, "total": c["total"],
            "quartiers": sorted(
                [{"name": k[2:], "total": v} for k, v in c.items() if k.startswith("q:")], key=lambda r: -r["total"]
            ),
        }
        for city, c in cities.items()
    ]
    rows.sort(key=lambda r: -r["total"])
    return {"cities": rows, "points": points}
