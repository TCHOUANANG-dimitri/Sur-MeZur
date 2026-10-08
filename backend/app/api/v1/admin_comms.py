"""
Communication (M11) dans l'administration web : annonces, modeles de
messages, pages d'information. Le bandeau du site (11.2) est un reglage
(`banner`), modifie par la page Reglages.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso
from app.core.deps import get_db, require_roles
from app.models.admin import Announcement, InfoPage, MessageTemplate
from app.models.users import TailorProfile, User
from app.services import audit
from app.services.activity import utcnow
from app.services.admin_perms import require_perm
from app.services.notify import notify

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])


class Audience(BaseModel):
    role: str = Field("all", pattern="^(all|client|tailor)$")
    city: str | None = None
    # Seulement les utilisateurs actifs depuis N jours (ex. « clients actifs »).
    active_days: int | None = Field(None, ge=1, le=365)
    verified_only: bool = False


def _audience_query(db: Session, a: Audience):
    q = db.query(User.id).filter(User.is_guest.is_(False), User.is_active.is_(True), User.role.in_(("client", "tailor")))
    if a.role != "all":
        q = q.filter(User.role == a.role)
    if a.city:
        tailors = db.query(TailorProfile.user_id).filter(TailorProfile.city.ilike(a.city))
        q = q.filter(or_(User.city.ilike(a.city), User.id.in_(tailors)))
    if a.verified_only:
        q = q.filter(User.id.in_(db.query(TailorProfile.user_id).filter(TailorProfile.verification_status == "approved")))
    if a.active_days:
        q = q.filter(User.last_seen_at >= utcnow() - timedelta(days=a.active_days))
    return q


@router.post("/announcements/preview")
def preview_audience(payload: Audience, db: Session = Depends(get_db), _=Depends(require_perm("comms"))):
    return {"recipients": _audience_query(db, payload).count()}


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=2, max_length=4000)
    audience: Audience = Field(default_factory=Audience)


@router.post("/announcements", status_code=status.HTTP_201_CREATED)
def send_announcement(payload: AnnouncementIn, request: Request, db: Session = Depends(get_db),
                      admin: User = Depends(require_perm("comms"))):
    """11.1 — message depose dans les notifications des utilisateurs cibles."""
    ids = [uid for (uid,) in _audience_query(db, payload.audience).all()]
    ann = Announcement(title=payload.title, body=payload.body, audience=payload.audience.model_dump(),
                       recipients_count=len(ids), author_id=admin.id, author_name=admin.full_name)
    db.add(ann)
    db.flush()
    for uid in ids:
        notify(db, uid, "announcement", {"announcement_id": ann.id, "title": payload.title, "body": payload.body})
    audit.record(db, admin, "announcement.send", "announcement", ann.id, summary=f"{payload.title} → {len(ids)} destinataire(s)", request=request)
    db.commit()
    return {"id": ann.id, "recipients": len(ids)}


@router.get("/announcements")
def list_announcements(db: Session = Depends(get_db), _=Depends(require_perm("comms"))):
    return [
        {"id": a.id, "title": a.title, "body": a.body, "audience": a.audience, "recipients_count": a.recipients_count,
         "author_name": a.author_name, "created_at": iso(a.created_at)}
        for a in db.query(Announcement).order_by(Announcement.created_at.desc()).limit(200)
    ]


# --- 11.3 Modeles de messages -----------------------------------------------------


TEMPLATE_CATEGORIES = {
    "verification_refus": "Refus de vérification",
    "verification_complement": "Demande de complément",
    "modele_refus": "Refus de modèle",
    "relance_paiement": "Relance de paiement",
    "litige_decision": "Décision de litige",
    "support_reponse": "Réponse au support",
    "autre": "Autre",
}

DEFAULT_TEMPLATES = [
    ("verification_refus", "Pièce d'identité illisible",
     "Bonjour, votre pièce d'identité n'est pas lisible sur la photo envoyée. Merci de la reprendre à plat, bien éclairée, les quatre coins visibles."),
    ("verification_complement", "Photo de l'atelier manquante",
     "Bonjour, pour terminer la vérification de votre profil, merci d'ajouter une photo de votre atelier où l'on voit votre poste de travail."),
    ("modele_refus", "Image inappropriée",
     "Votre proposition de modèle n'a pas été publiée : l'image ne montre pas clairement le vêtement ou ne respecte pas nos règles de publication."),
    ("relance_paiement", "Paiement non abouti",
     "Bonjour, votre paiement n'a pas abouti. Vous pouvez le relancer depuis votre commande ; votre tailleur attend sa confirmation pour commencer."),
    ("litige_decision", "Retouche demandée",
     "Après examen du dossier, nous demandons au tailleur de reprendre le vêtement sous 7 jours, sans frais pour le client."),
    ("support_reponse", "Accusé de réception",
     "Bonjour, nous avons bien reçu votre demande et revenons vers vous sous 24 h ouvrées. L'équipe Sur-MeZur."),
]


def seed_templates(db: Session) -> None:
    if db.query(MessageTemplate.id).first():
        return
    for cat, title, body in DEFAULT_TEMPLATES:
        db.add(MessageTemplate(category=cat, title=title, body=body))
    db.commit()


class TemplateIn(BaseModel):
    category: str
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=2, max_length=5000)


def _template_out(t: MessageTemplate) -> dict:
    return {"id": t.id, "category": t.category, "category_label": TEMPLATE_CATEGORIES.get(t.category, t.category),
            "title": t.title, "body": t.body, "updated_at": iso(t.updated_at)}


@router.get("/message-templates")
def list_templates(category: str | None = None, db: Session = Depends(get_db)):
    """Lisible par tout administrateur : les modeles servent dans plusieurs
    modules (verification, litiges, support)."""
    q = db.query(MessageTemplate)
    if category:
        q = q.filter(MessageTemplate.category == category)
    return {"categories": TEMPLATE_CATEGORIES, "items": [_template_out(t) for t in q.order_by(MessageTemplate.category, MessageTemplate.title)]}


@router.post("/message-templates", status_code=status.HTTP_201_CREATED)
def create_template(payload: TemplateIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("comms"))):
    if payload.category not in TEMPLATE_CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Catégorie inconnue")
    t = MessageTemplate(**payload.model_dump())
    db.add(t)
    db.flush()
    audit.record(db, admin, "template.create", "template", t.id, summary=t.title, request=request)
    db.commit()
    return _template_out(t)


@router.patch("/message-templates/{template_id}")
def update_template(template_id: str, payload: TemplateIn, request: Request, db: Session = Depends(get_db),
                    admin: User = Depends(require_perm("comms"))):
    t = get_or_404(db, MessageTemplate, template_id, "Modèle de message")
    for k, v in payload.model_dump().items():
        setattr(t, k, v)
    audit.record(db, admin, "template.update", "template", t.id, summary=t.title, request=request)
    db.commit()
    return _template_out(t)


@router.delete("/message-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("comms"))):
    t = get_or_404(db, MessageTemplate, template_id, "Modèle de message")
    audit.record(db, admin, "template.delete", "template", t.id, summary=t.title, request=request)
    db.delete(t)
    db.commit()


# --- 11.4 Pages d'information ---------------------------------------------------------


DEFAULT_PAGES = {
    "faq": ("Questions fréquentes", "## Comment sont calculées mes mesures ?\n\nÀ partir de deux photos (face et profil) et de votre taille, notre chaîne d'analyse estime vos mensurations de couture.\n\n## Mes photos sont-elles conservées ?\n\nVos photos servent uniquement au calcul. Vous pouvez les effacer à tout moment depuis votre profil."),
    "conditions": ("Conditions d'utilisation", "Les présentes conditions régissent l'utilisation de Sur-MeZur.\n\n(À compléter par l'équipe.)"),
    "confidentialite": ("Politique de confidentialité", "Sur-MeZur collecte les données nécessaires à la prise de mesure et à la mise en relation avec les tailleurs.\n\n(À compléter par l'équipe.)"),
}


def seed_pages(db: Session) -> None:
    existing = {slug for (slug,) in db.query(InfoPage.slug).all()}
    for slug, (title, body) in DEFAULT_PAGES.items():
        if slug not in existing:
            db.add(InfoPage(slug=slug, title=title, body=body, published=True))
    db.commit()


class PageIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(max_length=100_000)
    published: bool = True


def _page_out(p: InfoPage) -> dict:
    return {"slug": p.slug, "title": p.title, "body": p.body, "published": p.published, "updated_at": iso(p.updated_at)}


@router.get("/pages")
def list_pages(db: Session = Depends(get_db), _=Depends(require_perm("comms"))):
    return [_page_out(p) for p in db.query(InfoPage).order_by(InfoPage.slug)]


@router.put("/pages/{slug}")
def save_page(slug: str, payload: PageIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("comms"))):
    if not slug.replace("-", "").isalnum() or len(slug) > 64:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Adresse de page invalide (lettres, chiffres et tirets)")
    p = db.get(InfoPage, slug)
    if p is None:
        p = InfoPage(slug=slug)
        db.add(p)
    p.title = payload.title
    p.body = payload.body
    p.published = payload.published
    p.updated_by = admin.id
    audit.record(db, admin, "page.save", "page", None, summary=slug, request=request)
    db.commit()
    return _page_out(p)
