"""
Carnet de recettes du tailleur (finances de l'atelier).

CE QUE C'EST. Un carnet de notes : le tailleur y ecrit ce qu'il a encaisse,
quand, et pour quel travail. La plateforme ne fait passer aucun paiement —
elle ne connait que des notes.

CE QUE LA ROUTE NE DOIT PAS DEVOILER. Le reste a encaisser est calcule sur
les travaux du tailleur qui l'a demande : un autre tailleur n'en saura rien.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.tailor_tools import TailorIncomeEntry, TailorJob
from app.models.users import TailorProfile, User
from app.schemas.common import AMOUNT_MAX
from app.services import tailor_finance

router = APIRouter(
    prefix="/tailor/finances",
    tags=["tailor-finances"],
    dependencies=[Depends(require_roles("tailor"))],
)

# Moyens de paiement notes par le tailleur.
METHODS = {"cash", "mobile_money", "virement", "autre"}


def _tailor(user: User, db: Session) -> TailorProfile:
    tp = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not tp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profil tailleur introuvable")
    return tp


def _month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def _entry_out(entry: TailorIncomeEntry, job: TailorJob | None) -> dict:
    return {
        "id": entry.id,
        "job_id": entry.job_id,
        "amount": float(entry.amount),
        "received_on": entry.received_on.isoformat() if entry.received_on else None,
        "label": entry.label,
        "method": entry.method,
        "job_description": job.description if job else None,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }


class TailorIncomeEntryIn(BaseModel):
    job_id: str | None = None
    # Montant recu : strictement positif, plafonne.
    amount: float = Field(..., gt=0, le=AMOUNT_MAX)
    # Jour de la recette. Par defaut, aujourd'hui.
    received_on: date | None = None
    label: str | None = Field(None, max_length=255)
    method: str = "cash"


@router.get("")
def list_finances(
    debut: date | None = None,
    fin: date | None = None,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Recettes, par mois, et reste a encaisser.

    Au premier appel, les avances deja saisies sur les travaux sont reprises
    en recettes (« Avance (reprise) ») : l'avance d'un travail vaut desormais
    la somme de ses recettes, il faut donc bien une entree pour elle.
    """
    tp = _tailor(user, db)
    if debut and fin and debut > fin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La periode demandee est a l'envers")
    tailor_finance.ensure_all_reprises(db, tp.id)

    query = db.query(TailorIncomeEntry).filter(TailorIncomeEntry.tailor_id == tp.id)
    if debut:
        query = query.filter(TailorIncomeEntry.received_on >= debut)
    if fin:
        query = query.filter(TailorIncomeEntry.received_on <= fin)
    entries = query.order_by(TailorIncomeEntry.received_on.desc(), TailorIncomeEntry.created_at.desc()).all()

    jobs = {j.id: j for j in db.query(TailorJob).filter(TailorJob.tailor_id == tp.id).all()}
    par_mois: dict[str, float] = {}
    for entry in entries:
        if not entry.received_on:
            continue
        cle = _month_key(entry.received_on)
        par_mois[cle] = par_mois.get(cle, 0.0) + float(entry.amount)

    # Ce mois et le mois precedent ne dependent PAS de la periode demandee :
    # ils servent de repere fixe en haut de la page.
    today = date.today()
    debut_mois = today.replace(day=1)
    debut_precedent = (debut_mois - timedelta(days=1)).replace(day=1)
    mois_courant = _month_key(today)
    mois_precedent = _month_key(debut_precedent)
    reperes = (
        db.query(TailorIncomeEntry)
        .filter(TailorIncomeEntry.tailor_id == tp.id, TailorIncomeEntry.received_on >= debut_precedent)
        .all()
    )
    par_mois_reperes: dict[str, float] = {}
    for entry in reperes:
        cle = _month_key(entry.received_on)
        par_mois_reperes[cle] = par_mois_reperes.get(cle, 0.0) + float(entry.amount)

    return {
        "total_encaisse": round(sum(float(e.amount) for e in entries), 2),
        "reste_a_encaisser": round(tailor_finance.reste_a_encaisser(db, tp.id), 2),
        "par_mois": [
            {"mois": mois, "total": round(total, 2)}
            for mois, total in sorted(par_mois.items(), reverse=True)
        ],
        "entrees": [_entry_out(e, jobs.get(e.job_id)) for e in entries],
        "total_mois_courant": round(par_mois_reperes.get(mois_courant, 0.0), 2),
        "total_mois_precedent": round(par_mois_reperes.get(mois_precedent, 0.0), 2),
    }


@router.post("/entries", status_code=status.HTTP_201_CREATED)
def create_entry(
    payload: TailorIncomeEntryIn,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Note une recette. Si elle est rattachee a un travail, l'avance de ce
    travail est recalculee."""
    tp = _tailor(user, db)
    if payload.method not in METHODS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Moyen de paiement inconnu")
    job: TailorJob | None = None
    if payload.job_id:
        job = db.get(TailorJob, payload.job_id)
        if not job or job.tailor_id != tp.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Travail introuvable")
    jour = payload.received_on or date.today()
    if jour > date.today():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "La date de reception ne peut pas etre dans le futur.",
        )
    # L'avance ne peut pas depasser le prix convenu du travail.
    if job is not None and job.agreed_price is not None:
        prix = float(job.agreed_price)
        deja = tailor_finance.job_entries_total(db, job.id)
        if deja + float(payload.amount) > prix + tailor_finance.EPSILON:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cette recette ferait depasser le prix convenu du travail.",
            )
    entry = TailorIncomeEntry(
        tailor_id=tp.id,
        job_id=job.id if job else None,
        amount=float(payload.amount),
        received_on=jour,
        label=(payload.label or "").strip() or ("Recette" if job is None else f"Recette — {job.description or 'travail'}"),
        method=payload.method,
    )
    db.add(entry)
    db.flush()
    if job is not None:
        tailor_finance.sync_job_advance(db, job)
    db.commit()
    db.refresh(entry)
    return _entry_out(entry, job)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Supprime une recette et recalcule l'avance du travail concerne."""
    tp = _tailor(user, db)
    entry = db.get(TailorIncomeEntry, entry_id)
    if not entry or entry.tailor_id != tp.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recette introuvable")
    job = db.get(TailorJob, entry.job_id) if entry.job_id else None
    db.delete(entry)
    db.flush()
    if job is not None:
        tailor_finance.sync_job_advance(db, job)
    db.commit()
    return None
