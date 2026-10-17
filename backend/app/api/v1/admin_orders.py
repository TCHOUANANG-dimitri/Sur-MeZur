"""
Commandes (M5) dans l'administration web : liste, dossier, annulation, statut, retours d'essayage.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso, order_row, party_names, user_brief
from app.api.v1.admin_core import _late_orders
from app.core.deps import get_db, require_roles
from app.models.catalog import Fabric, GarmentModel
from app.models.enums import OrderStatus
from app.models.measurements import Measurement
from app.models.misc import Delivery, Pattern
from app.models.operations import FitFeedback
from app.models.orders import ChatMessage, Order
from app.models.users import ClientProfile, TailorProfile, User
from app.services import audit
from app.services.activity import as_utc, local_day, utcnow
from app.services.admin_perms import require_perm
from app.services.notify import notify
from app.services.platform_settings import get_setting
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response
from app.services.user_stats import local_start_utc

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])

ORDER_COLUMNS = [
    ("ref", "Référence"), ("status", "Statut"), ("client_name", "Client"), ("tailor_name", "Tailleur"),
    ("city", "Ville"), ("agreed_price", "Montant (FCFA)"), ("desired_date", "Date souhaitée"),
    ("created_at", "Créée le"),
]


def _filter_orders(
    db: Session,
    q: str | None,
    status_: str | None,
    tailor_id: str | None,
    client_id: str | None,
    city: str | None,
    date_from: date | None,
    date_to: date | None,
    min_amount: float | None,
    max_amount: float | None,
    late: bool | None,
):
    query = db.query(Order)
    if status_:
        query = query.filter(Order.status == status_)
    if tailor_id:
        query = query.filter(Order.tailor_id == tailor_id)
    if client_id:
        query = query.filter(Order.client_id == client_id)
    if city:
        query = query.filter(Order.tailor_id.in_(db.query(TailorProfile.id).filter(TailorProfile.city.ilike(city))))
    if date_from:
        query = query.filter(Order.created_at >= local_start_utc(date_from))
    if date_to:
        query = query.filter(Order.created_at < local_start_utc(date_to + timedelta(days=1)))
    if min_amount is not None:
        query = query.filter(Order.agreed_price >= min_amount)
    if max_amount is not None:
        query = query.filter(Order.agreed_price <= max_amount)
    if late:
        query = query.filter(Order.id.in_([o.id for o in _late_orders(db)]))
    if q:
        needle = q.strip().lower().lstrip("#")
        like = f"%{q.strip()}%"
        clients = db.query(ClientProfile.id).join(User, User.id == ClientProfile.user_id).filter(
            or_(User.full_name.ilike(like), User.phone.ilike(like))
        )
        tailors = db.query(TailorProfile.id).join(User, User.id == TailorProfile.user_id).filter(
            or_(User.full_name.ilike(like), TailorProfile.shop_name.ilike(like), User.phone.ilike(like))
        )
        query = query.filter(or_(Order.id.ilike(f"{needle}%"), Order.client_id.in_(clients), Order.tailor_id.in_(tailors)))
    return query


@router.get("/tables/orders")
def orders_table(
    params: TableParams = Depends(table_params),
    q: str | None = None,
    status_: str | None = Query(None, alias="status"),
    tailor_id: str | None = None,
    client_id: str | None = None,
    city: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    late: bool | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("orders.read")),
):
    """5.1 / 5.2 — commandes filtrables."""
    query = _filter_orders(db, q, status_, tailor_id, client_id, city, date_from, date_to, min_amount, max_amount, late)
    query = apply_sort(query, params, {
        "created_at": Order.created_at, "agreed_price": Order.agreed_price,
        "desired_date": Order.desired_date, "status": Order.status, "updated_at": Order.updated_at,
    }, "created_at")
    rows, total = page_of(query, params)
    clients, tailors = party_names(db, rows)
    return table_response(params, rows, total, lambda o: order_row(o, clients, tailors), "commandes", ORDER_COLUMNS)


def _money(v) -> float | None:
    return float(v) if v is not None else None


@router.get("/orders/{order_id}/dossier")
def order_dossier(order_id: str, db: Session = Depends(get_db), _=Depends(require_perm("orders.read"))):
    """Dossier d'une commande (sans paiement ni negociation) : les parties,
    le modele, les mesures, les echanges et les retours d'essayage."""
    o = get_or_404(db, Order, order_id, "Commande")
    clients, tailors = party_names(db, [o])
    client_user = clients.get(o.client_id)
    tailor_profile, tailor_user = tailors.get(o.tailor_id, (None, None))
    model = db.get(GarmentModel, o.garment_model_id) if o.garment_model_id else None
    fabric = db.get(Fabric, o.fabric_id) if o.fabric_id else None
    measurement = db.get(Measurement, o.measurement_id)
    chat = db.query(ChatMessage).filter(ChatMessage.order_id == o.id).order_by(ChatMessage.created_at).all()
    delivery = db.query(Delivery).filter(Delivery.order_id == o.id).first()
    pattern = db.query(Pattern).filter(Pattern.order_id == o.id).first()
    fits = db.query(FitFeedback).filter(FitFeedback.order_id == o.id).order_by(FitFeedback.created_at).all()
    senders = {u.id: u.full_name for u in db.query(User).filter(User.id.in_({m.sender_id for m in chat}))} if chat else {}

    timeline: list[dict] = [{"at": iso(o.created_at), "kind": "order", "title": "Commande créée", "detail": o.client_notes}]
    for c in chat:
        timeline.append({"at": iso(c.created_at), "kind": "message", "title": f"Message de {senders.get(c.sender_id, '?')}", "detail": c.body})
    if delivery and delivery.confirmed_at:
        timeline.append({"at": iso(delivery.confirmed_at), "kind": "delivery", "title": "Réception confirmée par le client", "detail": None})
    for f in fits:
        timeline.append({"at": iso(f.created_at), "kind": "fit", "title": f"Retour d'essayage ({f.source}) : {f.result}", "detail": f.comment})
    timeline.sort(key=lambda e: e["at"] or "")

    return {
        "order": order_row(o, clients, tailors) | {
            "client_notes": o.client_notes, "reception_mode": getattr(o.reception_mode, "value", o.reception_mode),
            "priority": getattr(o.priority, "value", o.priority), "cancel_reason": o.cancel_reason,
            "accessories": o.accessories or [],
        },
        "client": user_brief(client_user),
        "tailor": (user_brief(tailor_user) | {"tailor_id": tailor_profile.id, "shop_name": tailor_profile.shop_name, "city": tailor_profile.city}) if tailor_user else None,
        "model": {"id": model.id, "name": model.name, "photo_url": model.photo_url} if model else None,
        "fabric": {"id": fabric.id, "name": fabric.name, "color_hex": fabric.color_hex} if fabric else None,
        "measurement": {"id": measurement.id, "height_cm": measurement.height_cm, "gender": measurement.gender,
                        "source": getattr(measurement.source, "value", measurement.source), "version": measurement.version,
                        "data": measurement.data or {}, "created_at": iso(measurement.created_at)} if measurement else None,
        "delivery": {"mode": getattr(delivery.mode, "value", delivery.mode),
                     "confirmed_by_client": delivery.confirmed_by_client, "confirmed_at": iso(delivery.confirmed_at)} if delivery else None,
        "pattern": {"svg_url": pattern.svg_url, "pdf_url": pattern.pdf_url, "sent_at": iso(pattern.sent_at)} if pattern else None,
        "fit_feedbacks": [{"id": f.id, "result": f.result, "adjustments": f.adjustments or [], "comment": f.comment,
                           "source": f.source, "created_at": iso(f.created_at)} for f in fits],
        "timeline": timeline,
    }


def _notify_parties(db: Session, o: Order, type_: str, payload: dict) -> None:
    client = db.get(ClientProfile, o.client_id)
    tailor = db.get(TailorProfile, o.tailor_id)
    for uid in {client.user_id if client else None, tailor.user_id if tailor else None} - {None}:
        notify(db, uid, type_, {"order_id": o.id, **payload})


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: str, payload: CancelIn, request: Request, db: Session = Depends(get_db),
                 admin: User = Depends(require_perm("orders.write"))):
    """5.4 — annuler une commande, avec motif."""
    o = get_or_404(db, Order, order_id, "Commande")
    if str(getattr(o.status, "value", o.status)) == "cancelled":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Commande déjà annulée")
    previous = getattr(o.status, "value", o.status)
    o.status = OrderStatus.cancelled
    o.cancel_reason = payload.reason
    _notify_parties(db, o, "order_cancelled_by_admin", {"reason": payload.reason})
    audit.record(db, admin, "order.cancel", "order", o.id, summary=payload.reason,
                 details={"statut_avant": previous}, request=request)
    db.commit()
    return {"ok": True}


class ForceStatusIn(BaseModel):
    status: OrderStatus
    reason: str = Field(min_length=3, max_length=1000)


@router.post("/orders/{order_id}/force-status")
def force_status(order_id: str, payload: ForceStatusIn, request: Request, db: Session = Depends(get_db),
                 admin: User = Depends(require_perm("orders.write"))):
    """5.4 — debloquer une commande en changeant son statut."""
    o = get_or_404(db, Order, order_id, "Commande")
    previous = getattr(o.status, "value", o.status)
    o.status = payload.status
    _notify_parties(db, o, "order_status_changed_by_admin", {"status": payload.status.value, "reason": payload.reason})
    audit.record(db, admin, "order.force_status", "order", o.id, summary=payload.reason,
                 details={"avant": previous, "après": payload.status.value}, request=request)
    db.commit()
    return {"ok": True}


@router.get("/orders-alerts")
def order_alerts(db: Session = Depends(get_db), _=Depends(require_perm("orders.read"))):
    """5.5 — commandes en retard ou sans reponse du tailleur."""
    today = local_day()
    rows = _late_orders(db)
    clients, tailors = party_names(db, rows)
    out = []
    for o in rows:
        row = order_row(o, clients, tailors)
        if o.desired_date and o.desired_date < today:
            row["alert"] = f"date de livraison dépassée de {(today - o.desired_date).days} j"
        else:
            row["alert"] = f"sans réponse du tailleur depuis {(utcnow() - as_utc(o.created_at)).days} j"
        out.append(row)
    return {"items": out, "no_response_days": int(get_setting("order_no_response_days", db) or 3)}


class FitIn(BaseModel):
    result: str = Field(pattern="^(good|alteration|too_tight|too_loose)$")
    adjustments: list[dict] = Field(default_factory=list, max_length=20)
    comment: str | None = Field(None, max_length=2000)


@router.post("/orders/{order_id}/fit-feedback")
def admin_fit_feedback(order_id: str, payload: FitIn, request: Request, db: Session = Depends(get_db),
                       admin: User = Depends(require_perm("orders.write"))):
    """5.6 — saisir le retour d'essayage (par exemple apres un appel au
    client ou au tailleur)."""
    o = get_or_404(db, Order, order_id, "Commande")
    clean = []
    for adj in payload.adjustments:
        try:
            clean.append({"measure": str(adj.get("measure"))[:40], "delta_cm": float(adj.get("delta_cm")), "note": (adj.get("note") or "")[:200]})
        except (TypeError, ValueError):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ajustement invalide")
    db.add(FitFeedback(order_id=o.id, result=payload.result, adjustments=clean, comment=payload.comment, source="admin", author_id=admin.id))
    audit.record(db, admin, "order.fit_feedback", "order", o.id, summary=payload.result, request=request)
    db.commit()
    return {"ok": True}
