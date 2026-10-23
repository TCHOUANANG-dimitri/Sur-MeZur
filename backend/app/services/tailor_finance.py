"""
Carnet de recettes du tailleur.

CE QUE C'EST. Un carnet de notes : le tailleur y ecrit ce qu'il a encaisse,
quand, et pour quel travail. Aucun paiement ne transite par la plateforme —
la plateforme ne connait que des notes.

LA REGLE QUI TIENT LE TOUT. L'avance d'un travail (`tailor_jobs.advance_received`)
n'est plus une valeur saisie a part : c'est la SOMME des entrees de recettes
rattachees a ce travail. Une seule verite, donc pas d'ecart possible entre
« ce que j'ai note » et « ce que l'application affiche ».

LA REPRISE. L'avance existait avant le carnet de recettes : des centaines de
travaux ont deja une avance saisie a la main. Au premier acces aux finances,
chaque travail dont l'avance n'a pas encore d'entree recoit une entree
« Avance (reprise) », datee au jour du travail. L'operation est idempotente :
un travail qui a deja une entree n'est pas represente une seconde fois, et
l'avance affichee ne bouge pas.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.tailor_tools import TailorIncomeEntry, TailorJob

# Tolerance de comparaison : les montants sont stockes en Numeric(12, 2) et
# manipules en flottants. Deux centimes d'ecart ne doivent pas compter comme
# une difference.
EPSILON = 0.005


def _amount(value) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def job_entries_total(db: Session, job_id: str) -> float:
    """Somme des recettes rattachees a un travail."""
    total = (
        db.query(func.coalesce(func.sum(TailorIncomeEntry.amount), 0))
        .filter(TailorIncomeEntry.job_id == job_id)
        .scalar()
    )
    return _amount(total)


def sync_job_advance(db: Session, job: TailorJob) -> float:
    """Recalcule l'avance d'un travail d'apres ses recettes et l'ecrit.

    A appeler apres CHAQUE ajout ou suppression d'entree rattachee a ce
    travail : l'avance n'est plus une valeur a part, elle est le total.
    """
    total = job_entries_total(db, job.id)
    job.advance_received = total
    return total


def ensure_job_reprise(db: Session, job: TailorJob) -> bool:
    """Materialise l'avance deja saisie d'un travail en entree de recettes.

    Renvoie `True` si une entree a ete creee. Appelee avant de comparer une
    nouvelle avance a la somme des recettes : sinon, une avance saisie a la
    main et une entree de correction s'additionneraient deux fois.
    """
    advance = _amount(job.advance_received)
    if advance <= 0:
        return False
    deja = (
        db.query(TailorIncomeEntry.id).filter(TailorIncomeEntry.job_id == job.id).first()
    )
    if deja:
        return False
    db.add(
        TailorIncomeEntry(
            tailor_id=job.tailor_id,
            job_id=job.id,
            amount=advance,
            received_on=(job.created_at.date() if job.created_at else date.today()),
            label="Avance (reprise)",
            method="cash",
        )
    )
    db.flush()
    return True


def ensure_all_reprises(db: Session, tailor_id: str) -> int:
    """Reprise de toutes les avances deja saisies d'un tailleur.

    Appelee a la premiere ouverture des finances. Idempotente.
    """
    created = 0
    jobs = (
        db.query(TailorJob)
        .filter(TailorJob.tailor_id == tailor_id, TailorJob.advance_received.is_not(None))
        .all()
    )
    for job in jobs:
        if ensure_job_reprise(db, job):
            created += 1
    if created:
        db.commit()
    return created


def reste_a_encaisser(db: Session, tailor_id: str) -> float:
    """Somme des restes a payer sur les travaux du tailleur.

    Un travail livre n'est pas ecarte : s'il n'est pas entierement paye, il
    reste du. Seule l'absence de prix convenu l'ecarte.
    """
    total = 0.0
    jobs = db.query(TailorJob).filter(TailorJob.tailor_id == tailor_id).all()
    for job in jobs:
        price = _amount(job.agreed_price)
        if price <= 0:
            continue
        advance = _amount(job.advance_received)
        total += max(0.0, price - advance)
    return total
