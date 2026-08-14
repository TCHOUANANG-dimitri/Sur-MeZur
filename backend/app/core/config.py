import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# app/core/config.py -> backend/. Calculé depuis ce fichier plutôt que codé en
# dur : marche tel quel en local (Windows) comme sur Render (Linux), quel que
# soit le chemin absolu où le dépôt est cloné.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_DEFAULT_MOBILE_SAM_CHECKPOINT = _BACKEND_DIR / "ml" / "weights" / "mobile_sam.pt"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./sur_mezur.db"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    cors_origins: str = "http://localhost:5173"

    upload_dir: str = "./uploads"

    # --- Chaîne de mesure par vision ---------------------------------------
    # Tout est désactivable : sans modèle ni dépendances, le backend retombe sur
    # l'estimation heuristique et l'application continue de fonctionner.
    vision_enabled: bool = True
    # Vide désactive SAM : on reste alors sur les seules entrées squelettiques
    # MediaPipe, complétées par des ratios anthropométriques. Le checkpoint
    # MobileSAM (40 Mo) est versionné dans le dépôt (backend/ml/weights/) : ce
    # chemin par défaut fonctionne donc sans rien à configurer, en local comme
    # sur Render — une variable SAM_CHECKPOINT_PATH reste possible pour
    # pointer ailleurs (ex. le SAM complet en local, non versionné).
    sam_checkpoint_path: str = (
        str(_DEFAULT_MOBILE_SAM_CHECKPOINT) if _DEFAULT_MOBILE_SAM_CHECKPOINT.exists() else ""
    )
    sam_model_type: str = "vit_b"
    # "sam" (précis, lourd, ~375 Mo, plusieurs dizaines de secondes par image
    # sur CPU) ou "mobile_sam" (distillé, ~40 Mo, bien plus rapide sur CPU,
    # légère perte de précision de segmentation). Avec "mobile_sam",
    # sam_checkpoint_path doit pointer vers mobile_sam.pt et sam_model_type
    # est ignoré (toujours "vit_t"). C'est le backend retenu en production.
    sam_backend: str = "mobile_sam"
    # Confiance minimale d'un point MediaPipe pour être exploité.
    pose_min_visibility: float = 0.5
    pose_min_detection_confidence: float = 0.5

    # Le plafond de threads torch/OpenCV n'est VOLONTAIREMENT pas réglé ici :
    # il doit être posé avant l'import de ces bibliothèques, donc avant que
    # cette configuration ne soit chargée. Voir app/core/thread_limits.py, et
    # la variable d'environnement VISION_MAX_THREADS pour l'ajuster.

    # Sur O2Switch, `a2wsgi` (voir passenger_wsgi.py) attend la fin complète
    # d'un `BackgroundTasks` — y compris son propre traitement CPU de 10 à
    # 90 s — avant de rendre la main au worker Passenger : tout le site reste
    # bloqué pendant ce temps, pour tous les utilisateurs, pas seulement celui
    # qui mesure. "inline" (par défaut, local/Render sous uvicorn ASGI réel) :
    # le job tourne via BackgroundTasks, résultat en quelques secondes.
    # "cron" (O2Switch) : `upload_photos` enregistre les photos et rend la
    # main immédiatement ; `app.worker_measurements`, invoqué par une tâche
    # cron, va chercher les sessions en attente et les traite séparément.
    measurement_worker_mode: str = "inline"

    # --- Modélisation 3D (avatar via Blender + MPFB2) -----------------------
    # Blender tourne en subprocess (--background --python) : pas de dépendance
    # pip, mais le binaire doit être présent sur la machine. Local uniquement
    # pour l'instant : un hébergement mutualisé (O2Switch, Passenger/WSGI) n'a
    # ni root ni la place pour Blender — voir avatar_capabilities() pour le
    # diagnostic exposé par /avatars/capabilities.
    blender_path: str = ""
    # Volontairement HORS de `upload_dir` : ce dernier est monté en statique
    # public (voir main.py, StaticFiles sur /uploads). Un avatar ne doit être
    # accessible qu'via GET /avatars/{id}/glb, qui vérifie la propriété — le
    # placer sous /uploads le rendrait accessible à quiconque connaît l'URL,
    # sans passer par ce contrôle.
    avatar_output_dir: str = "./avatar_store"
    # Timeout en secondes pour le subprocess Blender. Une génération typique
    # prend 5-15 s sur CPU ; 60 s laisse une marge confortable sur un
    # hébergement contraint.
    avatar_blender_timeout: int = 120

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.avatar_output_dir, exist_ok=True)
