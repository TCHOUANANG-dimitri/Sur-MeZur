import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.models.enums import JobStatus
from app.models.measurements import Avatar, Measurement, TryonSession
from app.models.users import ClientProfile, User
from app.schemas.measurements import AvatarCreateIn, AvatarOut
from app.services import avatar as avatar_service
from app.services.mock_ai import generate_avatar_reference

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/avatars", tags=["avatars"])


def _avatar_file_path(gltf_url: str) -> Path:
    """
    Résout un `gltf_url` en chemin disque sous `avatar_output_dir`.

    Prend le seul NOM DE FICHIER (`Path(...).name`), jamais le `gltf_url` tel
    quel : ça absorbe sans branchement le format hérité `/uploads/avatars/xxx.glb`
    des lignes créées avant que les avatars ne sortent du dossier public, en
    plus du format actuel qui ne stocke déjà qu'un nom de fichier.
    """
    return Path(settings.avatar_output_dir) / Path(gltf_url).name


def _cleanup_superseded_avatars(db: Session, client_id: str, measurement_id: str, keep_id: str) -> None:
    """
    Supprime les avatars devenus obsolètes pour la même mesure.

    Chaque appel à `create_avatar` crée une nouvelle ligne plutôt que de
    réutiliser l'existante (typiquement : le client change la teinte de peau
    et régénère) — sans nettoyage, chaque essai laisse un fichier GLB de
    ~600 Ko sur le disque, indéfiniment.
    On ne touche jamais un avatar référencé par une session d'essayage
    sauvegardée : le supprimer casserait l'affichage de cette session.
    """
    referenced = {
        row[0]
        for row in db.query(TryonSession.avatar_id)
        .filter(TryonSession.avatar_id.isnot(None))
        .all()
    }
    stale = (
        db.query(Avatar)
        .filter(
            Avatar.client_id == client_id,
            Avatar.measurement_id == measurement_id,
            Avatar.id != keep_id,
        )
        .all()
    )
    for old in stale:
        if old.id in referenced:
            continue
        if old.gltf_url and not old.gltf_url.startswith("mock-asset://"):
            try:
                _avatar_file_path(old.gltf_url).unlink(missing_ok=True)
            except OSError:
                logger.warning("Suppression du fichier avatar %s en échec", old.id)
        db.delete(old)


@router.get("/capabilities")
def capabilities():
    """Diagnostic : état du système d'avatar 3D."""
    return avatar_service.avatar_capabilities()


@router.post("", response_model=AvatarOut)
def create_avatar(
    payload: AvatarCreateIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    """
    Calcule les poids de morph targets et répond immédiatement — pas de
    `BackgroundTasks`.

    Contrairement à l'ancien pipeline (un subprocess Blender par client, sous
    `BackgroundTasks`), ce calcul est du Python pur de l'ordre de la
    milliseconde : le déporter en tâche de fond n'aurait plus aucun sens, et
    évite surtout le blocage a2wsgi qui touchait déjà la prise de mesure —
    voir DEPLOIEMENT.txt et main.py::_boot pour le détail de ce bug sous
    Passenger.
    """
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client profile not found")
    measurement = db.get(Measurement, payload.measurement_id)
    if not measurement or measurement.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Measurement not found")

    morphology = avatar_service.generate_avatar_morphology(measurement)

    avatar = Avatar(
        client_id=client.id,
        measurement_id=payload.measurement_id,
        skin_tone_hex=payload.skin_tone_hex,
        status=JobStatus.ready if morphology else JobStatus.processing,
    )
    if morphology:
        avatar.morph_weights = morphology
    else:
        # Mesure sans données exploitables (cas limite, ex. session corrompue) :
        # repli mock plutôt que de laisser l'avatar bloqué en "processing".
        logger.warning("Mesure %s sans données exploitables pour avatar — repli mock", payload.measurement_id)
        avatar.gltf_url = generate_avatar_reference(payload.measurement_id)
        avatar.status = JobStatus.ready

    db.add(avatar)
    if not client.skin_tone_hex:
        client.skin_tone_hex = payload.skin_tone_hex
    db.commit()
    db.refresh(avatar)

    _cleanup_superseded_avatars(db, avatar.client_id, avatar.measurement_id, avatar.id)
    db.commit()

    return avatar


def _require_avatar_owner(avatar_id: str, user: User, db: Session) -> Avatar:
    """
    Charge l'avatar et vérifie que `user` en est propriétaire.

    Centralisé pour `get_avatar` et `get_avatar_glb` : avant cette correction,
    seul le second appliquait ce contrôle — `GET /avatars/{id}` était
    accessible à n'importe quel compte authentifié, sans vérification de
    propriété.
    """
    avatar = db.get(Avatar, avatar_id)
    if not avatar:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Avatar not found")
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not avatar.client_id or avatar.client_id != (client.id if client else None):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your avatar")
    return avatar


@router.get("/{avatar_id}", response_model=AvatarOut)
def get_avatar(
    avatar_id: str,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    return _require_avatar_owner(avatar_id, user, db)


@router.get("/{avatar_id}/glb")
def get_avatar_glb(
    avatar_id: str,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    """
    Télécharge le fichier GLB de l'avatar.

    C'est la SEULE voie d'accès à ce fichier : `avatar_output_dir` n'est pas
    monté en statique (contrairement à `upload_dir`), donc le contrôle de
    propriété fait ici n'est plus contournable en devinant une URL directe —
    voir la note sur `avatar_output_dir` dans config.py.
    """
    avatar = _require_avatar_owner(avatar_id, user, db)

    if not avatar.gltf_url or avatar.gltf_url.startswith("mock-asset://"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GLB not ready yet")

    file_path = _avatar_file_path(avatar.gltf_url)
    if not file_path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "GLB file not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type="model/gltf-binary",
        filename=f"avatar_{avatar_id[:8]}.glb",
    )
