import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, event

logger = logging.getLogger(__name__)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

# Convention SQLAlchemy : "sqlite:///x" (3 barres) = chemin relatif au
# répertoire courant, "sqlite:////x" (4 barres, donc un "/" de tête après le
# préfixe) = chemin absolu. SQLite crée le fichier lui-même au premier accès,
# mais jamais le dossier parent. Sans distinction, un chemin relatif comme le
# défaut "./sur_mezur.db" ferait extraire un dossier parent aberrant (la
# racine du disque) — seul le cas absolu, celui fourni explicitement via
# DATABASE_URL sur un hébergement comme O2Switch, a besoin de ce traitement ;
# le relatif pointe dans le répertoire courant du processus, déjà garanti
# existant.
if settings.database_url.startswith("sqlite:///") and ":memory:" not in settings.database_url:
    _raw_path = settings.database_url[len("sqlite:///") :]
    if _raw_path.startswith("/"):
        os.makedirs(Path(_raw_path).parent, exist_ok=True)

engine = create_engine(settings.database_url, connect_args=connect_args)

if settings.database_url.startswith("sqlite"):
    # Par défaut SQLite verrouille tout le fichier pendant une écriture : une
    # requête de lecture (ex. le polling GET /session/{id} pendant qu'une
    # mesure se termine) attend alors derrière. WAL autorise les lectures
    # concurrentes à une écriture en cours — seules deux écritures
    # simultanées restent sérialisées, cas rare ici.
    #
    # Best-effort : WAL exige d'écrire deux fichiers auxiliaires (-wal, -shm)
    # dans le MÊME dossier que la base, pas seulement dans le fichier lui-même
    # — impossible sur un dossier en lecture seule pour le process, et non
    # fiable sur un système de fichiers réseau (limitation documentée de
    # SQLite), configuration plausible sur un hébergement mutualisé. Sans ce
    # try/except, un PRAGMA qui échoue ici faisait échouer CHAQUE connexion à
    # la base — donc chaque requête, y compris la connexion — avec une 500.
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
        except Exception:
            logger.warning("PRAGMA WAL indisponible sur ce système de fichiers — mode par défaut conservé", exc_info=True)
        finally:
            cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass
