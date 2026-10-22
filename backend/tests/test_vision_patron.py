"""
Analyse de la photo d'un modele (fiche de style, Qwen3-VL) : requete au
serveur llama.cpp, nettoyage de la fiche, proposition pour le formulaire de
patron, routes de l'API. Le modele est remplace par un faux serveur local qui
rend une reponse type ; aucune vraie photo de personne n'est utilisee.

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_vision_patron
"""

import io
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-vision-test-")
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
from app.main import app  # noqa: E402
from app.services.patrons import vision  # noqa: E402

client = TestClient(app)
FAILS: list[str] = []

# Reponse type du modele pour un kaba a etages (avec les defauts connus :
# doublon, valeur hors liste, « none » dans une liste).
REPONSE_KABA = {
    "category": "kaba", "length": "ankle", "silhouette": "tiered", "waist": "no_waist_shaping",
    "neckline": "round", "sleeves": "short", "sleeve_style": "ruffled", "closure": "none_visible",
    "pockets": "patch_pockets_front", "construction_details": ["ruffles", "tiers", "ruffles", "invente"],
    "matching_pieces": ["head_wrap", "none", "head_wrap"],
}
RECU: list[dict] = []


class FauxLlama(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        corps = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        RECU.append({"path": self.path, "corps": corps})
        rep = json.dumps({"choices": [{"message": {"role": "assistant", "content": json.dumps(REPONSE_KABA)}}]})
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


def photo(cote: int = 2400) -> bytes:
    """Image de synthese (aplats de couleur), assez grande pour verifier la
    reduction avant envoi."""
    im = Image.new("RGB", (cote, int(cote * 1.33)), (230, 220, 200))
    for y in range(0, im.height, 40):
        for x in range(im.width // 3, 2 * im.width // 3):
            im.putpixel((x, y), (91, 33, 182))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=85)
    return out.getvalue()


def main() -> None:
    serveur = HTTPServer(("127.0.0.1", 0), FauxLlama)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{serveur.server_port}"

    print("\n== Nettoyage et proposition (sans reseau)")
    fiche = vision.nettoyer(REPONSE_KABA)
    check(fiche["construction_details"] == ["ruffles", "tiers"], "doublon et valeur hors liste retires")
    check(fiche["matching_pieces"] == ["head_wrap"], "« none » et doublon retires")
    check(vision.nettoyer({"category": "robe_africaine"})["category"] == "unknown", "categorie hors liste -> unknown")
    prop = vision.proposition(fiche)
    check(prop["categorie"] == "kaba" and prop["base"] == "kaba_etages", "kaba a etages -> base kaba_etages")
    check(prop["style"] == {"manches": "courtes", "encolure": "ronde", "etages": 2}, f"style propose {prop['style']}")
    check(prop["vu"]["length"] == "à la cheville", "longueur vue en francais")
    check([s["code"] for s in prop["suggestions"]] == ["ruffles", "tiers", "patch_pockets_front"],
          "details et poches en simples suggestions")
    jupe = vision.proposition(vision.nettoyer({**REPONSE_KABA, "category": "skirt", "silhouette": "flared"}))
    check(jupe["base"] == "jupe_cloche" and jupe["style"] == {"ampleur": "forte"}, "jupe evasee -> jupe cloche, ampleur forte")
    autre = vision.proposition(vision.nettoyer({**REPONSE_KABA, "category": "other"}))
    check(autre["categorie"] is None and autre["base"] is None, "autre vetement : rien de propose")
    check(set(vision.SCHEMA_V2["properties"]["category"]["enum"]) - {"other"}
          == set(vision.CATEGORIE_PAR_VISION), "categories du schema = catalogue")

    print("\n== Tailleur")
    reg = ok(client.post("/api/auth/register", json={
        "role": "tailor", "phone": "+237655001199", "full_name": "Atelier Test", "password": "abcd12",
    }), "inscription tailleur")
    H = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    print("\n== Service non configure")
    settings.vl_url = ""
    check(client.get("/api/tailor/patterns/catalogue", headers=H).json()["vision"] is False, "catalogue : vision non")
    ok(client.post("/api/tailor/patterns/analyse", files={"image": ("m.jpg", photo(400), "image/jpeg")}, headers=H),
       "analyse refusee sans service", 503)

    print("\n== Analyse avec le faux serveur")
    settings.vl_url = url
    check(client.get("/api/tailor/patterns/catalogue", headers=H).json()["vision"] is True, "catalogue : vision oui")
    ok(client.post("/api/tailor/patterns/analyse", files={"image": ("m.txt", b"pas une photo", "text/plain")},
                   headers=H), "fichier non image refuse", 400)
    a = ok(client.post("/api/tailor/patterns/analyse", files={"image": ("m.jpg", photo(), "image/jpeg")}, headers=H),
           "analyse lancee", 202).json()
    check(a["status"] == "processing", "statut initial")
    r = ok(client.get(f"/api/tailor/patterns/analyse/{a['id']}", headers=H), "lecture du resultat").json()
    check(r["status"] == "ready", "analyse terminee")
    check(r["proposition"]["base"] == "kaba_etages", "proposition renvoyee")
    req = RECU[-1]
    check(req["path"] == "/v1/chat/completions", "API compatible OpenAI de llama-server")
    corps = req["corps"]
    check(corps["response_format"]["json_schema"]["schema"] == vision.SCHEMA_V2, "reponse contrainte par schema_v2")
    check(corps["temperature"] == 0.1 and corps["max_tokens"] == 700, "reglages des essais")
    contenu = corps["messages"][0]["content"]
    check(contenu[1]["text"] == vision.CONSIGNE_V2, "consigne v2")
    import base64

    envoyee = Image.open(io.BytesIO(base64.b64decode(contenu[0]["image_url"]["url"].split(",", 1)[1])))
    check(max(envoyee.size) <= vision.COTE_MAX, f"image reduite avant envoi {envoyee.size}")

    print("\n== Acces reserve au tailleur")
    autre_t = client.post("/api/auth/register", json={
        "role": "tailor", "phone": "+237655001198", "full_name": "Autre", "password": "abcd12"}).json()
    ok(client.get(f"/api/tailor/patterns/analyse/{a['id']}",
                  headers={"Authorization": f"Bearer {autre_t['access_token']}"}), "autre tailleur refuse", 404)

    print("\n== Service injoignable")
    serveur.shutdown()
    settings.vl_url = "http://127.0.0.1:9"
    b = ok(client.post("/api/tailor/patterns/analyse", files={"image": ("m.jpg", photo(400), "image/jpeg")}, headers=H),
           "analyse lancee", 202).json()
    r = client.get(f"/api/tailor/patterns/analyse/{b['id']}", headers=H).json()
    check(r["status"] == "failed" and "injoignable" in (r["error_message"] or ""), f"echec propre : {r['error_message']}")

    print("\n== Fiche validee jointe a la demande de patron")
    from app.db.base import SessionLocal
    from app.services.platform_settings import get_setting, set_setting

    with SessionLocal() as db:
        set_setting(db, "features", {**(get_setting("features", db) or {}), "pattern_generation": "on"}, None)
        db.commit()
    fiche_validee = {"categorie": "kaba", "details": ["ruffles"], "source": "qwen3-vl-4b"}
    p = ok(client.post("/api/tailor/patterns", data={
        "garment_type": "kaba", "measurements": json.dumps({"chest": 96, "waist": 80, "hips": 104, "height": 165}),
        "fiche": json.dumps(fiche_validee),
    }, headers=H), "patron demande avec la fiche", 201).json()
    check(p["id"] is not None, "demande creee")
    ok(client.post("/api/tailor/patterns", data={"garment_type": "kaba", "measurements": "{}", "fiche": "pas du json"},
                   headers=H), "fiche illisible refusee", 400)

    print(f"\n{len(FAILS)} echec(s)")
    for f_ in FAILS:
        print("  -", f_)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
