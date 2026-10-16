"""
Enquete patrons : questionnaire public par lien personnel + lecture admin.

Public (`/public/enquete/{token}`), sans compte : le jeton de l'invitation
est la seule cle. Tout est borne au jeton (une fiche n'est lisible que par le
lien qui l'a creee), limite en debit, et les photos ne sont jamais servies en
statique : elles vivent dans `tailor_store/enquete/` et sortent par route.

Admin (`/admin/enquete`, permission `enquete`) : creation et revocation des
liens, lecture des fiches, statut de lecture, export ZIP (JSON + photos).
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.api.v1.admin_common import iso
from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.models.catalog import GarmentModel
from app.models.enquete import EnqueteInvite, EnqueteModele
from app.models.users import User
from app.services import audit
from app.services.admin_perms import require_perm
from app.services.rate_limit import check as rate_check, client_ip

public_router = APIRouter(prefix="/public/enquete", tags=["enquete"])
admin_router = APIRouter(
    prefix="/admin/enquete", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))]
)

# 2 : la fiche recueille la recette du tailleur (aisances, marges, choix de
# coupe) au lieu des mesures d'une personne et des pieces de son patron.
SCHEMA_VERSION = 2
SOURCES = ("cousu", "galerie")
PHOTO_KINDS = ("vetement", "patron", "autre")
REVIEW_STATUSES = ("a_lire", "retenu", "a_completer", "ecarte")
MAX_DATA_BYTES = 64 * 1024
MAX_PHOTO_BYTES = 12 * 1024 * 1024
MAX_PHOTOS = 15
GALLERY_PER_CATEGORY = 4

_MAGIC = (
    (b"\xff\xd8\xff", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", ".png"),
)


# --- Outils -----------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _store(*parts: str) -> Path:
    """Dossier prive de l'enquete (sauvegarde avec `tailor_store`)."""
    base = Path(settings.upload_dir).resolve().parent / "tailor_store" / "enquete"
    path = base.joinpath(*parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _photo_ext(content: bytes) -> str:
    """Extension d'apres les premiers octets, jamais d'apres le nom declare."""
    for magic, ext in _MAGIC:
        if content.startswith(magic):
            return ext
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    if content[4:8] == b"ftyp" and any(b in content[8:16] for b in (b"heic", b"heif", b"mif1")):
        return ".heic"
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Envoyez une vraie photo (JPEG, PNG, WEBP ou HEIC)")


def _invite(token: str, db: Session, request: Request | None = None) -> EnqueteInvite:
    if request is not None:
        rate_check("enquete_ip", client_ip(request))
    inv = db.query(EnqueteInvite).filter(EnqueteInvite.token == token).first()
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lien inconnu. Vérifiez le lien reçu.")
    if inv.revoked:
        raise HTTPException(status.HTTP_410_GONE, "Ce lien n'est plus actif. Contactez l'équipe Sur-MeZur.")
    return inv


def _modele(inv: EnqueteInvite, modele_id: str, db: Session) -> EnqueteModele:
    m = db.get(EnqueteModele, modele_id)
    # 404 volontaire : une fiche d'un autre lien n'existe pas pour celui-ci.
    if not m or m.invite_id != inv.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable")
    return m


def _model_brief(gm: GarmentModel | None) -> dict | None:
    if not gm:
        return None
    return {
        "id": gm.id,
        "nom": gm.name,
        "photo_url": gm.photo_url,
        "categorie": gm.category.name if gm.category else None,
    }


def _photo_out(token_or_admin: str, m: EnqueteModele, p: dict) -> dict:
    return {
        "id": p["id"],
        "kind": p.get("kind", "autre"),
        "legende": p.get("legende"),
        "url": f"{token_or_admin}/modeles/{m.id}/photos/{p['id']}",
        "created_at": p.get("created_at"),
    }


def _modele_out(m: EnqueteModele, base: str, db: Session, full: bool = True) -> dict:
    gm = db.get(GarmentModel, m.garment_model_id) if m.garment_model_id else None
    data = m.data or {}
    general = data.get("general") or {}
    out = {
        "id": m.id,
        "source": m.source,
        "status": m.status,
        "nom": _nom_fiche(general) or (gm.name if gm else None),
        "categorie": general.get("categorie"),
        "modele_galerie": _model_brief(gm),
        "nb_photos": len(m.photos or []),
        "submitted_at": iso(m.submitted_at),
        "updated_at": iso(m.updated_at),
        "a_completer": m.review_status == "a_completer",
        "review_note": m.review_note if m.review_status == "a_completer" else None,
    }
    if full:
        out["schema_version"] = m.schema_version
        out["data"] = data
        out["photos"] = [_photo_out(base, m, p) for p in (m.photos or [])]
    return out


def _check_size(data: dict) -> None:
    if len(json.dumps(data, ensure_ascii=False).encode("utf-8")) > MAX_DATA_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Fiche trop longue")


def _nom_fiche(general: dict) -> str | None:
    """Nom affiche : le type choisi, ou le nom donne a l'atelier pour « autre »."""
    if general.get("type") and general.get("type") != "autre" and general.get("type_label"):
        return str(general["type_label"])
    return general.get("nom") or None


def _missing_for_submit(m: EnqueteModele) -> list[str]:
    """Ce qui manque pour envoyer une fiche : le minimum exploitable."""
    if (m.schema_version or 1) < 2:
        return _missing_v1(m)
    d = m.data or {}
    g = d.get("general") or {}
    manque = []
    if not g.get("categorie"):
        manque.append("la catégorie")
    if not g.get("type"):
        manque.append("le type de modèle")
    if g.get("type") == "autre" and len(str(g.get("nom") or "").strip()) < 2:
        manque.append("le nom du modèle")
    if not g.get("fois_cousu"):
        manque.append("le nombre de fois où vous l'avez cousu")
    aisances = d.get("aisance_cm") or {}
    if not any(isinstance(v, (int, float)) and not isinstance(v, bool) for v in aisances.values()):
        manque.append("au moins une aisance")
    if not isinstance((d.get("coupe") or {}).get("couture_cm"), (int, float)):
        manque.append("la valeur de couture")
    return manque


def _missing_v1(m: EnqueteModele) -> list[str]:
    """Regle de la premiere version (fiches avec mesures et pieces)."""
    d = m.data or {}
    g = d.get("general") or {}
    manque = []
    if len(str(g.get("nom") or "").strip()) < 2:
        manque.append("le nom du modèle")
    if not g.get("categorie"):
        manque.append("la catégorie")
    if not g.get("fois_cousu"):
        manque.append("le nombre de fois où vous l'avez cousu")
    valeurs = ((d.get("personne") or {}).get("mesures") or {})
    if sum(1 for v in valeurs.values() if isinstance(v, (int, float)) and v > 0) < 3:
        manque.append("au moins 3 mesures de la personne")
    if not [p for p in (d.get("pieces") or []) if str(p.get("nom") or "").strip()]:
        manque.append("au moins une pièce du patron")
    if m.source == "cousu" and not any(p.get("kind") == "vetement" for p in (m.photos or [])):
        manque.append("au moins une photo du vêtement")
    return manque


# --- Public : le tailleur ---------------------------------------------------


class ProfilIn(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    telephone: str | None = Field(None, max_length=32)
    atelier: str | None = Field(None, max_length=120)
    ville: str | None = Field(None, max_length=80)
    quartier: str | None = Field(None, max_length=80)
    experience_annees: int | None = Field(None, ge=0, le=80)
    specialites: list[str] = Field(default_factory=list, max_length=20)
    consentement: bool = False


class ModeleCreateIn(BaseModel):
    source: str
    garment_model_id: str | None = None


class ModeleDataIn(BaseModel):
    data: dict


@public_router.post("/nouveau", status_code=status.HTTP_201_CREATED)
def enquete_nouveau(request: Request, db: Session = Depends(get_db)):
    """Acces direct par l'adresse du site, sans lien personnel : cree une
    fiche tailleur anonyme et renvoie son jeton, que le site garde sur
    l'appareil. Limite par IP ; chaque acces apparait dans l'admin
    (« Acces direct ») et peut y etre desactive."""
    rate_check("enquete_new_ip", client_ip(request))
    inv = EnqueteInvite(token=secrets.token_urlsafe(18), label="Accès direct",
                        note="Créé depuis l'adresse publique du questionnaire", profil={})
    db.add(inv)
    db.commit()
    return {"token": inv.token}


@public_router.get("/{token}")
def enquete_accueil(token: str, request: Request, db: Session = Depends(get_db)):
    inv = _invite(token, db, request)
    inv.last_seen_at = _now()
    db.commit()
    modeles = (
        db.query(EnqueteModele)
        .filter(EnqueteModele.invite_id == inv.id)
        .order_by(EnqueteModele.created_at)
        .all()
    )
    base = f"/public/enquete/{token}"
    return {
        "label": inv.label,
        "profil": inv.profil or {},
        "consentement": inv.consent_at is not None,
        "schema_version": SCHEMA_VERSION,
        "modeles": [_modele_out(m, base, db, full=False) for m in modeles],
    }


@public_router.put("/{token}/profil")
def enquete_profil(token: str, payload: ProfilIn, request: Request, db: Session = Depends(get_db)):
    inv = _invite(token, db, request)
    profil = payload.model_dump()
    profil["specialites"] = [str(s)[:60] for s in profil.get("specialites") or []]
    inv.profil = profil
    if payload.consentement and inv.consent_at is None:
        inv.consent_at = _now()
    if not payload.consentement:
        inv.consent_at = None
    db.commit()
    return {"profil": inv.profil, "consentement": inv.consent_at is not None}


@public_router.get("/{token}/galerie")
def enquete_galerie(token: str, request: Request, db: Session = Depends(get_db)):
    """Quelques modeles publies par categorie, avec photo, les plus
    demandes d'abord : le tailleur y choisit ce qu'il sait deja faire."""
    _invite(token, db, request)
    rows = (
        db.query(GarmentModel)
        .options(joinedload(GarmentModel.category))
        .filter(GarmentModel.status == "published", GarmentModel.photo_url.isnot(None))
        .order_by(GarmentModel.sort_order, GarmentModel.select_count.desc(), GarmentModel.created_at)
        .all()
    )
    groupes: dict[str, dict] = {}
    for gm in rows:
        cat = gm.category
        if cat is None:
            continue
        g = groupes.setdefault(cat.id, {"categorie": cat.name, "genre": cat.gender, "modeles": []})
        if len(g["modeles"]) < GALLERY_PER_CATEGORY:
            g["modeles"].append({"id": gm.id, "nom": gm.name, "photo_url": gm.photo_url})
    return sorted(groupes.values(), key=lambda g: (g["genre"], g["categorie"]))


@public_router.post("/{token}/modeles", status_code=status.HTTP_201_CREATED)
def enquete_nouveau_modele(token: str, payload: ModeleCreateIn, request: Request, db: Session = Depends(get_db)):
    inv = _invite(token, db, request)
    if inv.consent_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complétez d'abord votre profil et votre accord.")
    if payload.source not in SOURCES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Source inconnue")
    data: dict = {"general": {}}
    if payload.source == "galerie":
        gm = db.get(GarmentModel, payload.garment_model_id) if payload.garment_model_id else None
        if not gm or gm.status != "published":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable dans la galerie")
        data["general"] = {"nom": gm.name}
    if db.query(EnqueteModele).filter(EnqueteModele.invite_id == inv.id).count() >= 30:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nombre maximal de fiches atteint pour ce lien.")
    m = EnqueteModele(
        invite_id=inv.id,
        source=payload.source,
        garment_model_id=payload.garment_model_id if payload.source == "galerie" else None,
        schema_version=SCHEMA_VERSION,
        data=data,
        photos=[],
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _modele_out(m, f"/public/enquete/{token}", db)


@public_router.get("/{token}/modeles/{modele_id}")
def enquete_lire_modele(token: str, modele_id: str, request: Request, db: Session = Depends(get_db)):
    inv = _invite(token, db, request)
    return _modele_out(_modele(inv, modele_id, db), f"/public/enquete/{token}", db)


@public_router.put("/{token}/modeles/{modele_id}")
def enquete_sauver_modele(
    token: str, modele_id: str, payload: ModeleDataIn, request: Request, db: Session = Depends(get_db)
):
    """Sauvegarde automatique du brouillon (appelee a chaque modification)."""
    inv = _invite(token, db, request)
    m = _modele(inv, modele_id, db)
    if m.status == "envoye":
        raise HTTPException(status.HTTP_409_CONFLICT, "Fiche déjà envoyée : elle ne peut plus être modifiée.")
    _check_size(payload.data)
    m.data = payload.data
    m.schema_version = SCHEMA_VERSION
    db.commit()
    return {"ok": True, "updated_at": iso(m.updated_at)}


@public_router.post("/{token}/modeles/{modele_id}/envoyer")
def enquete_envoyer(token: str, modele_id: str, request: Request, db: Session = Depends(get_db)):
    inv = _invite(token, db, request)
    m = _modele(inv, modele_id, db)
    if m.status == "envoye":
        return _modele_out(m, f"/public/enquete/{token}", db)
    manque = _missing_for_submit(m)
    if manque:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Il manque : " + ", ".join(manque) + ".")
    m.status = "envoye"
    m.submitted_at = _now()
    if m.review_status == "a_completer":
        m.review_status = "a_lire"
    db.commit()
    return _modele_out(m, f"/public/enquete/{token}", db)


@public_router.delete("/{token}/modeles/{modele_id}", status_code=status.HTTP_204_NO_CONTENT)
def enquete_supprimer_modele(token: str, modele_id: str, request: Request, db: Session = Depends(get_db)):
    inv = _invite(token, db, request)
    m = _modele(inv, modele_id, db)
    if m.status == "envoye":
        raise HTTPException(status.HTTP_409_CONFLICT, "Une fiche envoyée ne peut pas être supprimée.")
    shutil.rmtree(_store(m.id, "x").parent, ignore_errors=True)
    db.delete(m)
    db.commit()


@public_router.post("/{token}/modeles/{modele_id}/photos", status_code=status.HTTP_201_CREATED)
def enquete_ajouter_photo(
    token: str,
    modele_id: str,
    request: Request,
    photo: UploadFile = File(...),
    kind: str = Form("vetement"),
    legende: str | None = Form(None),
    db: Session = Depends(get_db),
):
    inv = _invite(token, db, request)
    rate_check("enquete_photo", token)
    m = _modele(inv, modele_id, db)
    if m.status == "envoye":
        raise HTTPException(status.HTTP_409_CONFLICT, "Fiche déjà envoyée.")
    if kind not in PHOTO_KINDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type de photo inconnu")
    if len(m.photos or []) >= MAX_PHOTOS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{MAX_PHOTOS} photos au maximum par modèle.")
    content = photo.file.read(MAX_PHOTO_BYTES + 1)
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Photo trop lourde (12 Mo maximum)")
    ext = _photo_ext(content[:16])
    pid = uuid.uuid4().hex
    _store(m.id, f"{pid}{ext}").write_bytes(content)
    entry = {
        "id": pid, "kind": kind, "file": f"{pid}{ext}",
        "legende": (legende or "").strip()[:200] or None, "created_at": _now().isoformat(),
    }
    # Reaffectation (et non append) : SQLAlchemy ne voit pas la mutation en place d'un JSON.
    m.photos = [*(m.photos or []), entry]
    db.commit()
    return _photo_out(f"/public/enquete/{token}", m, entry)


def _photo_file(m: EnqueteModele, photo_id: str) -> tuple[dict, Path]:
    p = next((p for p in (m.photos or []) if p.get("id") == photo_id), None)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo introuvable")
    path = _store(m.id, os.path.basename(p["file"]))
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo introuvable")
    return p, path


@public_router.get("/{token}/modeles/{modele_id}/photos/{photo_id}")
def enquete_lire_photo(token: str, modele_id: str, photo_id: str, db: Session = Depends(get_db)):
    inv = _invite(token, db)
    _, path = _photo_file(_modele(inv, modele_id, db), photo_id)
    return FileResponse(path, headers={"Cache-Control": "private, max-age=3600"})


@public_router.delete("/{token}/modeles/{modele_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def enquete_supprimer_photo(token: str, modele_id: str, photo_id: str, request: Request, db: Session = Depends(get_db)):
    inv = _invite(token, db, request)
    m = _modele(inv, modele_id, db)
    if m.status == "envoye":
        raise HTTPException(status.HTTP_409_CONFLICT, "Fiche déjà envoyée.")
    _, path = _photo_file(m, photo_id)
    path.unlink(missing_ok=True)
    m.photos = [p for p in (m.photos or []) if p.get("id") != photo_id]
    db.commit()


# --- Admin --------------------------------------------------------------------


class InviteIn(BaseModel):
    label: str = Field(min_length=2, max_length=120)
    note: str | None = Field(None, max_length=1000)


class InvitePatchIn(BaseModel):
    label: str | None = Field(None, min_length=2, max_length=120)
    note: str | None = Field(None, max_length=1000)
    revoked: bool | None = None


class ReviewIn(BaseModel):
    review_status: str | None = None
    review_note: str | None = Field(None, max_length=2000)
    rouvrir: bool = False


def _invite_out(inv: EnqueteInvite, db: Session) -> dict:
    rows = db.query(EnqueteModele.status).filter(EnqueteModele.invite_id == inv.id).all()
    return {
        "id": inv.id,
        "token": inv.token,
        "label": inv.label,
        "note": inv.note,
        "revoked": inv.revoked,
        "profil": inv.profil or {},
        "consentement": inv.consent_at is not None,
        "created_at": iso(inv.created_at),
        "last_seen_at": iso(inv.last_seen_at),
        "nb_brouillons": sum(1 for (s,) in rows if s == "brouillon"),
        "nb_envoyes": sum(1 for (s,) in rows if s == "envoye"),
    }


@admin_router.get("/invites")
def admin_invites(db: Session = Depends(get_db), _=Depends(require_perm("enquete"))):
    rows = db.query(EnqueteInvite).order_by(EnqueteInvite.created_at.desc()).all()
    return [_invite_out(i, db) for i in rows]


@admin_router.post("/invites", status_code=status.HTTP_201_CREATED)
def admin_creer_invite(
    payload: InviteIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("enquete"))
):
    inv = EnqueteInvite(token=secrets.token_urlsafe(18), label=payload.label.strip(), note=payload.note,
                        created_by=user.id, profil={})
    db.add(inv)
    db.flush()
    audit.record(db, user, "enquete.invite.create", "enquete_invite", inv.id, f"Lien d'enquête créé : {inv.label}",
                 request=request)
    db.commit()
    return _invite_out(inv, db)


@admin_router.patch("/invites/{invite_id}")
def admin_modifier_invite(
    invite_id: str, payload: InvitePatchIn, request: Request, db: Session = Depends(get_db),
    user: User = Depends(require_perm("enquete")),
):
    inv = db.get(EnqueteInvite, invite_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lien introuvable")
    if payload.label is not None:
        inv.label = payload.label.strip()
    if payload.note is not None:
        inv.note = payload.note
    if payload.revoked is not None and payload.revoked != inv.revoked:
        inv.revoked = payload.revoked
        audit.record(db, user, "enquete.invite.revoke" if inv.revoked else "enquete.invite.restore",
                     "enquete_invite", inv.id, f"Lien d'enquête {'désactivé' if inv.revoked else 'réactivé'} : {inv.label}",
                     request=request)
    db.commit()
    return _invite_out(inv, db)


def _admin_modele_out(m: EnqueteModele, db: Session, full: bool) -> dict:
    inv = db.get(EnqueteInvite, m.invite_id)
    out = _modele_out(m, "/admin/enquete", db, full=full)
    out["review_status"] = m.review_status
    out["review_note"] = m.review_note
    out["created_at"] = iso(m.created_at)
    out["tailleur"] = {
        "invite_id": inv.id if inv else None,
        "label": inv.label if inv else None,
        "nom": (inv.profil or {}).get("nom") if inv else None,
        "ville": (inv.profil or {}).get("ville") if inv else None,
        **({"profil": inv.profil or {}} if full and inv else {}),
    }
    return out


@admin_router.get("/modeles")
def admin_modeles(
    statut: str | None = Query(None, pattern="^(brouillon|envoye)$"),
    lecture: str | None = Query(None),
    invite_id: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("enquete")),
):
    q = db.query(EnqueteModele)
    if statut:
        q = q.filter(EnqueteModele.status == statut)
    if lecture:
        q = q.filter(EnqueteModele.review_status == lecture)
    if invite_id:
        q = q.filter(EnqueteModele.invite_id == invite_id)
    rows = q.order_by(EnqueteModele.updated_at.desc()).limit(500).all()
    return [_admin_modele_out(m, db, full=False) for m in rows]


@admin_router.get("/modeles/{modele_id}")
def admin_modele(modele_id: str, db: Session = Depends(get_db), _=Depends(require_perm("enquete"))):
    m = db.get(EnqueteModele, modele_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable")
    return _admin_modele_out(m, db, full=True)


@admin_router.patch("/modeles/{modele_id}")
def admin_lire_modele(
    modele_id: str, payload: ReviewIn, request: Request, db: Session = Depends(get_db),
    user: User = Depends(require_perm("enquete")),
):
    m = db.get(EnqueteModele, modele_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable")
    if payload.review_status is not None:
        if payload.review_status not in REVIEW_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Statut de lecture inconnu")
        m.review_status = payload.review_status
    if payload.review_note is not None:
        m.review_note = payload.review_note
    # « A completer » + rouvrir : la fiche redevient modifiable par le tailleur,
    # qui voit la note de l'equipe en tete de sa fiche.
    if payload.rouvrir and m.status == "envoye":
        m.status = "brouillon"
        m.review_status = "a_completer"
    audit.record(db, user, "enquete.modele.review", "enquete_modele", m.id,
                 f"Fiche d'enquête : {m.review_status}{' (rouverte)' if payload.rouvrir else ''}", request=request)
    db.commit()
    return _admin_modele_out(m, db, full=True)


@admin_router.get("/modeles/{modele_id}/photos/{photo_id}")
def admin_photo(modele_id: str, photo_id: str, db: Session = Depends(get_db), _=Depends(require_perm("enquete"))):
    m = db.get(EnqueteModele, modele_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable")
    _, path = _photo_file(m, photo_id)
    return FileResponse(path, headers={"Cache-Control": "private, max-age=3600"})


@admin_router.get("/export")
def admin_export(
    background: BackgroundTasks,
    tout: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("enquete")),
):
    """Archive ZIP : `enquete.json` (tailleurs + fiches) et les photos rangees
    par fiche. Par defaut les fiches envoyees seulement ; `tout=1` ajoute
    les brouillons."""
    q = db.query(EnqueteModele)
    if not tout:
        q = q.filter(EnqueteModele.status == "envoye")
    modeles = q.order_by(EnqueteModele.invite_id, EnqueteModele.created_at).all()
    invites = {i.id: i for i in db.query(EnqueteInvite).all()}
    doc = {
        "exporte_le": _now().isoformat(),
        "schema_version": SCHEMA_VERSION,
        "tailleurs": [
            {"invite_id": i.id, "label": i.label, "profil": i.profil or {}, "consentement_le": iso(i.consent_at)}
            for i in invites.values() if any(m.invite_id == i.id for m in modeles)
        ],
        "fiches": [],
    }
    fd, tmp = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for m in modeles:
            gm = db.get(GarmentModel, m.garment_model_id) if m.garment_model_id else None
            photos = []
            for p in m.photos or []:
                path = _store(m.id, os.path.basename(p["file"]))
                if path.exists():
                    arc = f"photos/{m.id}/{p['kind']}_{p['file']}"
                    z.write(path, arc)
                    photos.append({**p, "fichier": arc})
            doc["fiches"].append({
                "id": m.id, "invite_id": m.invite_id, "source": m.source, "statut": m.status,
                "lecture": m.review_status, "note_equipe": m.review_note,
                "modele_galerie": _model_brief(gm), "schema_version": m.schema_version,
                "envoye_le": iso(m.submitted_at), "data": m.data or {}, "photos": photos,
            })
        z.writestr("enquete.json", json.dumps(doc, ensure_ascii=False, indent=1))
    background.add_task(os.remove, tmp)
    nom = f"enquete_patrons_{_now().strftime('%Y%m%d_%H%M')}.zip"
    return FileResponse(tmp, media_type="application/zip", filename=nom)
