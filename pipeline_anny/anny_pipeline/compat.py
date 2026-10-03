"""
Compatibilite clad-body 0.6.1 <-> Anny 0.6.1.

clad-body appelle le modele avec pose_parameterization="root_relative_world",
nom retire d'Anny en 0.6 (renomme « local-bone » avec l'orientation
« blender-rootidentity »). Anny ne traduit encore l'ancien nom qu'a la
construction du modele (anny/models/legacy.py::check_legacy_pose_parameterization),
pas a l'appel : clad-body echoue alors avec « Pose parameterization
root_relative_world not implemented ».

Les modeles de clad-body sont construits par `anny.create_fullbody_model`,
dont l'orientation par defaut est justement « blender-rootidentity » : on
applique donc a l'appel la meme traduction que celle d'Anny a la
construction. Rien n'est modifie dans les paquets installes.
"""

from __future__ import annotations

_ANCIENS = {"root_relative": "local-bone", "root_relative_world": "local-bone"}
_FAIT = False


def appliquer() -> None:
    global _FAIT
    if _FAIT:
        return
    from anny.models.phenotype import Anny

    origine = Anny.forward

    def forward(self, *args, pose_parameterization=None, **kwargs):
        pose_parameterization = _ANCIENS.get(pose_parameterization, pose_parameterization)
        return origine(self, *args, pose_parameterization=pose_parameterization, **kwargs)

    Anny.forward = forward
    _FAIT = True


appliquer()
