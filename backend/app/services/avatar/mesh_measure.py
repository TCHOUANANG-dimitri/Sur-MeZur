"""
Mesure de tours anatomiques sur un maillage déformé — pur numpy, sans Blender.

Portage de la logique déjà validée dans `calibrate_sensitivity.py`
(exécutée UNE FOIS hors ligne avec bpy/bmesh pour calibrer la matrice de
sensibilité) vers une version pure Python utilisable à chaque requête, en
production, sans Blender. L'algorithme (coupe par plan horizontal, boucles
par composantes connexes, sélection de la boucle du torse par périmètre
maximal, garde de plausibilité) est le même que `calibrate_sensitivity.py`.

Les hauteurs de coupe (CUT_LEVELS) en revanche NE SONT PAS les mêmes
fractions numériques que celles de `calibrate_sensitivity.py` — ce fichier
mesure sur le maillage déjà exporté en GLB, où Blender a converti Z-up en
Y-up (voir `_HEIGHT_AXIS` plus bas), et la plage de hauteur totale du GLB
exporté (min/max de tous les sommets) ne coïncide pas exactement avec celle
mesurée en direct dans Blender (écart empirique ~2 cm sur ~166 cm, cause
exacte non identifiée — probablement une géométrie annexe qui élargit
légèrement la boîte englobante à l'export). Plutôt que de suivre cet écart
en aveugle, les fractions ci-dessous ont été recalibrées empiriquement pour
reproduire, sur le maillage neutre (tous poids à 0), les mesures de
référence déjà calibrées par Blender (`sensitivity/male.json` /
`female.json` :: `neutral_measurements`) — validé à moins de 0.3 cm d'écart
pour les 4 tours. Attention en particulier au tour de taille : le profil de
circonférence du tronc n'est PAS monotone (minimum géométrique vers 0.66-
0.68, distinct de la hauteur anatomique conventionnelle de la taille) — une
recherche de correspondance sans fenêtre de recherche autour de la valeur
d'origine de calibrate_sensitivity.py peut se caler sur le mauvais côté de
la courbe (vérifié : une recherche globale trouvait 0.712, sur la pente
remontant vers la cage thoracique, plutôt que 0.624, la vraie taille).
Si le maillage de base change, cette recalibration doit être refaite (voir
le script de calibration correspondant, à conserver dans
`ml/bench/experiments/` si cette approche est retenue en production).
CUT_LEVELS_BLENDER est conservée en commentaire pour référence uniquement,
ne pas l'utiliser directement dans ce fichier.
#   CUT_LEVELS_BLENDER = {"chest": 0.72, "waist": 0.58, "hips": 0.48, "neck": 0.88}
"""

from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger(__name__)

# Recalibrées empiriquement dans le repère du GLB exporté — voir docstring
# du module. NE PAS copier les valeurs de CUT_LEVELS de calibrate_sensitivity.py
# ici : elles sont dans un repère différent (Blender natif, Z-up) et donnent
# des mesures fausses de plusieurs centimètres sur le maillage exporté.
CUT_LEVELS: dict[str, float] = {
    "chest": 0.758,
    "waist": 0.624,
    "hips": 0.528,
    "neck": 0.844,
}

# Doit rester identique à OUTPUT_NAMES/_TOUR_GROUPS dans calibrate_sensitivity.py.
_OUTPUT_NAMES: dict[str, tuple[str, str, str]] = {
    "chest": ("chest", "chestbreadth", "chestdepth"),
    "waist": ("waist", "waistbreadth", "waistdepth"),
    "hips": ("hips", "hipbreadth", "buttockdepth"),
    "neck": ("neck", "neckbreadth", "neckdepth"),
}

_PLAUSIBILITY_MIN_RATIO = 0.7  # même seuil que _sanitize_measurements côté Blender

# L'exporteur glTF de Blender convertit systématiquement Z-up (Blender) en
# Y-up (glTF) : gltf_X=blender_X, gltf_Y=blender_Z (hauteur), gltf_Z=-blender_Y
# (profondeur). `calibrate_sensitivity.py` mesure la hauteur sur l'axe Z
# *dans Blender* ; ici, sur le GLB déjà exporté, la hauteur est sur Y (axe 1).
# Vérifié empiriquement : plage de l'axe Y ≈ 1.69 (cohérent avec la hauteur
# neutre de 165.94 cm) contre 0.44 pour Z et 0.99 pour X. Confondre les axes
# ici ne lève aucune erreur — juste des mesures silencieusement absurdes
# (déjà rencontré en développement : hanches à 246 cm) — d'où ce commentaire.
_HEIGHT_AXIS = 1
_WIDTH_AXIS = 0
_DEPTH_AXIS = 2


def _plane_slice_segments(vertices: np.ndarray, faces: np.ndarray, z_cut: float) -> np.ndarray:
    """
    Intersecte le maillage par un plan horizontal z=z_cut.

    Équivalent pur numpy de `bmesh.ops.bisect_plane` pour ce cas d'usage
    précis (un seul plan, pas de découpe persistante du maillage) : pour
    chaque triangle dont la coupe traverse le plan, calcule le segment
    d'intersection par interpolation linéaire le long des arêtes.

    Returns:
        (K, 2, 3) — K segments, chacun 2 points 3D.
    """
    tri = vertices[faces]  # (M, 3, 3)
    z = tri[:, :, _HEIGHT_AXIS]
    zmin = z.min(axis=1)
    zmax = z.max(axis=1)
    candidates = np.nonzero((zmin <= z_cut) & (zmax >= z_cut))[0]
    if candidates.size == 0:
        return np.empty((0, 2, 3), dtype=np.float32)

    edge_pairs = ((0, 1), (1, 2), (2, 0))
    segments: list[np.ndarray] = []
    for ti in candidates:
        t = tri[ti]
        zt = z[ti]
        pts: list[np.ndarray] = []
        for a, b in edge_pairs:
            za, zb = zt[a], zt[b]
            if (za - z_cut) * (zb - z_cut) < 0.0:
                frac = (z_cut - za) / (zb - za)
                pts.append(t[a] + frac * (t[b] - t[a]))
            elif abs(za - z_cut) < 1e-9:
                pts.append(t[a])
            if len(pts) == 2:
                break
        if len(pts) == 2:
            segments.append(np.stack(pts))

    if not segments:
        return np.empty((0, 2, 3), dtype=np.float32)
    return np.stack(segments)


def _group_loops(segments: np.ndarray, tol: float = 1e-5) -> list[np.ndarray]:
    """
    Regroupe les segments d'intersection en boucles connexes (composantes
    connexes par sommets partagés) — équivalent du parcours d'arêtes déjà
    validé dans `calibrate_sensitivity.py::_measure_at_level` (nécessaire
    car en pose neutre, bras et torse traversent le même plan horizontal :
    voir le commentaire détaillé de cette fonction sur le bug déjà rencontré
    en triant par angle autour d'un centre unique au lieu de suivre la
    connectivité réelle du maillage).
    """
    if len(segments) == 0:
        return []

    def key(p: np.ndarray) -> tuple[int, int, int]:
        return tuple(np.round(p / tol).astype(np.int64))

    adjacency: dict[tuple, list[int]] = {}
    for i, (p0, p1) in enumerate(segments):
        adjacency.setdefault(key(p0), []).append(i)
        adjacency.setdefault(key(p1), []).append(i)

    visited: set[int] = set()
    loops: list[np.ndarray] = []
    for i in range(len(segments)):
        if i in visited:
            continue
        stack = [i]
        comp: list[int] = []
        while stack:
            si = stack.pop()
            if si in visited:
                continue
            visited.add(si)
            comp.append(si)
            for endpoint in segments[si]:
                for nb in adjacency.get(key(endpoint), []):
                    if nb not in visited:
                        stack.append(nb)
        loops.append(segments[comp])
    return loops


def _measure_at_level(vertices: np.ndarray, faces: np.ndarray, level_fraction: float) -> dict:
    """
    Mesure circonférence + largeur + profondeur (en cm) à une hauteur
    donnée du maillage, en ne retenant que la boucle du TORSE parmi les
    candidates (torse, bras qui croisent le même plan en pose neutre) —
    le critère est le périmètre maximal, voir le commentaire équivalent
    dans calibrate_sensitivity.py (déjà confirmé sur le maillage neutre).
    """
    z_min = vertices[:, _HEIGHT_AXIS].min()
    z_max = vertices[:, _HEIGHT_AXIS].max()
    z_cut = z_min + level_fraction * (z_max - z_min)

    segments = _plane_slice_segments(vertices, faces, z_cut)
    if segments.shape[0] < 3:
        return {"circumference_cm": 0.0, "width_cm": 0.0, "depth_cm": 0.0}

    loops = _group_loops(segments)
    if not loops:
        return {"circumference_cm": 0.0, "width_cm": 0.0, "depth_cm": 0.0}

    def loop_length(loop: np.ndarray) -> float:
        return float(np.sum(np.linalg.norm(loop[:, 1] - loop[:, 0], axis=1)))

    main_loop = max(loops, key=loop_length)
    circumference = loop_length(main_loop)
    pts = main_loop.reshape(-1, 3)
    width = float(pts[:, _WIDTH_AXIS].max() - pts[:, _WIDTH_AXIS].min())
    depth = float(pts[:, _DEPTH_AXIS].max() - pts[:, _DEPTH_AXIS].min())

    return {
        "circumference_cm": circumference * 100.0,
        "width_cm": width * 100.0,
        "depth_cm": depth * 100.0,
    }


def measure_tours(vertices: np.ndarray, faces: np.ndarray,
                   neutral_measurements: dict[str, float] | None = None) -> dict[str, float]:
    """
    Mesure les 4 tours de tronc calibrés (chest/waist/hips/neck) + leurs
    largeur/profondeur, avec les mêmes noms de sortie que
    `measurement_corrections`/`morph_weights` (chestbreadth, buttockdepth...).

    Si `neutral_measurements` est fourni, applique la même garde de
    plausibilité que côté Blender : une mesure qui s'effondre à moins de
    70% du neutre (typiquement la coupe hanches tombée sous l'entrejambe à
    poids extrême) est rejetée plutôt que renvoyée telle quelle — voir
    `_sanitize_measurements` dans calibrate_sensitivity.py pour le cas
    concret déjà rencontré.
    """
    results: dict[str, float] = {}
    for level_name, level_fraction in CUT_LEVELS.items():
        m = _measure_at_level(vertices, faces, level_fraction)
        circ_name, breadth_name, depth_name = _OUTPUT_NAMES[level_name]

        if neutral_measurements is not None:
            neutral_circ = neutral_measurements.get(circ_name, 0.0)
            if neutral_circ > 0 and m["circumference_cm"] < _PLAUSIBILITY_MIN_RATIO * neutral_circ:
                logger.warning(
                    "Mesure '%s' rejetée (%.1f cm < %.0f%% du neutre %.1f cm) — "
                    "probablement une coupe tombée hors du torse",
                    circ_name, m["circumference_cm"], _PLAUSIBILITY_MIN_RATIO * 100, neutral_circ,
                )
                continue

        results[circ_name] = m["circumference_cm"]
        results[breadth_name] = m["width_cm"]
        results[depth_name] = m["depth_cm"]

    return results
