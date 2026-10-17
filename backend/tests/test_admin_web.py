"""
Test de bout en bout de l'API de l'administration web (cahier des charges
M0 a M14), sur une base SQLite jetable.

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_admin_web
"""

import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-admin-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["DATASET_DIR"] = f"{_TMP}/dataset"
os.environ["AVATAR_OUTPUT_DIR"] = f"{_TMP}/avatars"
os.environ["VISION_ENABLED"] = "false"
os.environ["SURMEZUR_ALLOW_LOCALHOST"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models.catalog import Category  # noqa: E402
from app.models import (  # noqa: E402
    ClientProfile,
    GarmentModel,
    Measurement,
    MeasurementSession,
    Order,
    TailorProfile,
    User,
    UserActivityDay,
    VerificationDocument,
)
from app.services import totp  # noqa: E402
from app.services.activity import local_day  # noqa: E402

client = TestClient(app)
FAILS: list[str] = []


def check(cond: bool, label: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + label)
    if not cond:
        FAILS.append(label)


def ok(resp, label: str, code: int = 200):
    good = resp.status_code == code
    check(good, f"{label} -> {resp.status_code}" + ("" if good else f" {resp.text[:300]}"))
    return resp


def seed() -> dict:
    with SessionLocal() as db:
        admin = User(role="admin", phone="+237600000000", full_name="Admin Test", password_hash=hash_password("abc123"))
        mod = User(role="admin", admin_role="finance", phone="+237600000009", full_name="Finance", password_hash=hash_password("abc123"))
        db.add_all([admin, mod])
        tailor_user = User(role="tailor", phone="+237611111111", full_name="Tailleur Un", password_hash=hash_password("abc123"), city="Douala")
        db.add(tailor_user)
        db.flush()
        tp = TailorProfile(user_id=tailor_user.id, tailor_type="individual", shop_name="Atelier Un", city="Douala", quartier="Akwa")
        db.add(tp)
        db.flush()
        db.add(VerificationDocument(user_id=tailor_user.id, type="id_card", file_url="/uploads/x.jpg"))
        cat = Category(name="Robes", gender="female")
        db.add(cat)
        db.flush()
        db.add(GarmentModel(category_id=cat.id, name="Robe kaba", status="published"))
        ids = {"admin": admin.id, "finance": mod.id, "tailor_user": tailor_user.id, "tailor": tp.id, "category": cat.id}
        db.commit()
        return ids


def main() -> None:
    ids = seed()

    print("\n== Inscription avec origine (14.9 / 14.10)")
    r = ok(client.get("/api/public/acquisition-channels"), "canaux publics")
    check(len(r.json()) >= 5, "canaux par defaut presents")
    reg = ok(client.post("/api/auth/register", json={
        "role": "client", "phone": "+237622222222", "full_name": "Cliente Une", "password": "abc123",
        "city": "Douala", "acquisition": {"source": "facebook", "utm": {"utm_source": "facebook", "utm_campaign": "lancement"}},
    }, headers={"X-SMZ-Platform": "web"}), "inscription client")
    client_token = reg.json()["access_token"]
    ok(client.post("/api/auth/register", json={
        "role": "client", "phone": "237622222223", "full_name": "Cliente Une", "password": "abc123",
    }), "inscription doublon probable")

    print("\n== Connexion admin, session, activite")
    login = ok(client.post("/api/auth/login", json={"phone": "+237600000000", "password": "abc123"}), "connexion admin")
    tok = login.json()
    H = {"Authorization": f"Bearer {tok['access_token']}"}
    me = ok(client.get("/api/admin/me", headers=H), "admin/me").json()
    check(me["full_name"] == "Admin Test" and "admin_role" not in me, "profil admin, sans role")
    ok(client.get("/api/me", headers={"Authorization": f"Bearer {client_token}"}), "activite client")

    # Donnees d'activite et de commande pour les statistiques.
    with SessionLocal() as db:
        cl = db.query(User).filter(User.phone == "+237622222222").first()
        cp = db.query(ClientProfile).filter(ClientProfile.user_id == cl.id).first()
        for d in (10, 40, 70):
            db.add(UserActivityDay(user_id=cl.id, day=local_day() - timedelta(days=d), role="client"))
        m = Measurement(client_id=cp.id, source="ai", height_cm=170, data={"chest": 90.0, "waist": 75.0})
        db.add(m)
        db.flush()
        db.add(MeasurementSession(client_id=cp.id, status="failed", error_message="Personne non détectée sur la photo", platform="web"))
        o = Order(client_id=cp.id, tailor_id=ids["tailor"], measurement_id=m.id, reception_mode="pickup", agreed_price=50000,
                  desired_date=date.today() - timedelta(days=3))
        db.add(o)
        db.flush()
        db.commit()
        ids["client_user"], ids["order"], ids["measurement"] = cl.id, o.id, m.id

    print("\n== M0 / M1")
    ok(client.get("/api/admin/counters", headers={**H, "X-SMZ-Background": "1"}), "compteurs")
    q = ok(client.get("/api/admin/queue", headers=H), "file des actions").json()
    check(q["total"] >= 1, f"file non vide ({q['total']})")
    # Orientation sans argent ni verification : la file ne propose plus ces taches.
    check({x["type"] for x in q["items"]} <= {"model", "ticket", "late_order"},
          "file : moderation, support et retards seulement")
    s = ok(client.get("/api/admin/search?q=Clien", headers=H), "recherche globale").json()
    check(any(x["type"] == "user" for x in s["results"]), "recherche trouve l'utilisateur")
    ok(client.post("/api/admin/notes", headers=H, json={"entity_type": "user", "entity_id": ids["client_user"], "body": "Appelée le 3/10"}), "note", 201)
    check(len(client.get(f"/api/admin/notes?entity_type=user&entity_id={ids['client_user']}", headers=H).json()) == 1, "note relue")
    d = ok(client.get("/api/admin/dashboard?period=month", headers=H), "tableau de bord").json()
    check(d["kpis"]["orders"]["value"] == 1, "commandes du mois")
    check(not {"cash_in", "commission", "disputes"} & set(d["kpis"]), "ni argent ni litiges au tableau de bord")
    for metric in ("signups", "measurements", "orders", "gmv", "commission", "active_users"):
        ok(client.get(f"/api/admin/timeseries?metric={metric}&granularity=week", headers=H), f"serie {metric}")
    ok(client.get("/api/admin/funnel", headers=H), "entonnoir")
    ok(client.get("/api/admin/by-city", headers=H), "par ville")
    st = ok(client.get("/api/admin/stats", headers=H), "stats historiques (mobile)").json()
    check(st["orders_total"] == 1, "/admin/stats (mobile) toujours servi")

    print("\n== M2 Utilisateurs")
    t = ok(client.get("/api/admin/tables/users?role=client&sort=full_name&dir=asc", headers=H), "table utilisateurs").json()
    check(t["total"] == 2, f"2 clients ({t['total']})")
    csv = ok(client.get("/api/admin/tables/users?format=csv", headers=H), "export CSV")
    check(csv.text.startswith("﻿Nom;"), "CSV Excel (BOM + ;)")
    dossier = ok(client.get(f"/api/admin/users/{ids['client_user']}", headers=H), "fiche utilisateur").json()
    check(dossier["acquisition"]["channel"] == "Facebook", "canal capte a l'inscription")
    check(dossier["user"]["platform"] == "web", "support web enregistre")
    pw = ok(client.post(f"/api/admin/users/{ids['client_user']}/reset-password", headers=H), "mot de passe provisoire").json()
    rel = ok(client.post("/api/auth/login", json={"phone": "+237622222222", "password": pw["temporary_password"]}), "connexion mdp provisoire").json()
    check(rel["must_change_password"] is True, "changement exige")
    CH = {"Authorization": f"Bearer {rel['access_token']}"}
    ok(client.post("/api/me/password", headers=CH, json={"current_password": pw["temporary_password"], "new_password": "xyz789"}), "changement mdp")
    ok(client.patch(f"/api/admin/measurements/{ids['measurement']}", headers=H, json={"data": {"chest": 92}, "reason": "Demande cliente"}), "correction mesure")
    ok(client.get(f"/api/admin/measurements/{ids['measurement']}/history", headers=H), "historique mesure")
    ok(client.get(f"/api/admin/users/{ids['client_user']}/export", headers=H), "export donnees")
    ok(client.get("/api/admin/guests/cleanup", headers=H), "apercu nettoyage invites")
    ok(client.post("/api/admin/guests/cleanup", headers=H), "nettoyage invites")
    ok(client.get("/api/admin/users-duplicates", headers=H), "doublons retires", 404)

    print("\n== M3 Tailleurs")
    ok(client.get("/api/admin/verifications-table", headers=H), "verifications retirees", 404)
    ok(client.post(f"/api/admin/tailors/{ids['tailor']}/featured", headers=H, json={"is_featured": True, "rank": 1}), "mise en avant")
    tt = ok(client.get("/api/admin/tables/tailors", headers=H), "qualite tailleurs").json()
    check(tt["items"][0]["orders"] == 1, "commandes par tailleur")
    check("dispute_rate" not in tt["items"][0] and "verification_status" not in tt["items"][0], "ni litiges ni verification")
    mp = ok(client.get("/api/admin/tailors/map", headers=H), "carte tailleurs").json()
    check(mp["cities"][0]["total"] == 1, "tailleurs par ville")
    search = client.get("/api/tailors").json()
    check(search and search[0]["is_featured"], "tailleur mis en avant en tete")

    print("\n== M4 Catalogue")
    pending = ok(client.post("/api/models", headers={"Authorization": f"Bearer {rel['access_token']}"},
                             json={"name": "Ma proposition", "category_id": ids["category"]}), "proposition client", 201).json()
    check(pending["status"] == "pending", "proposition en attente")
    public = client.get("/api/models").json()
    check(all(m["id"] != pending["id"] for m in public), "proposition absente du catalogue public")
    mt = ok(client.get("/api/admin/tables/models?status=pending", headers=H), "table modeles").json()
    check(mt["total"] == 1, "file de moderation")
    ok(client.post(f"/api/admin/models/{pending['id']}/moderate", headers=H, json={"status": "published"}), "publication")
    ok(client.post("/api/admin/models/bulk", headers=H, json={"ids": [pending["id"]], "action": "hide"}), "action groupee")
    ok(client.get(f"/api/admin/models/{pending['id']}/stats", headers=H), "stats modele")
    f = ok(client.post("/api/admin/fabrics", headers=H, json={"name": "Wax bleu", "type": "wax", "color_hex": "#1144AA"}), "tissu").json()
    ok(client.delete(f"/api/admin/fabrics/{f['id']}", headers=H), "suppression tissu", 204)
    ok(client.post("/api/admin/accessories", headers=H, json={"name": "Boutons dorés", "price": 500}), "accessoire")
    ok(client.get("/api/admin/tables/ready-to-wear", headers=H), "pret-a-porter")
    files = [("files", ("robe-wax.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64, "image/png"))]
    imp = ok(client.post("/api/admin/models/import", headers=H, files=files, data={"category_id": ids["category"], "status": "pending"}), "import").json()
    check(imp["created"] == 1, "un modele importe")

    print("\n== M5 Commandes")
    ot = ok(client.get("/api/admin/tables/orders?late=true", headers=H), "table commandes (retard)").json()
    check(ot["total"] == 1, "commande en retard detectee")
    ok(client.get("/api/admin/orders-alerts", headers=H), "alertes")
    ok(client.post(f"/api/admin/orders/{ids['order']}/fit-feedback", headers=H,
                   json={"result": "alteration", "adjustments": [{"measure": "waist", "delta_cm": 2}]}), "retour d'essayage")
    od = ok(client.get(f"/api/admin/orders/{ids['order']}/dossier", headers=H), "dossier commande").json()
    check(len(od["timeline"]) >= 2 and not {"payments", "refunds", "review", "dispute_messages"} & set(od), "dossier sans argent ni litige")

    print("\n== Rubriques retirees")
    for path in ("tables/disputes", "tables/payments", "tables/reviews", "announcements", "message-templates",
                 "tables/audit", "system", "commission-tiers"):
        ok(client.get(f"/api/admin/{path}", headers=H), f"{path} retire", 404)

    print("\n== M9 / M10 Mesure et collecte")
    ok(client.get("/api/admin/tables/measurement-sessions", headers=H), "journal des analyses")
    ok(client.get("/api/admin/measure/health", headers=H), "sante de la mesure")
    ok(client.get("/api/admin/measure/chain", headers=H), "etat de la chaine")
    pr = ok(client.get("/api/admin/measure/precision", headers=H), "precision observee").json()
    check(any(r["measure"] == "chest" for r in pr["measures"]), "correction prise en compte")
    ok(client.get("/api/admin/collecte/objectives", headers=H), "objectifs collecte")
    ok(client.get("/api/collecte/stats", headers=H), "collecte (existant)")

    print("\n== M12 Support et pages d'information")
    pages = ok(client.get("/api/admin/pages", headers=H), "pages d'information").json()
    check({"faq", "conditions", "confidentialite"} <= {p["slug"] for p in pages}, "pages de depart creees")
    ok(client.put("/api/admin/pages/faq", headers=H, json={"title": "FAQ", "body": "## Q\nR", "published": True}), "page FAQ")
    check(ok(client.get("/api/public/pages/faq"), "page publique").json()["body"] == "## Q\nR", "page publique a jour")
    tk = ok(client.post("/api/support/tickets", json={"name": "Visiteur", "phone": "+237699", "subject": "Aide mesure", "body": "Je n'arrive pas à mesurer"}), "contact visiteur", 201).json()
    ok(client.get("/api/admin/tables/tickets", headers=H), "file support")
    ok(client.post(f"/api/admin/tickets/{tk['id']}/messages", headers=H, json={"body": "Rappel demain"}), "reponse support", 201)
    ok(client.patch(f"/api/admin/tickets/{tk['id']}", headers=H, json={"status": "resolved", "order_id": ids["order"][:8]}), "rattachement commande")
    ok(client.get(f"/api/admin/tickets/{tk['id']}", headers=H), "detail demande")

    print("\n== M13 Securite")
    team = ok(client.post("/api/admin/team", headers=H, json={"full_name": "Modo", "phone": "+237600000001"}), "nouveau membre", 201).json()
    check("admin_role" not in team["member"], "plus de role a choisir")
    mod_login = ok(client.post("/api/auth/login", json={"phone": "+237600000001", "password": team["temporary_password"]}), "connexion nouveau membre").json()
    MH = {"Authorization": f"Bearer {mod_login['access_token']}"}
    ok(client.get("/api/admin/me", headers=MH), "admin/me du nouveau membre")
    ok(client.get("/api/admin/settings", headers=MH), "nouveau membre : acces aux reglages")
    ok(client.get("/api/admin/team", headers=MH), "equipe visible par tout administrateur")
    fin = client.post("/api/auth/login", json={"phone": "+237600000009", "password": "abc123"}).json()
    ok(client.get("/api/admin/tables/models", headers={"Authorization": f"Bearer {fin['access_token']}"}), "ancien role finance : acces complet")
    tm = ok(client.get("/api/admin/team", headers=H), "liste equipe").json()
    check(len(tm["members"]) == 3 and "roles" not in tm, "trois administrateurs, sans roles")
    setup = ok(client.post("/api/admin/me/2fa/setup", headers=MH), "2FA preparation").json()
    ok(client.post("/api/admin/me/2fa/enable", headers=MH, json={"code": totp.current_code(setup["secret"])}), "2FA activee")
    step = ok(client.post("/api/auth/login", json={"phone": "+237600000001", "password": team["temporary_password"]}), "connexion 2FA etape 1").json()
    check(step["mfa_required"] and not step["access_token"], "code demande")
    ok(client.post("/api/auth/mfa", json={"mfa_token": step["mfa_token"], "code": "000000"}), "mauvais code", 400)
    ok(client.post("/api/auth/mfa", json={"mfa_token": step["mfa_token"], "code": totp.current_code(setup["secret"])}), "bon code")
    sess = ok(client.get("/api/admin/sessions?all=true", headers=H), "sessions").json()
    check(len(sess["sessions"]) >= 2, "sessions ouvertes listees")
    from app.core.security import decode_token

    mod_sid = decode_token(mod_login["access_token"])["sid"]
    other = next(s for s in sess["sessions"] if s["id"] == mod_sid)
    ok(client.post(f"/api/admin/sessions/{other['id']}/revoke", headers=H), "revocation")
    ok(client.get("/api/admin/me", headers=MH), "session revoquee refusee", 401)
    rg = ok(client.get("/api/admin/settings", headers=H), "reglages").json()
    check("negotiation_max_rounds" not in rg["values"] and "banner" not in rg["values"], "reglages des fonctions coupees masques")
    ok(client.put("/api/admin/settings/guest_retention_days", headers=H, json={"value": 45}), "reglage conservation invites")
    ok(client.put("/api/admin/settings/admin_idle_minutes", headers=H, json={"value": -5}), "reglage invalide", 400)
    ok(client.put("/api/admin/settings/negotiation_max_rounds", headers=H, json={"value": 5}), "reglage retire", 404)
    cfg = ok(client.get("/api/public/config"), "config publique").json()
    check("banner" not in cfg, "plus de bandeau")
    ok(client.put("/api/admin/settings/maintenance", headers=H, json={"value": {"enabled": True, "message": "Pause"}}), "maintenance on")
    from app.services.platform_settings import invalidate

    invalidate()
    ok(client.get("/api/models"), "site en maintenance", 503)
    ok(client.get("/api/admin/me", headers=H), "admin accessible en maintenance")
    ok(client.put("/api/admin/settings/maintenance", headers=H, json={"value": {"enabled": False}}), "maintenance off")
    invalidate()
    ok(client.post("/api/auth/password/reset/request", json={"phone": "+237600000000"}), "reset OTP admin bloque", 403)

    print("\n== M14 Croissance")
    for path in ("overview", "new-users?granularity=week", "active", "churn", "cohorts", "activation", "returns",
                 "channels-stats", "segments", "report", "report?format=csv&period=week", "channels", "campaigns", "goals",
                 "new-users?role=client&platform=web&city=Douala"):
        ok(client.get(f"/api/admin/growth/{path}", headers=H), f"growth/{path}")
    ov = client.get("/api/admin/growth/overview", headers=H).json()
    check(ov["by_role"]["client"] == 2 and ov["by_role"]["tailor"] == 1, "totaux par role")
    acq = ok(client.get("/api/admin/growth/acquisitions", headers=H), "file a qualifier").json()
    check(acq["total"] >= 2, "inscrits a qualifier")
    ch = client.get("/api/admin/growth/channels", headers=H).json()
    salon = next(c for c in ch if c["code"] == "salon_evenement")
    camp = ok(client.post("/api/admin/growth/campaigns", headers=H, json={"name": "Salon Douala", "code": "SALON26", "channel_id": salon["id"], "budget": 50000}), "campagne", 201).json()
    ok(client.post(f"/api/admin/growth/acquisitions/{ids['client_user']}", headers=H,
                   json={"channel_id": salon["id"], "campaign_id": camp["id"], "referrer": "Stand A", "method": "démarchage", "body": "Inscrite au stand"}), "qualification")
    ok(client.post("/api/admin/growth/acquisitions-bulk", headers=H, json={"user_ids": [ids["tailor_user"]], "channel_id": salon["id"]}), "qualification groupee")
    hist = ok(client.get(f"/api/admin/growth/acquisitions/{ids['client_user']}/history", headers=H), "historique acquisition").json()
    check(hist[0]["author_name"] == "Admin Test", "commentaire signe")
    cs = client.get("/api/admin/growth/channels-stats", headers=H).json()
    row = next(c for c in cs["campaigns"] if c["code"] == "SALON26")
    check(row["signups"] == 1 and row["cost_per_user"] == 50000, "cout d'acquisition")
    ok(client.post("/api/admin/growth/goals", headers=H, json={"label": "500 clients", "metric": "new_clients", "target": 500}), "objectif", 201)
    goals = client.get("/api/admin/growth/goals", headers=H).json()
    check(goals["goals"][0]["value"] is not None, "avancement de l'objectif")
    ok(client.post("/api/auth/register", json={"role": "client", "phone": "+237633333333", "full_name": "Par code", "password": "abc123",
                                               "acquisition": {"referral_code": "salon26"}}), "inscription avec code promo")
    with SessionLocal() as db:
        from app.models import UserAcquisition

        u = db.query(User).filter(User.phone == "+237633333333").first()
        a = db.query(UserAcquisition).filter(UserAcquisition.user_id == u.id).first()
        check(a.campaign_id == camp["id"] and a.channel_id == salon["id"], "code promo -> campagne et canal")

    print("\n== Suppression definitive (cascade des nouvelles tables)")
    ok(client.delete(f"/api/admin/users/{ids['client_user']}", headers=H), "suppression compte", 204)

    print(f"\n{len(FAILS)} echec(s)")
    for f_ in FAILS:
        print("  -", f_)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
