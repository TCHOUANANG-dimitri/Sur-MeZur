"""
Tests de l'orientation produit (A1.3 a A2.4) : OTP ferme, numeros normalises,
limitation de tentatives, verification desactivee, commandes sans argent,
espace tailleur (carnet, mesures, travaux, partage), patrons apercus.

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_tailor_space
"""

import io
import json
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-tailor-test-")
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
from app.models import (  # noqa: E402
    ClientProfile,
    Measurement,
    TailorClient,
    TailorClientMeasurement,
    TailorProfile,
    TailorShareToken,
    User,
)
from app.services import totp  # noqa: E402
from app.services.platform_settings import invalidate, set_setting  # noqa: E402

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


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200


def files_png(name: str = "photo.png"):
    return {"front": (name, io.BytesIO(PNG), "image/png")}


def seed_admin_totp() -> tuple[str, str]:
    with SessionLocal() as db:
        admin = User(role="admin", phone="+237600000010", full_name="Admin TOTP",
                     password_hash=hash_password("abcd12"))
        db.add(admin)
        db.commit()
        secret = totp.new_secret() if hasattr(totp, "new_secret") else totp.generate_secret()
        admin.totp_enabled = True
        admin.totp_secret = secret
        db.commit()
        return admin.id, secret


def main() -> None:
    print("\n== Config publique : features")
    cfg = ok(client.get("/api/public/config"), "config publique").json()
    check(cfg["features"] == {
        "tailor_verification": False, "payments": False,
        "negotiation": False, "pattern_generation": "preview",
    }, "features par defaut")

    print("\n== A1.3 : OTP ferme par defaut")
    r = ok(client.post("/api/auth/otp/request", json={"phone": "+237611111111"}), "otp sans code")
    check(r.json().get("dev_code") is None, "aucun dev_code")
    with SessionLocal() as db:
        db.add(User(role="client", phone="+237622222221", full_name="Reset Cli",
                    password_hash=hash_password("abcd12")))
        db.add(User(role="admin", phone="+237622222229", full_name="Reset Adm",
                    password_hash=hash_password("abcd12")))
        db.commit()
    r = ok(client.post("/api/auth/password/reset/request", json={"phone": "+237622222221"}),
           "reset libre-service ferme", 503)
    check("Contactez le support" in r.json().get("detail", ""), "message support")
    ok(client.post("/api/auth/password/reset/request", json={"phone": "+237622222229"}),
       "reset admin toujours 403", 403)
    ok(client.post("/api/auth/password/reset/confirm",
                   json={"phone": "+237622222221", "code": "000000", "new_password": "abcd12"}),
       "reset confirm ferme", 503)

    print("\n== A1.4 : normalisation des numeros")
    g = ok(client.post("/api/auth/guest"), "invite").json()
    guest_token = g["refresh_token"]
    reg = ok(client.post("/api/auth/register", json={
        "role": "tailor", "phone": "00237 6 55 44 33 22", "full_name": "Tailleur Essai",
        "password": "abcd12", "city": "Douala", "quartier": "Akwa",
        "shop_name": "Atelier Essai", "guest_token": guest_token,
    }), "inscription tailleur depuis invite")
    tailor_token = reg.json()["access_token"]
    TH = {"Authorization": f"Bearer {tailor_token}"}
    with SessionLocal() as db:
        u = db.query(User).filter(User.id == reg.json()["user_id"]).first()
        check(u.phone == "+237655443322" and u.role == "tailor" and not u.is_guest, "numero normalise, role tailleur")
        tp = db.query(TailorProfile).filter(TailorProfile.user_id == u.id).first()
        check(tp is not None and tp.shop_name == "Atelier Essai", "profil tailleur cree")
        cp = db.query(ClientProfile).filter(ClientProfile.user_id == u.id).first()
        check(cp is not None, "profil client conserve")
    # Connexion avec une autre ecriture du meme numero.
    ok(client.post("/api/auth/login", json={"phone": "6 55 44 33 22", "password": "abcd12"}),
       "connexion numero normalise")
    ok(client.post("/api/auth/register", json={
        "role": "client", "phone": "+237655443322", "full_name": "Doublon", "password": "abcd12",
    }), "doublon normalise refuse", 409)

    print("\n== A2.3 : carnet de clients")
    c1 = ok(client.post("/api/tailor/clients", json={
        "full_name": "Awa Ndi", "phone": "237 6 99 11 22 33", "gender": "female", "notes": "Prefere le kaba",
    }, headers=TH), "creation fiche", 201).json()
    check(c1["phone"] == "+237699112233", "numero fiche normalise")
    c2 = ok(client.post("/api/tailor/clients", json={"full_name": "Bouba S."}, headers=TH),
           "creation fiche minimale", 201).json()
    got = ok(client.get(f"/api/tailor/clients/{c1['id']}", headers=TH), "fiche detail").json()
    check(got["measurements"] == [] and got["jobs"] == [], "fiche vide")
    lst = ok(client.get("/api/tailor/clients?q=awa", headers=TH), "recherche").json()
    check(len(lst) == 1 and lst[0]["id"] == c1["id"], "recherche insensible a la casse")
    upd = ok(client.patch(f"/api/tailor/clients/{c2['id']}", json={"notes": "A rappeler"}, headers=TH),
             "modification fiche").json()
    check(upd["notes"] == "A rappeler", "note enregistree")
    ok(client.post("/api/tailor/clients", json={"full_name": "X", "phone": "12"}, headers=TH),
       "nom trop court refuse", 422)
    ok(client.delete(f"/api/tailor/clients/{c2['id']}", headers=TH), "retrait fiche", 204)
    ok(client.get(f"/api/tailor/clients/{c2['id']}", headers=TH), "fiche retiree", 404)

    print("\n== A2.3 : mesures manuelles")
    m1 = ok(client.post(f"/api/tailor/clients/{c1['id']}/measurements", json={
        "data": {"chest": 94, "waist": 78, "hips": 102}, "height_cm": 168, "note": "Robe",
    }, headers=TH), "saisie manuelle", 201).json()
    check(m1["source"] == "manual" and m1["data"]["chest"] == 94.0, "mesure enregistree")
    ok(client.post(f"/api/tailor/clients/{c1['id']}/measurements", json={"data": {"nez": 3}},
                   headers=TH), "cle inconnue refusee", 400)
    ok(client.post(f"/api/tailor/clients/{c1['id']}/measurements", json={"data": {"chest": 900}},
                   headers=TH), "valeur absurde refusee", 400)
    ok(client.post(f"/api/tailor/clients/{c1['id']}/measurements", json={"data": {}},
                   headers=TH), "mesure vide refusee", 400)

    print("\n== A2.3 : mesure par photo (chaine de vision)")
    sess = ok(client.post(f"/api/tailor/clients/{c1['id']}/measure-session",
                          json={"height_cm": 168, "weight_kg": 65, "gender": "female"},
                          headers=TH), "session creee", 201).json()
    up = ok(client.post(f"/api/tailor/measure-session/{sess['id']}/photos",
                        files=files_png(), headers=TH), "photos envoyees").json()
    check(up["status"] in ("processing", "ready", "failed"), "session lancee")
    st = ok(client.get(f"/api/tailor/measure-session/{sess['id']}", headers=TH), "statut session").json()
    # VISION_ENABLED=false en test : l'analyse echoue proprement, en francais.
    check(st["status"] == "failed" and st["error_message"], "echec propre sans vision")
    check(st["measurement"] is None, "pas de mesure en echec")
    ok(client.post("/api/tailor/measure-session/00000000-0000-0000-0000-000000000000/photos",
                   files=files_png(), headers=TH), "session inconnue", 404)
    fake = {"front": ("photo.txt", io.BytesIO(b"pas une image"), "text/plain")}
    ok(client.post(f"/api/tailor/measure-session/{sess['id']}/photos", files=fake, headers=TH),
       "faux fichier refuse", 400)

    print("\n== A2.3 : partage public")
    sh = ok(client.post(f"/api/tailor/clients/{c1['id']}/share", headers=TH), "lien cree", 201).json()
    check(sh["url"].startswith("/api/public/fiches/") and sh["token"], "url et jeton")
    fiche = ok(client.get(sh["url"]), "fiche publique").json()
    check(fiche["full_name"] == "Awa Ndi" and len(fiche["measurements"]) == 1, "fiche lisible sans compte")
    check(fiche["measurements"][0]["data"]["chest"] == 94.0, "mesures dans la fiche")
    ok(client.get("/api/public/fiches/inconnu"), "jeton inconnu", 404)
    with SessionLocal() as db:
        row = db.query(TailorShareToken).filter(TailorShareToken.token == sh["token"]).one()
        row.expires_at = row.expires_at - timedelta(days=60)
        db.commit()
    ok(client.get(sh["url"]), "lien expire", 410)

    print("\n== A2.3 : travaux")
    j1 = ok(client.post("/api/tailor/jobs", json={
        "tailor_client_id": c1["id"], "description": "Robe kaba",
        "delivery_date": (date.today() + timedelta(days=3)).isoformat(),
        "agreed_price": 15000, "advance_received": 5000,
    }, headers=TH), "travail cree", 201).json()
    check(j1["status"] == "todo" and j1["status_label"] == "À faire", "statut initial")
    check(j1["advance_received"] == 5000.0, "avance saisie")
    ok(client.post("/api/tailor/jobs", json={"status": "fini"}, headers=TH), "statut inconnu refuse", 400)
    ok(client.post("/api/tailor/jobs", json={"tailor_client_id": "00000000-0000-0000-0000-000000000000"},
                   headers=TH), "client inconnu refuse", 404)
    week = ok(client.get("/api/tailor/jobs?due=week", headers=TH), "travaux de la semaine").json()
    check(any(j["id"] == j1["id"] for j in week), "travail a venir")
    late0 = ok(client.get("/api/tailor/jobs?due=late", headers=TH), "pas de retard").json()
    check(late0 == [], "aucun retard")
    j2 = ok(client.post("/api/tailor/jobs", json={
        "description": "Retouche", "delivery_date": (date.today() - timedelta(days=2)).isoformat(),
    }, headers=TH), "travail en retard", 201).json()
    late1 = ok(client.get("/api/tailor/jobs?due=late", headers=TH), "retards").json()
    check(any(j["id"] == j2["id"] for j in late1), "retard detecte")
    upd_j = ok(client.patch(f"/api/tailor/jobs/{j1['id']}", json={"status": "delivered"}, headers=TH),
               "travail livre").json()
    check(upd_j["status"] == "delivered" and upd_j["finished_at"], "cloture datee")
    late2 = ok(client.get("/api/tailor/jobs?due=late", headers=TH), "retards apres livraison").json()
    check(all(j["id"] != j1["id"] for j in late2), "livre exclu des relances")
    job_photo = ok(client.post(f"/api/tailor/jobs/{j1['id']}/photo", files={"photo": ("m.png", io.BytesIO(PNG), "image/png")},
                               headers=TH), "photo de reference").json()
    check((job_photo["reference_photo_url"] or "").endswith(f"/api/tailor/jobs/{j1['id']}/photo"), "url photo")
    ok(client.get(f"/api/tailor/jobs/{j1['id']}/photo", headers=TH), "lecture photo")
    ok(client.delete(f"/api/tailor/jobs/{j2['id']}", headers=TH), "suppression travail", 204)

    print("\n== A2.3 : tableau de bord")
    dash = ok(client.get("/api/tailor/dashboard", headers=TH), "dashboard").json()
    # Carnet : « Moi (mesure d'essai) » (conversion invite) + Awa (Bouba est retire).
    check(dash["clients_count"] == 2 and isinstance(dash["orders_by_status"], dict), "compteurs")
    check("jobs_due_week" in dash and "jobs_late" in dash, "travaux au tableau")

    print("\n== A2.4 : patrons apercus")
    ok(client.post("/api/tailor/patterns", files={"image": ("r.png", io.BytesIO(PNG), "image/png")},
                   data={"garment_type": "fusée"}, headers=TH), "type inconnu refuse", 400)
    ok(client.post("/api/tailor/patterns", files={"image": ("r.png", io.BytesIO(PNG), "image/png")},
                   data={"garment_type": "robe"}, headers=TH), "mesures requises", 400)
    p1 = ok(client.post("/api/tailor/patterns", files={"image": ("r.png", io.BytesIO(PNG), "image/png")},
                        data={"garment_type": "robe", "tailor_client_id": c1["id"]}, headers=TH),
            "demande creee", 201).json()
    p1 = ok(client.get(f"/api/tailor/patterns/{p1['id']}", headers=TH), "patron genere").json()
    check(p1["status"] == "ready" and p1["engine"] == "preview-v0", "moteur apercu execute")
    check(p1["result"] and "Aperçu" in p1["result"]["note"], "mention apercu")
    check(p1["svg_url"] and p1["image_url"], "fichiers exposes")
    svg = ok(client.get(p1["svg_url"], headers=TH), "svg lisible").text
    check("Aperçu" in svg and "Marge de couture" in svg, "svg annote")
    ok(client.get(p1["image_url"], headers=TH), "image lisible")
    p2 = ok(client.post("/api/tailor/patterns", files={"image": ("r.png", io.BytesIO(PNG), "image/png")},
                        data={"garment_type": "pantalon",
                              "measurements": json.dumps({"chest": 96, "inseam": 80})},
                        headers=TH), "demande mesures libres", 201).json()
    p2 = ok(client.get(f"/api/tailor/patterns/{p2['id']}", headers=TH), "patron genere (libre)").json()
    check(p2["status"] == "ready", "apercu mesures libres")
    lst_p = ok(client.get("/api/tailor/patterns", headers=TH), "liste patrons").json()
    check(len(lst_p) == 2, "deux demandes")
    ok(client.delete(f"/api/tailor/patterns/{p2['id']}", headers=TH), "suppression patron", 204)
    ok(client.get(f"/api/tailor/patterns/{p2['id']}", headers=TH), "patron supprime", 404)
    invalidate()
    with SessionLocal() as db:
        set_setting(db, "features", {"pattern_generation": "off"}, None)
        db.commit()
    invalidate()
    ok(client.post("/api/tailor/patterns", files={"image": ("r.png", io.BytesIO(PNG), "image/png")},
                   data={"garment_type": "robe", "tailor_client_id": c1["id"]}, headers=TH),
       "patrons coupes", 404)
    with SessionLocal() as db:
        set_setting(db, "features", {"pattern_generation": "preview"}, None)
        db.commit()
    invalidate()

    print("\n== A2.2 : commandes sans argent")
    creg = ok(client.post("/api/auth/register", json={
        "role": "client", "phone": "+237677777777", "full_name": "Cliente",
        "password": "abcd12", "city": "Douala",
    }), "inscription cliente").json()
    CH = {"Authorization": f"Bearer {creg['access_token']}"}
    with SessionLocal() as db:
        cl = db.query(ClientProfile).filter(ClientProfile.user_id == creg["user_id"]).first()
        m = Measurement(client_id=cl.id, source="manual", height_cm=168, data={"chest": 94.0})
        db.add(m)
        db.commit()
        mid, tpid = m.id, db.query(TailorProfile).filter(
            TailorProfile.user.has(phone="+237655443322")).first().id
    o1 = ok(client.post("/api/orders", json={
        "tailor_id": tpid, "measurement_id": mid, "reception_mode": "pickup",
        "client_notes": "Pour samedi", "budget_amount": 12000,
    }, headers=CH), "commande envoyee").json()
    check(o1["status"] == "new" and o1["budget_amount"] == 12000.0, "commande sans offre")
    with SessionLocal() as db:
        from app.models.orders import Offer
        check(db.query(Offer).filter(Offer.order_id == o1["id"]).count() == 0, "aucune offre creee")
    mine = ok(client.get("/api/orders", headers=TH), "commandes recues").json()
    check(any(o["id"] == o1["id"] for o in mine), "tailleur voit la commande")
    acc = ok(client.post(f"/api/orders/{o1['id']}/accept",
                         json={"agreed_price": 15000}, headers=TH), "commande acceptee").json()
    check(acc["status"] == "in_progress" and acc["agreed_price"] == 15000.0, "prix convenu fixe")
    ok(client.post(f"/api/orders/{o1['id']}/accept", json={}, headers=CH), "client ne peut accepter", 403)
    ok(client.post(f"/api/orders/{o1['id']}/status", json={"status": "finished_delivered"}, headers=TH),
       "saut d'etape refuse", 400)
    ok(client.post(f"/api/orders/{o1['id']}/status", json={"status": "ready_for_pickup"}, headers=TH),
       "pret a retirer")
    ok(client.post(f"/api/orders/{o1['id']}/status", json={"status": "finished_delivered"}, headers=TH),
       "commande livree")
    o2 = ok(client.post("/api/orders", json={
        "tailor_id": tpid, "measurement_id": mid, "reception_mode": "pickup",
    }, headers=CH), "commande sans budget").json()
    dec = ok(client.post(f"/api/orders/{o2['id']}/decline", json={"reason": "Complet cette semaine"},
                         headers=TH), "commande refusee").json()
    check(dec["status"] == "declined" and dec["decline_reason"] == "Complet cette semaine", "refus motive")
    o3 = ok(client.post("/api/orders", json={
        "tailor_id": tpid, "measurement_id": mid, "reception_mode": "pickup",
    }, headers=CH), "commande a annuler").json()
    cxl = ok(client.post(f"/api/orders/{o3['id']}/cancel", json={"reason": "Change d'avis"}, headers=CH),
             "commande annulee").json()
    check(cxl["status"] == "cancelled" and cxl["cancelled_by"] == "client", "annulation cliente")
    dash2 = ok(client.get("/api/tailor/dashboard", headers=TH), "dashboard commandes").json()
    check(dash2["orders_by_status"].get("finished_delivered") == 1
          and dash2["orders_by_status"].get("declined") == 1
          and dash2["orders_by_status"].get("cancelled") == 1, "commandes par statut")

    print("\n== A2.2 : paiements desactives")
    ok(client.post("/api/payments/deposit", json={"order_id": o1["id"], "provider": "mtn_momo",
                                                  "phone": "+237677777777"}, headers=CH),
       "acompte desactive", 404)
    ok(client.get(f"/api/payments/order/{o1['id']}", headers=CH), "paiements commande fermes", 404)
    ok(client.post("/api/payments/webhook", json={"provider_txn_ref": "x", "status": "paid"}),
       "webhook ferme", 404)

    print("\n== A2.1 : verification desactivee")
    rtw = ok(client.post("/api/ready-to-wear", json={
        "name": "Kaba stock", "price": 8000,
    }, headers=TH), "pret-a-porter sans verification")
    check(rtw.status_code in (200, 201), "publie")
    tailors = ok(client.get("/api/tailors"), "liste tailleurs").json()
    check(all(t.get("verification_enabled") is False for t in tailors), "badge desactive")
    one = ok(client.get(f"/api/tailors/{tpid}"), "fiche tailleur").json()
    check(one.get("verification_enabled") is False, "fiche sans garantie")

    print("\n== A1.5 : limitation de tentatives (IP dediees)")
    for i in range(10):
        r = client.post("/api/auth/register", headers={"X-Forwarded-For": "10.9.9.1"},
                        json={"role": "client", "phone": f"+2376000010{i:02d}",
                              "full_name": f"Limite {i}", "password": "abcd12"})
        check(r.status_code == 200, f"inscription {i}")
    r = client.post("/api/auth/register", headers={"X-Forwarded-For": "10.9.9.1"},
                    json={"role": "client", "phone": "+237600001099",
                          "full_name": "Limite 10", "password": "abcd12"})
    check(r.status_code == 429 and "Trop de tentatives" in r.text, "11e inscription refusee")
    for _ in range(10):
        r = client.post("/api/auth/login", headers={"X-Forwarded-For": "10.9.9.2"},
                        json={"phone": "+237600001000", "password": "mauvais"})
        check(r.status_code == 401, "mauvais mot de passe")
    r = client.post("/api/auth/login", headers={"X-Forwarded-For": "10.9.9.2"},
                    json={"phone": "+237600001000", "password": "mauvais"})
    check(r.status_code == 429, "11e connexion refusee")
    for _ in range(30):
        r = client.post("/api/auth/guest", headers={"X-Forwarded-For": "10.9.9.3"})
        check(r.status_code == 200, "invite cree")
    r = client.post("/api/auth/guest", headers={"X-Forwarded-For": "10.9.9.3"})
    check(r.status_code == 429, "31e invite refuse")
    for _ in range(5):
        r = client.post("/api/support/tickets", headers={"X-Forwarded-For": "10.9.9.4"},
                        json={"name": "V", "phone": "+237600001000",
                              "subject": "Aide s'il vous plait", "body": "Je n'arrive pas a mesurer"})
        check(r.status_code == 201, "demande creee")
    r = client.post("/api/support/tickets", headers={"X-Forwarded-For": "10.9.9.4"},
                    json={"name": "V", "phone": "+237600001000",
                          "subject": "Aide s'il vous plait", "body": "Encore"})
    check(r.status_code == 429, "6e demande refusee")

    print("\n== A1.5 : double authentification limitee par jeton")
    seed_admin_totp()
    login = ok(client.post("/api/auth/login", json={"phone": "+237600000010", "password": "abcd12"}),
               "connexion admin TOTP").json()
    check(login.get("mfa_required") and login.get("mfa_token"), "code demande")
    for _ in range(5):
        r = client.post("/api/auth/mfa", json={"mfa_token": login["mfa_token"], "code": "000000"})
        check(r.status_code == 400, "mauvais code TOTP")
    r = client.post("/api/auth/mfa", json={"mfa_token": login["mfa_token"], "code": "000000"})
    check(r.status_code == 429, "6e essai TOTP refuse")

    print(f"\n{len(FAILS)} echec(s)")
    for f_ in FAILS:
        print("  -", f_)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
