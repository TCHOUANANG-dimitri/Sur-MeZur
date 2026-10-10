"""
A4 — reprise de securite : controle de propriete des essayages (A4.1) et
fichiers prives hors du stockage public (A4.2).

Couvre concretement :
- GET /tryon/{id} : sans jeton -> 401, pour un autre client -> 404, pour le
  proprietaire -> 200 (avant A4.1 : aucune authentification requise) ;
- POST /tryon : un client ne peut pas utiliser l'avatar d'un autre compte ;
- /uploads/{measurement_photos,verification,debug}/* : refuses par le montage
  statique (403), le reste de /uploads reste public ;
- protected_path() : ne sort jamais du stock prive (traversal coupe) ;
- GET /measurements/session/{id}/photos/front : proprietaire seul ;
- GET /admin/verification-documents/{id} : equipe seule, fichiers hors
  /uploads.

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m tests.test_securite
"""

import os
import sys
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="smz-securite-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["PROTECTED_DIR"] = f"{_TMP}/protected"
os.environ["DATASET_DIR"] = f"{_TMP}/dataset"
os.environ["AVATAR_OUTPUT_DIR"] = f"{_TMP}/avatars"
os.environ["VISION_ENABLED"] = "false"
os.environ["SURMEZUR_ALLOW_LOCALHOST"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Avatar,
    ClientProfile,
    Measurement,
    MeasurementSession,
    TryonSession,
    User,
    VerificationDocument,
)
from app.services.storage import protected_path  # noqa: E402

client = TestClient(app)
FAILS: list[str] = []


def check(cond: bool, label: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + label)
    if not cond:
        FAILS.append(label)


def _login(phone: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": "abcd12"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _seed_client(phone: str) -> tuple[str, str]:
    """Cree un utilisateur client + sa fiche ; renvoie (user.id, profile.id)."""
    with SessionLocal() as db:
        user = User(role="client", phone=phone, full_name="Client seed", password_hash=hash_password("abcd12"))
        db.add(user)
        db.flush()
        profile = ClientProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        return user.id, profile.id


def _write_fake(rel: str, content: bytes) -> None:
    if rel.startswith("uploads/"):
        path = Path(settings.upload_dir) / rel[len("uploads/"):]
    else:
        path = Path(settings.protected_dir) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def test_tryon_idor() -> None:
    print("\n== A4.1 — essayage sous controle de propriete")
    owner_user, owner_profile = _seed_client("+237611110001")
    other_user, other_profile = _seed_client("+237611110002")
    with SessionLocal() as db:
        m1 = Measurement(client_id=owner_profile, source="ai", height_cm=170, data={"chest": 90.0})
        m2 = Measurement(client_id=other_profile, source="ai", height_cm=175, data={"chest": 95.0})
        db.add_all([m1, m2])
        db.flush()
        avatar_owner = Avatar(client_id=owner_profile, measurement_id=m1.id, skin_tone_hex="#C68863")
        avatar_other = Avatar(client_id=other_profile, measurement_id=m2.id, skin_tone_hex="#000000")
        db.add_all([avatar_owner, avatar_other])
        db.flush()
        t = TryonSession(avatar_id=avatar_owner.id, status="processing")
        db.add(t)
        db.commit()
        tryon_id, other_avatar_id = t.id, avatar_other.id

    owner_h = _login("+237611110001")
    other_h = _login("+237611110002")

    # Avant A4.1, cette route etait accessible sans aucun jeton.
    r = client.get(f"/api/tryon/{tryon_id}")
    check(r.status_code == 401, "GET /tryon/{id} anonyme -> 401 (etait 200)")
    r = client.get(f"/api/tryon/{tryon_id}", headers=other_h)
    check(r.status_code == 404, "GET /tryon/{id} par un autre client -> 404")
    r = client.get(f"/api/tryon/{tryon_id}", headers=owner_h)
    check(r.status_code == 200 and "status" in r.json(), "GET /tryon/{id} par le proprietaire -> 200")

    # Un client ne peut pas lancer un essayage avec l'avatar d'un autre.
    r = client.post("/api/tryon", json={"avatar_id": other_avatar_id}, headers=owner_h)
    check(r.status_code == 404, "POST /tryon avec l'avatar d'autrui -> 404")

    del owner_user, other_user, owner_profile, other_profile


def test_uploads_guarded() -> None:
    print("\n== A4.2 — montage statique : dossiers prives refuses")
    _write_fake("uploads/models/vetement.jpg", b"\xff\xd8public")
    _write_fake("uploads/verification/carte.jpg", b"\xff\xd8carte")
    _write_fake("uploads/measurement_photos/corps.jpg", b"\xff\xd8corps")

    r = client.get("/uploads/models/vetement.jpg")
    check(r.status_code == 200, "GET /uploads/models/vetement.jpg -> public, 200")
    r = client.get("/uploads/verification/carte.jpg")
    check(r.status_code == 403, "GET /uploads/verification/carte.jpg -> 403")
    r = client.get("/uploads/measurement_photos/corps.jpg")
    check(r.status_code == 403, "GET /uploads/measurement_photos/corps.jpg -> 403")
    r = client.get("/uploads/debug/x.jpg")
    check(r.status_code == 403, "GET /uploads/debug/x.jpg -> 403")


def test_protected_path() -> None:
    print("\n== A4.2 — protected_path : jamais hors du stock prive")
    u = protected_path("protected://measurement_photos/../../../../etc/passwd")
    check(u is not None and Path(u).name == "passwd", "traversal coupe aux nom de fichier")
    u = protected_path("protected://verification/../../x.jpg")
    check(u is not None and Path(u).name == "x.jpg", "verification -> basename seul")
    base = str(Path(settings.protected_dir).resolve())
    u = protected_path("protected://measurement_photos/ok.jpg")
    # os.path.join melange les separateurs quand le dossier vient de mkdtemp
    # (forward slashes sous Windows) : on compare des chemins normalises.
    check(u is not None and os.path.normpath(u).startswith(os.path.normpath(base)),
          "chemin sous le stock prive")
    check(protected_path("protected://misc/foo.jpg") is None, "dossier hors liste -> None")
    check(protected_path("/uploads/measurement_photos/legacy.jpg") is not None, "legacy /uploads convertible")
    check(protected_path("https://x/uploads/measurement_photos/name.jpg") is not None, "URL absolue legacy prise en compte")
    check(protected_path(None) is None, "url vide -> None")
    check(protected_path("/uploads/models/photo.jpg") is None, "dossier public -> None")


def test_session_photo_owner() -> None:
    print("\n== A4.2 — photo de session : le proprietaire seul")
    _, owner_profile = _seed_client("+237611110003")
    _, other_profile = _seed_client("+237611110004")
    _write_fake("measurement_photos/corps-a.jpg", b"\xff\xd8photo-session")
    with SessionLocal() as db:
        s = MeasurementSession(
            client_id=owner_profile, status="failed",
            front_photo_url="protected://measurement_photos/corps-a.jpg", platform="web",
        )
        db.add(s)
        db.commit()
        session_id = s.id

    owner_h = _login("+237611110003")
    other_h = _login("+237611110004")
    r = client.get(f"/api/measurements/session/{session_id}/photos/front")
    check(r.status_code == 401, "photo anonyme -> 401")
    r = client.get(f"/api/measurements/session/{session_id}/photos/front", headers=other_h)
    check(r.status_code == 404, "photo par un autre client -> 404")
    r = client.get(f"/api/measurements/session/{session_id}/photos/front", headers=owner_h)
    check(r.status_code == 200 and r.content == b"\xff\xd8photo-session", "photo par le proprietaire -> 200, octets exacts")
    r = client.get(f"/api/measurements/session/{session_id}/photos/autre", headers=owner_h)
    check(r.status_code == 400, "vue inconnue -> 400")


def test_verification_document_admin() -> None:
    print("\n== A4.2 — piece de verification : equipe seule")
    with SessionLocal() as db:
        existing = db.query(User).filter(User.phone == "+237611110099").first()
        if not existing:
            db.add(User(role="admin", phone="+237611110099", full_name="Admin ref",
                        password_hash=hash_password("abcd12")))
            db.commit()
    admin = _login("+237611110099")
    _write_fake("verification/carte-b.jpg", b"\xff\xd8carte-b")
    with SessionLocal() as db:
        admin_user = db.query(User).filter(User.phone == "+237611110099").first()
        d = VerificationDocument(
            user_id=admin_user.id, type="id_card",
            file_url="protected://verification/carte-b.jpg",
        )
        db.add(d)
        db.commit()
        doc_id = d.id

    _seed_client("+237611110005")
    other_h = _login("+237611110005")
    r = client.get(f"/api/admin/verification-documents/{doc_id}")
    check(r.status_code == 401, "piece anonyme -> 401")
    r = client.get(f"/api/admin/verification-documents/{doc_id}", headers=other_h)
    check(r.status_code in (401, 403), "piece par un client -> refuse")
    r = client.get(f"/api/admin/verification-documents/{doc_id}", headers=admin)
    check(r.status_code == 200 and r.content == b"\xff\xd8carte-b", "piece par l'equipe -> 200, octets exacts")
    r = client.get("/api/admin/verification-documents/absent", headers=admin)
    check(r.status_code == 404, "piece inconnue -> 404")


def main() -> None:
    print("\n" + "=" * 60)
    print("  REPRISE DE SECURITE (A4)")
    print("=" * 60)
    for fn in (test_tryon_idor, test_uploads_guarded, test_protected_path,
               test_session_photo_owner, test_verification_document_admin):
        try:
            fn()
        except Exception:
            import traceback
            traceback.print_exc()
            FAILS.append(fn.__name__)
    print("\n" + "=" * 60)
    if FAILS:
        print(f"{len(FAILS)} echec(s) : {', '.join(FAILS)}")
    else:
        print("0 echec(s)")
    print("=" * 60)


if __name__ == "__main__":
    main()