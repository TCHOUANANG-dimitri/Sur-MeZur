"""
Tests du moteur de patrons « garmentcode-v1 » : catalogue, mesures, chaque
modele de base, mise a plat (pli, paires, manche, pinces), cotes, exports,
puis l'API de l'espace tailleur (mode « on »).

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_patrons
"""

import json
import os
import sys
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-patrons-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["DATASET_DIR"] = f"{_TMP}/dataset"
os.environ["AVATAR_OUTPUT_DIR"] = f"{_TMP}/avatars"
os.environ["VISION_ENABLED"] = "false"
os.environ["SURMEZUR_ALLOW_LOCALHOST"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.db.base import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.services import patrons  # noqa: E402
from app.services.pattern_engine import GARMENT_TYPES  # noqa: E402
from app.services.patrons import catalogue as cat  # noqa: E402
from app.services.patrons.corps import corps_garmentcode  # noqa: E402
from app.services.patrons.export import points_tracage  # noqa: E402
from app.services.platform_settings import invalidate, set_setting  # noqa: E402

client = TestClient(app)
FAILS: list[str] = []

FEMME = {"height": 165, "chest": 96, "waist": 78, "hips": 106, "back_length": 40, "shoulder": 37,
         "sleeve_length": 58, "waist_hip_height": 20, "neck": 35, "thigh": 60}
HOMME = {"height": 178, "chest": 102, "waist": 88, "hips": 102, "back_length": 44, "shoulder": 42,
         "sleeve_length": 62, "neck": 40, "thigh": 58, "inseam": 80, "outseam": 104}


def check(cond: bool, label: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + label)
    if not cond:
        FAILS.append(label)


def ok(resp, label: str, code: int = 200):
    good = resp.status_code == code
    check(good, f"{label} -> {resp.status_code}" + ("" if good else f" {resp.text[:300]}"))
    return resp


def leve(f, exc) -> str | None:
    try:
        f()
    except exc as e:
        return str(e)
    return None


def moteur() -> None:
    print("\n== Catalogue")
    check({c["id"] for c in cat.CATEGORIES} == set(GARMENT_TYPES), "categories = types de l'API")
    check(all(b.categorie in cat.CATEGORIES_PAR_ID for b in cat.BASES), "chaque base a une categorie connue")
    check(set(cat.CATEGORIE_PAR_VISION) == {"skirt", "dress", "kaba", "boubou", "agbada", "kaftan_tunic",
                                            "shirt", "top", "trousers"}, "identifiants du modele de vision")
    check(all(cat.BASE_PAR_DEFAUT[k] in cat.BASES_PAR_ID for k in cat.BASE_PAR_DEFAUT), "bases par defaut valides")

    print("\n== Mesures -> corps GarmentCode")
    gc, prov = corps_garmentcode({"chest": 96, "waist": 78, "hips": 106, "height_total": 165}, "femme")
    check(len([k for k in gc if not k.startswith("_")]) == 26, "26 mesures GarmentCode")
    check(gc["bust"] == 96 and prov["bust"] == "mesuree", "poitrine mesuree")
    check(gc["height"] == 165, "alias height_total")
    check(prov["back_width"] == "estimee" and 40 < gc["back_width"] < 50, "largeur de dos estimee a l'echelle")
    gc2, prov2 = corps_garmentcode({"waist": 88, "height": 178, "inseam": 80}, "homme")
    check(prov2["crotch_hip_diff"] == "deduite", "fourche deduite de l'entrejambe")
    check(leve(lambda: patrons.generer("jupe_droite", {"hips": 100}), patrons.PatronImpossible) is not None,
          "tour de taille obligatoire")
    msg = leve(lambda: patrons.generer("jupe_droite", {"waist": 900}), patrons.PatronImpossible) or ""
    check("hors limites" in msg, "mesure aberrante refusee")
    check(leve(lambda: patrons.generer("inconnu", FEMME), patrons.PatronImpossible) is not None, "base inconnue")
    check(leve(lambda: patrons.generer("robe_droite", FEMME, {"manches": "volantes"}), patrons.PatronImpossible)
          is not None, "choix de style invalide")

    print("\n== Chaque modele de base")
    resultats = {}
    for b in cat.BASES:
        try:
            p = patrons.generer(b.id, HOMME if b.genre == "homme" else FEMME)
        except Exception as e:  # noqa: BLE001
            check(False, f"{b.id} : {type(e).__name__} {e}")
            continue
        resultats[b.id] = p
        echecs = [c for c in p.controles if c["statut"] in ("echec", "a_verifier")]
        check(p.pieces and not echecs, f"{b.id} : {len(p.pieces)} pieces, controles ok"
              + ("" if not echecs else f" {echecs}"))

    print("\n== Mise a plat")
    jupe = resultats["jupe_droite"]
    noms = {x.nom: x for x in jupe.pieces}
    check({"Jupe devant", "Jupe dos", "Ceinture devant", "Ceinture dos"} <= set(noms), "pieces de la jupe")
    check(noms["Jupe devant"].consigne == "Couper 1 au pli", "jupe devant au pli")
    check(sum(1 for pc in noms["Jupe dos"].pinces if pc["type"] == "pince") == 2, "deux pinces dos (demi-piece)")
    check(any(txt == "ligne des hanches" for _, txt in noms["Jupe devant"].reperes), "ligne des hanches")
    tour = next(c for c in jupe.controles if c["controle"] == "tour de taille")
    check(tour["statut"] == "ok" and "79 cm" in tour["detail"], "ceinture = taille + aisance (78 + 1)")
    pantalon = {x.nom: x for x in resultats["pantalon_droit"].pieces}
    check(pantalon["Pantalon devant"].quantite == 2 and "au pli" not in pantalon["Pantalon devant"].consigne,
          "jambes de pantalon par paire, pas au pli")
    robe = {x.nom: x for x in resultats["robe_droite"].pieces}
    manche = robe["Manche"]
    check(manche.quantite == 2 and any("droit-fil" in t for _, t in manche.reperes), "manche en une piece")
    haut_manche = max(manche.anneau()[:, 1])
    tete = [a for a in manche.aretes if a.courbe]
    check(tete and all(a.pts[:, 1].mean() > 0.6 * haut_manche for a in tete), "tete de manche en haut")
    check(robe["Devant"].consigne == "Couper 1 au pli", "devant de robe au pli")
    lettres = [c["lettre"] for c in resultats["robe_droite"].coutures]
    check(len(lettres) == len(set(lettres)) and len(lettres) >= 6, "coutures lettrees sans doublon")
    taille = next(c for c in resultats["robe_evasee"].controles if c["controle"] == "couture de taille")
    check(taille["statut"] == "ok", "couture de taille : haut et bas de meme tour")

    print("\n== Cotes et points de tracage")
    fiche = jupe.fiche()
    pdev = next(x for x in fiche["pieces"] if x["nom"] == "Jupe devant")
    check(pdev["largeur_cm"] > 20 and pdev["hauteur_cm"] > 55, "largeur et hauteur de piece")
    check(any(b["pli"] for b in pdev["bords"]) and all(b["longueur_cm"] > 0 for b in pdev["bords"]), "longueurs de bords")
    pts = points_tracage(noms["Jupe devant"])
    check(min(p["x"] for p in pts) == 0 and min(p["y"] for p in pts) == 0, "points depuis le coin O")
    check(any(p["sorte"] == "courbe" for p in pts) and any(p["sorte"].startswith("pointe") for p in pts),
          "points de courbe et pointes de pince")
    check(fiche["corps_garmentcode"]["bust"]["provenance"] == "mesuree", "provenance dans la fiche")
    json.dumps(fiche)  # serialisable

    print("\n== Exports")
    f = patrons.fichiers(jupe)
    check(set(f) == {"svg", "a4.pdf", "plein.pdf", "tracage.pdf"}, "quatre fichiers")
    svg = f["svg"].decode()
    check('width="' in svg and "mm" in svg and "CARRÉ TEST" in svg and "PLIURE" in svg, "svg 1:1 avec carre test")
    check("largeur" in svg and "ligne des hanches" in svg, "svg cote")
    check(all(f[k][:5] == b"%PDF-" for k in ("a4.pdf", "plein.pdf", "tracage.pdf")), "pdf valides")
    check(f["a4.pdf"].count(b"/Type /Page\n") + f["a4.pdf"].count(b"/Type /Page ") >= 3 or len(f["a4.pdf"]) > 20000,
          "pdf A4 en plusieurs pages")


def api() -> None:
    print("\n== API (mode on)")
    reg = ok(client.post("/api/auth/register", json={
        "role": "tailor", "phone": "+237655000111", "full_name": "Tailleur Patron",
        "password": "abcd12", "city": "Douala", "quartier": "Akwa", "shop_name": "Atelier Patron",
    }), "inscription tailleur")
    TH = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    cat_api = ok(client.get("/api/tailor/patterns/catalogue", headers=TH), "catalogue").json()
    check(cat_api["mode"] == "preview" and len(cat_api["categories"]) == 9, "catalogue en mode apercu")
    ok(client.post("/api/tailor/patterns", data={"garment_type": "jupe", "measurements": json.dumps(FEMME)},
                   headers=TH), "apercu sans image refuse", 400)

    invalidate()
    with SessionLocal() as db:
        set_setting(db, "features", {"pattern_generation": "on"}, None)
        db.commit()
    invalidate()
    check(ok(client.get("/api/tailor/patterns/catalogue", headers=TH), "catalogue").json()["mode"] == "on", "mode on")
    ok(client.post("/api/tailor/patterns", data={"garment_type": "jupe", "base": "kaba_simple",
                                                 "measurements": json.dumps(FEMME)}, headers=TH),
       "base d'une autre categorie refusee", 400)
    ok(client.post("/api/tailor/patterns", data={"garment_type": "jupe", "style": "{pas du json",
                                                 "measurements": json.dumps(FEMME)}, headers=TH),
       "style invalide refuse", 400)
    p = ok(client.post("/api/tailor/patterns", data={
        "garment_type": "jupe", "base": "jupe_evasee", "style": json.dumps({"longueur_cm": 70, "ampleur": "forte"}),
        "measurements": json.dumps(FEMME),
    }, headers=TH), "demande garmentcode sans image", 201).json()
    check(p["engine"] == "garmentcode-v1", "moteur garmentcode")
    p = ok(client.get(f"/api/tailor/patterns/{p['id']}", headers=TH), "patron lu").json()
    check(p["status"] == "ready" and p["result"]["base"]["id"] == "jupe_evasee", "patron pret")
    check(p["result"]["style"]["longueur_cm"] == 70 and p["result"]["demande"]["style"]["ampleur"] == "forte",
          "style applique")
    check(set(p["pdf_urls"]) == {"tracage", "a4", "plein"}, "liens pdf")
    for k, url in p["pdf_urls"].items():
        r = ok(client.get(url, headers=TH), f"pdf {k}")
        check(r.content[:5] == b"%PDF-" and r.headers["content-type"] == "application/pdf", f"pdf {k} valide")
    ok(client.get(f"/api/tailor/patterns/{p['id']}/pdf?type=autre", headers=TH), "type pdf inconnu", 400)
    check("PLIURE" in ok(client.get(p["svg_url"], headers=TH), "svg").text, "svg du vrai patron")

    # Client du carnet (homme) : genre repris de la fiche.
    c = ok(client.post("/api/tailor/clients", json={"full_name": "Paul Eto", "gender": "male"}, headers=TH),
           "client", 201).json()
    ok(client.post(f"/api/tailor/clients/{c['id']}/measurements", json={
        "data": {"chest": 102, "waist": 88, "hips": 102, "inseam": 80, "thigh": 58}, "height_cm": 178,
    }, headers=TH), "mesures client", 201)
    p2 = ok(client.post("/api/tailor/patterns", data={"garment_type": "pantalon", "tailor_client_id": c["id"]},
                        headers=TH), "pantalon du carnet", 201).json()
    p2 = ok(client.get(f"/api/tailor/patterns/{p2['id']}", headers=TH), "pantalon lu").json()
    check(p2["status"] == "ready" and p2["result"]["base"]["id"] == "pantalon_droit", "base par defaut")
    check(p2["result"]["corps_garmentcode"]["height"]["valeur"] == 178, "taille du carnet utilisee")

    # Categorie sans modele de base : l'apercu prend le relais.
    p3 = ok(client.post("/api/tailor/patterns", files={"image": ("r.png", b"\x89PNG\r\n\x1a\n" + b"\0" * 64, "image/png")},
                        data={"garment_type": "boubou", "measurements": json.dumps({"chest": 100})}, headers=TH),
            "boubou", 201).json()
    check(p3["engine"] == "preview-v0", "boubou en apercu")

    # Mesure aberrante : echec avec un message lisible.
    p4 = ok(client.post("/api/tailor/patterns", data={"garment_type": "jupe",
                                                      "measurements": json.dumps({"waist": 290, "hips": 100})},
                        headers=TH), "mesure aberrante acceptee a la saisie", 201).json()
    p4 = ok(client.get(f"/api/tailor/patterns/{p4['id']}", headers=TH), "patron en echec").json()
    check(p4["status"] == "failed" and "hors limites" in (p4["error_message"] or ""), "message d'echec lisible")

    ok(client.delete(f"/api/tailor/patterns/{p['id']}", headers=TH), "suppression", 204)
    store = Path(os.environ["UPLOAD_DIR"]).resolve().parent / "tailor_store" / "patterns"
    check(not list(store.glob(f"{p['id']}*")), "fichiers supprimes")


def main() -> None:
    moteur()
    api()
    print(f"\n{len(FAILS)} echec(s)")
    for f_ in FAILS:
        print("  -", f_)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
