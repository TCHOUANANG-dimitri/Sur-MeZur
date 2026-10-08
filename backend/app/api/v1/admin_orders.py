"""
Commandes (M5) et litiges (M7) dans l'administration web.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso, order_row, party_names, user_brief
from app.api.v1.admin_core import _late_orders
from app.core.deps import get_db, require_roles
from app.models.catalog import Fabric, GarmentModel, ReadyToWear
from app.models.enums import OfferStatus, OrderStatus
from app.models.measurements import Measurement
from app.models.misc import Delivery, Pattern, Review
from app.models.operations import DisputeMessage, FitFeedback, Refund
from app.models.orders import ChatMessage, Modification, Offer, Order, Quote
from app.models.payments import Payment, PaymentSplit
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
    ("dispute_status", "Litige"), ("created_at", "Créée le"),
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
    dispute: str | None,
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
    if dispute == "open":
        query = query.filter(Order.dispute_status == "open")
    elif dispute == "any":
        query = query.filter(Order.dispute_status.isnot(None))
    elif dispute == "resolved":
        query = query.filter(Order.dispute_status.isnot(None), Order.dispute_status != "open")
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
    dispute: str | None = None,
    late: bool | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("orders.read")),
):
    """5.1 / 5.2 — commandes filtrables."""
    query = _filter_orders(db, q, status_, tailor_id, client_id, city, date_from, date_to, min_amount, max_amount, dispute, late)
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
def order_dossier(order_id: str, db: Session = Depends(get_db), _=Depends(require_perm("orders.read", "disputes"))):
    """5.3 / 7.2 — tout le dossier d'une commande, avec une chronologie."""
    o = get_or_404(db, Order, order_id, "Commande")
    clients, tailors = party_names(db, [o])
    client_user = clients.get(o.client_id)
    tailor_profile, tailor_user = tailors.get(o.tailor_id, (None, None))
    model = db.get(GarmentModel, o.garment_model_id) if o.garment_model_id else None
    rtw = db.get(ReadyToWear, o.ready_to_wear_id) if o.ready_to_wear_id else None
    fabric = db.get(Fabric, o.fabric_id) if o.fabric_id else None
    measurement = db.get(Measurement, o.measurement_id)
    offers = db.query(Offer).filter(Offer.order_id == o.id).order_by(Offer.created_at).all()
    quotes = db.query(Quote).filter(Quote.order_id == o.id).order_by(Quote.created_at).all()
    mods = db.query(Modification).filter(Modification.order_id == o.id).order_by(Modification.created_at).all()
    payments = db.query(Payment).filter(Payment.order_id == o.id).order_by(Payment.created_at).all()
    split = db.query(PaymentSplit).filter(PaymentSplit.order_id == o.id).first()
    refunds = db.query(Refund).filter(Refund.order_id == o.id).order_by(Refund.created_at).all()
    chat = db.query(ChatMessage).filter(ChatMessage.order_id == o.id).order_by(ChatMessage.created_at).all()
    delivery = db.query(Delivery).filter(Delivery.order_id == o.id).first()
    pattern = db.query(Pattern).filter(Pattern.order_id == o.id).first()
    review = db.query(Review).filter(Review.order_id == o.id).first()
    fits = db.query(FitFeedback).filter(FitFeedback.order_id == o.id).order_by(FitFeedback.created_at).all()
    dmsgs = db.query(DisputeMessage).filter(DisputeMessage.order_id == o.id).order_by(DisputeMessage.created_at).all()
    senders = {u.id: u.full_name for u in db.query(User).filter(User.id.in_({m.sender_id for m in chat}))} if chat else {}

    timeline: list[dict] = [{"at": iso(o.created_at), "kind": "order", "title": "Commande créée", "detail": o.client_notes}]
    for of in offers:
        timeline.append({"at": iso(of.created_at), "kind": "offer", "title": f"Offre {getattr(of.actor, 'value', of.actor)} n°{of.round}",
                         "detail": f"{float(of.amount):,.0f} FCFA · {getattr(of.status, 'value', of.status)}".replace(",", " ")})
    for qt in quotes:
        timeline.append({"at": iso(qt.created_at), "kind": "quote", "title": "Devis" + (" accepté" if qt.accepted else ""),
                         "detail": f"{float(qt.total):,.0f} FCFA, {qt.delay_days} j".replace(",", " ")})
    for m in mods:
        timeline.append({"at": iso(m.created_at), "kind": "modification", "title": f"Modification ({getattr(m.status, 'value', m.status)})", "detail": m.justification})
    for p in payments:
        timeline.append({"at": iso(p.created_at), "kind": "payment", "title": f"Paiement {getattr(p.phase, 'value', p.phase)} · {getattr(p.status, 'value', p.status)}",
                         "detail": f"{float(p.amount):,.0f} FCFA via {getattr(p.provider, 'value', p.provider)}".replace(",", " ")})
    for r in refunds:
        timeline.append({"at": iso(r.created_at), "kind": "refund", "title": f"Remboursement ({r.status})", "detail": f"{float(r.amount):,.0f} FCFA — {r.reason}".replace(",", " ")})
    for c in chat:
        timeline.append({"at": iso(c.created_at), "kind": "message", "title": f"Message de {senders.get(c.sender_id, '?')}", "detail": c.body})
    if delivery and delivery.confirmed_at:
        timeline.append({"at": iso(delivery.confirmed_at), "kind": "delivery", "title": "Réception confirmée par le client", "detail": None})
    if o.dispute_opened_at:
        timeline.append({"at": iso(o.dispute_opened_at), "kind": "dispute", "title": f"Litige ouvert ({o.dispute_opened_by or '?'})", "detail": o.dispute_note})
    for m in dmsgs:
        timeline.append({"at": iso(m.created_at), "kind": "dispute_message", "title": f"Litige · {m.author_name} ({m.author_role})", "detail": m.body})
    if o.dispute_resolved_at:
        timeline.append({"at": iso(o.dispute_resolved_at), "kind": "dispute", "title": f"Litige clos : {o.dispute_status}", "detail": o.dispute_note})
    for f in fits:
        timeline.append({"at": iso(f.created_at), "kind": "fit", "title": f"Retour d'essayage ({f.source}) : {f.result}", "detail": f.comment})
    if review:
        timeline.append({"at": iso(review.created_at), "kind": "review", "title": f"Avis {review.stars}★", "detail": review.comment})
    timeline.sort(key=lambda e: e["at"] or "")

    return {
        "order": order_row(o, clients, tailors) | {
            "client_notes": o.client_notes, "reception_mode": getattr(o.reception_mode, "value", o.reception_mode),
            "priority": getattr(o.priority, "value", o.priority), "delivery_fee": _money(o.delivery_fee),
            "current_offer_round": o.current_offer_round, "dispute_note": o.dispute_note,
            "dispute_opened_by": o.dispute_opened_by, "dispute_resolved_at": iso(o.dispute_resolved_at),
            "dispute_refund_amount": _money(o.dispute_refund_amount), "cancel_reason": o.cancel_reason,
            "accessories": o.accessories or [],
        },
        "client": user_brief(client_user),
        "tailor": (user_brief(tailor_user) | {"tailor_id": tailor_profile.id, "shop_name": tailor_profile.shop_name, "city": tailor_profile.city}) if tailor_user else None,
        "model": {"id": model.id, "name": model.name, "photo_url": model.photo_url} if model else None,
        "ready_to_wear": {"id": rtw.id, "name": rtw.name, "photo_url": rtw.photo_url} if rtw else None,
        "fabric": {"id": fabric.id, "name": fabric.name, "color_hex": fabric.color_hex} if fabric else None,
        "measurement": {"id": measurement.id, "height_cm": measurement.height_cm, "gender": measurement.gender,
                        "source": getattr(measurement.source, "value", measurement.source), "version": measurement.version,
                        "data": measurement.data or {}, "created_at": iso(measurement.created_at)} if measurement else None,
        "offers": [{"id": x.id, "actor": getattr(x.actor, "value", x.actor), "round": x.round, "amount": _money(x.amount),
                    "delay_days": x.delay_days, "status": getattr(x.status, "value", x.status), "created_at": iso(x.created_at)} for x in offers],
        "quotes": [{"id": x.id, "line_items": x.line_items, "total": _money(x.total), "delay_days": x.delay_days,
                    "commission_rate": _money(x.commission_rate), "commission_amount": _money(x.commission_amount),
                    "net_to_tailor": _money(x.net_to_tailor), "accepted": x.accepted, "created_at": iso(x.created_at)} for x in quotes],
        "payments": [{"id": p.id, "phase": getattr(p.phase, "value", p.phase), "provider": getattr(p.provider, "value", p.provider),
                      "amount": _money(p.amount), "status": getattr(p.status, "value", p.status), "provider_txn_ref": p.provider_txn_ref,
                      "created_at": iso(p.created_at)} for p in payments],
        "split": {"total": _money(split.total), "deposit": _money(split.deposit_70), "tailor_immediate": _money(split.tailor_immediate_40),
                  "escrow": _money(split.escrow_30), "balance": _money(split.balance_30),
                  "escrow_status": getattr(split.escrow_status, "value", split.escrow_status), "released_at": iso(split.released_at)} if split else None,
        "refunds": [{"id": r.id, "amount": _money(r.amount), "reason": r.reason, "status": r.status, "origin": r.origin,
                     "created_at": iso(r.created_at), "completed_at": iso(r.completed_at)} for r in refunds],
        "delivery": {"mode": getattr(delivery.mode, "value", delivery.mode), "fee": _money(delivery.fee),
                     "confirmed_by_client": delivery.confirmed_by_client, "confirmed_at": iso(delivery.confirmed_at)} if delivery else None,
        "pattern": {"svg_url": pattern.svg_url, "pdf_url": pattern.pdf_url, "sent_at": iso(pattern.sent_at)} if pattern else None,
        "review": {"id": review.id, "stars": review.stars, "comment": review.comment} if review else None,
        "fit_feedbacks": [{"id": f.id, "result": f.result, "adjustments": f.adjustments or [], "comment": f.comment,
                           "source": f.source, "created_at": iso(f.created_at)} for f in fits],
        "dispute_messages": [{"id": m.id, "author_name": m.author_name, "author_role": m.author_role, "audience": m.audience,
                              "body": m.body, "attachment_url": m.attachment_url, "requests_photo": m.requests_photo,
                              "created_at": iso(m.created_at)} for m in dmsgs],
        "timeline": timeline,
    }


def _notify_parties(db: Session, o: Order, type_: str, payload: dict) -> None:
    client = db.get(ClientProfile, o.client_id)
    tailor = db.get(TailorProfile, o.tailor_id)
    for uid in {client.user_id if client else None, tailor.user_id if tailor else None} - {None}:
        notify(db, uid, type_, {"order_id": o.id, **payload})


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)
    refund_amount: float | None = Field(None, ge=0)


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: str, payload: CancelIn, request: Request, db: Session = Depends(get_db),
                 admin: User = Depends(require_perm("orders.write"))):
    """5.4 — annuler une commande, avec motif et remboursement eventuel."""
    o = get_or_404(db, Order, order_id, "Commande")
    if str(getattr(o.status, "value", o.status)) == "cancelled":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Commande déjà annulée")
    previous = getattr(o.status, "value", o.status)
    o.status = OrderStatus.cancelled
    o.cancel_reason = payload.reason
    db.query(Offer).filter(Offer.order_id == o.id, Offer.status == OfferStatus.pending).update({"status": OfferStatus.expired})
    if payload.refund_amount:
        db.add(Refund(order_id=o.id, amount=payload.refund_amount, reason=payload.reason, origin="order", requested_by=admin.id))
    _notify_parties(db, o, "order_cancelled_by_admin", {"reason": payload.reason, "refund_amount": payload.refund_amount})
    audit.record(db, admin, "order.cancel", "order", o.id, summary=payload.reason,
                 details={"statut_avant": previous, "remboursement": payload.refund_amount}, request=request)
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


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


@router.post("/orders/{order_id}/reset-negotiation")
def reset_negotiation(order_id: str, payload: ReasonIn, request: Request, db: Session = Depends(get_db),
                      admin: User = Depends(require_perm("orders.write"))):
    """5.4 — debloquer une negociation arrivee au plafond d'offres ou dont
    l'offre a expire : les offres en attente expirent, le compteur repart."""
    o = get_or_404(db, Order, order_id, "Commande")
    db.query(Offer).filter(Offer.order_id == o.id, Offer.status == OfferStatus.pending).update({"status": OfferStatus.expired})
    o.current_offer_round = 0
    _notify_parties(db, o, "order_negotiation_reset", {"reason": payload.reason})
    audit.record(db, admin, "order.reset_negotiation", "order", o.id, summary=payload.reason, request=request)
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


# --- M7 Litiges -----------------------------------------------------------------------


DISPUTE_COLUMNS = [
    ("ref", "Commande"), ("dispute_status", "Statut"), ("dispute_category", "Cause"), ("client_name", "Client"),
    ("tailor_name", "Tailleur"), ("agreed_price", "Montant"), ("dispute_opened_at", "Ouvert le"), ("age_days", "Ancienneté (j)"),
]


@router.get("/tables/disputes")
def disputes_table(
    params: TableParams = Depends(table_params),
    state: str = Query("open", pattern="^(open|resolved|all)$"),
    category: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("disputes")),
):
    query = db.query(Order).filter(Order.dispute_status.isnot(None))
    if state == "open":
        query = query.filter(Order.dispute_status == "open")
    elif state == "resolved":
        query = query.filter(Order.dispute_status != "open")
    if category:
        query = query.filter(Order.dispute_category == category)
    if q:
        query = query.filter(Order.id.ilike(f"{q.strip().lower().lstrip('#')}%"))
    query = apply_sort(query, params, {"dispute_opened_at": Order.dispute_opened_at, "agreed_price": Order.agreed_price}, "dispute_opened_at")
    if not params.sort:
        query = query.order_by(None).order_by(Order.dispute_opened_at.is_(None), Order.dispute_opened_at.asc())
    rows, total = page_of(query, params)
    clients, tailors = party_names(db, rows)
    alert_days = int(get_setting("dispute_alert_days", db) or 7)

    def serialize(o: Order) -> dict:
        row = order_row(o, clients, tailors)
        opened = as_utc(o.dispute_opened_at or o.updated_at)
        end = as_utc(o.dispute_resolved_at) if o.dispute_status != "open" and o.dispute_resolved_at else utcnow()
        row["age_days"] = (end - opened).days
        row["overdue"] = o.dispute_status == "open" and row["age_days"] >= alert_days
        return row

    return table_response(params, rows, total, serialize, "litiges", DISPUTE_COLUMNS, extra={"alert_days": alert_days})


class DisputeMessageIn(BaseModel):
    audience: str = Field(pattern="^(client|tailor|both)$")
    body: str = Field(min_length=1, max_length=4000)
    requests_photo: bool = False


@router.post("/disputes/{order_id}/messages")
def dispute_message(order_id: str, payload: DisputeMessageIn, request: Request, db: Session = Depends(get_db),
                    admin: User = Depends(require_perm("disputes"))):
    """7.3 — ecrire au client, au tailleur ou aux deux depuis le dossier."""
    o = get_or_404(db, Order, order_id, "Commande")
    db.add(DisputeMessage(order_id=o.id, author_id=admin.id, author_name="Équipe Sur-MeZur", author_role="admin",
                          audience=payload.audience, body=payload.body, requests_photo=payload.requests_photo))
    client = db.get(ClientProfile, o.client_id)
    tailor = db.get(TailorProfile, o.tailor_id)
    targets = []
    if payload.audience in ("client", "both") and client:
        targets.append(client.user_id)
    if payload.audience in ("tailor", "both") and tailor:
        targets.append(tailor.user_id)
    for uid in targets:
        notify(db, uid, "dispute_message", {"order_id": o.id, "body": payload.body, "requests_photo": payload.requests_photo})
    audit.record(db, admin, "dispute.message", "order", o.id, summary=f"à {payload.audience}", request=request)
    db.commit()
    return {"ok": True}


class DisputeDecisionIn(BaseModel):
    decision: str = Field(pattern="^(refund_full|refund_partial|alteration|rejected)$")
    amount: float | None = Field(None, ge=0)
    reason: str = Field(min_length=3, max_length=2000)


DECISION_STATUS = {
    "refund_full": "resolved_client",
    "refund_partial": "resolved_client",
    "alteration": "resolved_alteration",
    "rejected": "dismissed",
}


@router.post("/disputes/{order_id}/decide")
def decide_dispute(order_id: str, payload: DisputeDecisionIn, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_perm("disputes"))):
    """7.4 — decision graduee, motif communique aux deux parties."""
    o = get_or_404(db, Order, order_id, "Commande")
    if o.dispute_status != "open":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ce litige n'est pas ouvert")
    paid = sum(
        float(p.amount) for p in db.query(Payment).filter(Payment.order_id == o.id).all()
        if str(getattr(p.status, "value", p.status)) in ("paid", "released")
    )
    amount = None
    if payload.decision == "refund_full":
        amount = paid
    elif payload.decision == "refund_partial":
        if not payload.amount:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indiquez le montant du remboursement partiel")
        amount = payload.amount
    if amount is not None and paid and amount > paid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Le remboursement dépasse les {paid:,.0f} FCFA encaissés".replace(",", " "))
    o.dispute_status = DECISION_STATUS[payload.decision]
    o.dispute_note = payload.reason
    o.dispute_resolved_at = utcnow()
    o.dispute_refund_amount = amount
    if amount:
        db.add(Refund(order_id=o.id, amount=amount, reason=payload.reason, origin="dispute", requested_by=admin.id))
    db.add(DisputeMessage(order_id=o.id, author_id=admin.id, author_name="Équipe Sur-MeZur", author_role="admin",
                          audience="both", body=f"Décision : {payload.reason}"))
    _notify_parties(db, o, "dispute_decided", {"decision": payload.decision, "amount": amount, "reason": payload.reason})
    audit.record(db, admin, f"dispute.{payload.decision}", "order", o.id, summary=payload.reason, details={"montant": amount}, request=request)
    db.commit()
    return {"ok": True, "dispute_status": o.dispute_status, "refund_amount": amount}


@router.get("/disputes-stats")
def disputes_stats(db: Session = Depends(get_db), _=Depends(require_perm("disputes"))):
    """7.5 — anciennete, alertes et causes les plus frequentes."""
    alert_days = int(get_setting("dispute_alert_days", db) or 7)
    now = utcnow()
    rows = db.query(Order).filter(Order.dispute_status.isnot(None)).all()
    open_rows = [o for o in rows if o.dispute_status == "open"]
    ages = [(now - as_utc(o.dispute_opened_at or o.updated_at)).days for o in open_rows]
    durations = [
        (as_utc(o.dispute_resolved_at) - as_utc(o.dispute_opened_at)).total_seconds() / 86400
        for o in rows if o.dispute_status != "open" and o.dispute_resolved_at and o.dispute_opened_at
    ]
    return {
        "open": len(open_rows),
        "overdue": sum(1 for a in ages if a >= alert_days),
        "alert_days": alert_days,
        "avg_open_age_days": round(sum(ages) / len(ages), 1) if ages else None,
        "avg_resolution_days": round(sum(durations) / len(durations), 1) if durations else None,
        "by_category": dict(Counter(o.dispute_category or "non renseignée" for o in rows).most_common()),
        "by_outcome": dict(Counter(o.dispute_status for o in rows if o.dispute_status != "open").most_common()),
        "opened_by": dict(Counter(o.dispute_opened_by or "?" for o in rows)),
    }
