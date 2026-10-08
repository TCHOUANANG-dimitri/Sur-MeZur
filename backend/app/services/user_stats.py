"""
Statistiques d'utilisateurs, d'activite et d'acquisition (M1, M14).

Les calculs se font en Python sur des projections legeres (identifiant,
role, date d'inscription...) : a l'echelle de la plateforme (quelques
dizaines de milliers de comptes au plus a moyen terme) c'est rapide, et
cela garde un code identique en SQLite et en PostgreSQL.

Conventions :
  - un « jour » est un jour du Cameroun (UTC+1, voir services/activity) ;
  - les comptes invites sont exclus partout, sauf mention contraire ; ils
    sont comptes a part (14.1) ;
  - les administrateurs sont exclus des statistiques d'utilisateurs ;
  - « actif » = au moins une journee d'activite enregistree
    (`user_activity_days`), « parti » (churn) = aucune activite depuis
    `churn_inactivity_days` jours (reglable).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.acquisition import AcquisitionChannel, Campaign, GrowthGoal, UserAcquisition
from app.models.admin import Announcement, UserActivityDay
from app.models.measurements import Measurement, MeasurementSession
from app.models.orders import Order, Quote
from app.models.payments import Payment, PaymentSplit
from app.models.users import ClientProfile, TailorProfile, User
from app.services.activity import LOCAL_OFFSET, as_utc, local_day
from app.services.platform_settings import get_setting

USER_ROLES = ("client", "tailor", "collector")
PAID_STATUSES = ("paid", "released")


# --- Dates -------------------------------------------------------------------


def local_start_utc(d: date) -> datetime:
    """Minuit (heure du Cameroun) du jour `d`, en UTC."""
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc) - LOCAL_OFFSET


def bucket_of(d: date, granularity: str) -> date:
    if granularity == "week":
        return d - timedelta(days=d.weekday())
    if granularity == "month":
        return d.replace(day=1)
    return d


def add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    return date(d.year + month // 12, month % 12 + 1, 1)


def buckets(start: date, end: date, granularity: str) -> list[date]:
    out: list[date] = []
    cur = bucket_of(start, granularity)
    while cur <= end:
        out.append(cur)
        if granularity == "week":
            cur += timedelta(days=7)
        elif granularity == "month":
            cur = add_months(cur, 1)
        else:
            cur += timedelta(days=1)
    return out


def resolve_range(period: str | None, start: date | None, end: date | None) -> tuple[date, date]:
    today = local_day()
    if start and end:
        return (start, end) if start <= end else (end, start)
    if period == "day":
        return today, today
    if period == "week":
        return today - timedelta(days=6), today
    if period == "quarter":
        return today - timedelta(days=89), today
    if period == "year":
        return today - timedelta(days=364), today
    return today - timedelta(days=29), today


def previous_range(start: date, end: date) -> tuple[date, date]:
    length = (end - start).days + 1
    return start - timedelta(days=length), start - timedelta(days=1)


def in_range(d: date | None, start: date, end: date) -> bool:
    return d is not None and start <= d <= end


def pct_change(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


# --- Projection des utilisateurs ----------------------------------------------


@dataclass
class UserRow:
    id: str
    role: str
    created: date
    created_at: datetime
    is_active: bool
    city: str | None
    platform: str | None
    gender: str | None
    channel_id: str | None
    campaign_id: str | None
    client_id: str | None
    tailor_id: str | None


@dataclass
class Segment:
    role: str | None = None
    city: str | None = None
    gender: str | None = None
    platform: str | None = None
    channel_id: str | None = None

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v}


def load_users(db: Session, segment: Segment | None = None, include_guests: bool = False) -> list[UserRow]:
    segment = segment or Segment()
    q = db.query(
        User.id, User.role, User.created_at, User.is_active, User.city, User.signup_platform, User.is_guest
    ).filter(User.role != "admin")
    if not include_guests:
        q = q.filter(User.is_guest.is_(False))
    rows = q.all()

    clients = dict(db.query(ClientProfile.user_id, ClientProfile.id).all())
    tailors = {uid: (tid, city) for uid, tid, city in db.query(TailorProfile.user_id, TailorProfile.id, TailorProfile.city).all()}
    acq = {
        uid: (ch, camp)
        for uid, ch, camp in db.query(UserAcquisition.user_id, UserAcquisition.channel_id, UserAcquisition.campaign_id).all()
    }
    # Sexe : celui de la mesure la plus recente du client.
    genders: dict[str, str] = {}
    for client_id, gender in (
        db.query(Measurement.client_id, Measurement.gender)
        .filter(Measurement.gender.isnot(None))
        .order_by(Measurement.created_at)
        .all()
    ):
        genders[client_id] = gender

    out: list[UserRow] = []
    for uid, role, created_at, is_active, city, platform, _guest in rows:
        role = str(getattr(role, "value", role))
        client_id = clients.get(uid)
        tailor_id, tailor_city = tailors.get(uid, (None, None))
        channel_id, campaign_id = acq.get(uid, (None, None))
        row = UserRow(
            id=uid,
            role="guest" if _guest else role,
            created=local_day(created_at),
            created_at=as_utc(created_at),
            is_active=bool(is_active),
            city=city or tailor_city,
            platform=platform or "app",
            gender=genders.get(client_id) if client_id else None,
            channel_id=channel_id,
            campaign_id=campaign_id,
            client_id=client_id,
            tailor_id=tailor_id,
        )
        if segment.role and row.role != segment.role:
            continue
        if segment.city and (row.city or "").lower() != segment.city.lower():
            continue
        if segment.gender and row.gender != segment.gender:
            continue
        if segment.platform and row.platform != segment.platform:
            continue
        if segment.channel_id:
            if segment.channel_id == "none":
                if row.channel_id:
                    continue
            elif row.channel_id != segment.channel_id:
                continue
        out.append(row)
    return out


def activity_by_user(db: Session, start: date, end: date, user_ids: set[str] | None = None) -> dict[str, set[date]]:
    q = db.query(UserActivityDay.user_id, UserActivityDay.day).filter(
        UserActivityDay.day >= start, UserActivityDay.day <= end
    )
    out: dict[str, set[date]] = defaultdict(set)
    for uid, day in q.all():
        if user_ids is None or uid in user_ids:
            out[uid].add(day)
    return out


def tracking_started(db: Session) -> date | None:
    first = db.query(func.min(UserActivityDay.day)).scalar()
    return first


# --- 14.1 Totaux ---------------------------------------------------------------


def totals(db: Session, as_of: date | None = None) -> dict:
    as_of = as_of or local_day()
    users = [u for u in load_users(db, include_guests=True) if u.created <= as_of]
    by_role = Counter(u.role for u in users if u.role != "guest")
    registered = [u for u in users if u.role != "guest"]
    return {
        "as_of": as_of.isoformat(),
        "total": len(registered),
        "by_role": {r: by_role.get(r, 0) for r in USER_ROLES},
        "active_accounts": sum(1 for u in registered if u.is_active),
        "suspended": sum(1 for u in registered if not u.is_active),
        "guests": sum(1 for u in users if u.role == "guest"),
        # Le statut suspendu est celui d'aujourd'hui : l'historique des
        # suspensions n'est pas conserve, seul le nombre de comptes l'est.
        "status_is_current": as_of != local_day(),
    }


# --- 14.2 Nouveaux utilisateurs --------------------------------------------------


def new_users(db: Session, start: date, end: date, granularity: str, segment: Segment) -> dict:
    users = load_users(db, segment)
    keys = buckets(start, end, granularity)
    series = {k: Counter() for k in keys}
    for u in users:
        if in_range(u.created, start, end):
            series[bucket_of(u.created, granularity)][u.role] += 1
    prev_start, prev_end = previous_range(start, end)
    current = sum(1 for u in users if in_range(u.created, start, end))
    previous = sum(1 for u in users if in_range(u.created, prev_start, prev_end))
    return {
        "series": [
            {"period": k.isoformat(), "total": sum(c.values()), **{r: c.get(r, 0) for r in USER_ROLES}}
            for k, c in series.items()
        ],
        "total": current,
        "previous": previous,
        "change_pct": pct_change(current, previous),
    }


# --- 14.3 Actifs ---------------------------------------------------------------


def active_users(db: Session, start: date, end: date, segment: Segment) -> dict:
    users = load_users(db, segment)
    ids = {u.id for u in users}
    window_start = start - timedelta(days=29)
    act = activity_by_user(db, window_start, end, ids)
    per_day: dict[date, set[str]] = defaultdict(set)
    for uid, days in act.items():
        for d in days:
            per_day[d].add(uid)

    def distinct(lo: date, hi: date) -> int:
        return len({uid for d, s in per_day.items() if lo <= d <= hi for uid in s})

    series = []
    d = start
    while d <= end:
        series.append({
            "period": d.isoformat(),
            "dau": len(per_day.get(d, ())),
            "wau": distinct(d - timedelta(days=6), d),
            "mau": distinct(d - timedelta(days=29), d),
        })
        d += timedelta(days=1)
    dau = series[-1]["dau"] if series else 0
    wau = series[-1]["wau"] if series else 0
    mau = series[-1]["mau"] if series else 0
    avg_dau = sum(s["dau"] for s in series[-30:]) / max(1, len(series[-30:]))
    return {
        "series": series,
        "dau": dau,
        "wau": wau,
        "mau": mau,
        # 14.3 : part des actifs du mois qui reviennent chaque jour.
        "stickiness_pct": round(avg_dau / mau * 100, 1) if mau else None,
        "tracking_since": (tracking_started(db) or local_day()).isoformat(),
    }


# --- 14.4 Churn ----------------------------------------------------------------


def _active_set(per_user: dict[str, set[date]], day: date, threshold: int) -> set[str]:
    lo = day - timedelta(days=threshold - 1)
    return {uid for uid, days in per_user.items() if any(lo <= d <= day for d in days)}


def churn(db: Session, periods: int, granularity: str, segment: Segment) -> dict:
    threshold = int(get_setting("churn_inactivity_days", db) or 30)
    today = local_day()
    keys = buckets(today - timedelta(days=(31 if granularity == "month" else 7) * (periods - 1)), today, granularity)
    first = keys[0] - timedelta(days=threshold + 1)
    users = load_users(db, segment)
    roles = {u.id: u.role for u in users}
    act = activity_by_user(db, first, today, set(roles))
    out = []
    for k in keys:
        nxt = add_months(k, 1) if granularity == "month" else k + timedelta(days=7)
        end = min(nxt - timedelta(days=1), today)
        base = _active_set(act, k - timedelta(days=1), threshold)
        still = _active_set(act, end, threshold)
        # Un utilisateur dont la derniere activite date de moins de
        # `threshold` jours n'est pas encore parti, meme s'il n'est pas
        # revenu depuis le debut de la periode.
        lost = base - still
        entry = {"period": k.isoformat(), "base": len(base), "churned": len(lost)}
        entry["rate_pct"] = round(len(lost) / len(base) * 100, 1) if base else None
        for role in ("client", "tailor"):
            b = {u for u in base if roles.get(u) == role}
            lr = {u for u in lost if roles.get(u) == role}
            entry[f"{role}_rate_pct"] = round(len(lr) / len(b) * 100, 1) if b else None
        out.append(entry)
    return {"threshold_days": threshold, "series": out, "tracking_since": (tracking_started(db) or today).isoformat()}


# --- 14.5 Cohortes ---------------------------------------------------------------


def cohorts(db: Session, months: int, segment: Segment) -> dict:
    today = local_day()
    first_month = add_months(today.replace(day=1), -(months - 1))
    users = [u for u in load_users(db, segment) if u.created >= first_month]
    act = activity_by_user(db, first_month, today, {u.id for u in users})
    by_cohort: dict[date, list[UserRow]] = defaultdict(list)
    for u in users:
        by_cohort[u.created.replace(day=1)].append(u)
    rows = []
    for i in range(months):
        cohort = add_months(first_month, i)
        members = by_cohort.get(cohort, [])
        cells = []
        for k in range(months - i):
            m_start = add_months(cohort, k)
            m_end = add_months(cohort, k + 1) - timedelta(days=1)
            if not members:
                cells.append(None)
                continue
            n = sum(1 for u in members if any(m_start <= d <= m_end for d in act.get(u.id, ())))
            cells.append(round(n / len(members) * 100, 1))
        rows.append({"cohort": cohort.isoformat(), "size": len(members), "retention_pct": cells})
    return {"rows": rows, "tracking_since": (tracking_started(db) or today).isoformat()}


# --- 14.6 Activation -------------------------------------------------------------


def _first_dates(db: Session) -> tuple[dict[str, datetime], dict[str, datetime], dict[str, datetime]]:
    first_measure: dict[str, datetime] = {}
    for client_id, created in (
        db.query(Measurement.client_id, func.min(Measurement.created_at)).group_by(Measurement.client_id).all()
    ):
        first_measure[client_id] = as_utc(created)
    first_order_client: dict[str, datetime] = {}
    for client_id, created in db.query(Order.client_id, func.min(Order.created_at)).group_by(Order.client_id).all():
        first_order_client[client_id] = as_utc(created)
    first_order_tailor: dict[str, datetime] = {}
    for tailor_id, created in db.query(Order.tailor_id, func.min(Order.created_at)).group_by(Order.tailor_id).all():
        first_order_tailor[tailor_id] = as_utc(created)
    return first_measure, first_order_client, first_order_tailor


def activation(db: Session, start: date, end: date, segment: Segment) -> dict:
    users = [u for u in load_users(db, segment) if in_range(u.created, start, end)]
    first_measure, first_order_client, first_order_tailor = _first_dates(db)
    clients = [u for u in users if u.role == "client"]
    tailors = [u for u in users if u.role == "tailor"]

    def delays(rows: Iterable[UserRow], source: dict[str, datetime], key: str) -> list[float]:
        out = []
        for u in rows:
            ref = getattr(u, key)
            when = source.get(ref) if ref else None
            if when:
                out.append(max(0.0, (when - u.created_at).total_seconds() / 86400))
        return out

    measured = delays(clients, first_measure, "client_id")
    ordered = delays(clients, first_order_client, "client_id")
    tailor_orders = delays(tailors, first_order_tailor, "tailor_id")

    def share(n: int, d: int) -> float | None:
        return round(n / d * 100, 1) if d else None

    return {
        "clients": {
            "signed_up": len(clients),
            "first_measure": len(measured),
            "first_measure_pct": share(len(measured), len(clients)),
            "first_measure_median_days": round(median(measured), 1) if measured else None,
            "first_order": len(ordered),
            "first_order_pct": share(len(ordered), len(clients)),
            "first_order_median_days": round(median(ordered), 1) if ordered else None,
        },
        "tailors": {
            "signed_up": len(tailors),
            "first_order": len(tailor_orders),
            "first_order_pct": share(len(tailor_orders), len(tailors)),
            "first_order_median_days": round(median(tailor_orders), 1) if tailor_orders else None,
        },
    }


# --- 14.7 Retours ----------------------------------------------------------------


def returns(db: Session, start: date, end: date, segment: Segment) -> dict:
    threshold = int(get_setting("churn_inactivity_days", db) or 30)
    users = {u.id: u for u in load_users(db, segment)}
    act = activity_by_user(db, start - timedelta(days=threshold + 400), end, set(users))
    announcements = [local_day(a) for (a,) in db.query(Announcement.created_at).all()]
    order_days: dict[str, set[date]] = defaultdict(set)
    clients = {u.client_id: uid for uid, u in users.items() if u.client_id}
    for client_id, created in db.query(Order.client_id, Order.created_at).all():
        uid = clients.get(client_id)
        if uid:
            order_days[uid].add(local_day(created))

    events = []
    for uid, days in act.items():
        ordered = sorted(days)
        for prev, cur in zip(ordered, ordered[1:]):
            if in_range(cur, start, end) and (cur - prev).days >= threshold:
                if any(cur - timedelta(days=7) <= a <= cur for a in announcements):
                    cause = "announcement"
                elif cur in order_days.get(uid, ()):
                    cause = "order"
                else:
                    cause = "unknown"
                events.append({"user_id": uid, "day": cur.isoformat(), "inactive_days": (cur - prev).days, "cause": cause})
    causes = Counter(e["cause"] for e in events)
    return {
        "threshold_days": threshold,
        "count": len({e["user_id"] for e in events}),
        "by_cause": dict(causes),
        "events": sorted(events, key=lambda e: e["day"], reverse=True)[:200],
    }


# --- 14.13 Statistiques par canal --------------------------------------------------


def _order_values(db: Session) -> tuple[dict[str, int], dict[str, float], dict[str, int], dict[str, float]]:
    """Commandes et volume livre, par client et par tailleur."""
    orders_by_client: Counter = Counter()
    gmv_by_client: defaultdict = defaultdict(float)
    orders_by_tailor: Counter = Counter()
    gmv_by_tailor: defaultdict = defaultdict(float)
    for client_id, tailor_id, status, price in db.query(
        Order.client_id, Order.tailor_id, Order.status, Order.agreed_price
    ).all():
        status = str(getattr(status, "value", status))
        orders_by_client[client_id] += 1
        orders_by_tailor[tailor_id] += 1
        if status == "finished_delivered":
            gmv_by_client[client_id] += float(price or 0)
            gmv_by_tailor[tailor_id] += float(price or 0)
    return orders_by_client, gmv_by_client, orders_by_tailor, gmv_by_tailor


def channel_stats(db: Session, start: date, end: date) -> dict:
    threshold = int(get_setting("churn_inactivity_days", db) or 30)
    today = local_day()
    users = [u for u in load_users(db) if in_range(u.created, start, end)]
    first_measure, first_order_client, first_order_tailor = _first_dates(db)
    orders_c, gmv_c, orders_t, gmv_t = _order_values(db)
    last_seen = dict(db.query(User.id, User.last_seen_at).all())

    channels = {c.id: c for c in db.query(AcquisitionChannel).all()}
    campaigns = {c.id: c for c in db.query(Campaign).all()}

    def summarize(rows: list[UserRow]) -> dict:
        measured = sum(1 for u in rows if u.client_id and u.client_id in first_measure)
        ordered = sum(
            1 for u in rows
            if (u.client_id and u.client_id in first_order_client) or (u.tailor_id and u.tailor_id in first_order_tailor)
        )
        orders = sum(orders_c.get(u.client_id, 0) for u in rows if u.client_id) + sum(
            orders_t.get(u.tailor_id, 0) for u in rows if u.tailor_id
        )
        gmv = sum(gmv_c.get(u.client_id, 0.0) for u in rows if u.client_id)
        mature = [u for u in rows if (today - u.created).days >= threshold]
        gone = sum(
            1 for u in mature
            if not last_seen.get(u.id) or (today - local_day(last_seen[u.id])).days >= threshold
        )
        return {
            "signups": len(rows),
            "clients": sum(1 for u in rows if u.role == "client"),
            "tailors": sum(1 for u in rows if u.role == "tailor"),
            "activated_measure": measured,
            "activated_order": ordered,
            "orders": orders,
            "gmv": round(gmv, 2),
            "churn_pct": round(gone / len(mature) * 100, 1) if mature else None,
        }

    by_channel: dict[str | None, list[UserRow]] = defaultdict(list)
    by_campaign: dict[str, list[UserRow]] = defaultdict(list)
    for u in users:
        by_channel[u.channel_id].append(u)
        if u.campaign_id:
            by_campaign[u.campaign_id].append(u)

    channel_rows = []
    for cid, rows in by_channel.items():
        ch = channels.get(cid) if cid else None
        channel_rows.append({"channel_id": cid, "name": ch.name if ch else "Non renseigné", **summarize(rows)})
    channel_rows.sort(key=lambda r: -r["signups"])

    campaign_rows = []
    for camp in campaigns.values():
        rows = by_campaign.get(camp.id, [])
        s = summarize(rows)
        budget = float(camp.budget) if camp.budget is not None else None
        campaign_rows.append({
            "campaign_id": camp.id,
            "name": camp.name,
            "code": camp.code,
            "channel": channels[camp.channel_id].name if camp.channel_id in channels else None,
            "budget": budget,
            # 14.14 : cout d'acquisition d'un utilisateur et d'un client
            # (inscrit ayant passe au moins une commande).
            "cost_per_user": round(budget / s["signups"], 0) if budget and s["signups"] else None,
            "cost_per_customer": round(budget / s["activated_order"], 0) if budget and s["activated_order"] else None,
            **s,
        })
    campaign_rows.sort(key=lambda r: -r["signups"])
    return {"channels": channel_rows, "campaigns": campaign_rows, "threshold_days": threshold}


# --- 14.15 Objectifs -----------------------------------------------------------------


def money_between(db: Session, start: date, end: date) -> tuple[float, float]:
    """Encaissements (paiements confirmes) et commissions sur la periode."""
    lo, hi = local_start_utc(start), local_start_utc(end + timedelta(days=1))
    cash = 0.0
    for amount, status, created in db.query(Payment.amount, Payment.status, Payment.created_at).all():
        if str(getattr(status, "value", status)) in PAID_STATUSES and lo <= as_utc(created) < hi:
            cash += float(amount or 0)
    commission = 0.0
    paid_orders = {
        oid: as_utc(created) for oid, created in db.query(PaymentSplit.order_id, PaymentSplit.created_at).all()
    }
    if paid_orders:
        latest: dict[str, tuple[datetime, float]] = {}
        for oid, created, amount, accepted in db.query(
            Quote.order_id, Quote.created_at, Quote.commission_amount, Quote.accepted
        ).filter(Quote.order_id.in_(list(paid_orders))).all():
            if accepted and (oid not in latest or as_utc(created) > latest[oid][0]):
                latest[oid] = (as_utc(created), float(amount or 0))
        for oid, (_c, amount) in latest.items():
            if lo <= paid_orders[oid] < hi:
                commission += amount
    return round(cash, 2), round(commission, 2)


def metric_value(db: Session, metric: str, start: date, end: date) -> float | None:
    if metric in ("new_users", "new_clients", "new_tailors"):
        role = {"new_clients": "client", "new_tailors": "tailor"}.get(metric)
        return float(sum(1 for u in load_users(db, Segment(role=role)) if in_range(u.created, start, end)))
    if metric == "active_users":
        return float(len(activity_by_user(db, start, end)))
    if metric == "churn_rate":
        data = churn(db, 1, "month", Segment())
        return data["series"][-1]["rate_pct"] if data["series"] else None
    if metric == "orders":
        lo, hi = local_start_utc(start), local_start_utc(end + timedelta(days=1))
        return float(sum(1 for (c,) in db.query(Order.created_at).all() if lo <= as_utc(c) < hi))
    if metric == "gmv":
        return money_between(db, start, end)[0]
    if metric == "measurements":
        lo, hi = local_start_utc(start), local_start_utc(end + timedelta(days=1))
        return float(sum(1 for (c,) in db.query(Measurement.created_at).all() if lo <= as_utc(c) < hi))
    return None


GOAL_METRICS = {
    "new_users": "Nouveaux utilisateurs",
    "new_clients": "Nouveaux clients",
    "new_tailors": "Nouveaux tailleurs",
    "active_users": "Utilisateurs actifs",
    "churn_rate": "Churn (%)",
    "orders": "Commandes",
    "gmv": "Encaissements (FCFA)",
    "measurements": "Mesures réalisées",
}


def goals_progress(db: Session) -> list[dict]:
    today = local_day()
    out = []
    for g in db.query(GrowthGoal).filter(GrowthGoal.active.is_(True)).order_by(GrowthGoal.created_at).all():
        start = today.replace(day=1) if g.period == "month" else today - timedelta(days=today.weekday())
        value = metric_value(db, g.metric, start, today)
        target = float(g.target)
        if value is None:
            progress = None
            reached = False
        elif g.comparator == "<=":
            progress = None
            reached = value <= target
        else:
            progress = round(value / target * 100, 1) if target else None
            reached = value >= target
        out.append({
            "id": g.id,
            "label": g.label,
            "metric": g.metric,
            "metric_label": GOAL_METRICS.get(g.metric, g.metric),
            "period": g.period,
            "period_start": start.isoformat(),
            "target": target,
            "comparator": g.comparator,
            "value": value,
            "progress_pct": progress,
            "reached": reached,
            "active": g.active,
        })
    return out


# --- 1.4 Series temporelles du tableau de bord --------------------------------------


def timeseries(db: Session, metric: str, start: date, end: date, granularity: str) -> list[dict]:
    keys = buckets(start, end, granularity)
    values: dict[date, float] = {k: 0.0 for k in keys}

    def add(dt: datetime | None, amount: float = 1.0) -> None:
        if dt is None:
            return
        d = local_day(dt)
        if in_range(d, start, end):
            values[bucket_of(d, granularity)] += amount

    if metric == "signups":
        for u in load_users(db):
            add(u.created_at)
    elif metric == "measurements":
        for (c,) in db.query(Measurement.created_at).all():
            add(c)
    elif metric == "measurement_failures":
        for (c,) in db.query(MeasurementSession.created_at).filter(MeasurementSession.status == "failed").all():
            add(c)
    elif metric == "orders":
        for (c,) in db.query(Order.created_at).all():
            add(c)
    elif metric == "gmv":
        for amount, status, created in db.query(Payment.amount, Payment.status, Payment.created_at).all():
            if str(getattr(status, "value", status)) in PAID_STATUSES:
                add(created, float(amount or 0))
    elif metric == "commission":
        for k in keys:
            nxt = add_months(k, 1) if granularity == "month" else k + timedelta(days=7 if granularity == "week" else 1)
            values[k] = money_between(db, max(k, start), min(nxt - timedelta(days=1), end))[1]
    elif metric == "active_users":
        # Utilisateurs distincts par periode (pas la somme des actifs du jour).
        seen: dict[date, set[str]] = defaultdict(set)
        for uid, d in db.query(UserActivityDay.user_id, UserActivityDay.day).filter(
            UserActivityDay.day >= start, UserActivityDay.day <= end, UserActivityDay.role != "guest"
        ).all():
            seen[bucket_of(d, granularity)].add(uid)
        for k, ids in seen.items():
            values[k] = float(len(ids))
    return [{"period": k.isoformat(), "value": round(v, 2)} for k, v in values.items()]
