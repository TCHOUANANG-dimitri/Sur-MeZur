"""
Supervision de la mesure par photo (M9, 1.5) et objectifs de la campagne de
collecte (10.5) dans l'administration web.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from statistics import mean, median

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso
from app.core.deps import get_db, require_roles
from app.models.collecte import DatasetSubject
from app.models.measurements import Measurement, MeasurementDataset, MeasurementSession
from app.models.operations import FitFeedback
from app.models.orders import Order
from app.models.tailor_tools import TailorClient, TailorClientMeasurement
from app.models.users import ClientProfile, TailorProfile, User
from app.services.activity import as_utc, local_day
from app.services.admin_perms import require_perm
from app.services.platform_settings import get_setting
from app.services.tables import TableParams, apply_sort, page_of, table_params, table_response
from app.services.user_stats import local_start_utc

router = APIRouter(prefix="/admin", tags=["admin-web"], dependencies=[Depends(require_roles("admin"))])

SESSION_COLUMNS = [("created_at", "Date"), ("account", "Compte"), ("platform", "Support"), ("status", "Résultat"),
                   ("duration_s", "Durée (s)"), ("error_message", "Cause de l'échec"), ("height_cm", "Taille (cm)"),
                   ("gender", "Sexe")]


def _duration(s: MeasurementSession) -> float | None:
    if s.started_at and s.finished_at:
        return round((as_utc(s.finished_at) - as_utc(s.started_at)).total_seconds(), 1)
    return None


def _error_family(message: str | None) -> str:
    """Regroupe les messages d'echec (rediges pour le client, parfois avec
    des details variables) en causes comparables."""
    if not message:
        return "inconnue"
    text = message.lower()
    rules = [
        ("personne", "personne non détectée"), ("corps entier", "corps incomplet"), ("pieds", "corps incomplet"),
        ("tête", "corps incomplet"), ("lumi", "éclairage"), ("sombre", "éclairage"), ("flou", "photo floue"),
        ("profil", "photo de profil"), ("face", "photo de face"), ("vêtement", "vêtements amples"),
        ("inattendue", "erreur technique"), ("délai", "délai dépassé"),
    ]
    for needle, label in rules:
        if needle in text:
            return label
    return re.sub(r"\d+", "#", message)[:60]


@router.get("/tables/measurement-sessions")
def sessions_table(
    params: TableParams = Depends(table_params),
    status_: str | None = Query(None, alias="status"),
    platform: str | None = None,
    account: str | None = Query(None, pattern="^(guest|registered)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("measure")),
):
    """9.1 — journal des analyses."""
    query = db.query(MeasurementSession, User).join(ClientProfile, ClientProfile.id == MeasurementSession.client_id).join(
        User, User.id == ClientProfile.user_id
    )
    if status_:
        query = query.filter(MeasurementSession.status == status_)
    if platform:
        query = query.filter(MeasurementSession.platform == platform) if platform == "web" else query.filter(
            or_(MeasurementSession.platform == platform, MeasurementSession.platform.is_(None))
        )
    if account == "guest":
        query = query.filter(User.is_guest.is_(True))
    elif account == "registered":
        query = query.filter(User.is_guest.is_(False))
    if date_from:
        query = query.filter(MeasurementSession.created_at >= local_start_utc(date_from))
    if date_to:
        query = query.filter(MeasurementSession.created_at < local_start_utc(date_to + timedelta(days=1)))
    query = apply_sort(query, params, {"created_at": MeasurementSession.created_at, "status": MeasurementSession.status}, "created_at")
    rows, total = page_of(query, params)

    def serialize(row) -> dict:
        s, u = row
        return {
            "id": s.id, "created_at": iso(s.created_at), "status": getattr(s.status, "value", s.status),
            "platform": s.platform or "app", "duration_s": _duration(s), "error_message": s.error_message,
            "error_family": _error_family(s.error_message) if getattr(s.status, "value", s.status) == "failed" else None,
            "height_cm": s.height_cm, "weight_kg": s.weight_kg, "gender": s.gender,
            "user_id": u.id, "is_guest": u.is_guest, "account": "invité" if u.is_guest else u.full_name,
            "has_photos": bool(s.front_photo_url or s.side_photo_url), "measurement_id": s.measurement_id,
        }

    return table_response(params, rows, total, serialize, "analyses", SESSION_COLUMNS)


@router.get("/measurement-sessions/{session_id}")
def session_diagnostic(session_id: str, db: Session = Depends(get_db), _=Depends(require_perm("measure"))):
    """9.2 — photos (si consentement) et message renvoye au client."""
    s = get_or_404(db, MeasurementSession, session_id, "Analyse")
    client = db.get(ClientProfile, s.client_id)
    user = db.get(User, client.user_id) if client else None
    consent = bool(user and user.photo_consent)
    measurement = db.get(Measurement, s.measurement_id) if s.measurement_id else None
    return {
        "id": s.id, "status": getattr(s.status, "value", s.status), "platform": s.platform or "app",
        "created_at": iso(s.created_at), "started_at": iso(s.started_at), "finished_at": iso(s.finished_at),
        "duration_s": _duration(s), "error_message": s.error_message, "error_family": _error_family(s.error_message),
        "height_cm": s.height_cm, "weight_kg": s.weight_kg, "gender": s.gender,
        "photo_consent": consent,
        # Sans consentement, les photos ne sont pas montrees, meme a l'equipe.
        "front_photo_url": s.front_photo_url if consent else None,
        "side_photo_url": s.side_photo_url if consent else None,
        "user": {"id": user.id, "full_name": user.full_name, "is_guest": user.is_guest} if user else None,
        "measurement": {"id": measurement.id, "data": measurement.data or {}, "confidence": measurement.confidence} if measurement else None,
    }


TAILOR_MEASURE_COLUMNS = [("created_at", "Date"), ("shop_name", "Atelier"), ("client", "Client"),
                          ("source", "Origine"), ("height_cm", "Taille (cm)"), ("keys", "Mesures")]


@router.get("/tables/tailor-measurements")
def tailor_measurements_table(
    params: TableParams = Depends(table_params),
    source: str | None = Query(None, pattern="^(manual|photo)$"),
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("measure")),
):
    """M9 — mesures faites par les tailleurs (carnet), saisie manuelle et
    photo reunies, avec l'atelier et le client concernes."""
    query = (
        db.query(TailorClientMeasurement, TailorClient, TailorProfile)
        .join(TailorClient, TailorClient.id == TailorClientMeasurement.tailor_client_id)
        .join(TailorProfile, TailorProfile.id == TailorClient.tailor_id)
    )
    if source:
        query = query.filter(TailorClientMeasurement.source == source)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(TailorClient.full_name.ilike(like), TailorProfile.shop_name.ilike(like))
        )
    if date_from:
        query = query.filter(TailorClientMeasurement.created_at >= local_start_utc(date_from))
    if date_to:
        query = query.filter(TailorClientMeasurement.created_at < local_start_utc(date_to + timedelta(days=1)))
    query = apply_sort(query, params, {"created_at": TailorClientMeasurement.created_at}, "created_at")
    rows, total = page_of(query, params)

    def serialize(row) -> dict:
        m, c, tp = row
        return {
            "id": m.id, "created_at": iso(m.created_at), "source": m.source,
            "shop_name": tp.shop_name, "tailor_user_id": tp.user_id,
            "client": c.full_name, "tailor_client_id": c.id,
            "height_cm": m.height_cm, "weight_kg": m.weight_kg,
            "keys": len(m.data or {}), "note": m.note,
        }

    return table_response(params, rows, total, serialize, "mesures tailleurs", TAILOR_MEASURE_COLUMNS)


@router.get("/measure/health")
def measure_health(days: int = Query(7, ge=1, le=90), db: Session = Depends(get_db), _=Depends(require_perm("measure", "dashboard"))):
    """1.5 — taux de reussite, duree et causes d'echec."""
    since = local_start_utc(local_day() - timedelta(days=days - 1))
    sessions = [s for s in db.query(MeasurementSession).filter(MeasurementSession.created_at >= since).all()
                if getattr(s.status, "value", s.status) in ("ready", "failed")]
    ready = [s for s in sessions if getattr(s.status, "value", s.status) == "ready"]
    failed = [s for s in sessions if getattr(s.status, "value", s.status) == "failed"]
    durations = [d for d in (_duration(s) for s in sessions) if d is not None]
    per_day: dict[str, Counter] = defaultdict(Counter)
    for s in sessions:
        per_day[local_day(s.created_at).isoformat()][getattr(s.status, "value", s.status)] += 1
    return {
        "days": days,
        "total": len(sessions),
        "success": len(ready),
        "failed": len(failed),
        "success_rate_pct": round(len(ready) / len(sessions) * 100, 1) if sessions else None,
        "avg_duration_s": round(mean(durations), 1) if durations else None,
        "median_duration_s": round(median(durations), 1) if durations else None,
        "top_errors": [{"cause": c, "count": n} for c, n in Counter(_error_family(s.error_message) for s in failed).most_common(6)],
        "by_platform": dict(Counter(s.platform or "app" for s in sessions)),
        "per_day": [{"day": d, "ready": c.get("ready", 0), "failed": c.get("failed", 0)} for d, c in sorted(per_day.items())],
        "processing_now": db.query(MeasurementSession).filter(
            MeasurementSession.status == "processing", MeasurementSession.started_at.isnot(None)
        ).count(),
    }


@router.get("/measure/chain")
def measure_chain(_=Depends(require_perm("measure", "security"))):
    """9.3 — MediaPipe, segmentation et modeles charges sur le serveur."""
    from app.services import vision

    try:
        return {"ok": True, **vision.capabilities()}
    except Exception as exc:  # pragma: no cover
        return {"ok": False, "error": str(exc)}


@router.get("/measure/precision")
def measure_precision(db: Session = Depends(get_db), _=Depends(require_perm("measure"))):
    """9.4 — ecart entre mesures calculees et verite terrain disponible :
    mesures confirmees par un tailleur, retouches signalees a l'essayage,
    corrections faites a la demande des clients."""
    per_measure: dict[str, list[float]] = defaultdict(list)
    sources = Counter()
    for ds in db.query(MeasurementDataset).filter(MeasurementDataset.tailor_confirmed_measurements.isnot(None)).all():
        ai = ds.ai_measurements or {}
        for key, truth in (ds.tailor_confirmed_measurements or {}).items():
            if isinstance(truth, (int, float)) and isinstance(ai.get(key), (int, float)):
                per_measure[key].append(float(ai[key]) - float(truth))
                sources["tailor_confirmed"] += 1
    fit_results = Counter()
    for f in db.query(FitFeedback).all():
        fit_results[f.result] += 1
        for adj in f.adjustments or []:
            try:
                # delta positif = il manquait de l'aisance : la mesure calculee etait trop petite.
                per_measure[str(adj.get("measure"))].append(-float(adj.get("delta_cm")))
                sources["fit_feedback"] += 1
            except (TypeError, ValueError):
                continue
    from app.models.admin import AuditLog

    for log in db.query(AuditLog).filter(AuditLog.action == "measurement.correct").all():
        for key, change in (log.details or {}).get("modifications", {}).items():
            try:
                per_measure[key].append(float(change["avant"]) - float(change["après"]))
                sources["admin_correction"] += 1
            except (TypeError, ValueError, KeyError):
                continue
    rows = []
    for key, deltas in per_measure.items():
        rows.append({
            "measure": key, "count": len(deltas),
            "mean_error_cm": round(mean(deltas), 2),
            "mean_abs_error_cm": round(mean(abs(d) for d in deltas), 2),
            "within_2cm_pct": round(sum(1 for d in deltas if abs(d) <= 2) / len(deltas) * 100, 1),
        })
    rows.sort(key=lambda r: -r["count"])
    total_fits = sum(fit_results.values())
    return {
        "measures": rows,
        "sources": dict(sources),
        "fit_results": dict(fit_results),
        "good_fit_pct": round(fit_results.get("good", 0) / total_fits * 100, 1) if total_fits else None,
        "delivered_orders": db.query(Order).filter(Order.status == "finished_delivered").count(),
    }


# --- 10.5 Objectifs de la campagne de collecte ------------------------------------------


def _bmi_group(s: DatasetSubject) -> str:
    if not s.height_cm or not s.weight_kg:
        return "inconnue"
    bmi = s.weight_kg / (s.height_cm / 100) ** 2
    if bmi < 18.5:
        return "mince (IMC < 18,5)"
    if bmi < 25:
        return "normale (18,5–25)"
    if bmi < 30:
        return "surpoids (25–30)"
    return "obésité (≥ 30)"


@router.get("/collecte/objectives")
def collecte_objectives(db: Session = Depends(get_db), _=Depends(require_perm("collecte"))):
    target = get_setting("collecte_target", db) or {}
    subjects = db.query(DatasetSubject).all()
    usable = [s for s in subjects if s.review_status != "rejected"]
    validated = [s for s in subjects if s.review_status == "validated"]
    total_target = int(target.get("total", 300))
    female_share = float(target.get("female_share", 0.5))

    def groups(key) -> list[dict]:
        c = Counter(key(s) for s in usable)
        return [{"name": k or "non renseigné", "count": v} for k, v in c.most_common()]

    by_week = Counter(local_day(s.created_at) - timedelta(days=local_day(s.created_at).weekday()) for s in subjects)
    return {
        "target": total_target,
        "minimum": int(target.get("minimum", 150)),
        "collected": len(usable),
        "validated": len(validated),
        "progress_pct": round(len(usable) / total_target * 100, 1) if total_target else None,
        "gender_targets": {"female": round(total_target * female_share), "male": total_target - round(total_target * female_share)},
        "by_gender": groups(lambda s: {"male": "homme", "female": "femme"}.get(s.gender, s.gender)),
        "by_corpulence": groups(_bmi_group),
        "by_clothing": groups(lambda s: s.clothing),
        "by_city": groups(lambda s: s.city),
        "by_week": [{"week": k.isoformat(), "count": v} for k, v in sorted(by_week.items())],
    }
