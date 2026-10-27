"""
Noms et descriptions du catalogue proposés d'après la photo (Qwen3-VL) :
fiche nettoyée, noms français et anglais accordés, doublons départagés, lot
(scripts/nommer_catalogue.py) qui reprend où il s'était arrêté, et routes
d'administration (relire, appliquer, ignorer, tout appliquer). Le modèle de
vision est remplacé par un faux serveur local ; les « photos » sont des
images de synthèse.

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_nommage_catalogue
"""

import io
import json
import os
import re
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-nommage-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["DATASET_DIR"] = f"{_TMP}/dataset"
os.environ["AVATAR_OUTPUT_DIR"] = f"{_TMP}/avatars"
os.environ["VISION_ENABLED"] = "false"
os.environ["SURMEZUR_ALLOW_LOCALHOST"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import GarmentModel, User  # noqa: E402
from app.models.catalog import Category  # noqa: E402
from app.services import catalogue_nommage as nommage  # noqa: E402

client = TestClient(app)
FAILS: list[str] = []

# Réponses types : la première avec les défauts connus du modèle (doublon,
# valeur hors liste, « none »), la seconde illisible pour tester l'échec.
KABA = {
    "category": "kaba", "length": "ankle", "silhouette": "tiered", "waist": "no_waist_shaping",
    "neckline": "round", "sleeves": "short", "sleeve_style": "puffed", "closure": "none_visible",
    "pockets": "none_visible", "construction_details": ["yoke", "tiers", "tiers", "invente"],
    "matching_pieces": ["head_wrap", "none"], "colors": ["purple", "purple", "rainbow"], "fabric": "wax_print",
}
REPONSES: list[str] = []


class FauxLlama(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        corps = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        schema = corps["response_format"]["json_schema"]["schema"]
        contenu = REPONSES.pop(0) if REPONSES else json.dumps(KABA)
        if "colors" not in schema["properties"]:
            contenu = "{}"
        rep = json.dumps({"choices": [{"message": {"role": "assistant", "content": contenu}}]})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(rep.encode())

    def log_message(self, *args):
        pass


def check(cond: bool, label: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + label)
    if not cond:
        FAILS.append(label)


def ok(resp, label: str, code: int = 200):
    good = resp.status_code == code
    check(good, f"{label} -> {resp.status_code}" + ("" if good else f" {resp.text[:300]}"))
    return resp


def photo_fichier(nom: str) -> str:
    """Écrit une image de synthèse sous UPLOAD_DIR, rend son adresse /uploads/..."""
    dossier = Path(settings.upload_dir) / "femme" / "kaba"
    dossier.mkdir(parents=True, exist_ok=True)
    im = Image.new("RGB", (600, 800), (93, 6, 204))
    out = io.BytesIO()
    im.save(out, "JPEG")
    (dossier / nom).write_bytes(out.getvalue())
    return f"/uploads/femme/kaba/{nom}"


def seed() -> list[str]:
    with SessionLocal() as db:
        db.add(User(role="admin", phone="+237600000000", full_name="Admin Test", password_hash=hash_password("abc123")))
        cat = Category(name="Kaba", gender="female")
        db.add(cat)
        db.flush()
        ids = []
        for i in range(1, 4):
            m = GarmentModel(category_id=cat.id, name=f"Kaba 000{i}", status="published", photo_url=photo_fichier(f"kaba-000{i}.jpg"))
            db.add(m)
            db.flush()
            ids.append(m.id)
        db.add(GarmentModel(category_id=cat.id, name="Kaba sans photo", status="published"))
        db.commit()
        return ids


def lancer_lot(*args: str) -> None:
    from scripts import nommer_catalogue

    ancien = sys.argv
    sys.argv = ["nommer_catalogue.py", *args]
    try:
        nommer_catalogue.main()
    finally:
        sys.argv = ancien


def main() -> None:
    serveur = HTTPServer(("127.0.0.1", 0), FauxLlama)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    settings.vl_url = f"http://127.0.0.1:{serveur.server_port}"

    print("\n== Fiche et vocabulaire (sans réseau)")
    fiche = nommage.nettoyer(KABA)
    check(fiche["construction_details"] == ["yoke", "tiers"], "doublon et valeur hors liste retirés")
    check(fiche["colors"] == ["purple"], "couleur en double et hors liste retirées")
    check(nommage.nettoyer({**KABA, "fabric": "soie"})["fabric"] == "unknown", "tissu hors liste -> unknown")
    fetes = {fr: en for fr, en in nommage.EVENEMENTS["fete"]}
    p = nommage.proposition("Kaba", "female", fiche, graine="m1")
    evt = p["name"].split(" ", 1)[1]
    check(p["occasion"] == "fete" and evt in fetes, f"kaba à étages = fête -> événement de fête : {p['name']}")
    check(p["name_en"] == f"{fetes[evt]} kaba", f"nom EN : {p['name_en']}")
    textes = nommage.OCCASIONS_TEXTES["fete"]
    check(any(fr in p["description"] for fr, _ in textes), f"occasion de fête dans la description : {p['description']}")
    check(any(en in p["description_en"] for _, en in textes), f"occasion en anglais : {p['description_en']}")
    check("wax" not in (p["name"] + p["description"] + p["name_en"] + p["description_en"]).lower(), "le wax n'est jamais nommé")
    check("empiècement" not in p["description"] and "yoke" not in p["description_en"], "pas de jargon de couture")
    check("À porter avec son foulard de tête assorti." in p["description"], "pièce assortie")
    check(p == {**nommage.proposition("Kaba", "female", fiche, graine="m1"), "date": p["date"]}, "même modèle -> même texte")

    simple = {**KABA, "silhouette": "loose", "construction_details": [], "sleeve_style": "plain", "matching_pieces": [],
              "colors": ["purple"]}
    quotidien = {fr for fr, _ in nommage.EVENEMENTS["quotidien"]}
    q = nommage.proposition("Kaba", "female", nommage.nettoyer(simple), graine="m2")
    check(q["occasion"] == "quotidien_f" and q["name"].split(" ", 1)[1] in quotidien,
          f"kaba simple = quotidien -> événement du quotidien : {q['name']} / {q['name_en']}")
    check(any(fr in q["description"] for fr, _ in nommage.OCCASIONS_TEXTES["quotidien_f"]), f"occasion du quotidien : {q['description']}")
    check("entre amis" not in q["description"], "quotidien au féminin (pas « entre amis »)")
    pris = {nommage.cle_nom(q["name"])}
    q2, _ = nommage.nommer("Kaba", "female", nommage.nettoyer(simple), pris, "m2")
    check(q2 != q["name"] and q2.split(" ", 1)[1] in quotidien, f"doublon : événement suivant ({q2})")
    pris = {nommage.cle_nom(f"Kaba {e}") for e in quotidien}
    q3, en3 = nommage.nommer("Kaba", "female", nommage.nettoyer(simple), pris, "m2")
    check(q3.endswith(" ample") and en3.endswith(" loose kaba"), f"tous pris : un trait s'ajoute ({q3} / {en3})")

    robe = {**KABA, "category": "dress", "silhouette": "fitted", "construction_details": ["side_slit"], "sleeve_style": "plain",
            "sleeves": "sleeveless", "colors": ["black"], "fabric": "satin", "matching_pieces": []}
    r = nommage.proposition("Robe De Soiree", "female", nommage.nettoyer(robe), graine="m5")
    check(r["occasion"] == "soiree" and r["name"].startswith("Robe de soirée "), f"robe de soirée : {r['name']}")
    check("En satin noir, sans manches, à la cheville :" in r["description"], f"concret : {r['description']}")
    check(not re.search(r"-le\b|\bOn le\b|\bil vous\b|\bcousu\b", r["description"]), f"accords au féminin (la, elle, cousue) : {r['description']}")
    # Variété : sur 30 modèles semblables, beaucoup de descriptions différentes.
    variantes = {nommage.decrire("Kaba", "female", fiche, "fr", f"v{k}") for k in range(30)}
    check(len(variantes) >= 20, f"tournures variées ({len(variantes)} descriptions différentes sur 30)")

    tunique = {**KABA, "category": "kaftan_tunic", "silhouette": "straight", "length": "knee",
               "neckline": "mandarin_collar", "sleeves": "long", "sleeve_style": "plain",
               "construction_details": ["embroidery"], "matching_pieces": ["trousers"], "colors": ["white"], "fabric": "bazin"}
    t = nommage.proposition("Vetement Traditionnel", "male", nommage.nettoyer(tunique), graine="m6")
    check(t["occasion"] == "ceremonie" and t["name"].startswith("Ensemble tunique et pantalon "), f"ensemble brodé : {t['name']}")
    check("mariages, les dots et les grandes cérémonies" in t["description"] and "En bazin blanc" in t["description"],
          f"cérémonie, bazin nommé : {t['description']}")
    jupe = nommage.proposition("Bas", "female", nommage.nettoyer({**robe, "category": "skirt", "silhouette": "flared",
                                                                  "construction_details": [], "colors": ["blue"],
                                                                  "fabric": "wax_print"}), graine="m7")
    bureau = dict(nommage.EVENEMENTS["bureau"])
    evt_j = jupe["name"].split(" ", 1)[1]
    check(jupe["occasion"] == "bureau" and evt_j in bureau and jupe["name_en"] == f"{bureau[evt_j]} skirt",
          f"jupe : {jupe['name']} / {jupe['name_en']}")
    multi = nommage.decrire("Haut", "male", nommage.nettoyer({**jupe["fiche"], "category": "shirt", "colors": ["multicolor"]}))
    check("Tout en couleurs" in multi, f"multicolore : {multi}")

    print("\n== Lot (faux serveur de vision)")
    ids = seed()
    lancer_lot("--essai")
    with SessionLocal() as db:
        check(all(db.get(GarmentModel, i).ai_status is None for i in ids), "--essai : rien d'enregistré")
    REPONSES.extend([json.dumps(KABA), "pas du json"])
    lancer_lot("--limite", "2")
    with SessionLocal() as db:
        etats = [db.get(GarmentModel, i).ai_status for i in ids]
        check(etats == ["proposed", "failed", None], f"proposé, échec, pas encore fait : {etats}")
        check(db.get(GarmentModel, ids[0]).name == "Kaba 0001", "rien n'est appliqué d'office")
    lancer_lot()
    with SessionLocal() as db:
        m3 = db.get(GarmentModel, ids[2])
        check(m3.ai_status == "proposed", "le lot reprend où il s'était arrêté")
        check(m3.ai_suggestion["name"] != db.get(GarmentModel, ids[0]).ai_suggestion["name"], "deux modèles, deux noms")
        check(db.get(GarmentModel, ids[1]).ai_status == "failed", "un échec n'est pas refait sans --refaire")

    print("\n== Administration")
    login = ok(client.post("/api/auth/login", json={"phone": "+237600000000", "password": "abc123"}), "connexion admin")
    H = {"Authorization": f"Bearer {login.json()['access_token']}"}
    lst = ok(client.get("/api/admin/models/ai-names", headers=H), "propositions").json()
    check(lst["counts"]["proposed"] == 2 and lst["counts"]["failed"] == 1 and lst["counts"]["not_analysed"] == 1,
          f"compteurs {lst['counts']}")
    check(lst["items"][0]["suggestion"]["name_en"], "proposition anglaise présente")
    ok(client.get("/api/admin/models/ai-names?status=failed", headers=H), "liste des échecs")
    ok(client.get("/api/admin/models/ai-names", headers={}), "sans connexion", 401)

    a = ok(client.post(f"/api/admin/models/{ids[0]}/ai-name/apply", headers=H,
                       json={"name": "Kaba Princesse", "description_en": "Corrected."}), "appliquer, avec correction").json()
    check(a["name"] == "Kaba Princesse" and a["ai_status"] == "applied", "nom corrigé appliqué")
    check(a["name_en"] == lst["items"][0]["suggestion"]["name_en"] and a["description_en"] == "Corrected.", "anglais : proposé + corrigé")
    ok(client.post(f"/api/admin/models/{ids[1]}/ai-name/apply", headers=H), "pas de proposition -> refus", 400)
    ok(client.post(f"/api/admin/models/{ids[2]}/ai-name/reject", headers=H), "ignorer")
    ok(client.post(f"/api/admin/models/{ids[2]}/ai-name/reject", headers=H), "ignorer deux fois -> refus", 400)
    with SessionLocal() as db:
        check(db.get(GarmentModel, ids[2]).name == "Kaba 0003", "ignoré : le nom ne change pas")
        db.get(GarmentModel, ids[2]).ai_status = "proposed"
        db.commit()
    tout = ok(client.post("/api/admin/models/ai-names/apply-all", headers=H), "tout appliquer").json()
    check(tout["applied"] == 1, "un seul en attente appliqué")

    pub = ok(client.get(f"/api/models/{ids[0]}"), "fiche publique").json()
    check(pub["name"] == "Kaba Princesse" and pub["name_en"] == a["name_en"], "catalogue : nom FR et EN")
    check(pub["description"] and pub["description_en"] == "Corrected.", "catalogue : descriptions FR et EN")
    row = ok(client.get("/api/admin/tables/models", headers=H), "tableau admin").json()
    check(any(r.get("name_en") for r in row["items"]), "tableau admin : nom anglais")

    print()
    if FAILS:
        print(f"{len(FAILS)} échec(s) :")
        for f in FAILS:
            print("  -", f)
        raise SystemExit(1)
    print("Tout est bon.")


if __name__ == "__main__":
    main()
