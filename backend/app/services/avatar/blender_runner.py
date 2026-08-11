"""
Gestion du subprocess Blender pour la génération d'avatars.

Blender tourne en mode --background --python : pas d'interface graphique,
pas de dépendance pip côté serveur. Les paramètres sont passés via un
fichier JSON temporaire, et le script Python exécuté par Blender lit ce
fichier pour construire le mesh.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


def _find_blender() -> str | None:
    """
    Renvoie le chemin vers l'exécutable Blender, ou None si introuvable.

    Ordre de recherche :
    1. BLENDER_PATH dans la config (.env)
    2. Variable d'env BLENDER_PATH
    3. 'blender' dans le PATH système
    """
    # 1. Config
    if settings.blender_path and Path(settings.blender_path).exists():
        return settings.blender_path

    # 2. Env
    env_path = os.environ.get("BLENDER_PATH", "")
    if env_path and Path(env_path).exists():
        return env_path

    # 3. PATH
    import shutil
    found = shutil.which("blender")
    if found:
        return found

    return None


def _find_generator_script() -> str | None:
    """
    Trouve le script generator.py qui sera exécuté par Blender.

    Le script doit se trouver à côté de ce module (app/services/avatar/generator.py).
    """
    here = Path(__file__).resolve().parent
    script = here / "generator.py"
    if script.exists():
        return str(script)
    return None


def run_blender(params_json: dict, timeout: int | None = None) -> str | None:
    """
    Lance Blender en subprocess pour générer un avatar.

    Args:
        params_json: paramètres du corps (dict sérialisable en JSON).
                     Doit contenir au minimum : height_cm, gender, et les
                     facteurs morphologiques.
        timeout: timeout en secondes (défaut : avatar_blender_timeout).

    Returns:
        Chemin vers le fichier GLB généré, ou None en cas d'échec.

    Raises:
        FileNotFoundError: si Blender ou le script generator est introuvable.
        RuntimeError: si le subprocess échoue.
    """
    blender = _find_blender()
    if not blender:
        raise FileNotFoundError(
            "Blender introuvable. Définissez BLENDER_PATH dans .env ou dans "
            "la variable d'environnement."
        )

    generator = _find_generator_script()
    if not generator:
        raise FileNotFoundError(
            "Script generator.py introuvable dans app/services/avatar/."
        )

    timeout = timeout or settings.avatar_blender_timeout

    # Fichier JSON temporaire pour les paramètres
    params_fd, params_path = tempfile.mkstemp(suffix=".json", prefix="avatar_params_")
    try:
        with os.fdopen(params_fd, "w", encoding="utf-8") as f:
            json.dump(params_json, f, ensure_ascii=False, indent=2)

        # Fichier de sortie GLB
        output_dir = Path(settings.avatar_output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        output_name = f"avatar_{params_json.get('request_id', 'default')}.glb"
        output_path = output_dir / output_name

        cmd = [
            blender,
            "--background",
            "--python", generator,
            "--",           # séparateur Blender : args après -- vont dans sys.argv
            params_path,
            str(output_path),
        ]

        logger.info("Lancement Blender : %s", " ".join(cmd[:4]))

        # On n'utilise PAS capture_output=True : sur Windows, Blender produit
        # beaucoup de sortie stdout/stderr, et le buffer peut bloquer le
        # processus si personne ne le lit. On laisse la sortie aller directement
        # au stdout/stderr du processus Python parent.
        result = subprocess.run(
            cmd,
            capture_output=False,
            timeout=timeout,
            cwd=str(Path(__file__).resolve().parents[3]),  # racine du projet
        )

        if result.returncode != 0:
            logger.error(
                "Blender a echoue (code %d)",
                result.returncode,
            )
            return None

        if not output_path.exists():
            logger.error(
                "Blender s'est terminé mais le fichier GLB n'existe pas : %s",
                output_path,
            )
            return None

        file_size = output_path.stat().st_size
        if file_size < 1000:
            logger.error("Fichier GLB trop petit (%d octets) — probablement corrompu", file_size)
            return None

        logger.info("Avatar GLB généré : %s (%d octets)", output_path, file_size)
        return str(output_path)

    except subprocess.TimeoutExpired:
        logger.error("Blender a dépassé le timeout de %d secondes", timeout)
        return None
    except Exception:
        logger.exception("Erreur inattendue lors du lancement de Blender")
        return None
    finally:
        # Nettoyage du fichier de paramètres
        try:
            os.unlink(params_path)
        except OSError:
            pass


def check_blender_available() -> dict:
    """Diagnostic : état de Blender pour l'endpoint /capabilities."""
    blender = _find_blender()
    generator = _find_generator_script()
    return {
        "blender_path": blender,
        "blender_available": blender is not None,
        "generator_script": generator,
        "generator_available": generator is not None,
        "output_dir": settings.avatar_output_dir,
        "timeout": settings.avatar_blender_timeout,
    }
