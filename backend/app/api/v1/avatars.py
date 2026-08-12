import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.db.base import SessionLocal
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


def _run_avatar_job(avatar_id: str) -> None:
    """
    Background task : génère le vrai avatar 3D via Blender + MPFB2.

    En cas d'échec (Blender absent, timeout, etc.), le service se replie
    sur le mock pour que l'application reste fonctionnelle.
    """
    with SessionLocal() as db:
        avatar = db.get(Avatar, avatar_id)
        if not avatar:
            return

        try:
            measurement = db.get(Measurement, avatar.measurement_id)
            if not measurement:
                logger.error("Measurement %s introuvable pour avatar %s", avatar.measurement_id, avatar_id)
                avatar.gltf_url = generate_avatar_reference(avatar_id)
                avatar.status = JobStatus.ready
                db.commit()
                return

            # Tenter la génération réelle
            gltf_filename = avatar_service.generate_avatar(
                measurement=measurement,
                skin_tone_hex=avatar.skin_tone_hex,
            )

            if gltf_filename:
                # Nom de fichier seul, jamais un chemin public — voir
                # avatar_output_dir dans config.py et get_avatar_glb ci-dessous.
                avatar.gltf_url = gltf_filename
                avatar.status = JobStatus.ready
                logger.info("Avatar %s généré avec succès : %s", avatar_id, gltf_filename)
            else:
                # Fallback sur le mock
                logger.warning("Génération Blender échouée pour avatar %s — repli mock", avatar_id)
                avatar.gltf_url = generate_avatar_reference(avatar_id)
                avatar.status = JobStatus.ready

            _cleanup_superseded_avatars(db, avatar.client_id, avatar.measurement_id, avatar.id)

        except Exception:
            logger.exception("Erreur inattendue lors de la génération de l'avatar %s", avatar_id)
            # Fallback sur le mock pour ne pas bloquer le client
            avatar.gltf_url = generate_avatar_reference(avatar_id)
            avatar.status = JobStatus.ready

        db.commit()


@router.get("/capabilities")
def capabilities():
    """Diagnostic : état du système d'avatar 3D."""
    return avatar_service.avatar_capabilities()


@router.post("", response_model=AvatarOut)
def create_avatar(
    payload: AvatarCreateIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client profile not found")
    measurement = db.get(Measurement, payload.measurement_id)
    if not measurement or measurement.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Measurement not found")

    avatar = Avatar(
        client_id=client.id,
        measurement_id=payload.measurement_id,
        skin_tone_hex=payload.skin_tone_hex,
        status=JobStatus.processing,
    )
    db.add(avatar)
    if not client.skin_tone_hex:
        client.skin_tone_hex = payload.skin_tone_hex
    db.commit()
    db.refresh(avatar)

    background_tasks.add_task(_run_avatar_job, avatar.id)
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
