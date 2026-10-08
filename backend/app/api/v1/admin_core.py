"""
Socle de l'administration web : profil de l'administrateur, compteurs du
menu (0.2), recherche globale (0.3), notes internes (0.10) et tableau de
bord (M1).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import iso, order_row, party_names
from app.core.deps import get_db, require_roles
from app.models.acquisition import UserAcquisition
from app.models.admin import AdminNote, SupportTicket
from app.models.catalog import GarmentModel
from app.models.collecte import DatasetSubject
from app.models.enums import ModerationStatus, VerificationStatus
from app.models.measurements import Measurement, MeasurementSession
from app.models.misc import Review
from app.models.operations import Refund, ReviewReport
from app.models.orders import Offer, Order
from app.models.payments import Payment
from app.models.users import ClientProfile, TailorProfile, User, VerificationDocument
from app.services import audit
from app.services.activity import as_utc, local_day, utcnow
from app.services.admin_perms import ADMIN_ROLES, admin_role_of, has_perm, permissions_of, require_perm
from app.services.platform_settings import get_setting
from app.services.user_stats import (
    Segment,
    goals_progress,
    in_range,
    load_users,
    local_start_utc,
    metric_value,
    money_between,
    pct_change,
    previous_range,
    resolve_range,
    timeseries,
)

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])


# --- Profil -------------------------------------------------------------------


@router.get("/me")
def admin_me(user: User = Depends(require_roles("admin"))):
    role = admin_role_of(user)
    return {
        "id": user.id,
        "full_name": user.full_name,
        "phone": user.phone,
        "admin_role": role,
        "admin_role_label": ADMIN_ROLES.get(role, role),
        "permissions": permissions_of(user),
        "totp_enabled": bool(user.totp_enabled),
        "idle_minutes": int(get_setting("admin_idle_minutes") or 0),
    }


# --- 0.2 Compteurs du menu, 1.2 file des actions -------------------------------------


def _pending_verifications(db: Session):
    submitted = db.query(VerificationDocument.user_id).distinct()
    return db.query(TailorProfile).filter(
        TailorProfile.user_id.in_(submitted), TailorProfile.verification_status == VerificationStatus.pending
    )


def _late_orders(db: Session) -> list[Order]:
    today = local_day()
    no_response_days = int(get_setting("order_no_response_days", db) or 3)
    open_statuses = ("new", "in_progress", "ready_for_pickup")
    out = []
    offered = {oid for (oid,) in db.query(Offer.order_id).filter(Offer.actor == "tailor").distinct()}
    for o in db.query(Order).filter(Order.status.in_(open_statuses)).all():
        if o.desired_date and o.desired_date < today and str(getattr(o.status, "value", o.status)) != "ready_for_pickup":
            out.append(o)
        elif str(getattr(o.status, "value", o.status)) == "new" and o.id not in offered and (
            utcnow() - as_utc(o.created_at)
        ).days >= no_response_days:
            out.append(o)
    return out


@router.get("/counters")
def counters(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """Nombre d'elements en attente par entree du menu. Appele toutes les
    minutes par l'interface, avec l'en-tete X-SMZ-Background (ne prolonge
    pas la session)."""
    from app.services.platform_settings import get_setting as get_platform_setting

    features = get_platform_setting("features") or {}
    verification_on = bool(features.get("tailor_verification", False))
    payments_on = bool(features.get("payments", False))
    out: dict[str, int] = {}
    if has_perm(user, "tailors") and verification_on:
        out["verifications"] = _pending_verifications(db).count()
    if has_perm(user, "disputes"):
        out["disputes"] = db.query(func.count(Order.id)).filter(Order.dispute_status == "open").scalar() or 0
    if has_perm(user, "reviews"):
        out["reviews"] = (
            db.query(func.count(Review.id)).filter(Review.moderation_status == ModerationStatus.flagged).scalar() or 0
        )
    if has_perm(user, "catalog"):
        out["catalog"] = db.query(func.count(GarmentModel.id)).filter(GarmentModel.status == "pending").scalar() or 0
    if has_perm(user, "payments") and payments_on:
        out["payments"] = (
            db.query(func.count(Payment.id)).filter(Payment.status == "failed").scalar() or 0
        ) + (db.query(func.count(Refund.id)).filter(Refund.status == "pending").scalar() or 0)
    if has_perm(user, "support"):
        out["support"] = db.query(func.count(SupportTicket.id)).filter(SupportTicket.status == "new").scalar() or 0
    if has_perm(user, "growth"):
        since = local_start_utc(local_day() - timedelta(days=30))
        qualified = db.query(UserAcquisition.user_id).filter(UserAcquisition.qualified.is_(True))
        out["acquisition"] = (
            db.query(func.count(User.id))
            .filter(
                User.role.in_(("client", "tailor")),
                User.is_guest.is_(False),
                User.created_at >= since,
                User.id.notin_(qualified),
            )
            .scalar()
            or 0
        )
    if has_perm(user, "orders.read"):
        out["orders"] = len(_late_orders(db))
    if has_perm(user, "collecte"):
        out["collecte"] = (
            db.query(func.count(DatasetSubject.id)).filter(DatasetSubject.review_status == "pending").scalar() or 0
        )
    return out


@router.get("/queue")
def action_queue(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """1.2 — toutes les taches en attente, de la plus ancienne a la plus
    recente, avec un lien vers chacune."""
    from app.services.platform_settings import get_setting as get_platform_setting

    features = get_platform_setting("features") or {}
    verification_on = bool(features.get("tailor_verification", False))
    payments_on = bool(features.get("payments", False))
    items: list[dict] = []
    if has_perm(user, "tailors") and verification_on:
        for tp in _pending_verifications(db).all():
            items.append({
                "type": "verification", "label": "Vérification de tailleur", "title": tp.shop_name,
                "since": iso(tp.updated_at), "href": f"/admin/verifications?id={tp.id}",
            })
    if has_perm(user, "disputes"):
        for o in db.query(Order).filter(Order.dispute_status == "open").all():
            items.append({
                "type": "dispute", "label": "Litige ouvert", "title": f"Commande {o.id[:8].upper()}",
                "since": iso(o.dispute_opened_at or o.updated_at), "href": f"/admin/litiges/{o.id}",
            })
    if has_perm(user, "reviews"):
        for r in db.query(Review).filter(Review.moderation_status == ModerationStatus.flagged).all():
            items.append({
                "type": "review", "label": "Avis signalé", "title": f"{r.stars}★ — {(r.comment or '')[:60]}",
                "since": iso(r.updated_at), "href": "/admin/avis?statut=flagged",
            })
    if has_perm(user, "catalog"):
        for m in db.query(GarmentModel).filter(GarmentModel.status == "pending").all():
            items.append({
                "type": "model", "label": "Modèle à modérer", "title": m.name,
                "since": iso(m.created_at), "href": "/admin/catalogue?onglet=moderation",
            })
    if has_perm(user, "payments") and payments_on:
        for p in db.query(Payment).filter(Payment.status == "failed").all():
            items.append({
                "type": "payment", "label": "Paiement en échec", "title": f"{float(p.amount):,.0f} FCFA".replace(",", " "),
                "since": iso(p.updated_at), "href": "/admin/paiements?onglet=echecs",
            })
        for r in db.query(Refund).filter(Refund.status == "pending").all():
            items.append({
                "type": "refund", "label": "Remboursement à effectuer", "title": f"{float(r.amount):,.0f} FCFA".replace(",", " "),
                "since": iso(r.created_at), "href": "/admin/paiements?onglet=remboursements",
            })
    if has_perm(user, "support"):
        for t in db.query(SupportTicket).filter(SupportTicket.status == "new").all():
            items.append({
                "type": "ticket", "label": "Demande de support", "title": f"#{t.number} {t.subject}",
                "since": iso(t.created_at), "href": f"/admin/support/{t.id}",
            })
    if has_perm(user, "orders.read"):
        for o in _late_orders(db):
            items.append({
                "type": "late_order", "label": "Commande en retard", "title": f"Commande {o.id[:8].upper()}",
                "since": iso(o.created_at), "href": f"/admin/commandes/{o.id}",
            })
    items.sort(key=lambda i: i["since"] or "")
    return {"items": items, "total": len(items)}


# --- 0.3 Recherche globale --------------------------------------------------------------


@router.get("/search")
def global_search(
    q: str = Query(..., min_length=2),
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    needle = q.strip()
    like = f"%{needle}%"
    results: list[dict] = []
    if has_perm(user, "users.read"):
        for u in (
            db.query(User)
            .filter(User.is_guest.is_(False), or_(User.full_name.ilike(like), User.phone.ilike(like), User.email.ilike(like)))
            .limit(6)
        ):
            results.append({
                "type": "user", "title": u.full_name, "subtitle": f"{getattr(u.role, 'value', u.role)} · {u.phone}",
                "href": f"/admin/utilisateurs/{u.id}",
            })
    if has_perm(user, "orders.read"):
        ref = needle.lower().replace("#", "")
        orders = db.query(Order).filter(Order.id.ilike(f"{ref}%")).limit(5).all() if len(ref) >= 4 else []
        clients, tailors = party_names(db, orders)
        for o in orders:
            row = order_row(o, clients, tailors)
            results.append({
                "type": "dispute" if o.dispute_status == "open" else "order",
                "title": f"Commande {row['ref']}",
                "subtitle": f"{row['client_name'] or '?'} → {row['tailor_name'] or '?'}",
                "href": f"/admin/litiges/{o.id}" if o.dispute_status == "open" else f"/admin/commandes/{o.id}",
            })
    if has_perm(user, "catalog"):
        for m in db.query(GarmentModel).filter(GarmentModel.name.ilike(like)).limit(5):
            results.append({"type": "model", "title": m.name, "subtitle": f"modèle · {m.status}", "href": f"/admin/catalogue?q={m.name}"})
    if has_perm(user, "tailors"):
        for tp in db.query(TailorProfile).filter(TailorProfile.shop_name.ilike(like)).limit(5):
            results.append({"type": "tailor", "title": tp.shop_name, "subtitle": f"tailleur · {tp.city or ''}", "href": f"/admin/utilisateurs/{tp.user_id}"})
    if has_perm(user, "support"):
        filters = [SupportTicket.subject.ilike(like), SupportTicket.name.ilike(like)]
        if needle.lstrip("#").isdigit():
            filters.append(SupportTicket.number == int(needle.lstrip("#")))
        for t in db.query(SupportTicket).filter(or_(*filters)).limit(5):
            results.append({"type": "ticket", "title": f"#{t.number} {t.subject}", "subtitle": t.name, "href": f"/admin/support/{t.id}"})
    return {"results": results}


# --- 0.10 Notes internes ------------------------------------------------------------------


class NoteIn(BaseModel):
    entity_type: str = Field(pattern="^(user|order|dispute|tailor|ticket|payment)$")
    entity_id: str
    body: str = Field(min_length=1, max_length=5000)


def _note_out(n: AdminNote) -> dict:
    return {"id": n.id, "author_id": n.author_id, "author_name": n.author_name, "body": n.body, "created_at": iso(n.created_at)}


@router.get("/notes")
def list_notes(entity_type: str, entity_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(AdminNote)
        .filter(AdminNote.entity_type == entity_type, AdminNote.entity_id == entity_id)
        .order_by(AdminNote.created_at.desc())
        .all()
    )
    return [_note_out(n) for n in rows]


@router.post("/notes", status_code=status.HTTP_201_CREATED)
def add_note(payload: NoteIn, request: Request, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    note = AdminNote(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        author_id=user.id,
        author_name=user.full_name,
        body=payload.body.strip(),
    )
    db.add(note)
    db.flush()
    audit.record(db, user, "note.add", payload.entity_type, payload.entity_id, request=request)
    db.commit()
    return _note_out(note)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: str, request: Request, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    note = db.get(AdminNote, note_id)
    if not note:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note introuvable")
    if note.author_id != user.id and not has_perm(user, "security"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul l'auteur peut supprimer sa note")
    audit.record(db, user, "note.delete", note.entity_type, note.entity_id, request=request)
    db.delete(note)
    db.commit()


# --- M1 Tableau de bord ----------------------------------------------------------------------


def _kpis(db: Session, start: date, end: date) -> dict:
    users = load_users(db)
    lo, hi = local_start_utc(start), local_start_utc(end + timedelta(days=1))

    def between(dt) -> bool:
        return dt is not None and lo <= as_utc(dt) < hi

    sessions = db.query(MeasurementSession.status, MeasurementSession.created_at).all()
    measured = [s for s in sessions if between(s[1])]
    cash, commission = money_between(db, start, end)
    return {
        "new_users": sum(1 for u in users if in_range(u.created, start, end)),
        "new_clients": sum(1 for u in users if u.role == "client" and in_range(u.created, start, end)),
        "new_tailors": sum(1 for u in users if u.role == "tailor" and in_range(u.created, start, end)),
        "active_users": metric_value(db, "active_users", start, end) or 0,
        "measurements": sum(1 for s in measured if str(getattr(s[0], "value", s[0])) == "ready"),
        "measurement_failures": sum(1 for s in measured if str(getattr(s[0], "value", s[0])) == "failed"),
        "orders": sum(1 for (c,) in db.query(Order.created_at).all() if between(c)),
        "disputes": sum(1 for (c,) in db.query(Order.dispute_opened_at).filter(Order.dispute_opened_at.isnot(None)).all() if between(c)),
        "cash_in": cash,
        "commission": commission,
    }


@router.get("/dashboard")
def dashboard(
    period: str = "month",
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("dashboard")),
):
    """1.1 et 1.3 — chiffres cles de la periode, compares a la precedente."""
    start, end = resolve_range(period, start, end)
    prev_start, prev_end = previous_range(start, end)
    current = _kpis(db, start, end)
    previous = _kpis(db, prev_start, prev_end)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "previous_start": prev_start.isoformat(),
        "previous_end": prev_end.isoformat(),
        "kpis": {
            k: {"value": v, "previous": previous[k], "change_pct": pct_change(float(v), float(previous[k]))}
            for k, v in current.items()
        },
        "goals": goals_progress(db),
    }


@router.get("/timeseries")
def dashboard_timeseries(
    metric: str = Query(..., pattern="^(signups|measurements|measurement_failures|orders|gmv|commission|active_users)$"),
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    period: str = "month",
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("dashboard")),
):
    """1.4 — evolution dans le temps."""
    start, end = resolve_range(period, start, end)
    return {"metric": metric, "granularity": granularity, "series": timeseries(db, metric, start, end, granularity)}


@router.get("/funnel")
def funnel(
    period: str = "month",
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("dashboard")),
):
    """1.6 — du visiteur qui mesure sans compte au client qui commande."""
    start, end = resolve_range(period, start, end)
    lo, hi = local_start_utc(start), local_start_utc(end + timedelta(days=1))

    def between(dt) -> bool:
        return dt is not None and lo <= as_utc(dt) < hi

    # Visiteurs : comptes invites crees sur la periode (y compris ceux qui
    # se sont inscrits depuis, reconnaissables a guest_converted_at).
    visitors = db.query(User.id, User.created_at, User.guest_converted_at, User.is_guest).filter(
        or_(User.is_guest.is_(True), User.guest_converted_at.isnot(None))
    ).all()
    guest_ids = {v[0] for v in visitors if (between(v[1]) if v[3] else True)}
    guest_profiles = dict(db.query(ClientProfile.user_id, ClientProfile.id).filter(ClientProfile.user_id.in_(guest_ids)).all()) if guest_ids else {}
    measured_profiles = {cid for (cid,) in db.query(Measurement.client_id).distinct()}
    guests_measured = sum(1 for uid in guest_ids if guest_profiles.get(uid) in measured_profiles)
    converted = sum(1 for v in visitors if v[2] is not None and between(v[2]))

    clients = [u for u in load_users(db, Segment(role="client")) if in_range(u.created, start, end)]
    with_measure = [u for u in clients if u.client_id in measured_profiles]
    ordering = {cid for (cid,) in db.query(Order.client_id).distinct()}
    delivered = {cid for (cid,) in db.query(Order.client_id).filter(Order.status == "finished_delivered").distinct()}
    steps = [
        {"key": "visitors", "label": "Visiteurs ayant lancé une mesure sans compte", "value": len(guest_ids)},
        {"key": "visitors_measured", "label": "… dont mesure obtenue", "value": guests_measured},
        {"key": "converted", "label": "Visiteurs devenus inscrits", "value": converted},
        {"key": "clients", "label": "Nouveaux clients inscrits", "value": len(clients)},
        {"key": "clients_measured", "label": "Clients avec au moins une mesure", "value": len(with_measure)},
        {"key": "clients_ordering", "label": "Clients ayant commandé", "value": sum(1 for u in clients if u.client_id in ordering)},
        {"key": "clients_delivered", "label": "Clients livrés", "value": sum(1 for u in clients if u.client_id in delivered)},
    ]
    return {"start": start.isoformat(), "end": end.isoformat(), "steps": steps}


@router.get("/by-city")
def activity_by_city(db: Session = Depends(get_db), _=Depends(require_perm("dashboard"))):
    """1.7 / 3.8 — inscriptions, tailleurs et commandes par ville et quartier."""
    cities: dict[str, dict] = defaultdict(lambda: {"clients": 0, "tailors": 0, "tailors_verified": 0, "orders": 0, "quartiers": Counter()})
    for u in load_users(db):
        if u.role == "client":
            cities[(u.city or "Non renseignée").strip()]["clients"] += 1
    tailor_city: dict[str, str] = {}
    for tp in db.query(TailorProfile).all():
        city = (tp.city or "Non renseignée").strip()
        tailor_city[tp.id] = city
        cities[city]["tailors"] += 1
        if str(getattr(tp.verification_status, "value", tp.verification_status)) == "approved":
            cities[city]["tailors_verified"] += 1
        if tp.quartier:
            cities[city]["quartiers"][tp.quartier.strip()] += 1
    for (tailor_id,) in db.query(Order.tailor_id).all():
        cities[tailor_city.get(tailor_id, "Non renseignée")]["orders"] += 1
    rows = [
        {"city": c, **{k: v for k, v in d.items() if k != "quartiers"}, "quartiers": [{"name": q, "tailors": n} for q, n in d["quartiers"].most_common()]}
        for c, d in cities.items()
    ]
    rows.sort(key=lambda r: -(r["clients"] + r["tailors"] + r["orders"]))
    return {"cities": rows}
