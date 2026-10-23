"""
Tests « relier clients et tailleurs » : annuaire, contact, commande depuis
le profil d'un tailleur, localisation, carnet de recettes.

Ce que ces tests verrouillent :
  - l'annuaire ne montre jamais de telephone ni d'e-mail ;
  - le telephone d'un tailleur ne sort que par `/tailors/{id}/contact`, et
    seulement pour un compte connecte ;
  - un client ne peut pas commander avec les mesures d'un autre ;
  - un tailleur ne voit pas les commandes d'un autre atelier ;
  - l'avance d'un travail vaut toujours la somme de ses recettes.

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_client_tailleur
"""

import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-client-tailleur-")
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
from app.models.catalog import Category, GarmentModel  # noqa: E402
from app.models import (  # noqa: E402
    ClientProfile,
    Measurement,
    TailorProfile,
    User,
)

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


def register(role: str, phone: str, name: str, **extra):
    body = {
        "role": role,
        "phone": phone,
        "full_name": name,
        "password": "abcd12",
        "language": "fr",
        "photo_consent": False,
    }
    body.update(extra)
    r = ok(client.post("/api/auth/register", json=body), f"inscription {role} {phone}")
    return r.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def tailor_profile_of(user_id: str) -> str:
    with SessionLocal() as db:
        tp = db.query(TailorProfile).filter(TailorProfile.user_id == user_id).first()
        return tp.id if tp else ""


def measurement_for(user_id: str, chest: float = 94.0) -> str:
    """Cree une fiche de mesures pour un compte client et rend son id."""
    with SessionLocal() as db:
        cp = db.query(ClientProfile).filter(ClientProfile.user_id == user_id).first()
        m = Measurement(
            client_id=cp.id,
            source="manual",
            height_cm=168,
            weight_kg=62,
            gender="female",
            data={"chest": chest, "waist": 74.0, "hips": 96.0},
        )
        db.add(m)
        db.commit()
        return m.id


def main() -> None:
    print("\n== Inscription des acteurs")
    tailleur = register("tailor", "+237677000001", "Awa Atelier", city="Douala",
                         quartier="Akwa", shop_name="Atelier Awa")
    TH = auth(tailleur["access_token"])
    tpid = tailor_profile_of(tailleur["user_id"])
    check(bool(tpid), "profil tailleur cree")

    autre = register("tailor", "+237677000002", "Boris Couture", city="Yaounde",
                     shop_name="Boris Couture")
    TH2 = auth(autre["access_token"])

    cliente = register("client", "+237678000001", "Nadege Client")
    CH = auth(cliente["access_token"])
    mid = measurement_for(cliente["user_id"])

    autre_client = register("client", "+237678000002", "Autre Client")
    CH2 = auth(autre_client["access_token"])
    mid2 = measurement_for(autre_client["user_id"], chest=80.0)

    print("\n== 4.1 : l'annuaire est public et sans telephone")
    r = ok(client.get("/api/tailors"), "annuaire public")
    lst = r.json()
    check(isinstance(lst, list) and len(lst) >= 2, "annuaire liste les tailleurs")
    check(all("phone" not in t and "email" not in t for t in lst),
          "aucun telephone ni e-mail dans l'annuaire")
    check(all("landmark" in t for t in lst), "le repere est expose")
    check(any(t["id"] == tpid for t in lst), "l'atelier inscrit figure a l'annuaire")

    r = ok(client.get(f"/api/tailors/{tpid}"), "profil public")
    check("phone" not in r.json() and "email" not in r.json(),
          "aucun telephone ni e-mail dans le profil public")

    print("\n== 4.1 : le telephone ne sort que par /contact, pour un compte connecte")
    r = client.get(f"/api/tailors/{tpid}/contact")
    check(r.status_code == 401, f"contact sans connexion -> {r.status_code}")
    r = ok(client.get(f"/api/tailors/{tpid}/contact", headers=CH), "contact connecte")
    check(r.json()["phone"] == "+237677000001", "numero rendu au client connecte")
    check(r.json()["whatsapp"] is True, "WhatsApp disponible")

    r = ok(client.get(f"/api/tailors/{tpid}/contact", headers=CH2), "contact autre client")
    check(r.json()["phone"] == "+237677000001", "meme numero pour un autre client")

    print("\n== 4.1 : le tailleur peut masquer son numero")
    ok(client.patch("/api/tailors/me", json={"show_phone": False}, headers=TH),
       "masquage du numero")
    r = ok(client.get(f"/api/tailors/{tpid}/contact", headers=CH), "contact apres masquage")
    check(r.json()["phone"] is None, "numero masque")
    check(r.json()["hidden"] is True, "etat « masque » signale")
    ok(client.patch("/api/tailors/me", json={"show_phone": True}, headers=TH),
       "remise en service du numero")

    print("\n== 4.1 : localisation et repere")
    r = ok(client.patch("/api/tailors/me", json={
        "landmark": "Face pharmacie du marche", "city": "Douala", "quartier": "Akwa",
        "lat": 4.05, "lng": 9.70,
    }, headers=TH), "profil mis a jour")
    check(r.json()["landmark"] == "Face pharmacie du marche", "repere enregistre")
    check(r.json()["lat"] == 4.05 and r.json()["lng"] == 9.70, "position enregistree")
    r = client.patch("/api/tailors/me", json={"lat": 4.05}, headers=TH)
    check(r.status_code == 400, "position incomplete refusee")
    r = ok(client.patch("/api/tailors/me", json={"lat": None, "lng": None}, headers=TH),
           "position effacee")
    check(r.json()["lat"] is None and r.json()["lng"] is None, "position effacee")

    print("\n== 4.1 : un compte desactif quitte l'annuaire")
    with SessionLocal() as db:
        u = db.query(User).filter(User.id == tailleur["user_id"]).first()
        u.is_active = False
        db.commit()
    lst = ok(client.get("/api/tailors"), "annuaire apres desactivation").json()
    check(not any(t["id"] == tpid for t in lst), "atelier desactive absent de l'annuaire")
    with SessionLocal() as db:
        u = db.query(User).filter(User.id == tailleur["user_id"]).first()
        u.is_active = True
        db.commit()

    print("\n== 4.3 : commande depuis le profil d'un tailleur")
    r = ok(client.post("/api/orders", json={
        "tailor_id": tpid, "measurement_id": mid, "reception_mode": "pickup",
        "client_notes": "Robe de mariage", "budget_amount": 25000,
    }, headers=CH), "commande envoyee")
    order = r.json()
    check(order["status"] == "new", "commande a l'etat « nouvelle »")
    check(order["measurement_id"] == mid, "mesures jointes")

    print("\n== Securite : on ne commande pas avec les mesures d'un autre")
    r = client.post("/api/orders", json={
        "tailor_id": tpid, "measurement_id": mid2, "reception_mode": "pickup",
    }, headers=CH)
    check(r.status_code == 403, f"mesure d'un autre refusee -> {r.status_code}")
    r = client.post("/api/orders", json={
        "tailor_id": tpid, "measurement_id": "inexistant", "reception_mode": "pickup",
    }, headers=CH)
    check(r.status_code == 403, f"mesure inconnue refusee -> {r.status_code}")

    print("\n== Securite : un tailleur ne voit pas les commandes d'un autre atelier")
    r = client.get(f"/api/orders/{order['id']}", headers=TH2)
    check(r.status_code == 403, f"commande d'un autre atelier refusee -> {r.status_code}")
    r = ok(client.get(f"/api/orders/{order['id']}", headers=TH), "commande vue par l'atelier")
    check(r.json()["id"] == order["id"], "commande du bon atelier")

    print("\n== 4.4 : le tailleur voit le client, son numero et ses mesures")
    r = ok(client.get(f"/api/tailor/orders/{order['id']}/client", headers=TH),
           "coordonnees du client")
    payload = r.json()
    check(payload["name"] == "Nadege Client", "nom du client")
    check(payload["phone"] == "+237678000001", "telephone du client")
    check(payload["measurement"] and payload["measurement"]["data"].get("chest") == 94.0,
          "mesures du client visibles")
    r = client.get(f"/api/tailor/orders/{order['id']}/client", headers=CH2)
    check(r.status_code in (403, 404), f"client sans rapport refuse -> {r.status_code}")

    print("\n== 4.3 : commande avec un modele du catalogue")
    with SessionLocal() as db:
        cat = Category(name="Robes", gender="female")
        db.add(cat)
        db.flush()
        gm = GarmentModel(category_id=cat.id, name="Robe kaba test", photo_url="/media/kaba.jpg")
        db.add(gm)
        db.commit()
        gmid = gm.id
    r = ok(client.post("/api/orders", json={
        "tailor_id": tpid, "measurement_id": mid, "garment_model_id": gmid,
        "reception_mode": "delivery",
    }, headers=CH), "commande avec modele")
    order_modele = r.json()
    r = ok(client.get(f"/api/tailor/orders/{order_modele['id']}/client", headers=TH),
           "coordonnees d'une commande avec modele")
    check((r.json().get("model") or {}).get("name") == "Robe kaba test", "modele vu par le tailleur")
    check((r.json().get("model") or {}).get("photo_url") == "/media/kaba.jpg", "photo du modele")
    r = client.post("/api/orders", json={
        "tailor_id": tpid, "measurement_id": mid, "garment_model_id": "inexistant",
        "reception_mode": "pickup",
    }, headers=CH)
    check(r.status_code == 404, f"modele inconnu refuse -> {r.status_code}")

    print("\n== 4.4 : le client entre au carnet")
    r = ok(client.post(f"/api/tailor/orders/{order['id']}/notebook", headers=TH),
           "ajout au carnet", 200)
    check(r.json()["created"] is True, "fiche carnet creee")
    check(r.json()["measurement_copied"] is True, "mesures recopiees")
    r = ok(client.post(f"/api/tailor/orders/{order['id']}/notebook", headers=TH),
           "ajout au carnet (deuxieme fois)")
    check(r.json()["created"] is False, "pas de doublon de fiche")
    carnets = ok(client.get("/api/tailor/clients", headers=TH), "carnet").json()
    check(len([c for c in carnets if c["full_name"] == "Nadege Client"]) == 1,
          "une seule fiche pour ce client")

    print("\n== 4.2 : le tailleur accepte la commande avec un prix")
    r = ok(client.post(f"/api/orders/{order['id']}/accept", json={"agreed_price": 30000},
                       headers=TH), "acceptation")
    check(r.json()["agreed_price"] == 30000, "prix convenu enregistre")
    r = client.post(f"/api/orders/{order['id']}/accept", json={"agreed_price": 99999999},
                    headers=TH)
    check(r.status_code == 422, "montant hors plafond refuse")

    print("\n== 4.5 : carnet de recettes")
    r = ok(client.post("/api/tailor/jobs", json={
        "description": "Chemise en lin", "agreed_price": 20000, "advance_received": 5000,
    }, headers=TH), "travail cree", 201)
    job = r.json()
    check(job["advance_received"] == 5000, "avance affichee")

    fin = ok(client.get("/api/tailor/finances", headers=TH), "finances").json()
    check(fin["total_encaisse"] == 5000, f"total encaisse = {fin['total_encaisse']}")
    check(fin["reste_a_encaisser"] == 15000, f"reste = {fin['reste_a_encaisser']}")
    check(len(fin["entrees"]) == 1 and fin["entrees"][0]["label"] == "Avance",
          "l'avance saisie devient une recette")
    check(fin["par_mois"] and fin["par_mois"][0]["mois"] == date.today().strftime("%Y-%m"),
          "recette rangee dans le mois")

    # Le mois precedent est un repere fixe, quelle que soit la periode.
    debut_mois = date.today().replace(day=1)
    mois_dernier = (debut_mois - timedelta(days=1)).replace(day=1)
    ok(client.post("/api/tailor/finances/entries", json={
        "amount": 3000, "label": "Retouche", "method": "mobile_money",
        "received_on": mois_dernier.isoformat(),
    }, headers=TH), "recette du mois dernier", 201)
    fin = ok(client.get(f"/api/tailor/finances?debut={debut_mois.isoformat()}", headers=TH),
             "finances de ce mois").json()
    check(fin["total_mois_courant"] == 5000, f"ce mois = {fin['total_mois_courant']}")
    check(fin["total_mois_precedent"] == 3000, f"mois dernier = {fin['total_mois_precedent']}")
    check(fin["total_encaisse"] == 5000, "la periode exclut le mois dernier")

    r = ok(client.post("/api/tailor/finances/entries", json={
        "job_id": job["id"], "amount": 7000, "label": "Deuxieme acompte", "method": "cash",
    }, headers=TH), "recette ajoutee", 201)
    check(r.json()["amount"] == 7000, "montant de la recette")
    jobs = ok(client.get("/api/tailor/jobs", headers=TH), "travaux").json()
    avance = [j for j in jobs if j["id"] == job["id"]][0]["advance_received"]
    check(avance == 12000, f"avance recalculee = {avance}")

    r = client.post("/api/tailor/finances/entries", json={
        "job_id": job["id"], "amount": 9000, "label": "Trop",
    }, headers=TH)
    check(r.status_code == 400, f"recette au-dela du prix refusee -> {r.status_code}")

    r = client.post("/api/tailor/finances/entries", json={
        "amount": 0, "label": "Zero",
    }, headers=TH)
    check(r.status_code == 422, "montant nul refuse")

    r = client.post("/api/tailor/finances/entries", json={
        "amount": 1000, "received_on": (date.today() + timedelta(days=2)).isoformat(),
    }, headers=TH)
    check(r.status_code == 400, "date future refusee")

    r = ok(client.get("/api/tailor/finances", headers=TH2), "finances de l'autre atelier")
    check(r.json()["total_encaisse"] == 0, "recettes d'un autre atelier non vues")
    r = client.get("/api/tailor/finances", headers=CH)
    check(r.status_code == 403, f"finances interdites au client -> {r.status_code}")

    # Suppression d'une recette : l'avance suit.
    entree = [e for e in fin["entrees"] if e["job_id"] == job["id"]][0]
    r = client.delete(f"/api/tailor/finances/entries/{entree['id']}", headers=TH)
    check(r.status_code == 204, f"recette supprimee -> {r.status_code}")
    jobs = ok(client.get("/api/tailor/jobs", headers=TH), "travaux").json()
    avance = [j for j in jobs if j["id"] == job["id"]][0]["advance_received"]
    check(avance == 7000, f"avance recalculee apres suppression = {avance}")

    print("\n== 4.5 : la reprise des avances deja saisies")
    with SessionLocal() as db:
        from app.models.tailor_tools import TailorIncomeEntry, TailorJob

        ancien = TailorJob(tailor_id=tpid, description="Travail ancien",
                            status="todo", agreed_price=10000, advance_received=4000)
        db.add(ancien)
        db.commit()
        ancien_id = ancien.id
    fin = ok(client.get("/api/tailor/finances", headers=TH), "finances apres reprise").json()
    avance = [e for e in fin["entrees"] if e.get("job_id") == ancien_id]
    check(len(avance) == 1 and avance[0]["label"] == "Avance (reprise)",
          "avance reprise en recette")
    check(avance and avance[0]["amount"] == 4000, "montant de la reprise")
    fin2 = ok(client.get("/api/tailor/finances", headers=TH), "finances (idempotence)").json()
    check(len([e for e in fin2["entrees"] if e.get("job_id") == ancien_id]) == 1,
          "la reprise ne se repete pas")
    with SessionLocal() as db:
        from app.models.tailor_tools import TailorJob

        job_db = db.get(TailorJob, ancien_id)
        check(job_db.advance_received == 4000, "avance inchangee par la reprise")

    print(f"\n{len(FAILS)} echec(s)")
    for f_ in FAILS:
        print("  -", f_)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
