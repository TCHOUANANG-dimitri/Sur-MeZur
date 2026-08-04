import os
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    # Laisser vide désactive SAM : on reste alors sur les seules entrées
    # squelettiques MediaPipe, complétées par des ratios anthropométriques.
    sam_checkpoint_path: str = ""
    sam_model_type: str = "vit_b"
    # "sam" (précis, lourd, ~375 Mo, plusieurs dizaines de secondes par image
    # sur CPU) ou "mobile_sam" (distillé, ~40 Mo, bien plus rapide sur CPU,
    # légère perte de précision de segmentation). Avec "mobile_sam",
    # sam_checkpoint_path doit pointer vers mobile_sam.pt et sam_model_type
    # est ignoré (toujours "vit_t").
    sam_backend: str = "sam"
    # Confiance minimale d'un point MediaPipe pour être exploité.
    pose_min_visibility: float = 0.5
    pose_min_detection_confidence: float = 0.5

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
os.makedirs(settings.upload_dir, exist_ok=True)
