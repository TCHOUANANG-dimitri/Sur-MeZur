"""Seed data for local development / manual testing.

Run with:  python -m app.seed   (from the backend/ directory, venv active)

Seul le compte administrateur est créé ici. Il n'existe plus aucun compte
tailleur/client de démonstration : clients et tailleurs s'inscrivent depuis
l'app. Conséquence directe — `GarmentModel.created_by` et
`ReadyToWear.tailor_id` exigent un tailleur propriétaire (le second via une
vraie contrainte FK) : sans tailleur démo, ces deux tables restent vides
jusqu'à ce qu'un vrai tailleur s'inscrive et publie ses modèles. Tissus et
accessoires n'ont pas ce besoin (pas de colonne propriétaire obligatoire) et
restent seedés pour peupler le catalogue dès l'installation.
"""

from app.core.security import hash_password
from app.db.base import Base, SessionLocal, engine
from app.models.catalog import Accessory, Fabric
from app.models.enums import GarmentCategory, Language, UserRole
from app.models.users import User
from app.services.commission import seed_commission_tiers

# Numéro du compte administrateur de la plateforme.
ADMIN_PHONE = "+237696982953"
ADMIN_PASSWORD = "dimi11"


def get_or_create_user(db, phone, role, full_name, password="password123"):
    user = db.query(User).filter(User.phone == phone).first()
    if user:
        return user
    user = User(
        role=role,
        phone=phone,
        password_hash=hash_password(password),
        full_name=full_name,
        language=Language.fr,
        photo_consent=True,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_commission_tiers(db)

        # --- Compte administrateur -----------------------------------------
        # `get_or_create_user` ne touche jamais un compte deja existant (meme
        # role, meme mot de passe) : si quelqu'un s'est deja inscrit avec ce
        # numero comme client/tailleur avant que ce script tourne, l'admin
        # n'etait jamais reellement cree -- sans la moindre erreur (vecu le
        # 26/08/2026 en production : connexion "reussie" mais role=client).
        # On corrige donc explicitement l'ecart de role ici, au lieu de le
        # laisser passer silencieusement.
        admin = get_or_create_user(db, ADMIN_PHONE, UserRole.admin, "Admin Sur-MeZur", password=ADMIN_PASSWORD)
        if admin.role != UserRole.admin:
            print(
                f"ATTENTION : {ADMIN_PHONE} existait deja avec le role "
                f"'{admin.role.value}' (compte cree avant ce seed) -- promu en admin."
            )
            admin.role = UserRole.admin
        db.commit()

        # --- Catalogue (sans propriétaire) ------------------------------------
        if db.query(Fabric).count() == 0:
            fabrics = [
                ("Wax vibrant", "wax", "#DC2626", True),
                ("Pagne indigo", "pagne", "#1F2A44", True),
                ("Bazin riche", "bazin", "#5B21B6", True),
                ("Uni ivoire", "uni", "#F4F2F8", False),
                ("Uni bordeaux", "uni", "#7C2D12", False),
            ]
            for name, ftype, color, local in fabrics:
                db.add(Fabric(name=name, type=ftype, color_hex=color, is_local=local))

        if db.query(Accessory).count() == 0:
            accessories = [
                ("Ceinture en cuir", 3000, [GarmentCategory.top, GarmentCategory.bottom]),
                ("Broderie col", 5000, [GarmentCategory.top, GarmentCategory.traditional]),
                ("Boutons dorés", 2000, [GarmentCategory.top, GarmentCategory.dress]),
            ]
            for name, price, categories in accessories:
                db.add(Accessory(name=name, price=price, compatible_categories=[c.value for c in categories]))

        db.commit()

        print("Seed complete.")
        print(f"Admin : {ADMIN_PHONE} / {ADMIN_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    run()