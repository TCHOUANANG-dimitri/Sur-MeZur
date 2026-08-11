"""Service de modélisation 3D d'avatars via Blender + MPFB2."""

from .service import generate_avatar, avatar_capabilities
from .blender_runner import check_blender_available

__all__ = [
    "generate_avatar",
    "avatar_capabilities",
    "check_blender_available",
]
