"""Seed data for local development / manual testing.

Run with:  python -m app.seed   (from the backend/ directory, venv active)
"""

from app.core.security import hash_password
from app.db.base import Base, SessionLocal, engine
from app.models.catalog import Accessory, Fabric, GarmentModel, ReadyToWear
from app.models.enums import (
    GarmentCategory,
    Language,
    MeasurementMethod,
    TailorType,
    UserRole,
    VerificationStatus,
)
from app.models.users import ClientProfile, TailorProfile, User
from app.services.commission import seed_commission_tiers

DOUALA_LAT, DOUALA_LNG = 4.0511, 9.7679


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

        # --- Demo accounts -------------------------------------------------
        client_user = get_or_create_user(db, "+237600000001", UserRole.client, "Awa Client")
        if not db.query(ClientProfile).filter(ClientProfile.user_id == client_user.id).first():
            db.add(ClientProfile(user_id=client_user.id))

        tailor_user = get_or_create_user(db, "+237600000002", UserRole.tailor, "Chez Fatou Couture")
        tailor_profile = db.query(TailorProfile).filter(TailorProfile.user_id == tailor_user.id).first()
        if not tailor_profile:
            tailor_profile = TailorProfile(
                user_id=tailor_user.id,
                tailor_type=TailorType.atelier,
                shop_name="Chez Fatou Couture",
                bio="Atelier spécialisé prêt-à-porter et sur-mesure, Akwa, Douala.",
                lat=DOUALA_LAT,
                lng=DOUALA_LNG,
                city="Douala",
                verification_status=VerificationStatus.approved,
                rating_avg=4.6,
                completed_orders_count=12,
                avg_response_minutes=45,
            )
            db.add(tailor_profile)

        pending_tailor_user = get_or_create_user(
            db, "+237600000003", UserRole.tailor, "Atelier Ngozi (en attente)"
        )
        if not db.query(TailorProfile).filter(TailorProfile.user_id == pending_tailor_user.id).first():
            db.add(
                TailorProfile(
                    user_id=pending_tailor_user.id,
                    tailor_type=TailorType.individual,
                    shop_name="Atelier Ngozi",
                    bio="Nouveau sur la plateforme.",
                    lat=DOUALA_LAT + 0.05,
                    lng=DOUALA_LNG + 0.02,
                    city="Douala",
                    verification_status=VerificationStatus.pending,
                )
            )

        admin_user = get_or_create_user(db, "+237600000000", UserRole.admin, "Admin Sur-MeZur")

        db.commit()

        # --- Catalog ---------------------------------------------------------
        if db.query(GarmentModel).count() == 0:
            models = [
                ("Chemise ajustée", GarmentCategory.top, "#7C3AED", ["classique", "bureau"]),
                ("Robe fourreau", GarmentCategory.dress, "#5B21B6", ["soirée", "élégant"]),
                ("Pantalon tailleur", GarmentCategory.bottom, "#1F2A44", ["classique"]),
                ("Boubou brodé", GarmentCategory.traditional, "#D97706", ["traditionnel", "cérémonie"]),
                ("Kaba ngondo", GarmentCategory.traditional, "#16A34A", ["traditionnel"]),
            ]
            for name, category, color, tags in models:
                db.add(
                    GarmentModel(
                        category=category,
                        name=name,
                        description=f"Modèle {name.lower()}, personnalisable en tissu et accessoires.",
                        base_price=15000,
                        style_tags=tags,
                        thumbnail_color=color,
                        created_by=tailor_profile.id,
                    )
                )

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

        if db.query(ReadyToWear).filter(ReadyToWear.tailor_id == tailor_profile.id).count() == 0:
            db.add(
                ReadyToWear(
                    tailor_id=tailor_profile.id,
                    name="Chemise unisexe M",
                    description="Chemise prête-à-porter, coupe classique.",
                    price=12000,
                    item_measurements={"chest": 100, "waist": 88, "hips": 102, "shoulder": 45},
                    measurement_method=MeasurementMethod.standard,
                    in_stock=True,
                )
            )
        db.commit()

        print("Seed complete.")
        print("Demo client   : +237600000001 / password123")
        print("Demo tailor   : +237600000002 / password123 (verified)")
        print("Pending tailor: +237600000003 / password123 (pending verification)")
        print("Demo admin    : +237600000000 / password123")
    finally:
        db.close()


if __name__ == "__main__":
    run()
