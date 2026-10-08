"""
Support utilisateurs (M12) et routes publiques de l'administration (bandeau,
maintenance, pages d'information, canaux d'acquisition).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso
from app.core.deps import get_current_user, get_current_user_optional, get_db, require_roles
from app.models.acquisition import AcquisitionChannel
from app.models.admin import InfoPage, SupportMessage, SupportTicket
from app.models.orders import Order
from app.models.tailor_tools import TailorClient, TailorClientMeasurement, TailorShareToken
from app.models.users import TailorProfile, User
from app.services import audit
from app.services.activity import utcnow
from app.services.admin_perms import has_perm, require_perm
from app.services.notify import notify
from app.services.platform_settings import PUBLIC_KEYS, get_setting
from app.services.rate_limit import check as rate_check, client_ip
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response

public_router = APIRouter(tags=["public"])
admin_router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])

TICKET_CATEGORIES = {
    "mesure": "Prise de mesure",
    "compte": "Mon compte",
    "commande": "Une commande",
    "paiement": "Un paiement",
    "tailleur": "Un tailleur",
    "suggestion": "Suggestion",
    "autre": "Autre",
}


# --- Public ----------------------------------------------------------------------------


@public_router.get("/public/config")
def public_config():
    """Bandeau (11.2), maintenance (13.8), villes (13.7) et question
    d'acquisition (14.9), lus par le site au chargement."""
    return {key: get_setting(key) for key in PUBLIC_KEYS}


@public_router.get("/public/acquisition-channels")
def public_channels(db: Session = Depends(get_db)):
    """14.9 — reponses proposees a « Comment nous avez-vous connu ? »."""
    rows = (
        db.query(AcquisitionChannel)
        .filter(AcquisitionChannel.active.is_(True), AcquisitionChannel.self_reportable.is_(True))
        .order_by(AcquisitionChannel.sort_order, AcquisitionChannel.name)
        .all()
    )
    return [{"code": c.code, "name": c.name} for c in rows]


@public_router.get("/public/pages/{slug}")
def public_page(slug: str, db: Session = Depends(get_db)):
    page = db.get(InfoPage, slug)
    if not page or not page.published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page introuvable")
    return {"slug": page.slug, "title": page.title, "body": page.body, "updated_at": iso(page.updated_at)}


@public_router.get("/public/pages")
def public_pages(db: Session = Depends(get_db)):
    return [{"slug": p.slug, "title": p.title} for p in db.query(InfoPage).filter(InfoPage.published.is_(True)).order_by(InfoPage.slug)]


@public_router.get("/public/fiches/{token}")
def public_sheet(token: str, db: Session = Depends(get_db)):
    """A2.3 — fiche de mesures partagee par un tailleur : lecture seule,
    sans compte, 30 jours. Un jeton expire repond 410 (plus : « lien expire »)."""
    share = db.query(TailorShareToken).filter(TailorShareToken.token == token).first()
    if not share:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lien inconnu")
    if share.expires_at and share.expires_at.replace(tzinfo=None) < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status.HTTP_410_GONE, "Ce lien a expiré, demandez-en un nouveau à votre tailleur")
    client = db.get(TailorClient, share.tailor_client_id)
    if not client or not client.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche indisponible")
    tailor = db.get(TailorProfile, share.tailor_id)
    rows = (
        db.query(TailorClientMeasurement)
        .filter(TailorClientMeasurement.tailor_client_id == client.id)
        .order_by(TailorClientMeasurement.created_at.desc())
        .limit(10)
        .all()
    )
    return {
        "full_name": client.full_name,
        "gender": client.gender,
        "shop_name": tailor.shop_name if tailor else None,
        "measurements": [
            {
                "data": m.data,
                "source": m.source,
                "height_cm": m.height_cm,
                "weight_kg": m.weight_kg,
                "note": m.note,
                "created_at": iso(m.created_at),
            }
            for m in rows
        ],
        "expires_at": iso(share.expires_at),
    }


class TicketIn(BaseModel):
    name: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=32)
    email: str | None = Field(None, max_length=255)
    subject: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=5, max_length=5000)
    category: str = "autre"
    order_id: str | None = None


def _next_number(db: Session) -> int:
    return int(db.query(func.max(SupportTicket.number)).scalar() or 1000) + 1


@public_router.post("/support/tickets", status_code=status.HTTP_201_CREATED)
def create_ticket(payload: TicketIn, request: Request, db: Session = Depends(get_db), user: User | None = Depends(get_current_user_optional)):
    """12.1 — formulaire « Nous contacter ». Ouvert aux visiteurs : il faut
    alors un nom et un moyen de recontacter."""
    registered = user is not None and not user.is_guest
    if not registered:
        # 1.5 : un visiteur peut inonder le support de demandes ; limite de
        # 5 par heure par IP.
        rate_check("ticket_ip", client_ip(request))
    name = (user.full_name if registered else (payload.name or "")).strip()
    phone = user.phone if registered else (payload.phone or "").strip() or None
    if not registered and (not name or not (phone or payload.email)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indiquez votre nom et un téléphone ou un e-mail pour qu'on puisse vous répondre")
    order_id = None
    if payload.order_id and db.get(Order, payload.order_id):
        order_id = payload.order_id
    ticket = SupportTicket(
        number=_next_number(db),
        user_id=user.id if registered else None,
        name=name[:255],
        phone=phone,
        email=(payload.email or (user.email if registered else None)),
        subject=payload.subject.strip(),
        body=payload.body.strip(),
        category=payload.category if payload.category in TICKET_CATEGORIES else "autre",
        order_id=order_id,
    )
    db.add(ticket)
    db.commit()
    return {"id": ticket.id, "number": ticket.number}


def _message_out(m: SupportMessage) -> dict:
    return {"id": m.id, "author_name": m.author_name, "from_staff": m.from_staff, "body": m.body, "created_at": iso(m.created_at)}


@public_router.get("/support/tickets/mine")
def my_tickets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(SupportTicket).filter(SupportTicket.user_id == user.id).order_by(SupportTicket.created_at.desc()).all()
    return [{"id": t.id, "number": t.number, "subject": t.subject, "status": t.status, "created_at": iso(t.created_at)} for t in rows]


@public_router.get("/support/tickets/{ticket_id}")
def my_ticket(ticket_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(SupportTicket, ticket_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demande introuvable")
    msgs = db.query(SupportMessage).filter(SupportMessage.ticket_id == t.id).order_by(SupportMessage.created_at).all()
    return {"id": t.id, "number": t.number, "subject": t.subject, "body": t.body, "status": t.status,
            "created_at": iso(t.created_at), "messages": [_message_out(m) for m in msgs]}


class TicketMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


@public_router.post("/support/tickets/{ticket_id}/messages", status_code=status.HTTP_201_CREATED)
def reply_my_ticket(ticket_id: str, payload: TicketMessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(SupportTicket, ticket_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demande introuvable")
    db.add(SupportMessage(ticket_id=t.id, author_id=user.id, author_name=user.full_name, from_staff=False, body=payload.body.strip()))
    if t.status == "resolved":
        t.status = "in_progress"
        t.resolved_at = None
    t.updated_at = utcnow()
    db.commit()
    return {"ok": True}


# --- Administration -----------------------------------------------------------------------


TICKET_COLUMNS = [("number", "N°"), ("created_at", "Reçue le"), ("name", "Demandeur"), ("phone", "Téléphone"),
                  ("category", "Catégorie"), ("subject", "Objet"), ("status", "Statut"), ("assignee", "Attribuée à")]


@admin_router.get("/tables/tickets")
def tickets_table(
    params: TableParams = Depends(table_params),
    status_: str | None = Query(None, alias="status"),
    category: str | None = None,
    assigned: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_perm("support")),
):
    """12.2 — file des demandes."""
    query = db.query(SupportTicket)
    if status_:
        query = query.filter(SupportTicket.status == status_)
    elif status_ is None:
        pass
    if category:
        query = query.filter(SupportTicket.category == category)
    if assigned == "me":
        query = query.filter(SupportTicket.assigned_to == admin.id)
    elif assigned == "none":
        query = query.filter(SupportTicket.assigned_to.is_(None))
    if q:
        like = f"%{q}%"
        filters = [SupportTicket.subject.ilike(like), SupportTicket.name.ilike(like), SupportTicket.phone.ilike(like)]
        if q.strip().lstrip("#").isdigit():
            filters.append(SupportTicket.number == int(q.strip().lstrip("#")))
        query = query.filter(or_(*filters))
    query = apply_sort(query, params, {"created_at": SupportTicket.created_at, "number": SupportTicket.number,
                                       "updated_at": SupportTicket.updated_at}, "created_at")
    rows, total = page_of(query, params)
    staff = {u.id: u.full_name for u in db.query(User).filter(User.id.in_({t.assigned_to for t in rows if t.assigned_to}))}
    return table_response(params, rows, total, lambda t: {
        "id": t.id, "number": t.number, "name": t.name, "phone": t.phone, "email": t.email, "category": t.category,
        "category_label": TICKET_CATEGORIES.get(t.category, t.category), "subject": t.subject, "status": t.status,
        "assigned_to": t.assigned_to, "assignee": staff.get(t.assigned_to), "user_id": t.user_id, "order_id": t.order_id,
        "created_at": iso(t.created_at), "updated_at": iso(t.updated_at),
    }, "support", TICKET_COLUMNS, extra={"categories": TICKET_CATEGORIES})


@admin_router.get("/tickets/{ticket_id}")
def ticket_detail(ticket_id: str, db: Session = Depends(get_db), _=Depends(require_perm("support"))):
    t = get_or_404(db, SupportTicket, ticket_id, "Demande")
    msgs = db.query(SupportMessage).filter(SupportMessage.ticket_id == t.id).order_by(SupportMessage.created_at).all()
    staff = [{"id": u.id, "full_name": u.full_name} for u in db.query(User).filter(User.role == "admin", User.is_active.is_(True))
             if has_perm(u, "support")]
    order = db.get(Order, t.order_id) if t.order_id else None
    return {
        "id": t.id, "number": t.number, "name": t.name, "phone": t.phone, "email": t.email, "subject": t.subject,
        "body": t.body, "category": t.category, "category_label": TICKET_CATEGORIES.get(t.category, t.category),
        "status": t.status, "assigned_to": t.assigned_to, "user_id": t.user_id, "order_id": t.order_id,
        "order_ref": order.id[:8].upper() if order else None, "dispute_open": bool(order and order.dispute_status == "open"),
        "created_at": iso(t.created_at), "resolved_at": iso(t.resolved_at),
        "messages": [_message_out(m) for m in msgs], "staff": staff, "categories": TICKET_CATEGORIES,
    }


class TicketPatchIn(BaseModel):
    status: str | None = Field(None, pattern="^(new|in_progress|resolved)$")
    assigned_to: str | None = None
    order_id: str | None = None
    user_id: str | None = None
    category: str | None = None


@admin_router.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: str, payload: TicketPatchIn, request: Request, db: Session = Depends(get_db),
                  admin: User = Depends(require_perm("support"))):
    """12.2 / 12.3 — statut, attribution, rattachement a un compte ou une
    commande."""
    t = get_or_404(db, SupportTicket, ticket_id, "Demande")
    changes = payload.model_dump(exclude_unset=True)
    if "order_id" in changes and changes["order_id"]:
        ref = changes["order_id"].strip().lower().lstrip("#")
        order = db.get(Order, ref) or db.query(Order).filter(Order.id.ilike(f"{ref}%")).first()
        if not order:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Commande introuvable")
        changes["order_id"] = order.id
    if "user_id" in changes and changes["user_id"] and not db.get(User, changes["user_id"]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compte introuvable")
    for k, v in changes.items():
        setattr(t, k, v)
    if changes.get("status") == "resolved":
        t.resolved_at = utcnow()
        if t.user_id:
            notify(db, t.user_id, "support_resolved", {"ticket_id": t.id, "number": t.number})
    audit.record(db, admin, "ticket.update", "ticket", t.id, details=changes, request=request)
    db.commit()
    return {"ok": True}


@admin_router.post("/tickets/{ticket_id}/messages", status_code=status.HTTP_201_CREATED)
def answer_ticket(ticket_id: str, payload: TicketMessageIn, request: Request, db: Session = Depends(get_db),
                  admin: User = Depends(require_perm("support"))):
    """12.2 — repondre depuis l'interface. Un compte inscrit recoit la
    reponse dans ses notifications ; un visiteur se recontacte par telephone
    ou e-mail (la reponse est gardee dans le dossier)."""
    t = get_or_404(db, SupportTicket, ticket_id, "Demande")
    db.add(SupportMessage(ticket_id=t.id, author_id=admin.id, author_name=admin.full_name, from_staff=True, body=payload.body.strip()))
    if t.status == "new":
        t.status = "in_progress"
    if not t.assigned_to:
        t.assigned_to = admin.id
    if t.user_id:
        notify(db, t.user_id, "support_reply", {"ticket_id": t.id, "number": t.number, "body": payload.body.strip()})
    audit.record(db, admin, "ticket.reply", "ticket", t.id, request=request)
    db.commit()
    return {"ok": True, "notified": bool(t.user_id)}
