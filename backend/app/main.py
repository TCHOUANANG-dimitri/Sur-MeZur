import logging

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

app = FastAPI(title="Sur-MeZur API", version="0.1.0")

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
