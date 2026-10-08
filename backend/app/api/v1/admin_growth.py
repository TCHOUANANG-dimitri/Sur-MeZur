"""
Statistiques d'utilisateurs et acquisition (M14) dans l'administration web.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.admin_common import get_or_404, iso
from app.core.deps import get_db, require_roles
from app.models.acquisition import AcquisitionChannel, AcquisitionComment, Campaign, GrowthGoal, UserAcquisition
from app.models.measurements import MeasurementSession
from app.models.tailor_tools import TailorClientMeasurement, TailorPatternRequest
from app.models.users import ClientProfile, TailorProfile, User
from app.services import audit
from app.services.acquisition import qualify
from app.services.activity import local_day, utcnow
from app.services.admin_perms import require_perm
from app.services.tables import TableParams, apply_sort, csv_response, page_of, table_params, table_response
from app.services.user_stats import (
    GOAL_METRICS,
    Segment,
    activation,
    active_users,
    channel_stats,
    churn,
    cohorts,
    goals_progress,
    local_start_utc,
    money_between,
    new_users,
    previous_range,
    resolve_range,
    returns,
    totals,
)

router = APIRouter(prefix="/admin/growth", tags=["admin-growth"], dependencies=[Depends(require_roles("admin"))])
read = Depends(require_perm("growth"))


def segment_params(
    role: str | None = Query(None, pattern="^(client|tailor|collector)$"),
    city: str | None = None,
    gender: str | None = Query(None, pattern="^(male|female)$"),
    platform: str | None = Query(None, pattern="^(web|app)$"),
    channel_id: str | None = None,
) -> Segment:
    """14.8 — segmentation commune a toutes les statistiques."""
    return Segment(role=role, city=city, gender=gender, platform=platform, channel_id=channel_id)


def range_params(period: str = "month", start: date | None = None, end: date | None = None) -> tuple[date, date]:
    return resolve_range(period, start, end)


@router.get("/overview", dependencies=[read])
def overview(as_of: date | None = None, db: Session = Depends(get_db)):
    """14.1 — total des comptes a date, par role et statut."""
    return totals(db, as_of)


@router.get("/new-users", dependencies=[read])
def new_users_stats(
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    rng: tuple[date, date] = Depends(range_params),
    segment: Segment = Depends(segment_params),
    db: Session = Depends(get_db),
):
    """14.2 — inscriptions par jour, semaine ou mois."""
    return new_users(db, rng[0], rng[1], granularity, segment)


@router.get("/active", dependencies=[read])
def active_stats(rng: tuple[date, date] = Depends(range_params), segment: Segment = Depends(segment_params), db: Session = Depends(get_db)):
    """14.3 — actifs du jour, de la semaine, du mois."""
    return active_users(db, rng[0], rng[1], segment)


@router.get("/churn", dependencies=[read])
def churn_stats(
    periods: int = Query(6, ge=1, le=24),
    granularity: str = Query("month", pattern="^(week|month)$"),
    segment: Segment = Depends(segment_params),
    db: Session = Depends(get_db),
):
    """14.4 — taux d'attrition par periode, clients et tailleurs."""
    return churn(db, periods, granularity, segment)


@router.get("/cohorts", dependencies=[read])
def cohort_stats(months: int = Query(6, ge=2, le=24), segment: Segment = Depends(segment_params), db: Session = Depends(get_db)):
    """14.5 — retention par mois d'inscription."""
    return cohorts(db, months, segment)


@router.get("/activation", dependencies=[read])
def activation_stats(rng: tuple[date, date] = Depends(range_params), segment: Segment = Depends(segment_params), db: Session = Depends(get_db)):
    """14.6 — premiere mesure, premiere commande, delais medians."""
    return activation(db, rng[0], rng[1], segment)


@router.get("/returns", dependencies=[read])
def return_stats(rng: tuple[date, date] = Depends(range_params), segment: Segment = Depends(segment_params), db: Session = Depends(get_db)):
    """14.7 - utilisateurs revenus apres une periode d'inactivite."""
    return returns(db, rng[0], rng[1], segment)


@router.get("/product", dependencies=[read])
def product_stats(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    """Nouveau produit (octobre 2026) : les deux services gratuits mis en
    avant — mesures par photo (invites, inscrits, tailleurs) et patrons
    generes — plus les inscriptions de tailleurs."""
    from app.services.user_stats import local_start_utc

    since = local_start_utc(local_day() - timedelta(days=days))
    guest_sessions = (
        db.query(func.count(MeasurementSession.id))
        .join(ClientProfile, ClientProfile.id == MeasurementSession.client_id)
        .join(User, User.id == ClientProfile.user_id)
        .filter(MeasurementSession.created_at >= since, User.is_guest.is_(True))
        .scalar() or 0
    )
    registered_sessions = (
        db.query(func.count(MeasurementSession.id))
        .join(ClientProfile, ClientProfile.id == MeasurementSession.client_id)
        .join(User, User.id == ClientProfile.user_id)
        .filter(MeasurementSession.created_at >= since, User.is_guest.is_(False))
        .scalar() or 0
    )
    tailor_sessions = (
        db.query(func.count(MeasurementSession.id))
        .filter(MeasurementSession.created_at >= since,
                MeasurementSession.tailor_client_id.isnot(None))
        .scalar() or 0
    )
    tailor_signups = (
        db.query(func.count(User.id))
        .filter(User.created_at >= since, User.role == "tailor", User.is_guest.is_(False))
        .scalar() or 0
    )
    tailor_manual = (
        db.query(func.count(TailorClientMeasurement.id))
        .filter(TailorClientMeasurement.created_at >= since,
                TailorClientMeasurement.source == "manual")
        .scalar() or 0
    )
    tailor_photo = (
        db.query(func.count(TailorClientMeasurement.id))
        .filter(TailorClientMeasurement.created_at >= since,
                TailorClientMeasurement.source == "photo")
        .scalar() or 0
    )
    patterns = (
        db.query(TailorPatternRequest.status, func.count(TailorPatternRequest.id))
        .filter(TailorPatternRequest.created_at >= since)
        .group_by(TailorPatternRequest.status)
        .all()
    )
    by_status = {str(s): n for s, n in patterns}
    return {
        "days": days,
        "guest_sessions": guest_sessions,
        "registered_sessions": registered_sessions,
        "tailor_sessions": tailor_sessions,
        "tailor_signups": tailor_signups,
        "tailor_manual_measurements": tailor_manual,
        "tailor_photo_measurements": tailor_photo,
        "patterns_total": sum(by_status.values()),
        "patterns_ready": by_status.get("ready", 0),
        "patterns_failed": by_status.get("failed", 0),
    }


@router.get("/channels-stats", dependencies=[read])
def channels_stats(rng: tuple[date, date] = Depends(range_params), db: Session = Depends(get_db)):
    """14.13 — resultats par canal et par campagne."""
    return channel_stats(db, rng[0], rng[1])


@router.get("/segments", dependencies=[read])
def segment_options(db: Session = Depends(get_db)):
    """Valeurs proposees dans les filtres de segmentation (14.8)."""
    cities = {c for (c,) in db.query(User.city).filter(User.city.isnot(None)).distinct()}
    cities |= {c for (c,) in db.query(TailorProfile.city).filter(TailorProfile.city.isnot(None)).distinct()}
    channels = db.query(AcquisitionChannel).order_by(AcquisitionChannel.sort_order).all()
    return {
        "cities": sorted(c.strip() for c in cities if c and c.strip()),
        "channels": [{"id": c.id, "name": c.name} for c in channels],
    }


# --- 14.11 / 14.12 Acquisitions a qualifier --------------------------------------------------


ACQ_COLUMNS = [("created_at", "Inscription"), ("full_name", "Nom"), ("phone", "Téléphone"), ("role", "Rôle"),
               ("platform", "Support"), ("self_reported", "Déclaré"), ("utm", "Lien de campagne"),
               ("referral_code", "Code"), ("channel", "Canal retenu"), ("campaign", "Campagne"),
               ("referrer", "Personne / partenaire"), ("qualified", "Qualifié")]


@router.get("/acquisitions")
def acquisitions_table(
    params: TableParams = Depends(table_params),
    state: str = Query("todo", pattern="^(todo|done|all)$"),
    role: str | None = None,
    channel_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_perm("growth")),
):
    """14.12 — inscrits recents dont l'origine reste a qualifier."""
    query = (
        db.query(User, UserAcquisition)
        .outerjoin(UserAcquisition, UserAcquisition.user_id == User.id)
        .filter(User.is_guest.is_(False), User.role.in_(("client", "tailor")))
    )
    if state == "todo":
        query = query.filter(or_(UserAcquisition.id.is_(None), UserAcquisition.qualified.is_(False)))
    elif state == "done":
        query = query.filter(UserAcquisition.qualified.is_(True))
    if role:
        query = query.filter(User.role == role)
    if channel_id:
        query = query.filter(UserAcquisition.channel_id == channel_id)
    if date_from:
        query = query.filter(User.created_at >= local_start_utc(date_from))
    if date_to:
        query = query.filter(User.created_at < local_start_utc(date_to + timedelta(days=1)))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(User.full_name.ilike(like), User.phone.ilike(like)))
    query = apply_sort(query, params, {"created_at": User.created_at, "full_name": User.full_name}, "created_at")
    rows, total = page_of(query, params)
    channels = {c.id: c for c in db.query(AcquisitionChannel).all()}
    by_code = {c.code: c.name for c in channels.values()}
    campaigns = {c.id: c.name for c in db.query(Campaign).all()}

    def serialize(row) -> dict:
        u, a = row
        utm = (a.utm or {}) if a else {}
        return {
            "user_id": u.id, "full_name": u.full_name, "phone": u.phone, "role": getattr(u.role, "value", u.role),
            "created_at": iso(u.created_at), "platform": (a.platform if a else None) or u.signup_platform or "app",
            "self_reported": (by_code.get(a.self_reported_code) if a else None) or None,
            "self_reported_other": a.self_reported_other if a else None,
            "utm": " · ".join(f"{k.replace('utm_', '')}={v}" for k, v in utm.items()),
            "referral_code": a.referral_code if a else None,
            "channel_id": a.channel_id if a else None, "channel": channels[a.channel_id].name if a and a.channel_id in channels else None,
            "campaign_id": a.campaign_id if a else None, "campaign": campaigns.get(a.campaign_id) if a else None,
            "referrer": a.referrer if a else None, "qualified": bool(a and a.qualified),
        }

    return table_response(params, rows, total, serialize, "acquisitions", ACQ_COLUMNS)


class QualifyIn(BaseModel):
    channel_id: str | None = None
    campaign_id: str | None = None
    referrer: str | None = Field(None, max_length=255)
    method: str | None = Field(None, max_length=255)
    body: str | None = Field(None, max_length=4000)


def _check_refs(db: Session, payload: QualifyIn) -> None:
    if payload.channel_id and not db.get(AcquisitionChannel, payload.channel_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Canal introuvable")
    if payload.campaign_id and not db.get(Campaign, payload.campaign_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campagne introuvable")
    if not (payload.channel_id or payload.referrer or (payload.body or "").strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Renseignez au moins un canal, une personne à l'origine ou un commentaire")


@router.post("/acquisitions/{user_id}")
def qualify_user(user_id: str, payload: QualifyIn, request: Request, db: Session = Depends(get_db),
                 admin: User = Depends(require_perm("growth.write"))):
    """14.11 — canal, campagne, personne a l'origine et commentaire, dates
    et signes."""
    _check_refs(db, payload)
    target = get_or_404(db, User, user_id, "Utilisateur")
    qualify(db, target, admin, payload.channel_id, payload.campaign_id, payload.referrer, payload.method, payload.body)
    audit.record(db, admin, "acquisition.qualify", "user", target.id, summary=payload.method or payload.body, request=request)
    db.commit()
    return {"ok": True}


class BulkQualifyIn(QualifyIn):
    user_ids: list[str] = Field(min_length=1, max_length=500)


@router.post("/acquisitions-bulk")
def qualify_bulk(payload: BulkQualifyIn, request: Request, db: Session = Depends(get_db),
                 admin: User = Depends(require_perm("growth.write"))):
    """14.12 — meme origine pour un lot (ex. inscrits lors d'un salon)."""
    _check_refs(db, payload)
    done = 0
    for uid in payload.user_ids:
        target = db.get(User, uid)
        if target:
            qualify(db, target, admin, payload.channel_id, payload.campaign_id, payload.referrer, payload.method, payload.body)
            done += 1
    audit.record(db, admin, "acquisition.qualify_bulk", summary=f"{done} compte(s)", request=request)
    db.commit()
    return {"done": done}


@router.get("/acquisitions/{user_id}/history", dependencies=[read])
def acquisition_history(user_id: str, db: Session = Depends(get_db)):
    channels = {c.id: c.name for c in db.query(AcquisitionChannel).all()}
    campaigns = {c.id: c.name for c in db.query(Campaign).all()}
    return [
        {"id": c.id, "author_name": c.author_name, "channel": channels.get(c.channel_id), "campaign": campaigns.get(c.campaign_id),
         "referrer": c.referrer, "method": c.method, "body": c.body, "created_at": iso(c.created_at)}
        for c in db.query(AcquisitionComment).filter(AcquisitionComment.user_id == user_id).order_by(AcquisitionComment.created_at.desc())
    ]


# --- 14.14 Canaux et campagnes --------------------------------------------------------------------


class ChannelIn(BaseModel):
    code: str = Field(min_length=2, max_length=32, pattern="^[a-z0-9_]+$")
    name: str = Field(min_length=2, max_length=100)
    self_reportable: bool = True
    active: bool = True
    sort_order: int = 0


def _channel_out(c: AcquisitionChannel, counts: dict[str, int]) -> dict:
    return {"id": c.id, "code": c.code, "name": c.name, "self_reportable": c.self_reportable, "active": c.active,
            "sort_order": c.sort_order, "users": counts.get(c.id, 0)}


@router.get("/channels", dependencies=[read])
def list_channels(db: Session = Depends(get_db)):
    counts = dict(db.query(UserAcquisition.channel_id, func.count(UserAcquisition.id)).group_by(UserAcquisition.channel_id).all())
    return [_channel_out(c, counts) for c in db.query(AcquisitionChannel).order_by(AcquisitionChannel.sort_order, AcquisitionChannel.name)]


@router.post("/channels", status_code=status.HTTP_201_CREATED)
def create_channel(payload: ChannelIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("growth.write"))):
    if db.query(AcquisitionChannel).filter(AcquisitionChannel.code == payload.code).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce code existe déjà")
    c = AcquisitionChannel(**payload.model_dump())
    db.add(c)
    db.flush()
    audit.record(db, admin, "channel.create", "channel", c.id, summary=c.name, request=request)
    db.commit()
    return _channel_out(c, {})


@router.patch("/channels/{channel_id}")
def update_channel(channel_id: str, payload: ChannelIn, request: Request, db: Session = Depends(get_db),
                   admin: User = Depends(require_perm("growth.write"))):
    c = get_or_404(db, AcquisitionChannel, channel_id, "Canal")
    clash = db.query(AcquisitionChannel).filter(AcquisitionChannel.code == payload.code, AcquisitionChannel.id != c.id).first()
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce code existe déjà")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    audit.record(db, admin, "channel.update", "channel", c.id, summary=c.name, request=request)
    db.commit()
    return _channel_out(c, {})


@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("growth.write"))):
    c = get_or_404(db, AcquisitionChannel, channel_id, "Canal")
    if db.query(UserAcquisition.id).filter(UserAcquisition.channel_id == c.id).first() or \
            db.query(Campaign.id).filter(Campaign.channel_id == c.id).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Canal déjà utilisé : désactivez-le plutôt que de le supprimer")
    audit.record(db, admin, "channel.delete", "channel", c.id, summary=c.name, request=request)
    db.delete(c)
    db.commit()


class CampaignIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    code: str = Field(min_length=2, max_length=64, pattern="^[A-Za-z0-9_-]+$")
    channel_id: str | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    budget: float | None = Field(None, ge=0)
    notes: str | None = Field(None, max_length=1000)
    active: bool = True


def _campaign_out(c: Campaign, counts: dict[str, int], channels: dict[str, str]) -> dict:
    return {"id": c.id, "name": c.name, "code": c.code, "channel_id": c.channel_id, "channel": channels.get(c.channel_id),
            "starts_on": iso(c.starts_on), "ends_on": iso(c.ends_on), "budget": float(c.budget) if c.budget is not None else None,
            "notes": c.notes, "active": c.active, "users": counts.get(c.id, 0)}


@router.get("/campaigns", dependencies=[read])
def list_campaigns(db: Session = Depends(get_db)):
    counts = dict(db.query(UserAcquisition.campaign_id, func.count(UserAcquisition.id)).group_by(UserAcquisition.campaign_id).all())
    channels = {c.id: c.name for c in db.query(AcquisitionChannel).all()}
    return [_campaign_out(c, counts, channels) for c in db.query(Campaign).order_by(Campaign.created_at.desc())]


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
def create_campaign(payload: CampaignIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("growth.write"))):
    if db.query(Campaign).filter(func.lower(Campaign.code) == payload.code.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce code de campagne existe déjà")
    if payload.channel_id and not db.get(AcquisitionChannel, payload.channel_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Canal introuvable")
    c = Campaign(**payload.model_dump())
    db.add(c)
    db.flush()
    audit.record(db, admin, "campaign.create", "campaign", c.id, summary=c.name, request=request)
    db.commit()
    return _campaign_out(c, {}, {})


@router.patch("/campaigns/{campaign_id}")
def update_campaign(campaign_id: str, payload: CampaignIn, request: Request, db: Session = Depends(get_db),
                    admin: User = Depends(require_perm("growth.write"))):
    c = get_or_404(db, Campaign, campaign_id, "Campagne")
    clash = db.query(Campaign).filter(func.lower(Campaign.code) == payload.code.lower(), Campaign.id != c.id).first()
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce code de campagne existe déjà")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    audit.record(db, admin, "campaign.update", "campaign", c.id, summary=c.name, request=request)
    db.commit()
    return _campaign_out(c, {}, {})


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(campaign_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("growth.write"))):
    c = get_or_404(db, Campaign, campaign_id, "Campagne")
    if db.query(UserAcquisition.id).filter(UserAcquisition.campaign_id == c.id).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Campagne déjà attribuée à des comptes : désactivez-la plutôt")
    audit.record(db, admin, "campaign.delete", "campaign", c.id, summary=c.name, request=request)
    db.delete(c)
    db.commit()


# --- 14.15 Objectifs ----------------------------------------------------------------------------------


class GoalIn(BaseModel):
    label: str = Field(min_length=2, max_length=150)
    metric: str
    period: str = Field("month", pattern="^(month|week)$")
    target: float = Field(ge=0)
    comparator: str = Field(">=", pattern="^(>=|<=)$")
    active: bool = True


@router.get("/goals", dependencies=[read])
def list_goals(db: Session = Depends(get_db)):
    inactive = [
        {"id": g.id, "label": g.label, "metric": g.metric, "metric_label": GOAL_METRICS.get(g.metric, g.metric), "period": g.period,
         "target": float(g.target), "comparator": g.comparator, "active": False}
        for g in db.query(GrowthGoal).filter(GrowthGoal.active.is_(False))
    ]
    return {"metrics": GOAL_METRICS, "goals": goals_progress(db) + inactive}


@router.post("/goals", status_code=status.HTTP_201_CREATED)
def create_goal(payload: GoalIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("growth.write"))):
    if payload.metric not in GOAL_METRICS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indicateur inconnu")
    g = GrowthGoal(**payload.model_dump())
    db.add(g)
    db.flush()
    audit.record(db, admin, "goal.create", "goal", g.id, summary=g.label, request=request)
    db.commit()
    return {"id": g.id}


@router.patch("/goals/{goal_id}")
def update_goal(goal_id: str, payload: GoalIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("growth.write"))):
    g = get_or_404(db, GrowthGoal, goal_id, "Objectif")
    if payload.metric not in GOAL_METRICS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indicateur inconnu")
    for k, v in payload.model_dump().items():
        setattr(g, k, v)
    audit.record(db, admin, "goal.update", "goal", g.id, summary=g.label, request=request)
    db.commit()
    return {"ok": True}


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_perm("growth.write"))):
    g = get_or_404(db, GrowthGoal, goal_id, "Objectif")
    audit.record(db, admin, "goal.delete", "goal", g.id, summary=g.label, request=request)
    db.delete(g)
    db.commit()


# --- 14.16 Rapport -----------------------------------------------------------------------------------------


@router.get("/report", dependencies=[read])
def growth_report(
    period: str = Query("month", pattern="^(week|month)$"),
    ref: date | None = None,
    format: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
):
    """Rapport hebdomadaire ou mensuel : la semaine ou le mois contenant
    `ref` (par defaut : la periode en cours)."""
    from app.services.activity import local_day

    ref = ref or local_day()
    if period == "week":
        start = ref - timedelta(days=ref.weekday())
        end = start + timedelta(days=6)
    else:
        start = ref.replace(day=1)
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    end = min(end, local_day())
    prev_start, prev_end = previous_range(start, end)
    all_seg = Segment()
    nu = new_users(db, start, end, "day", all_seg)
    act = active_users(db, end, end, all_seg)
    ch = churn(db, 1, "month" if period == "month" else "week", all_seg)
    actv = activation(db, start, end, all_seg)
    rets = returns(db, start, end, all_seg)
    channels = channel_stats(db, start, end)
    cash, commission = money_between(db, start, end)
    prev_cash, _pc = money_between(db, prev_start, prev_end)
    tot = totals(db, end)
    summary = [
        ("Utilisateurs inscrits (total)", tot["total"]),
        ("Clients", tot["by_role"]["client"]),
        ("Tailleurs", tot["by_role"]["tailor"]),
        ("Nouveaux inscrits sur la période", nu["total"]),
        ("Nouveaux inscrits, période précédente", nu["previous"]),
        ("Évolution des inscriptions (%)", nu["change_pct"]),
        ("Actifs sur 30 jours (fin de période)", act["mau"]),
        ("Actifs sur 7 jours (fin de période)", act["wau"]),
        ("Churn de la période (%)", ch["series"][-1]["rate_pct"] if ch["series"] else None),
        ("Nouveaux clients ayant mesuré (%)", actv["clients"]["first_measure_pct"]),
        ("Nouveaux clients ayant commandé (%)", actv["clients"]["first_order_pct"]),
        ("Utilisateurs revenus après inactivité", rets["count"]),
        ("Encaissements (FCFA)", cash),
        ("Encaissements, période précédente (FCFA)", prev_cash),
        ("Commissions (FCFA)", commission),
    ]
    if format == "csv":
        rows = [{"indicateur": k, "valeur": v} for k, v in summary]
        rows.append({"indicateur": "", "valeur": ""})
        for c in channels["channels"]:
            rows.append({"indicateur": f"Canal — {c['name']} : inscriptions", "valeur": c["signups"]})
            rows.append({"indicateur": f"Canal — {c['name']} : ont commandé", "valeur": c["activated_order"]})
        return csv_response(f"rapport-{period}-{start.isoformat()}", [("indicateur", "Indicateur"), ("valeur", "Valeur")], rows)
    return {
        "period": period, "start": start.isoformat(), "end": end.isoformat(),
        "summary": [{"label": k, "value": v} for k, v in summary],
        "channels": channels["channels"], "campaigns": channels["campaigns"],
        "new_users_series": nu["series"], "goals": goals_progress(db),
    }
