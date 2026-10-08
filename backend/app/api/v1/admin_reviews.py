"""
Avis (M8) dans l'administration web.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso
from app.core.deps import get_db, require_roles
from app.models.enums import ModerationStatus
from app.models.misc import Review
from app.models.operations import ReviewReport
from app.models.users import ClientProfile, TailorProfile, User
from app.services import audit
from app.services.admin_perms import require_perm
from app.services.ranking import recompute_tailor_ranking
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response
from app.services.user_stats import local_start_utc

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])

REVIEW_COLUMNS = [("created_at", "Date"), ("stars", "Note"), ("comment", "Commentaire"), ("client_name", "Client"),
                  ("tailor_name", "Tailleur"), ("moderation_status", "Statut"), ("reports", "Signalements"),
                  ("tailor_reply", "Réponse du tailleur")]


@router.get("/tables/reviews")
def reviews_table(
    params: TableParams = Depends(table_params),
    stars: int | None = Query(None, ge=1, le=5),
    max_stars: int | None = Query(None, ge=1, le=5),
    tailor_id: str | None = None,
    status_: str | None = Query(None, alias="status"),
    reported: bool | None = None,
    has_reply: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("reviews")),
):
    """8.2 — avis filtrables par note, tailleur, periode et statut."""
    query = db.query(Review)
    if stars:
        query = query.filter(Review.stars == stars)
    if max_stars:
        query = query.filter(Review.stars <= max_stars)
    if tailor_id:
        query = query.filter(Review.tailor_id == tailor_id)
    if status_:
        query = query.filter(Review.moderation_status == status_)
    if reported:
        query = query.filter(Review.id.in_(db.query(ReviewReport.review_id).filter(ReviewReport.status == "open")))
    if has_reply is not None:
        query = query.filter(Review.tailor_reply.isnot(None) if has_reply else Review.tailor_reply.is_(None))
    if date_from:
        query = query.filter(Review.created_at >= local_start_utc(date_from))
    if date_to:
        query = query.filter(Review.created_at < local_start_utc(date_to + timedelta(days=1)))
    if q:
        query = query.filter(Review.comment.ilike(f"%{q}%"))
    query = apply_sort(query, params, {"created_at": Review.created_at, "stars": Review.stars}, "created_at")
    rows, total = page_of(query, params)

    client_ids = {r.client_id for r in rows}
    tailor_ids = {r.tailor_id for r in rows}
    clients = {cp.id: u.full_name for cp, u in db.query(ClientProfile, User).join(User, User.id == ClientProfile.user_id).filter(ClientProfile.id.in_(client_ids))} if client_ids else {}
    tailors = {tp.id: tp.shop_name for tp in db.query(TailorProfile).filter(TailorProfile.id.in_(tailor_ids))} if tailor_ids else {}
    ids = [r.id for r in rows]
    reports = dict(db.query(ReviewReport.review_id, func.count(ReviewReport.id)).filter(
        ReviewReport.review_id.in_(ids), ReviewReport.status == "open").group_by(ReviewReport.review_id).all()) if ids else {}

    def serialize(r: Review) -> dict:
        return {
            "id": r.id, "order_id": r.order_id, "stars": r.stars, "comment": r.comment,
            "client_name": clients.get(r.client_id), "tailor_id": r.tailor_id, "tailor_name": tailors.get(r.tailor_id),
            "moderation_status": getattr(r.moderation_status, "value", r.moderation_status), "reports": reports.get(r.id, 0),
            "tailor_reply": r.tailor_reply, "tailor_reply_at": iso(r.tailor_reply_at), "reply_status": r.reply_status,
            "created_at": iso(r.created_at),
        }

    return table_response(params, rows, total, serialize, "avis", REVIEW_COLUMNS)


@router.get("/reviews/{review_id}/reports")
def review_reports(review_id: str, db: Session = Depends(get_db), _=Depends(require_perm("reviews"))):
    rows = db.query(ReviewReport).filter(ReviewReport.review_id == review_id).order_by(ReviewReport.created_at.desc()).all()
    names = {u.id: u.full_name for u in db.query(User).filter(User.id.in_({r.reporter_id for r in rows}))} if rows else {}
    return [{"id": r.id, "reporter": names.get(r.reporter_id), "reason": r.reason, "status": r.status, "created_at": iso(r.created_at)} for r in rows]


class ReportDecisionIn(BaseModel):
    decision: str = Field(pattern="^(hide|keep)$")
    reason: str | None = None


@router.post("/reviews/{review_id}/reports/decide")
def decide_reports(review_id: str, payload: ReportDecisionIn, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_perm("reviews"))):
    """8.3 — trancher les signalements d'un avis : le masquer, ou le garder
    et clore les signalements."""
    review = get_or_404(db, Review, review_id, "Avis")
    review.moderation_status = ModerationStatus.hidden if payload.decision == "hide" else ModerationStatus.visible
    db.query(ReviewReport).filter(ReviewReport.review_id == review.id, ReviewReport.status == "open").update(
        {"status": "upheld" if payload.decision == "hide" else "dismissed", "handled_by": admin.id}, synchronize_session=False
    )
    audit.record(db, admin, f"review.reports_{payload.decision}", "review", review.id, summary=payload.reason, request=request)
    db.commit()
    recompute_tailor_ranking(db, review.tailor_id)
    return {"ok": True}


class ReplyModerationIn(BaseModel):
    status: str = Field(pattern="^(visible|hidden)$")


@router.post("/reviews/{review_id}/reply-status")
def moderate_reply(review_id: str, payload: ReplyModerationIn, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_perm("reviews"))):
    """8.4 — moderer la reponse publique d'un tailleur."""
    review = get_or_404(db, Review, review_id, "Avis")
    if not review.tailor_reply:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cet avis n'a pas de réponse")
    review.reply_status = payload.status
    audit.record(db, admin, f"review.reply_{payload.status}", "review", review.id, request=request)
    db.commit()
    return {"ok": True}


class BulkReviewsIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    status: ModerationStatus


@router.post("/reviews/bulk")
def bulk_reviews(payload: BulkReviewsIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("reviews"))):
    tailors = set()
    for rid in payload.ids:
        review = db.get(Review, rid)
        if review:
            review.moderation_status = payload.status
            tailors.add(review.tailor_id)
            audit.record(db, admin, f"review.{payload.status.value}", "review", rid, request=request)
    db.commit()
    for tid in tailors:
        recompute_tailor_ranking(db, tid)
    return {"done": len(payload.ids)}
