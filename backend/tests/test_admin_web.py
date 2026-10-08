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
    Payment,
    PaymentSplit,
    Quote,
    Review,
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
    check(me["admin_role"] == "super_admin" and "security" in me["permissions"], "super admin par defaut")
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
        db.add(Quote(order_id=o.id, line_items=[], total=50000, delay_days=7, commission_rate=0.08, commission_amount=4000,
                     net_to_tailor=46000, accepted=True))
        db.add(Payment(order_id=o.id, phase="deposit_70", provider="mtn_momo", amount=35000, status="paid", provider_txn_ref="SANDBOX-AAA"))
        db.add(Payment(order_id=o.id, phase="balance_30", provider="orange_money", amount=15000, status="failed", provider_txn_ref="SANDBOX-BBB"))
        db.add(PaymentSplit(order_id=o.id, total=50000, deposit_70=35000, tailor_immediate_40=20000, escrow_30=15000, balance_30=15000))
        db.add(Review(order_id=o.id, client_id=cp.id, tailor_id=ids["tailor"], stars=2, comment="Pas terrible"))
        db.commit()
        ids["client_user"], ids["order"], ids["measurement"] = cl.id, o.id, m.id
        ids["review"] = db.query(Review).first().id
        ids["payment_failed"] = db.query(Payment).filter(Payment.status == "failed").first().id

    print("\n== M0 / M1")
    ok(client.get("/api/admin/counters", headers={**H, "X-SMZ-Background": "1"}), "compteurs")
    q = ok(client.get("/api/admin/queue", headers=H), "file des actions").json()
    check(q["total"] >= 3, f"file non vide ({q['total']})")
    s = ok(client.get("/api/admin/search?q=Clien", headers=H), "recherche globale").json()
    check(any(x["type"] == "user" for x in s["results"]), "recherche trouve l'utilisateur")
    ok(client.post("/api/admin/notes", headers=H, json={"entity_type": "user", "entity_id": ids["client_user"], "body": "Appelée le 3/10"}), "note", 201)
    check(len(client.get(f"/api/admin/notes?entity_type=user&entity_id={ids['client_user']}", headers=H).json()) == 1, "note relue")
    d = ok(client.get("/api/admin/dashboard?period=month", headers=H), "tableau de bord").json()
    check(d["kpis"]["cash_in"]["value"] == 35000, f"encaissements {d['kpis']['cash_in']['value']}")
    check(d["kpis"]["commission"]["value"] == 4000, f"commission {d['kpis']['commission']['value']}")
    for metric in ("signups", "measurements", "orders", "gmv", "commission", "active_users"):
        ok(client.get(f"/api/admin/timeseries?metric={metric}&granularity=week", headers=H), f"serie {metric}")
    ok(client.get("/api/admin/funnel", headers=H), "entonnoir")
    ok(client.get("/api/admin/by-city", headers=H), "par ville")
    st = ok(client.get("/api/admin/stats", headers=H), "stats historiques (mobile)").json()
    check(st["commission_earned"] == 4000, "commission corrigee dans /admin/stats")

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
    dup = ok(client.get("/api/admin/users-duplicates", headers=H), "doublons").json()
    check(len(dup["pairs"]) >= 1, "doublon detecte")

    print("\n== M3 Tailleurs")
    ok(client.post(f"/api/admin/verifications/{ids['tailor']}/request-info", headers=H,
                   json={"missing_documents": ["atelier_photo"], "message": "Photo d'atelier manquante"}), "demande de complement")
    vd = ok(client.get(f"/api/admin/verifications/{ids['tailor']}/dossier", headers=H), "dossier verification").json()
    check(vd["history"][0]["action"] == "info_requested", "historique de verification")
    ok(client.post(f"/api/admin/verifications/{ids['tailor']}/decide", headers=H, json={"status": "rejected"}), "refus sans motif refuse", 400)
    ok(client.post(f"/api/admin/verifications/{ids['tailor']}/decide", headers=H, json={"status": "approved"}), "approbation")
    ok(client.post(f"/api/admin/tailors/{ids['tailor']}/featured", headers=H, json={"is_featured": True, "rank": 1}), "mise en avant")
    tt = ok(client.get("/api/admin/tables/tailors", headers=H), "qualite tailleurs").json()
    check(tt["items"][0]["orders"] == 1, "commandes par tailleur")
    ok(client.get("/api/admin/tailors/map", headers=H), "carte tailleurs")
    ok(client.get("/api/admin/verifications-table", headers=H), "file verifications")
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

    print("\n== M5 / M7 Commandes et litiges")
    ot = ok(client.get("/api/admin/tables/orders?late=true", headers=H), "table commandes (retard)").json()
    check(ot["total"] == 1, "commande en retard detectee")
    od = ok(client.get(f"/api/admin/orders/{ids['order']}/dossier", headers=H), "dossier commande").json()
    check(len(od["timeline"]) >= 4, "chronologie")
    ok(client.get("/api/admin/orders-alerts", headers=H), "alertes")
    ok(client.post(f"/api/admin/orders/{ids['order']}/fit-feedback", headers=H,
                   json={"result": "alteration", "adjustments": [{"measure": "waist", "delta_cm": 2}]}), "retour d'essayage")
    ok(client.post(f"/api/orders/{ids['order']}/dispute", headers=CH, json={"note": "Retard", "category": "retard"}), "ouverture litige (client)")
    ok(client.post(f"/api/admin/disputes/{ids['order']}/messages", headers=H, json={"audience": "both", "body": "Merci d'envoyer une photo", "requests_photo": True}), "message litige")
    pm = ok(client.get(f"/api/orders/{ids['order']}/dispute/messages", headers=CH), "messages vus par le client").json()
    check(len(pm) == 1, "client voit le message")
    ok(client.post(f"/api/orders/{ids['order']}/dispute/messages", headers=CH, data={"body": "Voici ma réponse"}), "reponse partie", 201)
    ok(client.get("/api/admin/tables/disputes", headers=H), "table litiges")
    ok(client.post(f"/api/admin/disputes/{ids['order']}/decide", headers=H,
                   json={"decision": "refund_partial", "amount": 10000, "reason": "Retard avéré"}), "decision graduee")
    ok(client.get("/api/admin/disputes-stats", headers=H), "stats litiges")

    print("\n== M6 Paiements")
    ok(client.get("/api/admin/tables/payments?status=failed", headers=H), "paiements en echec")
    ok(client.post(f"/api/admin/payments/{ids['payment_failed']}/remind", headers=H), "relance")
    ps = ok(client.get("/api/admin/payouts/summary", headers=H), "versements").json()
    check(ps["tailors"][0]["due_total"] == 16000, f"du au tailleur {ps['tailors'][0]['due_total']}")
    ok(client.post("/api/admin/payouts", headers=H, json={"tailor_id": ids["tailor"], "amount": 16000, "reference": "MOMO-1"}), "versement")
    rf = ok(client.get("/api/admin/tables/refunds", headers=H), "remboursements").json()
    check(rf["total"] == 1, "remboursement cree par la decision de litige")
    ok(client.post(f"/api/admin/refunds/{rf['items'][0]['id']}/status", headers=H, json={"status": "completed", "provider_ref": "R1"}), "remboursement effectue")
    stmt = "reference;montant;date;statut\nSANDBOX-AAA;35000;05/10/2026;ok\nINCONNU-1;1000;05/10/2026;ok\n"
    rec = ok(client.post("/api/admin/reconciliation", headers=H, files={"file": ("releve.csv", stmt.encode(), "text/csv")}), "rapprochement").json()
    check(rec["matched"] == 1 and len(rec["unknown"]) == 1, "ecarts detectes")
    with SessionLocal() as db:
        pid = db.query(Payment).filter(Payment.status == "paid").first().id
    ok(client.get(f"/api/admin/payments/{pid}/receipt", headers=H), "recu")
    ok(client.get(f"/api/admin/statements/monthly?month={date.today():%Y-%m}", headers=H), "releve mensuel")
    ok(client.patch(f"/api/admin/commission-tiers/{client.get('/api/admin/commission-tiers', headers=H).json()[0]['id']}" if client.get('/api/admin/commission-tiers', headers=H).json() else "/api/admin/commission-tiers/x",
                    headers=H, json={"min_price": 0, "max_price": 15000, "rate": 0.1}), "bareme", 200 if client.get('/api/admin/commission-tiers', headers=H).json() else 404)

    print("\n== M8 Avis")
    tailor_login = client.post("/api/auth/login", json={"phone": "+237611111111", "password": "abc123"}).json()
    TH = {"Authorization": f"Bearer {tailor_login['access_token']}"}
    ok(client.post(f"/api/reviews/{ids['review']}/report", headers=TH, json={"reason": "Propos faux"}), "signalement", 201)
    ok(client.post(f"/api/reviews/{ids['review']}/reply", headers=TH, json={"reply": "Le retard venait du tissu"}), "reponse tailleur")
    ok(client.get("/api/admin/tables/reviews?reported=true", headers=H), "avis signales")
    ok(client.get(f"/api/admin/reviews/{ids['review']}/reports", headers=H), "liste signalements")
    ok(client.post(f"/api/admin/reviews/{ids['review']}/reports/decide", headers=H, json={"decision": "keep"}), "decision signalement")
    ok(client.post(f"/api/admin/reviews/{ids['review']}/reply-status", headers=H, json={"status": "hidden"}), "moderation reponse")

    print("\n== M9 / M10 Mesure et collecte")
    ok(client.get("/api/admin/tables/measurement-sessions", headers=H), "journal des analyses")
    ok(client.get("/api/admin/measure/health", headers=H), "sante de la mesure")
    ok(client.get("/api/admin/measure/chain", headers=H), "etat de la chaine")
    pr = ok(client.get("/api/admin/measure/precision", headers=H), "precision observee").json()
    check(any(r["measure"] == "chest" for r in pr["measures"]), "correction prise en compte")
    ok(client.get("/api/admin/collecte/objectives", headers=H), "objectifs collecte")
    ok(client.get("/api/collecte/stats", headers=H), "collecte (existant)")

    print("\n== M11 / M12 Communication et support")
    ok(client.post("/api/admin/announcements/preview", headers=H, json={"role": "client"}), "apercu audience")
    a = ok(client.post("/api/admin/announcements", headers=H, json={"title": "Nouveauté", "body": "La fiche patron arrive", "audience": {"role": "all"}}), "annonce", 201).json()
    check(a["recipients"] >= 2, "annonce envoyee")
    ok(client.get("/api/admin/message-templates", headers=H), "modeles de messages")
    ok(client.put("/api/admin/pages/faq", headers=H, json={"title": "FAQ", "body": "## Q\nR", "published": True}), "page FAQ")
    ok(client.get("/api/public/pages/faq"), "page publique")
    tk = ok(client.post("/api/support/tickets", json={"name": "Visiteur", "phone": "+237699", "subject": "Aide mesure", "body": "Je n'arrive pas à mesurer"}), "contact visiteur", 201).json()
    ok(client.get("/api/admin/tables/tickets", headers=H), "file support")
    ok(client.post(f"/api/admin/tickets/{tk['id']}/messages", headers=H, json={"body": "Rappel demain"}), "reponse support", 201)
    ok(client.patch(f"/api/admin/tickets/{tk['id']}", headers=H, json={"status": "resolved", "order_id": ids["order"][:8]}), "rattachement commande")
    ok(client.get(f"/api/admin/tickets/{tk['id']}", headers=H), "detail demande")

    print("\n== M13 Securite")
    team = ok(client.post("/api/admin/team", headers=H, json={"full_name": "Modo", "phone": "+237600000001", "admin_role": "moderator"}), "nouveau membre", 201).json()
    mod_login = ok(client.post("/api/auth/login", json={"phone": "+237600000001", "password": team["temporary_password"]}), "connexion moderateur").json()
    MH = {"Authorization": f"Bearer {mod_login['access_token']}"}
    ok(client.get("/api/admin/tables/payments", headers=MH), "moderateur interdit aux paiements", 403)
    ok(client.get("/api/admin/tables/models", headers=MH), "moderateur autorise au catalogue")
    fin = client.post("/api/auth/login", json={"phone": "+237600000009", "password": "abc123"}).json()
    ok(client.delete(f"/api/admin/users/{ids['client_user']}", headers={"Authorization": f"Bearer {fin['access_token']}"}), "finance ne supprime pas", 403)
    ok(client.get("/api/admin/tables/audit", headers=H), "journal")
    check(client.get("/api/admin/tables/audit", headers=H).json()["total"] > 10, "actions journalisees")
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
    ok(client.get("/api/admin/settings", headers=H), "reglages")
    ok(client.put("/api/admin/settings/negotiation_max_rounds", headers=H, json={"value": 5}), "reglage nombre d'offres")
    ok(client.put("/api/admin/settings/deposit_share", headers=H, json={"value": 3}), "reglage invalide", 400)
    ok(client.put("/api/admin/settings/banner", headers=H, json={"value": {"enabled": True, "message": "Promo"}}), "bandeau")
    cfg = ok(client.get("/api/public/config"), "config publique").json()
    check(cfg["banner"]["message"] == "Promo", "bandeau public")
    ok(client.put("/api/admin/settings/maintenance", headers=H, json={"value": {"enabled": True, "message": "Pause"}}), "maintenance on")
    from app.services.platform_settings import invalidate

    invalidate()
    ok(client.get("/api/models"), "site en maintenance", 503)
    ok(client.get("/api/admin/me", headers=H), "admin accessible en maintenance")
    ok(client.put("/api/admin/settings/maintenance", headers=H, json={"value": {"enabled": False}}), "maintenance off")
    invalidate()
    ok(client.get("/api/admin/system", headers=H), "etat technique")
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
