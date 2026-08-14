"""
Suppression définitive d'un compte et de toutes ses données.

SQLite, tel que configuré dans ce projet, n'impose pas les contraintes de
clé étrangère (`PRAGMA foreign_keys` n'est jamais activé — voir db/base.py).
Un simple `db.delete(user)` supprimerait donc le compte sans erreur, mais
laisserait derrière lui des lignes orphelines dans une dizaine de tables
(commandes, mesures, avatars, messages...), invisibles jusqu'à ce qu'un
écran essaie de les afficher.

Ce module fait donc à la main ce qu'un `ON DELETE CASCADE` ferait : chaque
table dépendante est vidée dans l'ordre (des feuilles vers la racine) avant
de supprimer le compte lui-même. `User.client_profile` / `User.tailor_profile`
ont leur propre cascade ORM (`cascade="all, delete-orphan"`, voir
models/users.py) — inutile de les gérer ici, `db.delete(user)` s'en charge.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.api.v1.avatars import _avatar_file_path
from app.models.catalog import Fabric, GarmentModelLike, ReadyToWear
from app.models.measurements import Avatar, Measurement, MeasurementDataset, MeasurementSession, TryonSession
from app.models.misc import Delivery, Notification, Pattern, Review
from app.models.orders import ChatMessage, Modification, Offer, Order, Quote
from app.models.payments import Payment, PaymentSplit
from app.models.users import ClientProfile, TailorProfile, User, VerificationDocument
from app.services.storage import delete_upload


def _delete_order_cascade(db: Session, order: Order) -> None:
    """Vide tout ce qui référence CET ordre avant de le supprimer lui-même."""
    db.query(Payment).filter(Payment.order_id == order.id).delete(synchronize_session=False)
    db.query(PaymentSplit).filter(PaymentSplit.order_id == order.id).delete(synchronize_session=False)
    db.query(Pattern).filter(Pattern.order_id == order.id).delete(synchronize_session=False)
    db.query(Delivery).filter(Delivery.order_id == order.id).delete(synchronize_session=False)
    db.query(Review).filter(Review.order_id == order.id).delete(synchronize_session=False)
    db.query(Offer).filter(Offer.order_id == order.id).delete(synchronize_session=False)
    db.query(Quote).filter(Quote.order_id == order.id).delete(synchronize_session=False)
    db.query(ChatMessage).filter(ChatMessage.order_id == order.id).delete(synchronize_session=False)
    # Modification est référencée par ChatMessage.modification_id (nullable) :
    # les messages de cet ordre sont déjà partis, donc plus rien n'y pointe.
    db.query(Modification).filter(Modification.order_id == order.id).delete(synchronize_session=False)
    db.delete(order)


def delete_user_cascade(db: Session, user: User) -> None:
    """
    Supprime `user` et toutes les données qui lui appartiennent.

    Ne fait AUCUN commit — c'est à l'appelant de commit (ou rollback si une
    étape lève une exception, pour ne rien laisser à moitié supprimé).
    """
    # Commun aux deux rôles : notifications reçues, messages envoyés dans
    # n'importe quel ordre (une commande n'est pas forcément supprimée par
    # ce même appel — l'autre partie peut avoir un compte toujours actif).
    db.query(Notification).filter(Notification.user_id == user.id).delete(synchronize_session=False)
    db.query(ChatMessage).filter(ChatMessage.sender_id == user.id).delete(synchronize_session=False)

    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if client is not None:
        db.query(GarmentModelLike).filter(GarmentModelLike.client_id == client.id).delete(synchronize_session=False)

        avatars = db.query(Avatar).filter(Avatar.client_id == client.id).all()
        avatar_ids = [a.id for a in avatars]
        if avatar_ids:
            db.query(TryonSession).filter(TryonSession.avatar_id.in_(avatar_ids)).delete(synchronize_session=False)
        for avatar in avatars:
            if avatar.gltf_url and not avatar.gltf_url.startswith("mock-asset://"):
                _avatar_file_path(avatar.gltf_url).unlink(missing_ok=True)
            db.delete(avatar)

        # Les commandes du client d'abord : Order.measurement_id est une FK
        # non nullable vers measurements — il faut que plus aucune commande
        # ne pointe vers une mesure avant de supprimer les mesures elles-mêmes.
        for order in db.query(Order).filter(Order.client_id == client.id).all():
            _delete_order_cascade(db, order)

        sessions = db.query(MeasurementSession).filter(MeasurementSession.client_id == client.id).all()
        for session_row in sessions:
            delete_upload(session_row.front_photo_url)
            delete_upload(session_row.side_photo_url)
            db.delete(session_row)

        db.query(MeasurementDataset).filter(MeasurementDataset.client_id == client.id).delete(synchronize_session=False)
        # `default_measurement_id` empêcherait la suppression du profil tant
        # qu'il pointe vers une mesure : on le vide avant de purger les mesures.
        client.default_measurement_id = None
        db.flush()
        db.query(Measurement).filter(Measurement.client_id == client.id).delete(synchronize_session=False)

    tailor = db.query(TailorProfile).filter(TailorProfile.user_id == user.id).first()
    if tailor is not None:
        db.query(VerificationDocument).filter(VerificationDocument.user_id == user.id).delete(synchronize_session=False)

        for order in db.query(Order).filter(Order.tailor_id == tailor.id).all():
            _delete_order_cascade(db, order)

        for item in db.query(ReadyToWear).filter(ReadyToWear.tailor_id == tailor.id).all():
            for url in [item.photo_url, *(item.photos or [])]:
                delete_upload(url)
            db.delete(item)

        db.query(Fabric).filter(Fabric.owner_tailor_id == tailor.id).delete(synchronize_session=False)

        if tailor.atelier_photo_url:
            delete_upload(tailor.atelier_photo_url)

    db.flush()
    # Cascade ORM (`cascade="all, delete-orphan"`, voir models/users.py) :
    # supprime client_profile / tailor_profile restants automatiquement.
    db.delete(user)
