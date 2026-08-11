import logging
import os
import socket
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.base import Base, engine
from app.models import *  # noqa: F401,F403 -- ensures all models are registered on Base

# Uvicorn ne configure que ses propres loggers : sans cette ligne, tous les
# `logger.info` des modules `app.*` remontent à une racine sans handler et sont
# silencieusement jetés (niveau par défaut WARNING).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("app").setLevel(logging.INFO)


def _lan_ip() -> str:
    """IP de la machine sur le réseau local, telle que la verra le téléphone."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # aucune donnée envoyée, sert à choisir l'interface
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "<ip-de-votre-machine>"


def _guard_bind_address() -> None:
    """
    Refuse de démarrer si uvicorn n'écoute que sur 127.0.0.1.

    Sans `--host 0.0.0.0`, uvicorn n'accepte que les connexions locales : le
    téléphone envoie sa requête dans le vide et l'application affiche « le
    serveur n'a pas répondu ». Le symptôme est à l'autre bout de la chaîne, ce
    qui coûte beaucoup de temps à diagnostiquer — mieux vaut échouer ici, tout
    de suite, avec la bonne commande sous les yeux.

    Ne s'applique qu'au poste de développement : sur un hébergement géré, la
    plateforme impose elle-même l'adresse d'écoute, et refuser de démarrer ici
    couperait la production pour un problème qui n'existe qu'en local.

    Contournement volontaire : SURMEZUR_ALLOW_LOCALHOST=1
    """
    argv = " ".join(sys.argv)
    if "uvicorn" not in argv.lower():
        return  # lancé autrement (tests, gunicorn, import) : rien à vérifier
    if os.environ.get("SURMEZUR_ALLOW_LOCALHOST") == "1":
        return
    # Render définit RENDER et PORT ; PORT seul couvre les autres plateformes
    # (Railway, Heroku, Fly…). Aucune ne correspond à un poste de dev.
    if os.environ.get("RENDER") or os.environ.get("PORT"):
        return

    host = None
    for i, arg in enumerate(sys.argv):
        if arg == "--host" and i + 1 < len(sys.argv):
            host = sys.argv[i + 1]
        elif arg.startswith("--host="):
            host = arg.split("=", 1)[1]

    if host in ("0.0.0.0", "::"):
        return

    ip = _lan_ip()
    reason = "aucun --host fourni (uvicorn utilise 127.0.0.1)" if host is None else f"--host {host}"
    print(
        "\n"
        "==========================================================================\n"
        "  DEMARRAGE REFUSE : le telephone ne pourrait pas joindre l'API\n"
        "==========================================================================\n"
        f"  Cause : {reason}\n"
        "  Consequence : l'application mobile affichera\n"
        "                \"le serveur n'a pas repondu apres 15 s\"\n"
        "\n"
        "  Commande correcte :\n"
        "      python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload\n"
        "\n"
        "  ou simplement :   .\\start.ps1\n"
        "\n"
        f"  L'application mobile joindra alors http://{ip}:8000\n"
        "\n"
        "  Pour demarrer quand meme en local uniquement :\n"
        "      $env:SURMEZUR_ALLOW_LOCALHOST=1\n"
        "==========================================================================\n",
        file=sys.stderr,
        flush=True,
    )
    raise SystemExit(1)


_guard_bind_address()

app = FastAPI(title="Sur-MeZur API", version="0.1.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
app.include_router(api_router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)

    # Préchauffage MediaPipe/SAM au démarrage, en tâche de fond.
    # Chargé en parallèle avec l'ouverture du port : pas de blocage.
    # warm_up_async() est idempotent (un seul thread de lancé au total).
    try:
        from app.services import vision
        vision.warm_up_async()
    except Exception:
        pass


@app.get("/api/health")
def health():
    return {"status": "ok"}
