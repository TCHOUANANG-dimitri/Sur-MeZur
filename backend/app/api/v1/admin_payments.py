"""
Paiements, commissions et versements (M6) dans l'administration web.

Le Mobile Money est encore simule (services/payment_provider.py). Les
ecrans ci-dessous lisent ce que la plateforme enregistre ; remboursements et
versements sont consignes par l'equipe apres envoi chez l'operateur, en
attendant que le vrai fournisseur les execute directement.
"""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso, party_names
from app.core.deps import get_db, require_roles
from app.models.enums import EscrowStatus, PaymentStatus
from app.models.operations import Refund, TailorPayout
from app.models.orders import Order, Quote
from app.models.payments import Payment, PaymentSplit
from app.models.users import ClientProfile, TailorProfile, User
from app.services import audit
from app.services.activity import as_utc, local_day, utcnow
from app.services.admin_perms import require_perm
from app.services.notify import notify
from app.services.tables import TableParams, apply_sort, csv_response, page_of, table_params, table_response
from app.services.user_stats import local_start_utc

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])

PROVIDER_LABELS = {"mtn_momo": "MTN MoMo", "orange_money": "Orange Money"}
PHASE_LABELS = {"deposit_70": "Acompte", "balance_30": "Solde"}

PAYMENT_COLUMNS = [
    ("created_at", "Date"), ("order_ref", "Commande"), ("client_name", "Client"), ("tailor_name", "Tailleur"),
    ("phase_label", "Phase"), ("provider_label", "Opérateur"), ("amount", "Montant (FCFA)"),
    ("status", "Statut"), ("provider_txn_ref", "Référence opérateur"), ("psp_ref", "Référence PSP"),
]


def _orders_for(db: Session, order_ids: set[str]) -> dict[str, Order]:
    if not order_ids:
        return {}
    return {o.id: o for o in db.query(Order).filter(Order.id.in_(order_ids))}


@router.get("/tables/payments")
def payments_table(
    params: TableParams = Depends(table_params),
    q: str | None = None,
    status_: str | None = Query(None, alias="status"),
    provider: str | None = None,
    phase: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    stuck: bool | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("payments")),
):
    """6.2 / 6.3 — paiements avec leur etat chez l'operateur. `stuck` :
    paiements en attente depuis plus d'une heure (bloques)."""
    query = db.query(Payment)
    if status_:
        query = query.filter(Payment.status == status_)
    if provider:
        query = query.filter(Payment.provider == provider)
    if phase:
        query = query.filter(Payment.phase == phase)
    if date_from:
        query = query.filter(Payment.created_at >= local_start_utc(date_from))
    if date_to:
        query = query.filter(Payment.created_at < local_start_utc(date_to + timedelta(days=1)))
    if stuck:
        query = query.filter(Payment.status == "pending", Payment.created_at < utcnow() - timedelta(hours=1))
    if q:
        needle = q.strip()
        query = query.filter(or_(Payment.provider_txn_ref.ilike(f"%{needle}%"), Payment.psp_ref.ilike(f"%{needle}%"),
                                 Payment.order_id.ilike(f"{needle.lower().lstrip('#')}%")))
    query = apply_sort(query, params, {"created_at": Payment.created_at, "amount": Payment.amount, "status": Payment.status}, "created_at")
    rows, total = page_of(query, params)
    orders = _orders_for(db, {p.order_id for p in rows})
    clients, tailors = party_names(db, list(orders.values()))

    def serialize(p: Payment) -> dict:
        o = orders.get(p.order_id)
        client = clients.get(o.client_id) if o else None
        tailor = tailors.get(o.tailor_id) if o else None
        phase_ = getattr(p.phase, "value", p.phase)
        provider_ = getattr(p.provider, "value", p.provider)
        return {
            "id": p.id, "order_id": p.order_id, "order_ref": p.order_id[:8].upper(),
            "client_name": client.full_name if client else None, "client_user_id": client.id if client else None,
            "tailor_name": (tailor[0].shop_name if tailor else None),
            "phase": phase_, "phase_label": PHASE_LABELS.get(phase_, phase_),
            "provider": provider_, "provider_label": PROVIDER_LABELS.get(provider_, provider_),
            "amount": float(p.amount), "status": getattr(p.status, "value", p.status),
            "provider_txn_ref": p.provider_txn_ref, "psp_ref": p.psp_ref,
            "created_at": iso(p.created_at), "updated_at": iso(p.updated_at),
        }

    return table_response(params, rows, total, serialize, "paiements", PAYMENT_COLUMNS)


@router.post("/payments/{payment_id}/remind")
def remind_payment(payment_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("payments"))):
    """6.3 — relancer le client d'un paiement refuse ou bloque."""
    p = get_or_404(db, Payment, payment_id, "Paiement")
    o = db.get(Order, p.order_id)
    client = db.get(ClientProfile, o.client_id) if o else None
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client introuvable")
    notify(db, client.user_id, "payment_retry_requested", {
        "order_id": p.order_id, "payment_id": p.id, "amount": float(p.amount), "phase": getattr(p.phase, "value", p.phase),
    })
    audit.record(db, admin, "payment.remind", "payment", p.id, request=request)
    db.commit()
    return {"ok": True}


class PaymentStatusIn(BaseModel):
    status: str = Field(pattern="^(paid|failed)$")
    reason: str = Field(min_length=3, max_length=500)


@router.post("/payments/{payment_id}/status")
def set_payment_status(payment_id: str, payload: PaymentStatusIn, request: Request, db: Session = Depends(get_db),
                       admin: User = Depends(require_perm("payments"))):
    """6.3 — trancher un paiement bloque d'apres le releve de l'operateur.
    « paye » declenche le meme traitement qu'une confirmation de l'operateur."""
    from app.services.payment_provider import finalize_balance, finalize_deposit

    p = get_or_404(db, Payment, payment_id, "Paiement")
    if str(getattr(p.status, "value", p.status)) != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seul un paiement en attente peut être tranché")
    audit.record(db, admin, f"payment.mark_{payload.status}", "payment", p.id, summary=payload.reason, request=request)
    if payload.status == "failed":
        p.status = PaymentStatus.failed
        db.commit()
    else:
        db.commit()
        if getattr(p.phase, "value", p.phase) == "deposit_70":
            quote = db.query(Quote).filter(Quote.order_id == p.order_id).order_by(Quote.created_at.desc()).first()
            finalize_deposit(db, p, float(quote.total) if quote else float(p.amount) / 0.7)
        else:
            finalize_balance(db, p)
    return {"ok": True}


# --- 6.4 Sequestre et versements -----------------------------------------------------------


def _payout_summary(db: Session) -> dict[str, dict]:
    tailors = {t.id: t for t in db.query(TailorProfile).all()}
    orders = {o.id: o for o in db.query(Order).all()}
    paid_phases: dict[str, set[str]] = defaultdict(set)
    for oid, phase, st in db.query(Payment.order_id, Payment.phase, Payment.status).all():
        if str(getattr(st, "value", st)) in ("paid", "released"):
            paid_phases[oid].add(str(getattr(phase, "value", phase)))
    commissions: dict[str, float] = {}
    for oid, amount, accepted in db.query(Quote.order_id, Quote.commission_amount, Quote.accepted).all():
        if accepted:
            commissions[oid] = float(amount or 0)

    out: dict[str, dict] = defaultdict(lambda: {"due_immediate": 0.0, "due_delivery": 0.0, "held": 0.0, "paid": 0.0,
                                                 "commission": 0.0, "orders": 0, "refunded": 0.0})
    for split in db.query(PaymentSplit).all():
        o = orders.get(split.order_id)
        if not o:
            continue
        s = out[o.tailor_id]
        s["orders"] += 1
        commission = commissions.get(o.id, 0.0)
        s["commission"] += commission
        escrow = getattr(split.escrow_status, "value", split.escrow_status)
        if escrow == "refunded":
            continue
        # Part immediate a l'acompte, moins la commission prelevee dessus.
        s["due_immediate"] += max(0.0, float(split.tailor_immediate_40) - commission)
        if escrow == "released" or "balance_30" in paid_phases.get(o.id, set()):
            s["due_delivery"] += float(split.escrow_30) + float(split.balance_30)
        else:
            s["held"] += float(split.escrow_30)
    for tailor_id, amount, st in db.query(TailorPayout.tailor_id, TailorPayout.amount, TailorPayout.status).all():
        if st == "paid":
            out[tailor_id]["paid"] += float(amount)
    for r in db.query(Refund).filter(Refund.status == "completed").all():
        o = orders.get(r.order_id)
        if o:
            out[o.tailor_id]["refunded"] += float(r.amount)
    result = {}
    for tid, s in out.items():
        tp = tailors.get(tid)
        due = s["due_immediate"] + s["due_delivery"] - s["refunded"]
        result[tid] = {
            "tailor_id": tid, "shop_name": tp.shop_name if tp else "?", "user_id": tp.user_id if tp else None,
            "orders": s["orders"], "due_total": round(due, 2), "paid": round(s["paid"], 2),
            "balance": round(due - s["paid"], 2), "held_in_escrow": round(s["held"], 2),
            "commission": round(s["commission"], 2), "refunded": round(s["refunded"], 2),
        }
    return result


@router.get("/payouts/summary")
def payouts_summary(db: Session = Depends(get_db), _=Depends(require_perm("payments"))):
    rows = sorted(_payout_summary(db).values(), key=lambda r: -r["balance"])
    return {
        "tailors": rows,
        "totals": {k: round(sum(r[k] for r in rows), 2) for k in ("due_total", "paid", "balance", "held_in_escrow", "commission")},
    }


class PayoutIn(BaseModel):
    tailor_id: str
    amount: float = Field(gt=0)
    order_id: str | None = None
    kind: str = Field("manual", pattern="^(deposit|delivery|manual)$")
    reference: str | None = Field(None, max_length=64)
    note: str | None = Field(None, max_length=1000)


@router.post("/payouts")
def record_payout(payload: PayoutIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("payments"))):
    tp = get_or_404(db, TailorProfile, payload.tailor_id, "Tailleur")
    payout = TailorPayout(**payload.model_dump(), status="paid", paid_at=utcnow(), recorded_by=admin.id)
    db.add(payout)
    db.flush()
    notify(db, tp.user_id, "payout_sent", {"amount": payload.amount, "reference": payload.reference})
    audit.record(db, admin, "payout.record", "tailor", tp.id, summary=f"{payload.amount:.0f} FCFA", details=payload.model_dump(), request=request)
    db.commit()
    return {"id": payout.id}


PAYOUT_COLUMNS = [("paid_at", "Date"), ("shop_name", "Tailleur"), ("amount", "Montant"), ("kind", "Type"),
                  ("reference", "Référence"), ("order_ref", "Commande"), ("note", "Note")]


@router.get("/tables/payouts")
def payouts_table(params: TableParams = Depends(table_params), tailor_id: str | None = None,
                  db: Session = Depends(get_db), _=Depends(require_perm("payments"))):
    query = db.query(TailorPayout, TailorProfile).join(TailorProfile, TailorProfile.id == TailorPayout.tailor_id)
    if tailor_id:
        query = query.filter(TailorPayout.tailor_id == tailor_id)
    query = apply_sort(query, params, {"paid_at": TailorPayout.paid_at, "amount": TailorPayout.amount}, "paid_at")
    rows, total = page_of(query, params)
    return table_response(params, rows, total, lambda r: {
        "id": r[0].id, "tailor_id": r[1].id, "shop_name": r[1].shop_name, "amount": float(r[0].amount), "kind": r[0].kind,
        "status": r[0].status, "reference": r[0].reference, "order_id": r[0].order_id,
        "order_ref": r[0].order_id[:8].upper() if r[0].order_id else None, "note": r[0].note, "paid_at": iso(r[0].paid_at),
    }, "versements", PAYOUT_COLUMNS)


# --- 6.5 Remboursements -------------------------------------------------------------------------


REFUND_COLUMNS = [("created_at", "Demandé le"), ("order_ref", "Commande"), ("amount", "Montant"), ("origin", "Origine"),
                  ("reason", "Motif"), ("status", "Statut"), ("provider_ref", "Référence"), ("completed_at", "Effectué le")]


@router.get("/tables/refunds")
def refunds_table(params: TableParams = Depends(table_params), status_: str | None = Query(None, alias="status"),
                  db: Session = Depends(get_db), _=Depends(require_perm("payments"))):
    query = db.query(Refund)
    if status_:
        query = query.filter(Refund.status == status_)
    query = apply_sort(query, params, {"created_at": Refund.created_at, "amount": Refund.amount}, "created_at")
    rows, total = page_of(query, params)
    return table_response(params, rows, total, lambda r: {
        "id": r.id, "order_id": r.order_id, "order_ref": r.order_id[:8].upper(), "amount": float(r.amount), "origin": r.origin,
        "reason": r.reason, "status": r.status, "provider_ref": r.provider_ref, "created_at": iso(r.created_at),
        "completed_at": iso(r.completed_at),
    }, "remboursements", REFUND_COLUMNS)


class RefundIn(BaseModel):
    order_id: str
    amount: float = Field(gt=0)
    reason: str = Field(min_length=3, max_length=1000)


@router.post("/refunds")
def create_refund(payload: RefundIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("payments"))):
    o = get_or_404(db, Order, payload.order_id, "Commande")
    refund = Refund(order_id=o.id, amount=payload.amount, reason=payload.reason, origin="dispute" if o.dispute_status else "order",
                    requested_by=admin.id)
    db.add(refund)
    db.flush()
    audit.record(db, admin, "refund.create", "order", o.id, summary=f"{payload.amount:.0f} FCFA — {payload.reason}", request=request)
    db.commit()
    return {"id": refund.id}


class RefundCompleteIn(BaseModel):
    status: str = Field(pattern="^(completed|failed|cancelled)$")
    provider_ref: str | None = Field(None, max_length=64)


@router.post("/refunds/{refund_id}/status")
def refund_status(refund_id: str, payload: RefundCompleteIn, request: Request, db: Session = Depends(get_db),
                  admin: User = Depends(require_perm("payments"))):
    r = get_or_404(db, Refund, refund_id, "Remboursement")
    if r.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ce remboursement est déjà traité")
    r.status = payload.status
    r.provider_ref = payload.provider_ref
    if payload.status == "completed":
        r.completed_at = utcnow()
        o = db.get(Order, r.order_id)
        paid = [p for p in db.query(Payment).filter(Payment.order_id == r.order_id).all()
                if str(getattr(p.status, "value", p.status)) in ("paid", "released")]
        if paid and float(r.amount) >= sum(float(p.amount) for p in paid):
            for p in paid:
                p.status = PaymentStatus.refunded
            split = db.query(PaymentSplit).filter(PaymentSplit.order_id == r.order_id).first()
            if split:
                split.escrow_status = EscrowStatus.refunded
        client = db.get(ClientProfile, o.client_id) if o else None
        if client:
            notify(db, client.user_id, "refund_completed", {"order_id": r.order_id, "amount": float(r.amount)})
    audit.record(db, admin, f"refund.{payload.status}", "order", r.order_id, summary=payload.provider_ref, request=request)
    db.commit()
    return {"ok": True}


# --- 6.6 Rapprochement ---------------------------------------------------------------------------


def _parse_amount(text: str) -> float | None:
    cleaned = (text or "").replace(" ", "").replace(" ", "").replace("FCFA", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


@router.post("/reconciliation")
async def reconciliation(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                         admin: User = Depends(require_perm("payments"))):
    """Compare le releve de l'operateur (CSV : colonnes reference ; montant ;
    date ; statut) aux paiements enregistres. Signale les references
    inconnues, les montants differents et les paiements absents du releve."""
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    if not raw.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fichier vide")
    dialect = csv.Sniffer().sniff(raw.splitlines()[0], delimiters=";,\t")
    reader = csv.DictReader(io.StringIO(raw), dialect=dialect)
    statement: dict[str, dict] = {}
    for row in reader:
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        ref = row.get("reference") or row.get("référence") or row.get("ref") or row.get("transaction")
        if not ref:
            continue
        statement[ref] = {"amount": _parse_amount(row.get("montant") or row.get("amount") or ""),
                          "date": row.get("date"), "status": (row.get("statut") or row.get("status") or "").lower()}
    dates = []
    for v in statement.values():
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
            try:
                dates.append(datetime.strptime(v["date"], fmt).date())
                break
            except (TypeError, ValueError):
                continue
    payments = {p.provider_txn_ref: p for p in db.query(Payment).all()}
    matched, mismatched, unknown, missing = [], [], [], []
    for ref, line in statement.items():
        p = payments.get(ref)
        if not p:
            unknown.append({"reference": ref, **line})
        elif line["amount"] is not None and abs(float(p.amount) - line["amount"]) > 0.5:
            mismatched.append({"reference": ref, "platform_amount": float(p.amount), "operator_amount": line["amount"],
                               "payment_id": p.id, "order_id": p.order_id})
        else:
            matched.append(ref)
    if dates:
        lo, hi = min(dates), max(dates)
        for ref, p in payments.items():
            d = local_day(p.created_at)
            if lo <= d <= hi and ref not in statement and str(getattr(p.status, "value", p.status)) in ("paid", "released"):
                missing.append({"reference": ref, "amount": float(p.amount), "payment_id": p.id, "order_id": p.order_id,
                                "date": iso(p.created_at)})
    report = {
        "lines": len(statement), "matched": len(matched), "mismatched": mismatched, "unknown": unknown,
        "missing_in_statement": missing, "period": [min(dates).isoformat(), max(dates).isoformat()] if dates else None,
    }
    audit.record(db, admin, "payments.reconciliation", summary=f"{len(statement)} lignes, {len(mismatched) + len(unknown) + len(missing)} écart(s)",
                 details={k: report[k] for k in ("lines", "matched", "period")}, request=request)
    db.commit()
    return report


# --- 6.7 Recus et releve mensuel ------------------------------------------------------------------


@router.get("/payments/{payment_id}/receipt")
def payment_receipt(payment_id: str, db: Session = Depends(get_db), _=Depends(require_perm("payments"))):
    p = get_or_404(db, Payment, payment_id, "Paiement")
    o = db.get(Order, p.order_id)
    clients, tailors = party_names(db, [o]) if o else ({}, {})
    client = clients.get(o.client_id) if o else None
    tailor = tailors.get(o.tailor_id) if o else None
    phase_ = getattr(p.phase, "value", p.phase)
    provider_ = getattr(p.provider, "value", p.provider)
    return {
        "number": f"R-{local_day(p.created_at).strftime('%Y%m')}-{p.id[:6].upper()}",
        "date": iso(p.created_at), "status": getattr(p.status, "value", p.status),
        "amount": float(p.amount), "phase": PHASE_LABELS.get(phase_, phase_), "provider": PROVIDER_LABELS.get(provider_, provider_),
        "provider_txn_ref": p.provider_txn_ref, "order_ref": p.order_id[:8].upper(),
        "order_total": float(o.agreed_price) if o and o.agreed_price is not None else None,
        "client": {"name": client.full_name, "phone": client.phone} if client else None,
        "tailor": {"name": tailor[0].shop_name, "city": tailor[0].city} if tailor else None,
    }


@router.get("/statements/monthly")
def monthly_statement(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    operator_fee_rate: float = Query(0.0, ge=0, le=0.2),
    format: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    _=Depends(require_perm("payments")),
):
    """Releve mensuel : encaissements, commissions, frais operateur estimes,
    versements et remboursements, operation par operation."""
    year, mon = (int(x) for x in month.split("-"))
    start = date(year, mon, 1)
    end = date(year + mon // 12, mon % 12 + 1, 1) - timedelta(days=1)
    lo, hi = local_start_utc(start), local_start_utc(end + timedelta(days=1))

    def within(dt) -> bool:
        return dt is not None and lo <= as_utc(dt) < hi

    lines = []
    cash = fees = 0.0
    for p in db.query(Payment).all():
        if within(p.created_at) and str(getattr(p.status, "value", p.status)) in ("paid", "released", "refunded"):
            fee = round(float(p.amount) * operator_fee_rate, 2)
            cash += float(p.amount)
            fees += fee
            lines.append({"date": iso(p.created_at), "type": "Encaissement", "reference": p.provider_txn_ref,
                          "order_ref": p.order_id[:8].upper(), "amount": float(p.amount), "operator_fee": fee})
    commission = 0.0
    splits = {s.order_id: s for s in db.query(PaymentSplit).all() if within(s.created_at)}
    for q in db.query(Quote).filter(Quote.accepted.is_(True)).all():
        if q.order_id in splits:
            commission += float(q.commission_amount or 0)
            lines.append({"date": iso(splits[q.order_id].created_at), "type": "Commission", "reference": "",
                          "order_ref": q.order_id[:8].upper(), "amount": float(q.commission_amount or 0), "operator_fee": 0})
    payouts = 0.0
    for t in db.query(TailorPayout).all():
        if within(t.paid_at) and t.status == "paid":
            payouts += float(t.amount)
            lines.append({"date": iso(t.paid_at), "type": "Versement tailleur", "reference": t.reference or "",
                          "order_ref": (t.order_id or "")[:8].upper(), "amount": -float(t.amount), "operator_fee": 0})
    refunds = 0.0
    for r in db.query(Refund).filter(Refund.status == "completed").all():
        if within(r.completed_at):
            refunds += float(r.amount)
            lines.append({"date": iso(r.completed_at), "type": "Remboursement", "reference": r.provider_ref or "",
                          "order_ref": r.order_id[:8].upper(), "amount": -float(r.amount), "operator_fee": 0})
    lines.sort(key=lambda l: l["date"] or "")
    summary = {"month": month, "cash_in": round(cash, 2), "commission": round(commission, 2), "operator_fees": round(fees, 2),
               "payouts": round(payouts, 2), "refunds": round(refunds, 2),
               "net": round(cash - fees - payouts - refunds, 2)}
    if format == "csv":
        cols = [("date", "Date"), ("type", "Type"), ("reference", "Référence"), ("order_ref", "Commande"),
                ("amount", "Montant (FCFA)"), ("operator_fee", "Frais opérateur")]
        return csv_response(f"releve-{month}", cols, lines)
    return {"summary": summary, "lines": lines}
