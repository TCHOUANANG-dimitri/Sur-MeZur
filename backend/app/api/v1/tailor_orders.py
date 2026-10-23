"""
Commandes plateforme vues du cote tailleur (4.4).

CE QUE C'EST. Quand un client passe une commande sur la plateforme, le
tailleur doit pouvoir le joindre : appeler, ecrire sur WhatsApp, le mettre
dans son carnet. La commande elle-meme est exposee par les routes `/orders`
(communes au client et au tailleur) ; ce module ajoute ce qui n'a de sens que
du point de vue de l'atelier : les coordonnees du client, ses mesures, et le
rangement de la commande dans le carnet.

CE QUE CES ROUTES NE DOIVENT PAS DEVOILER. Le telephone du client n'est
renvoyé qu'au tailleur de CETTE commande, et jamais dans la sortie publique
d'un profil. Un tailleur ne voit pas les commandes des autres.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.catalog import GarmentModel
from app.models.measurements import Measurement
from app.models.orders import Order
from app.models.tailor_tools import TailorClient, TailorClientMeasurement
from app.models.users import ClientProfile, TailorProfile, User
from app.services.phone import normalize_phone

router = APIRouter(
    prefix="/tailor/orders",
    tags=["tailor-orders"],
    dependencies=[Depends(require_roles("tailor"))],
)

# Les 12 clefs de couture : ce qu'un tailleur releve au metre ruban. Les
# grandeurs intermediaires de la vision ne sont pas recopiees dans le carnet.
MEASURE_KEYS = (
    "neck", "chest", "waist", "hips", "biceps", "thigh",
    "wrist", "ankle", "shoulder", "sleeve_length", "inseam", "back_length",
)


def _tailor(user: User, db: Session) -> TailorProfile:
    tp = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if not tp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profil tailleur introuvable")
    return tp


def _owned_order(tailor_id: str, order_id: str, db: Session) -> Order:
    order = db.get(Order, order_id)
    if not order or order.tailor_id != tailor_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Commande introuvable")
    return order


def _client_and_user(order: Order, db: Session) -> tuple[ClientProfile | None, User | None]:
    client = db.get(ClientProfile, order.client_id) if order.client_id else None
    owner = db.get(User, client.user_id) if client else None
    return client, owner


@router.get("/{order_id}/client")
def order_client(
    order_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Coordonnees du client et mesures qu'il a envoyees avec la commande.

    Reserve au tailleur de la commande : c'est lui qui doit pouvoir rappeler
    son client et coudre.
    """
    tp = _tailor(user, db)
    order = _owned_order(tp.id, order_id, db)
    client, owner = _client_and_user(order, db)
    measurement = db.get(Measurement, order.measurement_id) if order.measurement_id else None
    model = db.get(GarmentModel, order.garment_model_id) if order.garment_model_id else None
    phone = (owner.phone or "").strip() if owner else ""
    return {
        "client_id": owner.id if owner else None,
        "name": (owner.full_name if owner else "") or "Client",
        "phone": phone if phone and not phone.startswith("guest-") else None,
        "city": owner.city if owner else None,
        "measurement": {
            "id": measurement.id if measurement else None,
            "data": measurement.data if measurement else {},
            "height_cm": measurement.height_cm if measurement else None,
            "weight_kg": measurement.weight_kg if measurement else None,
            "gender": measurement.gender if measurement else None,
            "source": measurement.source if measurement else None,
            "created_at": measurement.created_at.isoformat() if measurement and measurement.created_at else None,
        } if measurement else None,
        "model": {
            "id": model.id,
            "name": model.name,
            "photo_url": model.photo_url,
        } if model else None,
        "order": {
            "id": order.id,
            "status": order.status.value if hasattr(order.status, "value") else order.status,
            "client_notes": order.client_notes,
            "desired_date": order.desired_date.isoformat() if order.desired_date else None,
            "budget_amount": float(order.budget_amount) if order.budget_amount is not None else None,
            "agreed_price": float(order.agreed_price) if order.agreed_price is not None else None,
            "reception_mode": order.reception_mode.value if hasattr(order.reception_mode, "value") else order.reception_mode,
        },
    }


@router.post("/{order_id}/notebook")
def add_order_to_notebook(
    order_id: str,
    user: User = Depends(require_roles("tailor")),
    db: Session = Depends(get_db),
):
    """Met le client de la commande dans le carnet de l'atelier.

    Idempotent : un client deja rattache (meme compte Sur-MeZur) n'est pas
    duplique, et ses mesures sont mises a jour plutot que doublées.
    """
    tp = _tailor(user, db)
    order = _owned_order(tp.id, order_id, db)
    client, owner = _client_and_user(order, db)
    if not client or not owner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client introuvable")

    carnet = (
        db.query(TailorClient)
        .filter(TailorClient.tailor_id == tp.id, TailorClient.linked_user_id == owner.id)
        .first()
    )
    cree = False
    if not carnet:
        carnet = TailorClient(
            tailor_id=tp.id,
            full_name=owner.full_name or "Client",
            phone=normalize_phone(owner.phone) if owner.phone else None,
            linked_user_id=owner.id,
            is_active=True,
        )
        db.add(carnet)
        db.flush()
        cree = True

    # Les mesures envoyees avec la commande sont reprises dans le carnet :
    # le tailleur les retrouve sans les ressaisir.
    copie = False
    measurement = db.get(Measurement, order.measurement_id) if order.measurement_id else None
    if measurement and isinstance(measurement.data, dict):
        data = {
            k: float(v)
            for k, v in measurement.data.items()
            if k in MEASURE_KEYS and isinstance(v, (int, float))
        }
        if data:
            deja = (
                db.query(TailorClientMeasurement)
                .filter(
                    TailorClientMeasurement.tailor_client_id == carnet.id,
                    TailorClientMeasurement.measurement_id == measurement.id,
                )
                .first()
            )
            if not deja:
                db.add(
                    TailorClientMeasurement(
                        tailor_client_id=carnet.id,
                        measurement_id=measurement.id,
                        data=data,
                        source="photo" if measurement.source == "ai" else "manual",
                        height_cm=measurement.height_cm,
                        weight_kg=measurement.weight_kg,
                        note="Reprise de la commande Sur-MeZur",
                    )
                )
                copie = True
    db.commit()
    db.refresh(carnet)
    return {
        "client_id": carnet.id,
        "created": cree,
        "measurement_copied": copie,
        "name": carnet.full_name,
    }
