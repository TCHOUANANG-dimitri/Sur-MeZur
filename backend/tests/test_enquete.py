"""
Enquete patrons : lien public par jeton (profil, galerie, fiches, photos,
envoi) et lecture admin (liens, lecture, reouverture, export ZIP).

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_enquete
"""

import io
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-enquete-test-")
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
from app.models import EnqueteModele, GarmentModel, User  # noqa: E402
from app.models.catalog import Category  # noqa: E402

client = TestClient(app)
FAILS: list[str] = []
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 300


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
        db.add_all([
            User(role="admin", phone="+237600000000", full_name="Admin", password_hash=hash_password("abc123")),
            User(role="admin", admin_role="finance", phone="+237600000009", full_name="Finance",
                 password_hash=hash_password("abc123")),
        ])
        robes = Category(name="Robes", gender="female")
        chemises = Category(name="Chemises", gender="male")
        db.add_all([robes, chemises])
        db.flush()
        ids = {}
        for i in range(6):
            gm = GarmentModel(category_id=robes.id, name=f"Robe {i}", status="published", photo_url=f"/uploads/r{i}.jpg")
            db.add(gm)
            db.flush()
            ids.setdefault("robe", gm.id)
        db.add(GarmentModel(category_id=chemises.id, name="Chemise col mao", status="published", photo_url="/uploads/c.jpg"))
        db.add(GarmentModel(category_id=chemises.id, name="Sans photo", status="published"))
        hidden = GarmentModel(category_id=chemises.id, name="Cachee", status="hidden", photo_url="/uploads/h.jpg")
        db.add(hidden)
        db.flush()
        ids["hidden"] = hidden.id
        db.commit()
        return ids


def donnees_completes() -> dict:
    """Fiche v2 : la recette du tailleur (aisances, marges, coupe)."""
    return {
        "general": {"categorie": "jupe", "type": "jupe_droite", "type_label": "Droite, ajustée à pinces",
                    "pour": "femme", "fois_cousu": "6-20"},
        "mesures_prises": ["waist", "hips", "garment_length"],
        "taille_ou": "creux",
        "aisance_cm": {"waist": 1, "hips": 4},
        "coupe": {"couture_cm": 1.5, "ourlet_cm": 3, "devant": "pli", "dos": "deux", "pinces_devant": "1",
                  "pinces_dos": "2", "fermeture": "eclair_dos", "ceinture": "montee"},
        "astuces": "devant = hanches / 4 + 1",
    }


def main() -> None:
    ids = seed()
    H = {"Authorization": "Bearer " + client.post(
        "/api/auth/login", json={"phone": "+237600000000", "password": "abc123"}).json()["access_token"]}
    F = {"Authorization": "Bearer " + client.post(
        "/api/auth/login", json={"phone": "+237600000009", "password": "abc123"}).json()["access_token"]}

    print("\n== Liens (admin)")
    ok(client.post("/api/admin/enquete/invites", json={"label": "X"}, headers=F), "finance n'a pas l'enquete", 403)
    a = ok(client.post("/api/admin/enquete/invites", json={"label": "Maman Rose"}, headers=H), "lien A", 201).json()
    b = ok(client.post("/api/admin/enquete/invites", json={"label": "Atelier B"}, headers=H), "lien B", 201).json()
    ta, tb = a["token"], b["token"]
    check(len(ta) >= 20 and ta != tb, "jetons longs et distincts")
    ok(client.get("/api/public/enquete/inconnu-123456"), "jeton inconnu", 404)

    print("\n== Accueil, profil, consentement")
    acc = ok(client.get(f"/api/public/enquete/{ta}"), "accueil sans compte").json()
    check(acc["consentement"] is False and acc["modeles"] == [], "accueil vierge")
    ok(client.post(f"/api/public/enquete/{ta}/modeles", json={"source": "cousu"}), "fiche refusee sans accord", 409)
    ok(client.put(f"/api/public/enquete/{ta}/profil", json={"nom": "R"}), "nom trop court", 422)
    p = ok(client.put(f"/api/public/enquete/{ta}/profil", json={
        "nom": "Rose Ngo", "ville": "Douala", "experience_annees": 12, "specialites": ["robes", "kaba"],
        "consentement": True}), "profil + accord").json()
    check(p["consentement"] is True, "accord enregistre")

    print("\n== Galerie")
    gal = ok(client.get(f"/api/public/enquete/{ta}/galerie"), "galerie").json()
    robes = next(g for g in gal if g["categorie"] == "Robes")
    check(len(robes["modeles"]) == 4, "4 modeles max par categorie")
    noms = {m["nom"] for g in gal for m in g["modeles"]}
    check("Sans photo" not in noms and "Cachee" not in noms, "ni modele sans photo ni modele cache")

    print("\n== Fiche « galerie »")
    ok(client.post(f"/api/public/enquete/{ta}/modeles", json={"source": "galerie", "garment_model_id": ids["hidden"]}),
       "modele cache refuse", 404)
    g = ok(client.post(f"/api/public/enquete/{ta}/modeles", json={"source": "galerie", "garment_model_id": ids["robe"]}),
           "fiche galerie", 201).json()
    check(g["data"]["general"]["nom"] == "Robe 0" and g["modele_galerie"]["categorie"] == "Robes", "nom pre-rempli")

    print("\n== Fiche « cousu » : brouillon, photos, envoi")
    c = ok(client.post(f"/api/public/enquete/{ta}/modeles", json={"source": "cousu"}), "fiche cousu", 201).json()
    base = f"/api/public/enquete/{ta}/modeles/{c['id']}"
    ok(client.put(base, json={"data": {"general": {"categorie": "jupe"}}}), "sauvegarde brouillon")
    r = ok(client.post(f"{base}/envoyer"), "envoi incomplet refuse", 422)
    check("type de modèle" in r.text and "aisance" in r.text and "valeur de couture" in r.text,
          "message liste les manques")
    check("photo" not in r.text, "photo facultative")
    ok(client.put(base, json={"data": {**donnees_completes(),
                                       "general": {"categorie": "jupe", "type": "autre", "fois_cousu": "2-5"}}}),
       "type autre sans nom")
    r = ok(client.post(f"{base}/envoyer"), "type autre : nom exige", 422)
    check("nom du modèle" in r.text, "nom demande pour un type autre")
    ok(client.put(base, json={"data": {"x": "y" * 70000}}), "fiche trop longue", 413)
    ok(client.post(f"{base}/photos", files={"photo": ("x.jpg", io.BytesIO(b"MZ\x90\x00" * 50), "image/jpeg")},
                   data={"kind": "vetement"}), "faux jpeg refuse", 400)
    ph = ok(client.post(f"{base}/photos", files={"photo": ("v.jpg", io.BytesIO(JPEG), "image/jpeg")},
                        data={"kind": "vetement", "legende": "devant"}), "photo vetement", 201).json()
    ok(client.post(f"{base}/photos", files={"photo": ("p.jpg", io.BytesIO(JPEG), "image/jpeg")},
                   data={"kind": "patron"}), "photo patron", 201)
    img = ok(client.get(f"/api{ph['url']}"), "photo relue par le lien")
    check(img.content == JPEG, "octets identiques")
    # Isolation : le lien B ne voit ni la fiche ni la photo de A.
    ok(client.get(f"/api/public/enquete/{tb}/modeles/{c['id']}"), "fiche A invisible depuis B", 404)
    ok(client.get(f"/api/public/enquete/{tb}/modeles/{c['id']}/photos/{ph['id']}"), "photo A invisible depuis B", 404)
    ok(client.get(f"/uploads/../tailor_store/enquete/{c['id']}/{ph['id']}.jpg"), "pas de service statique", 404)
    ok(client.put(base, json={"data": donnees_completes()}), "fiche complete")
    env = ok(client.post(f"{base}/envoyer"), "envoi").json()
    check(env["status"] == "envoye" and env["submitted_at"], "fiche envoyee")
    check(env["nom"] == "Droite, ajustée à pinces" and env["schema_version"] == 2, "nom = type choisi, version 2")
    ok(client.put(base, json={"data": {}}), "envoyee non modifiable", 409)
    ok(client.delete(base), "envoyee non supprimable", 409)
    ok(client.delete(f"/api/public/enquete/{ta}/modeles/{g['id']}"), "brouillon supprime", 204)

    print("\n== Ancienne fiche (version 1)")
    v1 = ok(client.post(f"/api/public/enquete/{ta}/modeles", json={"source": "cousu"}), "fiche v1", 201).json()
    with SessionLocal() as db:
        row = db.get(EnqueteModele, v1["id"])
        row.schema_version = 1
        row.data = {"general": {"nom": "Ancienne", "categorie": "jupe", "fois_cousu": "2-5"}}
        db.commit()
    r = ok(client.post(f"/api/public/enquete/{ta}/modeles/{v1['id']}/envoyer"), "v1 : ancienne regle", 422)
    check("3 mesures" in r.text, "regle v1 conservee")
    ok(client.delete(f"/api/public/enquete/{ta}/modeles/{v1['id']}"), "fiche v1 supprimee", 204)

    print("\n== Lecture admin, reouverture, export")
    inv = ok(client.get("/api/admin/enquete/invites", headers=H), "liste des liens").json()
    la = next(i for i in inv if i["id"] == a["id"])
    check(la["nb_envoyes"] == 1 and la["profil"]["nom"] == "Rose Ngo", "compteurs et profil")
    lst = ok(client.get("/api/admin/enquete/modeles?statut=envoye", headers=H), "fiches envoyees").json()
    check(len(lst) == 1 and lst[0]["tailleur"]["nom"] == "Rose Ngo", "fiche listee avec son tailleur")
    det = ok(client.get(f"/api/admin/enquete/modeles/{c['id']}", headers=H), "detail admin").json()
    check(len(det["photos"]) == 2, "photos listees")
    ok(client.get(f"/api{det['photos'][0]['url']}", headers=H), "photo cote admin")
    ok(client.get(f"/api{det['photos'][0]['url']}"), "photo admin sans session", 401)
    rv = ok(client.patch(f"/api/admin/enquete/modeles/{c['id']}", headers=H,
                         json={"review_note": "Précisez l'aisance aux hanches", "rouvrir": True}), "rouvrir").json()
    check(rv["status"] == "brouillon" and rv["review_status"] == "a_completer", "fiche rouverte")
    vue = ok(client.get(base), "le tailleur voit la note").json()
    check(vue["a_completer"] and "aisance" in (vue["review_note"] or ""), "note visible")
    ok(client.post(f"{base}/envoyer"), "renvoi")
    ok(client.patch(f"/api/admin/enquete/modeles/{c['id']}", headers=H, json={"review_status": "retenu"}), "retenu")
    z = ok(client.get("/api/admin/enquete/export", headers=H), "export ZIP")
    with zipfile.ZipFile(io.BytesIO(z.content)) as zf:
        noms = zf.namelist()
        doc = json.loads(zf.read("enquete.json"))
    check("enquete.json" in noms and sum(n.startswith("photos/") for n in noms) == 2, "JSON + 2 photos")
    check(len(doc["fiches"]) == 1 and doc["fiches"][0]["lecture"] == "retenu", "fiche exportee")
    check(doc["tailleurs"][0]["profil"]["nom"] == "Rose Ngo", "profil exporte")

    print("\n== Acces direct (sans lien personnel)")
    n1 = ok(client.post("/api/public/enquete/nouveau"), "acces direct cree", 201).json()["token"]
    n2 = ok(client.post("/api/public/enquete/nouveau"), "second acces direct", 201).json()["token"]
    check(n1 != n2 and len(n1) >= 20, "jetons distincts")
    acc = ok(client.get(f"/api/public/enquete/{n1}"), "accueil acces direct").json()
    check(acc["label"] == "Accès direct" and acc["modeles"] == [], "acces direct vierge")
    ok(client.get(f"/api/public/enquete/{n2}/modeles/{c['id']}"), "acces direct ne voit pas les fiches des autres", 404)
    inv = client.get("/api/admin/enquete/invites", headers=H).json()
    check(sum(1 for i in inv if i["label"] == "Accès direct") == 2, "acces directs visibles dans l'admin")
    codes = [client.post("/api/public/enquete/nouveau").status_code for _ in range(12)]
    check(429 in codes, "limite de creation par IP")

    print("\n== Revocation")
    ok(client.patch(f"/api/admin/enquete/invites/{b['id']}", headers=H, json={"revoked": True}), "desactiver B")
    ok(client.get(f"/api/public/enquete/{tb}"), "lien B desactive", 410)

    print(f"\n{len(FAILS)} echec(s)")
    for f in FAILS:
        print("  -", f)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
