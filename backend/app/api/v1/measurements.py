import logging
import time
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db, require_roles
from app.db.base import SessionLocal
from app.models.enums import JobStatus, MeasurementSource
from app.models.measurements import Measurement, MeasurementSession
from app.models.users import ClientProfile, User
from app.schemas.measurements import (
    MeasurementOut,
    MeasurementPatchIn,
    MeasurementSessionCreateIn,
    MeasurementSessionOut,
)
from app.services import vision
from app.services.notify import notify
from app.services.storage import save_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/measurements", tags=["measurements"])


@router.get("/capabilities")
def measurement_capabilities():
    """Diagnostic : ce qui est réellement actif dans la chaîne de mesure."""
    return vision.capabilities()


@router.post("/debug/analyze")
def debug_analyze(
    front: UploadFile = File(...),
    side: UploadFile | None = File(None),
    height_cm: float = Form(...),
    weight_kg: float = Form(...),
    gender: str = Form(...),
    user: User = Depends(get_current_user),
):
    """
    Renvoie **toute la trace intermédiaire** de la chaîne de mesure : les 33
    points MediaPipe, l'échelle, les 12 variables du modèle, les prédictions.

    Rien n'est enregistré en base — c'est un outil d'inspection, destiné en
    particulier à mesurer l'écart entre les estimations MediaPipe et de vraies
    mensurations prises au mètre ruban.
    """
    front_path = save_upload(front, "debug")
    side_path = save_upload(side, "debug") if side is not None else None
    return vision.analyze_debug(
        front_photo=_photo_path(front_path),
        side_photo=_photo_path(side_path),
        height_cm=height_cm,
        weight_kg=weight_kg,
        gender=gender,
    )


def _client_profile(user: User, db: Session) -> ClientProfile:
    profile = db.query(ClientProfile).filter(ClientProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client profile not found")
    return profile


def _photo_path(url: str | None) -> str | None:
    """Les URL stockées sont servies sous /uploads : on remonte au fichier."""
    if not url:
        return None
    relative = url.split("/uploads/", 1)[-1]
    path = Path(settings.upload_dir) / relative
    return str(path) if path.exists() else None


class MeasurementFailed(Exception):
    """Échec destiné au client : le message est affiché tel quel dans l'app."""


# Consigne de reprise, alignée sur l'écran de capture du mobile.
_RETRY_GUIDANCE = (
    "Nous n'avons pas pu analyser vos photos. Reprenez-les en vérifiant que :\n"
    "• tout le corps est visible, de la tête aux pieds\n"
    "• vous êtes seul·e devant un fond dégagé et bien éclairé\n"
    "• votre tenue est ajustée (ni ample, ni très sombre sur fond sombre)\n"
    "• de face : bras légèrement écartés du corps (~45°)\n"
    "• de profil : mains derrière la tête, coudes vers l'arrière\n"
    "• le téléphone est tenu à la verticale, à hauteur de poitrine"
)


def _measure(session_row: MeasurementSession) -> tuple[dict, dict, MeasurementSource]:
    """
    Mesure réelle depuis les photos, ou échec explicite.

    Aucun repli heuristique : produire des chiffres déduits de la seule taille
    donnerait une fiche plausible mais fausse, indiscernable d'une vraie
    mesure — et un vêtement serait taillé dessus. Mieux vaut demander au
    client de reprendre ses photos.
    """
    front = _photo_path(session_row.front_photo_url)
    if not front:
        raise MeasurementFailed(
            "La photo de face n'a pas pu être enregistrée. Reprenez les deux photos."
        )
    if not (session_row.height_cm and session_row.weight_kg and session_row.gender):
        raise MeasurementFailed(
            "Taille, poids et sexe sont nécessaires au calcul. Reprenez le formulaire."
        )

    # Panne de service (dépendance absente, modèle non déployé) : ce n'est pas
    # la faute du client, inutile de lui faire refaire ses photos pour rien.
    caps = vision.capabilities()
    if not caps.get("vision_enabled") or not caps.get("mediapipe", {}).get("available"):
        logger.error(
            "Chaîne de vision indisponible côté serveur : mediapipe=%s, sam=%s",
            caps.get("mediapipe"), caps.get("sam"),
        )
        raise MeasurementFailed(
            "Le service de mesure est temporairement indisponible. "
            "Réessayez dans quelques minutes."
        )

    try:
        result = vision.run(
            front_photo=front,
            side_photo=_photo_path(session_row.side_photo_url),
            height_cm=session_row.height_cm,
            weight_kg=session_row.weight_kg,
            gender=session_row.gender,
        )
    except Exception:
        logger.exception("Chaîne vision en erreur — session %s", session_row.id)
        raise MeasurementFailed(_RETRY_GUIDANCE)

    if result is None:
        logger.warning("Chaîne vision sans résultat — session %s", session_row.id)
        raise MeasurementFailed(_RETRY_GUIDANCE)

    logger.info(
        "Mesures obtenues par vision (%s)%s",
        result.source,
        f" — {'; '.join(result.notes)}" if result.notes else "",
    )
    return result.data, result.confidence, MeasurementSource.ai


def _run_measurement_job(session_id: str) -> None:
    time.sleep(2)  # mimics the "Analyse en cours..." wait from doc 1 §4.6
    with SessionLocal() as db:
        session_row = db.get(MeasurementSession, session_id)
        if not session_row:
            return
        try:
            data, confidence, source = _measure(session_row)
            measurement = Measurement(
                client_id=session_row.client_id,
                source=source,
                version=1,
                height_cm=session_row.height_cm or 170,
                weight_kg=session_row.weight_kg,
                gender=session_row.gender,
                data=data,
                confidence=confidence,
            )
            db.add(measurement)
            db.flush()
            session_row.measurement_id = measurement.id
            session_row.status = JobStatus.ready

            client = db.get(ClientProfile, session_row.client_id)
            if client and not client.default_measurement_id:
                client.default_measurement_id = measurement.id
            # L'analyse par vision peut prendre bien plus longtemps que ce que
            # le mobile attend en direct (SAM à froid : jusqu'à plusieurs
            # minutes) : plutôt que de forcer une attente bloquante côté
            # client, on le prévient dès que c'est prêt, qu'il ait attendu ou
            # non l'ait fait.
            if client:
                notify(db, client.user_id, "measurement_ready", {"measurement_id": measurement.id})
            db.commit()
        except MeasurementFailed as exc:
            # Échec attendu : le message est rédigé pour le client, l'app
            # l'affiche tel quel et le renvoie vers l'écran de reprise.
            _fail_session(db, session_id, str(exc))
        except Exception:  # pragma: no cover - defensive
            logger.exception("Échec inattendu du calcul de mensurations")
            # Pas de détail technique côté client : il n'y peut rien.
            _fail_session(
                db,
                session_id,
                "Une erreur inattendue est survenue pendant l'analyse. Réessayez.",
            )


def _fail_session(db: Session, session_id: str, message: str) -> None:
    """
    Marque la session en échec et prévient le client.

    La notification n'est pas un détail : l'écran de mesure propose « Continuer
    sans attendre — je serai notifié·e ». Sans notification d'échec, un client
    parti attendrait un résultat qui n'arrive jamais.
    """
    db.rollback()
    session_row = db.get(MeasurementSession, session_id)
    if not session_row:
        return
    session_row.status = JobStatus.failed
    session_row.error_message = message
    client = db.get(ClientProfile, session_row.client_id)
    if client:
        notify(
            db,
            client.user_id,
            "measurement_failed",
            {"session_id": session_id, "message": message},
        )
    db.commit()


@router.post("/session", response_model=MeasurementSessionOut)
def create_session(
    payload: MeasurementSessionCreateIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = _client_profile(user, db)
    session_row = MeasurementSession(
        client_id=client.id,
        height_cm=payload.height_cm,
        weight_kg=payload.weight_kg,
        gender=payload.gender,
        status=JobStatus.processing,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return session_row


@router.post("/session/{session_id}/photos", response_model=MeasurementSessionOut)
def upload_photos(
    session_id: str,
    background_tasks: BackgroundTasks,
    front: UploadFile = File(...),
    side: UploadFile = File(...),
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = _client_profile(user, db)
    session_row = db.get(MeasurementSession, session_id)
    if not session_row or session_row.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    session_row.front_photo_url = save_upload(front, "measurement_photos")
    session_row.side_photo_url = save_upload(side, "measurement_photos")
    session_row.status = JobStatus.processing
    db.commit()
    db.refresh(session_row)

    background_tasks.add_task(_run_measurement_job, session_id)
    return session_row


@router.get("/session/{session_id}", response_model=MeasurementSessionOut)
def get_session(
    session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    session_row = db.get(MeasurementSession, session_id)
    if not session_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session_row


@router.get("", response_model=list[MeasurementOut])
def list_measurements(
    user: User = Depends(require_roles("client")), db: Session = Depends(get_db)
):
    client = _client_profile(user, db)
    return (
        db.query(Measurement)
        .filter(Measurement.client_id == client.id)
        .order_by(Measurement.created_at.desc())
        .all()
    )


@router.patch("/{measurement_id}", response_model=MeasurementOut)
def patch_measurement(
    measurement_id: str,
    payload: MeasurementPatchIn,
    user: User = Depends(require_roles("client")),
    db: Session = Depends(get_db),
):
    client = _client_profile(user, db)
    measurement = db.get(Measurement, measurement_id)
    if not measurement or measurement.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Measurement not found")

    merged = dict(measurement.data)
    merged.update(payload.data)
    measurement.data = merged
    if payload.height_cm is not None:
        measurement.height_cm = payload.height_cm
    if measurement.source == MeasurementSource.ai:
        measurement.source = MeasurementSource.mixed
    db.commit()
    db.refresh(measurement)
    return measurement
