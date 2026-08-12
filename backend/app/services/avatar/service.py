"""
Service de génération d'avatars 3D.

Orchestre la conversion des mensurations en mesh glTF via Blender + MPFB2.
Ce service est appelé par l'endpoint API (avatars.py) et tourne en
background task pour ne pas bloquer le client.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from app.core.config import settings
from app.models.measurements import Avatar, Measurement
from app.models.enums import JobStatus

from .body_params import measurements_to_avatar_params, to_json
from .blender_runner import run_blender, check_blender_available

logger = logging.getLogger(__name__)


def generate_avatar(
    measurement: Measurement,
    skin_tone_hex: str = "#C68863",
) -> str | None:
    """
    Génère un avatar 3D glTF à partir des mensurations.

    Args:
        measurement: objet Measurement (doit contenir data, gender)
        skin_tone_hex: couleur de peau au format "#RRGGBB"

    Returns:
        Chemin relatif vers le fichier GLB généré (ex: "avatars/avatar_xxx.glb"),
        ou None en cas d'échec.
    """
    # 1. Extraire les mensurations
    #
    # COPIE délibérée : `measurement.data` est la colonne JSON de l'ORM. La
    # compléter en place inscrirait `height_total` et `weight_kg` dans la
    # mesure enregistrée au prochain commit de la session — une modification
    # de données que personne n'a demandée, à l'occasion d'une génération
    # d'avatar.
    if not measurement.data:
        logger.error("Measurement sans données (id=%s)", measurement.id)
        return None
    measurements = dict(measurement.data)

    # Champs stockés en colonnes plutôt que dans le JSON
    if measurement.height_cm:
        measurements["height_total"] = measurement.height_cm
    if measurement.weight_kg:
        measurements["weight_kg"] = measurement.weight_kg

    # 2. Convertir en paramètres avatar (avec features si disponibles)
    features = getattr(measurement, 'features', None) or None
    params = measurements_to_avatar_params(measurements, measurement.gender, features=features)
    logger.info(
        "Paramètres avatar calculés pour %s : %s",
        measurement.id,
        "; ".join(params.notes),
    )

    # 3. Préparer les paramètres pour Blender
    request_id = uuid.uuid4().hex[:12]
    blender_params = to_json(params)
    blender_params["skin_tone_hex"] = skin_tone_hex
    blender_params["request_id"] = request_id

    # 4. Lancer Blender — c'est lui qui compose le nom et le chemin de sortie,
    #    à partir du request_id transmis dans les paramètres.
    glb_path = run_blender(blender_params)
    if glb_path is None:
        logger.error("Échec de la génération Blender pour measurement %s", measurement.id)
        return None

    # 5. Renvoyer le chemin relatif (pour servir via /uploads/)
    try:
        relative = Path(glb_path).relative_to(Path(settings.avatar_output_dir))
        return f"avatars/{relative}"
    except ValueError:
        # Chemin hors du dossier de sortie : on retombe sur le nom de fichier,
        # que run_blender construit à l'identique depuis le request_id.
        return f"avatars/avatar_{request_id}.glb"


def avatar_capabilities() -> dict:
    """État du système d'avatar pour un endpoint de diagnostic."""
    blender_info = check_blender_available()
    return {
        **blender_info,
        "avatar_enabled": bool(blender_info["blender_available"] and blender_info["generator_available"]),
    }
