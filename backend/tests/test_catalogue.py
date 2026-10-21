"""
Filtres du catalogue (GET /api/models) : favoris, tri par popularite,
categorie et recherche, seuls ou combines, sur une base SQLite jetable.

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_catalogue
"""

import os
import sys
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-catalogue-test-")
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
from app.models import GarmentModel  # noqa: E402
from app.models.catalog import Category  # noqa: E402

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
        robes = Category(name="Robes", gender="female")
        hauts = Category(name="Haut", gender="male")
        db.add_all([robes, hauts])
        db.flush()
        # Crees du plus ancien au plus recent.
        kaba = GarmentModel(category_id=robes.id, name="Robe kaba", status="published", style_tags=["wax"])
        sirene = GarmentModel(category_id=robes.id, name="Robe sirene", status="published")
        chemise = GarmentModel(category_id=hauts.id, name="Chemise brodee", status="published")
        for m in (kaba, sirene, chemise):
            db.add(m)
            db.flush()
        ids = {"robes": robes.id, "kaba": kaba.id, "sirene": sirene.id, "chemise": chemise.id}
        db.commit()
        return ids


def register(phone: str) -> dict:
    r = ok(client.post("/api/auth/register", json={
        "role": "client", "phone": phone, "full_name": "Cliente", "password": "abc123",
    }), f"inscription {phone}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def names(params: str, headers: dict, label: str) -> list[str]:
    r = ok(client.get(f"/api/models?{params}", headers=headers), label)
    return [m["name"] for m in r.json()] if r.status_code == 200 else []


def main() -> None:
    ids = seed()
    a = register("+237633333331")
    b = register("+237633333332")

    print("\n== Coeurs : A aime kaba et sirene, B aime sirene")
    for h, model in ((a, "kaba"), (a, "sirene"), (b, "sirene")):
        ok(client.post(f"/api/models/{ids[model]}/like", headers=h), f"like {model}")

    print("\n== Tri et favoris")
    check(names("sort=popular", a, "plus aimes") == ["Robe sirene", "Robe kaba", "Chemise brodee"],
          "plus aimes : sirene (2), kaba (1), chemise (0)")
    check(set(names("liked_only=true", a, "enregistres")) == {"Robe kaba", "Robe sirene"}, "enregistres de A")
    check(names("liked_only=true&sort=popular", a, "enregistres + plus aimes") == ["Robe sirene", "Robe kaba"],
          "enregistres + plus aimes, dans l'ordre")
    check(names("liked_only=true&sort=popular", b, "enregistres de B + plus aimes") == ["Robe sirene"],
          "enregistres de B seulement")
    check(names("liked_only=true", {}, "enregistres sans compte") == [], "enregistres sans compte : vide")

    print("\n== Categorie et recherche")
    check(set(names(f"category_id={ids['robes']}&liked_only=true&sort=popular", a, "categorie + enregistres + plus aimes"))
          == {"Robe kaba", "Robe sirene"}, "trois filtres combines")
    check(names("q=chemise", a, "recherche par nom") == ["Chemise brodee"], "recherche par nom")
    check(names("q=wax", a, "recherche par etiquette") == ["Robe kaba"], "recherche par etiquette de style")

    liked = {m["name"]: m["liked_by_me"] for m in client.get("/api/models", headers=a).json()}
    check(liked == {"Robe kaba": True, "Robe sirene": True, "Chemise brodee": False}, "liked_by_me exact")

    print(f"\n{len(FAILS)} echec(s)")
    for f_ in FAILS:
        print("  -", f_)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
