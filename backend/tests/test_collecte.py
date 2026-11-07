"""
Campagne de collecte : protocole « tailleur » (20 mesures homme, 26 femme,
photos face/profil/dos, serie de controle) et lecture des fiches v1.

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_collecte
"""

import io
import json
import os
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-collecte-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["PROTECTED_DIR"] = f"{_TMP}/protected"
os.environ["DATASET_DIR"] = f"{_TMP}/dataset"
os.environ["AVATAR_OUTPUT_DIR"] = f"{_TMP}/avatars"
os.environ["VISION_ENABLED"] = "false"
os.environ["SURMEZUR_ALLOW_LOCALHOST"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.models.collecte import DatasetSubject  # noqa: E402
from app.services.collecte_protocol import MESURES, mesures_du_sexe  # noqa: E402

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


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 120), (200, 190, 180)).save(buf, "JPEG")
    return buf.getvalue()


def seed() -> tuple[dict, dict]:
    with SessionLocal() as db:
        admin = User(role="admin", phone="+237600000100", full_name="Admin", password_hash=hash_password("abc123"))
        agent = User(role="collector", phone="+237600000101", full_name="Agent", password_hash=hash_password("abc123"))
        db.add_all([admin, agent])
        db.commit()
        return (
            {"Authorization": f"Bearer {create_access_token(admin.id, 'admin')}"},
            {"Authorization": f"Bearer {create_access_token(agent.id, 'collector')}"},
        )


def fiche(gender: str, measurements: dict, **extra) -> dict:
    return {
        "client_uuid": str(uuid.uuid4()),
        "gender": gender,
        "height_cm": 170,
        "weight_kg": 65,
        "measurements": measurements,
        "consent": True,
        "consent_name": "Volontaire",
        "clothing": "ajuste",
        **extra,
    }


def valeurs(keys: list[str]) -> dict:
    # Une valeur plausible pour chaque mesure : le milieu des bornes dures.
    from app.services.collecte_protocol import HARD_BOUNDS

    return {k: round(sum(HARD_BOUNDS[k]) / 2, 1) for k in keys}


def main():
    admin, agent = seed()

    print("== protocole")
    check(len(mesures_du_sexe("male")) == 20, "20 mesures homme")
    check(len(mesures_du_sexe("female")) == 26, "26 mesures femme")

    print("== creation")
    h = ok(client.post("/api/collecte/subjects", json=fiche("male", valeurs(mesures_du_sexe("male"))), headers=agent), "fiche homme complete").json()
    check(h["protocole"] == "tailleur", "protocole tailleur")
    check(not h["complete"], "incomplete sans photos")
    ok(client.post("/api/collecte/subjects", json=fiche("male", {"tour_dessous_poitrine": 80}), headers=agent),
       "mesure femme refusee sur un homme", 422)
    ok(client.post("/api/collecte/subjects", json=fiche("female", {"tour_taille": 70, "waist": 70}), headers=agent),
       "melange des protocoles refuse", 422)
    ok(client.post("/api/collecte/subjects", json=fiche("female", {"tour_taille": 7}), headers=agent),
       "valeur hors bornes refusee", 422)
    controle = valeurs(mesures_du_sexe("female"))
    controle["tour_taille"] += 1.0
    f = ok(client.post("/api/collecte/subjects",
                       json=fiche("female", valeurs(mesures_du_sexe("female")), measurements_check=controle),
                       headers=agent), "fiche femme avec controle").json()
    check(f["measurements_check"] and len(f["measurements_check"]) == 26, "serie de controle gardee")
    ok(client.post("/api/collecte/subjects",
                   json=fiche("male", valeurs(mesures_du_sexe("male")), measurements_check={"chest": 90}),
                   headers=agent), "controle a l'ancien protocole refuse", 422)

    print("== photos")
    for view in ("face", "profil"):
        ok(client.put(f"/api/collecte/subjects/{h['id']}/photos/{view}", files={"file": (f"{view}.jpg", jpeg(), "image/jpeg")},
                      headers=agent), f"photo {view}")
    s = ok(client.get(f"/api/collecte/subjects/{h['id']}", headers=agent), "relecture").json()
    check(not s["complete"], "incomplete sans la photo de dos")
    s = ok(client.put(f"/api/collecte/subjects/{h['id']}/photos/dos", files={"file": ("dos.jpg", jpeg(), "image/jpeg")},
                      headers=agent), "photo dos").json()
    check(s["complete"], "complete avec face, profil et dos")
    ok(client.put(f"/api/collecte/subjects/{h['id']}/photos/trois_quarts", files={"file": ("x.jpg", jpeg(), "image/jpeg")},
                  headers=agent), "vue inconnue refusee", 400)

    print("== modification")
    ok(client.patch(f"/api/collecte/subjects/{h['id']}", json={"gender": "female"}, headers=agent),
       "changer le sexe seul (mesures homme deja la) refuse", 422)
    r = ok(client.patch(f"/api/collecte/subjects/{h['id']}", json={"measurements": {**valeurs(mesures_du_sexe("male")), "tour_cou": 39.5}},
                        headers=agent), "corriger une mesure").json()
    check(r["measurements"]["tour_cou"] == 39.5, "mesure corrigee")

    print("== ancienne fiche v1")
    with SessionLocal() as db:
        n = (db.query(DatasetSubject).count() or 0) + 1
        agent_id = db.query(User).filter(User.phone == "+237600000101").one().id
        db.add(DatasetSubject(number=n, client_uuid=str(uuid.uuid4()), collector_id=agent_id, gender="male", height_cm=172,
                              weight_kg=70, measurements=valeurs(MESURES), consent=True))
        db.commit()
    lst = ok(client.get("/api/collecte/subjects", headers=agent), "liste").json()
    v1 = [x for x in lst if x["protocole"] == "v1"]
    check(len(v1) == 1, "fiche v1 reconnue")
    for view in ("face", "profil"):
        client.put(f"/api/collecte/subjects/{v1[0]['id']}/photos/{view}", files={"file": (f"{view}.jpg", jpeg(), "image/jpeg")}, headers=agent)
    v = ok(client.get(f"/api/collecte/subjects/{v1[0]['id']}", headers=agent), "relecture v1").json()
    check(v["complete"], "v1 complete avec face et profil")
    ok(client.patch(f"/api/collecte/subjects/{v1[0]['id']}", json={"measurements": {**valeurs(MESURES), "neck": 38}}, headers=agent),
       "corriger une fiche v1")

    print("== export")
    t = ok(client.get("/api/collecte/export?format=json", headers=admin), "sujets_tailleur.json").json()
    check(len(t["sujets"]) == 1 and len(t["sujets"][0]["mesures"]) == 20, "une fiche tailleur complete, 20 mesures")
    check(set(t["sujets"][0]["photos"]) == {"face", "profil", "dos"}, "3 photos dans l'export")
    b = ok(client.get("/api/collecte/export?format=json_v1", headers=admin), "sujets.json v1").json()
    check(len(b["sujets"]) == 1 and len(b["sujets"][0]["tours"]) == 8, "fiche v1 au format du banc")
    csv = ok(client.get("/api/collecte/export?format=csv", headers=admin), "csv").text
    head = csv.splitlines()[0]
    check("protocole" in head and "tour_dessous_poitrine" in head and "controle_tour_taille" in head and "photo_dos" in head,
          "colonnes du csv")
    z = ok(client.get("/api/collecte/export?format=zip&photos=true", headers=admin), "zip")
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    check("sujets_tailleur.json" in names and any(n.endswith("_dos.jpg") for n in names), "zip : json tailleur et photo de dos")
    zt = json.loads(zipfile.ZipFile(io.BytesIO(z.content)).read("sujets_tailleur.json"))
    check(zt["mesures_femme"] == mesures_du_sexe("female"), "liste des mesures femme dans le json")
    o = ok(client.get("/api/admin/collecte/objectives", headers=admin), "objectifs").json()
    check(o["target"] == 100 and o["minimum"] == 60, "objectif 100 volontaires, minimum 60")

    print()
    if FAILS:
        print(f"{len(FAILS)} ECHEC(S)")
        for x in FAILS:
            print("  -", x)
        sys.exit(1)
    print("Tous les controles passent.")


if __name__ == "__main__":
    main()
