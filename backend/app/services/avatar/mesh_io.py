"""
Lecture minimale des maillages de base GLB (position + morph targets),
sans Blender ni dépendance glTF tierce (pygltflib, trimesh...).

Pourquoi un parseur maison plutôt qu'une bibliothèque : ce projet a déjà
rencontré des installations pip peu fiables sur l'hébergement mutualisé
(réseau instable, quota CPU trompeur — voir BRIEF_MODELE_CORPOREL_AVATAR.md
§2). Le format GLB est simple et documenté (deux chunks : JSON + binaire) ;
lire uniquement POSITION et les morph targets d'un mesh sans skin/animation
ne demande qu'une fraction du spec glTF. Aucune nouvelle dépendance : juste
`struct`, `json`, `numpy` (déjà présents en production pour MediaPipe/
MobileSAM).

Ce module ne lit QUE ce dont mesh_measure.py a besoin : position moyenne
du(des) primitive(s), triangles, et deltas de position par morph target
nommé (mesh.extras.targetNames, convention de l'exporteur glTF de Blender —
c'est ce que Viewer3D.tsx lit déjà côté mobile).
"""

from __future__ import annotations

import json
import logging
import struct
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_GLB_MAGIC = 0x46546C67  # b'glTF'
_CHUNK_JSON = 0x4E4F534A
_CHUNK_BIN = 0x004E4942

_COMPONENT_DTYPES = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}

_TYPE_COMPONENTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT4": 16,
}


@dataclass(frozen=True)
class BaseMesh:
    vertices: np.ndarray          # (N, 3) float32, maillage neutre (toutes cibles à 0)
    faces: np.ndarray             # (M, 3) uint32
    target_deltas: dict[str, np.ndarray]  # nom de cible -> (N, 3) float32 (delta vs neutre)


def _read_glb_chunks(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != _GLB_MAGIC:
        raise ValueError(f"{path} n'est pas un fichier GLB valide (magic incorrect)")

    offset = 12
    json_chunk: dict | None = None
    bin_chunk: bytes = b""
    while offset < length:
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        chunk_data = data[offset + 8: offset + 8 + chunk_len]
        if chunk_type == _CHUNK_JSON:
            json_chunk = json.loads(chunk_data.decode("utf-8"))
        elif chunk_type == _CHUNK_BIN:
            bin_chunk = chunk_data
        offset += 8 + chunk_len

    if json_chunk is None:
        raise ValueError(f"{path} : chunk JSON introuvable")
    return json_chunk, bin_chunk


def _read_flat(gltf: dict, binary: bytes, buffer_view_index: int, byte_offset: int,
                count: int, n_comp: int, dtype: np.dtype, allow_stride: bool = True) -> np.ndarray:
    buffer_view = gltf["bufferViews"][buffer_view_index]
    total_offset = buffer_view.get("byteOffset", 0) + byte_offset
    byte_stride = buffer_view.get("byteStride")
    item_size = n_comp * np.dtype(dtype).itemsize

    if allow_stride and byte_stride and byte_stride != item_size:
        raise NotImplementedError(
            f"bufferView {buffer_view_index} entrelacé (byteStride={byte_stride} != "
            f"{item_size}) — non supporté par ce parseur minimal."
        )

    raw = binary[total_offset: total_offset + count * item_size]
    return np.frombuffer(raw, dtype=dtype, count=count * n_comp).reshape(count, n_comp)


def _read_accessor(gltf: dict, binary: bytes, accessor_index: int) -> np.ndarray:
    """
    Lit un accessor glTF, y compris les accessors "sparse" — utilisés par
    l'exporteur de Blender pour les morph targets de MPFB2 : chaque cible ne
    déforme qu'une petite région du corps (quelques centaines à ~1500
    sommets sur 21833), donc Blender encode le delta comme une base creuse
    (implicitement nulle) plus une liste d'indices/valeurs modifiés, au lieu
    d'un tableau dense de 21833 vecteurs presque tous à zéro. Manquer ce cas
    ne lève aucune erreur — `_read_accessor` renvoyait silencieusement un
    delta entièrement nul (déjà rencontré et confirmé en développement :
    la mesure ne bougeait plus du tout quel que soit le poids appliqué).
    """
    accessor = gltf["accessors"][accessor_index]
    component_type = accessor["componentType"]
    count = accessor["count"]
    type_ = accessor["type"]
    n_comp = _TYPE_COMPONENTS[type_]
    dtype = _COMPONENT_DTYPES[component_type]

    if "bufferView" in accessor:
        arr = _read_flat(gltf, binary, accessor["bufferView"], accessor.get("byteOffset", 0),
                          count, n_comp, dtype).astype(np.float32, copy=True)
    else:
        arr = np.zeros((count, n_comp), dtype=np.float32)

    sparse = accessor.get("sparse")
    if sparse:
        s_count = sparse["count"]
        idx_info = sparse["indices"]
        idx_dtype = _COMPONENT_DTYPES[idx_info["componentType"]]
        indices = _read_flat(gltf, binary, idx_info["bufferView"], idx_info.get("byteOffset", 0),
                              s_count, 1, idx_dtype, allow_stride=False).reshape(-1)

        val_info = sparse["values"]
        values = _read_flat(gltf, binary, val_info["bufferView"], val_info.get("byteOffset", 0),
                             s_count, n_comp, dtype, allow_stride=False)

        arr[indices.astype(np.int64)] = values.astype(np.float32)

    return arr


def _load_glb(path: Path) -> BaseMesh:
    gltf, binary = _read_glb_chunks(path)

    meshes = gltf.get("meshes", [])
    if not meshes:
        raise ValueError(f"{path} : aucun mesh dans le glTF")
    if len(meshes) > 1:
        logger.warning("%s : %d meshes trouvés, un seul est attendu — on utilise le premier", path, len(meshes))

    mesh = meshes[0]
    primitives = mesh.get("primitives", [])
    if not primitives:
        raise ValueError(f"{path} : aucune primitive dans le mesh")
    if len(primitives) > 1:
        logger.warning("%s : %d primitives trouvées, une seule est attendue — on utilise la première", path, len(primitives))

    prim = primitives[0]
    position_idx = prim["attributes"]["POSITION"]
    vertices = _read_accessor(gltf, binary, position_idx)

    indices_idx = prim.get("indices")
    if indices_idx is not None:
        faces_flat = _read_accessor(gltf, binary, indices_idx).reshape(-1)
        faces = faces_flat.reshape(-1, 3).astype(np.uint32)
    else:
        faces = np.arange(len(vertices), dtype=np.uint32).reshape(-1, 3)

    target_names: list[str] = mesh.get("extras", {}).get("targetNames", [])
    targets = prim.get("targets", [])
    if target_names and len(target_names) != len(targets):
        logger.warning(
            "%s : %d noms de cibles pour %d targets glTF — correspondance par index tronquée",
            path, len(target_names), len(targets),
        )

    target_deltas: dict[str, np.ndarray] = {}
    for i, target in enumerate(targets):
        if "POSITION" not in target:
            continue
        name = target_names[i] if i < len(target_names) else f"target_{i}"
        target_deltas[name] = _read_accessor(gltf, binary, target["POSITION"])

    return BaseMesh(vertices=vertices, faces=faces, target_deltas=target_deltas)


@lru_cache(maxsize=2)
def load_base_mesh(gender: str) -> BaseMesh:
    """
    Charge (et met en cache process) le maillage de base pour "male" ou
    "female", depuis les mêmes fichiers GLB que ceux embarqués dans l'app
    mobile — c'est important : mesurer un autre maillage que celui
    réellement rendu chez le client n'aurait aucun sens.
    """
    if gender not in ("male", "female"):
        raise ValueError(f"gender invalide: {gender!r}")
    path = Path(__file__).resolve().parent / "base_meshes" / f"avatar-base-{gender}.glb"
    if not path.exists():
        raise FileNotFoundError(f"Maillage de base introuvable : {path}")
    return _load_glb(path)


def apply_weights(base: BaseMesh, weights: dict[str, float]) -> np.ndarray:
    """
    Déforme le maillage neutre par une somme pondérée de deltas de cibles —
    exactement le calcul que fait three.js via `mesh.morphTargetInfluences`
    côté mobile (voir Viewer3D.tsx). Les clés de `weights` absentes du
    maillage (nom de cible inconnu) sont ignorées silencieusement, comme
    côté client (voir le commentaire de `_target_name` dans
    optimize_weights.py : un nom qui ne correspond à aucune cible ne doit
    pas faire échouer tout le calcul).
    """
    verts = base.vertices.copy()
    for name, weight in weights.items():
        delta = base.target_deltas.get(name)
        if delta is None or weight == 0.0:
            continue
        verts += weight * delta
    return verts
