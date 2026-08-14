"""
Plafonne le nombre de threads des bibliothèques de calcul (OpenMP, torch,
OpenCV) AVANT qu'elles ne soient importées.

Pourquoi ce module existe et pourquoi il doit être importé en tout premier :
torch, NumPy/BLAS et OpenCV décident de leur nombre de threads au moment de
leur initialisation, à partir du nombre de cœurs VISIBLES. Sur un hébergement
mutualisé, la machine en expose des dizaines tandis que le compte n'a droit
qu'à un ou deux cœurs — les threads créés se disputent alors ce quota et
passent leur temps à changer de contexte plutôt qu'à calculer.

Mesuré sur ce projet : la chaîne de mesure complète prend ~3 s sur un poste de
développement, et n'a toujours pas rendu de réponse après 5 minutes sur
O2Switch, avec le même code et des photos de 37 Ko.

Les variables d'environnement doivent être posées avant l'import : une fois
OpenMP initialisé, les changer n'a plus aucun effet. Les appels
`set_num_threads` faits plus tard (voir `apply_runtime_limits`) couvrent ce
que les variables ne suffisent pas à contraindre.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Lu directement dans l'environnement plutôt que via `settings` : ce module est
# importé avant tout le reste, y compris la configuration, précisément pour
# devancer l'initialisation d'OpenMP.
_ENV_VARS = (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "NUMEXPR_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
)


def _configured_limit() -> int:
    raw = os.environ.get("VISION_MAX_THREADS", "2")
    try:
        return max(0, int(raw))
    except ValueError:
        return 2


def set_env_limits() -> int:
    """
    Pose les variables d'environnement de threading. À appeler avant tout
    import de torch / cv2 / numpy. Renvoie la limite retenue (0 = aucune).

    Ne remplace jamais une valeur déjà présente dans l'environnement : si
    l'hébergeur ou l'exploitant en a posé une, elle fait autorité.
    """
    limit = _configured_limit()
    if limit <= 0:
        return 0
    for name in _ENV_VARS:
        os.environ.setdefault(name, str(limit))
    return limit


def apply_runtime_limits() -> None:
    """
    Applique la limite aux bibliothèques déjà importées.

    Complète `set_env_limits` : torch ignore `OMP_NUM_THREADS` dans certains
    cas (selon la version et le backend BLAS compilé), et OpenCV possède son
    propre pool, indépendant d'OpenMP. Sans effet si la bibliothèque n'est pas
    installée — la chaîne de vision est optionnelle (voir `vision_enabled`).
    """
    limit = _configured_limit()
    if limit <= 0:
        return

    try:
        import torch

        torch.set_num_threads(limit)
        # Threads inter-op (parallélisme entre opérations) : séparé du
        # précédent, et tout aussi coûteux quand le quota CPU est étroit.
        try:
            torch.set_num_interop_threads(limit)
        except RuntimeError:
            # Ne peut être réglé qu'avant le premier travail parallèle ; si
            # c'est déjà trop tard, la limite intra-op suffit.
            pass
        logger.info("torch limité à %d thread(s)", limit)
    except ImportError:
        pass

    try:
        import cv2

        cv2.setNumThreads(limit)
        logger.info("OpenCV limité à %d thread(s)", limit)
    except ImportError:
        pass
