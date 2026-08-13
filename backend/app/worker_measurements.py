"""Worker de traitement des mesures — à invoquer par une tâche cron, hors du
cycle de requête Passenger.

Pourquoi ce fichier existe : `BackgroundTasks` de FastAPI ne rend jamais la
main au worker Passenger avant la fin complète de la tâche — `a2wsgi` (voir
passenger_wsgi.py) attend `asgi_done` sans limite de temps par défaut avant
de terminer la réponse WSGI. Le traitement d'une mesure (10 à 90 s de CPU)
bloquait donc ce worker Passenger en entier, y compris pour toute autre
requête d'un autre utilisateur pendant ce temps. Actif uniquement quand
`settings.measurement_worker_mode == "cron"` (voir app/core/config.py) —
sur Render et en local, `upload_photos` continue de traiter en ligne via
BackgroundTasks, ce script n'a alors rien à faire.

Déploiement (tâche cron O2Switch, ex. toutes les minutes) :
    cd /chemin/vers/backend && venv/bin/python -m app.worker_measurements
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path

from app.db.base import SessionLocal
from app.models.enums import JobStatus
from app.models.measurements import MeasurementSession

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_LOCK_PATH = Path(tempfile.gettempdir()) / "surmezur_measurement_worker.lock"
# Au-delà de cette durée, un verrou ne peut provenir que d'une exécution
# précédente plantée sans nettoyage — pas d'un traitement encore légitime.
_STALE_LOCK_S = 600

# Durée pendant laquelle le worker reste éveillé après avoir traité au moins
# une session, à comparer à l'intervalle du cron (ex. 60 s).
#
# MediaPipe/SAM se chargent une fois par PROCESSUS (voir vision.warm_up), pas
# une fois pour toutes comme sous Passenger où le worker web reste en vie
# entre requêtes. Un cron qui lance un processus Python par tick paierait
# donc ce chargement (10-90 s mesurés à froid) à CHAQUE session traitée. En
# restant éveillé un moment après un premier traitement plutôt que de
# terminer aussitôt, ce même processus — modèles déjà chargés — peut absorber
# les mesures suivantes soumises dans la foulée sans repayer ce coût.
_ACTIVE_WINDOW_S = 50
_POLL_INTERVAL_S = 2


def _acquire_lock() -> int | None:
    """Verrou par création atomique de fichier (portable Windows/Linux) :
    évite que deux exécutions cron se chevauchent si un traitement dépasse
    l'intervalle du cron."""
    try:
        return os.open(str(_LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        try:
            age_s = time.time() - _LOCK_PATH.stat().st_mtime
        except OSError:
            return None
        if age_s < _STALE_LOCK_S:
            return None
        logger.warning("Verrou périmé (%.0fs) — nettoyage et reprise", age_s)
        try:
            _LOCK_PATH.unlink()
            return os.open(str(_LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except OSError:
            return None


def _release_lock(fd: int) -> None:
    os.close(fd)
    try:
        _LOCK_PATH.unlink()
    except OSError:
        pass


def _pending_ids() -> list[str]:
    with SessionLocal() as db:
        rows = (
            db.query(MeasurementSession.id)
            .filter(
                MeasurementSession.status == JobStatus.processing,
                MeasurementSession.front_photo_url.isnot(None),
                MeasurementSession.side_photo_url.isnot(None),
            )
            .all()
        )
        return [row.id for row in rows]


def run_once() -> int:
    """
    Traite les sessions en attente jusqu'à épuisement, puis reste éveillé
    jusqu'à `_ACTIVE_WINDOW_S` pour absorber les arrivées suivantes sans
    repayer le chargement des modèles. Renvoie le nombre total traité.
    """
    from app.api.v1.measurements import _run_measurement_job
    from app.services import vision

    total = 0
    deadline: float | None = None

    while True:
        session_ids = _pending_ids()
        if not session_ids:
            if deadline is None or time.monotonic() >= deadline:
                break
            time.sleep(_POLL_INTERVAL_S)
            continue

        if total == 0:
            # Modèles chargés une seule fois pour toute la fenêtre active,
            # avant le premier traitement plutôt que lazy dans le premier
            # appel — pour que le log distingue clairement chargement et
            # inférence.
            vision.warm_up()

        for session_id in session_ids:
            logger.info("Traitement session %s", session_id)
            try:
                _run_measurement_job(session_id)
            except Exception:  # pragma: no cover - defensive
                logger.exception("Échec non rattrapé pour la session %s", session_id)
            total += 1

        deadline = time.monotonic() + _ACTIVE_WINDOW_S

    return total


def main() -> None:
    fd = _acquire_lock()
    if fd is None:
        logger.info("Une autre exécution est déjà en cours — on passe.")
        return
    try:
        n = run_once()
        if n:
            logger.info("%d session(s) traitée(s)", n)
    finally:
        _release_lock(fd)


if __name__ == "__main__":
    main()
