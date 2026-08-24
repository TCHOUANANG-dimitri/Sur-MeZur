"""
Outillage de développement, à exécuter UNE FOIS avec Blender.

Mesure empiriquement l'effet de CHAQUE cible morphologique sur ~12-16
mensurations virtuelles du maillage, à des poids 0 / 0.25 / 0.5 / 0.75 / 1.0.

Le résultat est une matrice de sensibilité sauvegardée en JSON, utilisée
ensuite par le backend (Python pur, sans Blender) pour résoudre un petit
problème d'optimisation par client : quels poids font correspondre les
mesures virtuelles de l'avatar aux mesures réelles du client.

Pourquoi ce script existe :
  L'ancien mécanisme poids=|z| supposait qu'un z-score de 0.5 correspond
  exactement à la moitié de l'amplitude maximale du morph target. Rien n'a
  jamais vérifié cette hypothèse — et elle est fausse : un morph target
  MakeHuman a sa propre courbe de réponse, pas nécessairement linéaire.

Simplification assumée (v1), à lever si les résultats la remettent en
cause : seul le sens "-incr" de chaque cible est mesuré (poids 0 à 1) ;
l'effet du sens "-decr" est supposé être le miroir exact (même amplitude,
signe opposé) plutôt que mesuré séparément. C'est raisonnable pour les
cibles `measure-*` (poitrine/taille/hanches/etc.), conçues par paire
symétrique autour du neutre, moins garanti pour les cibles de forme
(torso, fessiers). Mesurer aussi "-decr" doublerait le temps de calibration
(actuellement ~5 evaluations Blender par cible) — vaut le coût seulement
si l'écart mesuré s'avère significatif en pratique.

Usage :
    blender --background --python calibrate_sensitivity.py -- male   <sortie.json>
    blender --background --python calibrate_sensitivity.py -- female <sortie.json>

Sortie : un fichier JSON contenant, pour chaque cible et chaque poids,
les mesures virtuelles du maillage déformé.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generator as gen

import bpy
import bmesh
from mathutils import Vector


# ---------------------------------------------------------------------------
# Hauteurs anatomiques de coupe (fraction de la hauteur totale du maillage)
# ---------------------------------------------------------------------------
# Ces hauteurs définissent OÙ couper le maillage pour mesurer chaque tour.
# Elles sont ancrées sur les proportions du maillage neutre MPFB et doivent
# être ajustées si le maillage de base change significativement.

CUT_LEVELS = {
    # Tours de tronc (coupes horizontales)
    "chest":     0.72,   # sous les aisselles, milieu de la cage thoracique
    "waist":     0.58,   # taille anatomique (creux lombaire)
    # 0.47 tombe SOUS l'entrejambe : la coupe y traverse les deux cuisses
    # séparément (2 boucles de ~53 cm) plutôt que le bassin en un seul
    # anneau — confirmé en balayant 0.44 à 0.58 sur le maillage neutre :
    # une boucle unique n'existe qu'entre 0.48 et 0.52, avec un maximum de
    # circonférence (103,4 cm, cohérent avec la référence ANSUR ~102 cm) à
    # 0.48, juste au-dessus de la séparation des jambes.
    "hips":      0.48,   # hanches, au plus large des fessiers
    # Tours de membres (coupes ou mesures sur les os)
    "biceps":    None,   # mesuré sur le bras, pas par coupe tronc
    "thigh":     None,   # mesuré sur la cuisse
    "neck":      0.88,   # base du cou
    "wrist":     None,   # mesuré sur l'avant-bras
    "ankle":     None,   # mesuré sur la cheville
    # Longueurs (distances entre points squelettiques)
    "shoulder":  None,   # largeur entre épaules (pas une coupe)
    "sleeve":    None,   # longueur de manche
    "back":      None,   # longueur de dos
    "inseam":    None,   # entrejambe
}


def _get_positional(index: int) -> str | None:
    try:
        sep = sys.argv.index("--")
    except ValueError:
        return None
    pos = sep + 1 + index
    return sys.argv[pos] if pos < len(sys.argv) else None


def _get_evaluated_mesh(human) -> bmesh.types.BMesh:
    """Retourne le maillage évalué (shape keys appliquées) en BMesh."""
    deps = bpy.context.evaluated_depsgraph_get()
    ev = human.evaluated_get(deps)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    ev.to_mesh_clear()
    return bm


def _measure_height(human) -> float:
    """Hauteur totale du maillage évalué en cm."""
    deps = bpy.context.evaluated_depsgraph_get()
    ev = human.evaluated_get(deps)
    me = ev.to_mesh()
    zs = [v.co.z for v in me.vertices]
    ev.to_mesh_clear()
    return (max(zs) - min(zs)) * 100.0 if zs else 0.0


def _measure_at_level(bm, level_fraction: float, height_cm: float,
                      axis: str = "x") -> dict:
    """
    Coupe le maillage par un plan horizontal à `level_fraction` de la hauteur
    et mesure la circonférence (périmètre de la boucle) + largeur/profondeur
    de la boîte englobante de la coupe.

    Utilise `bmesh.ops.bisect_plane` (l'opérateur de coupe natif de Blender)
    plutôt qu'un tri par angle autour d'un centre unique fait à la main :
    en pose neutre, les bras pendent le long du corps et croisent le MÊME
    plan de coupe horizontal que le torse à hauteur taille/hanches. Trier
    TOUS les points (torse + bras) par angle autour d'un centre commun
    produit un polygone qui saute d'une boucle à l'autre — un périmètre de
    plusieurs dizaines, parfois centaines de cm, mesuré et confirmé faux
    lors du premier essai (ex. +200 cm sur le tour de taille pour une seule
    cible à poids 1.0). `bisect_plane` trace la géométrie correctement
    connectée le long de la coupe ; regrouper ces arêtes en composantes
    connexes sépare naturellement le torse des bras, sans avoir à deviner
    une région d'exclusion.

    Args:
        bm: BMesh évalué
        level_fraction: hauteur de coupe en fraction [0,1] de la hauteur totale
        height_cm: hauteur totale du maillage en cm (non utilisé directement
                   ici, conservé pour compatibilité de signature)
        axis: non utilisé (largeur/profondeur toujours renvoyées ensemble)

    Returns:
        dict avec circumference_cm, width_cm, depth_cm
    """
    z_min = min(v.co.z for v in bm.verts)
    z_max = max(v.co.z for v in bm.verts)
    z_cut = z_min + level_fraction * (z_max - z_min)

    bm_copy = bm.copy()
    result = bmesh.ops.bisect_plane(
        bm_copy,
        geom=bm_copy.verts[:] + bm_copy.edges[:] + bm_copy.faces[:],
        dist=1e-5,
        plane_co=(0.0, 0.0, z_cut),
        plane_no=(0.0, 0.0, 1.0),
        clear_outer=False,
        clear_inner=False,
    )
    cut_edges = [e for e in result["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]

    if len(cut_edges) < 3:
        bm_copy.free()
        return {"circumference_cm": 0.0, "width_cm": 0.0, "depth_cm": 0.0}

    # Regrouper les arêtes de coupe en composantes connexes (une boucle par
    # membre traversant le plan : torse, bras gauche, bras droit...).
    edge_by_vert: dict = {}
    for e in cut_edges:
        for v in e.verts:
            edge_by_vert.setdefault(v, []).append(e)

    visited = set()
    loops = []
    for start in cut_edges:
        if start in visited:
            continue
        loop_edges = []
        stack = [start]
        while stack:
            e = stack.pop()
            if e in visited:
                continue
            visited.add(e)
            loop_edges.append(e)
            for v in e.verts:
                for e2 in edge_by_vert.get(v, ()):
                    if e2 not in visited:
                        stack.append(e2)
        loops.append(loop_edges)

    # Choisir la boucle du TORSE parmi les candidates (torse, bras, mains...
    # qui croisent le même plan horizontal en pose neutre). Le nombre
    # d'arêtes ne convient PAS comme critère : une main, plus finement
    # tessellée (doigts, articulations) qu'un anneau de torse, peut avoir
    # PLUS d'arêtes tout en étant physiquement plus petite (confirmé : 60
    # arêtes pour une main de 26,9 cm de périmètre contre 44 pour un torse
    # de 78,5 cm à hauteur taille). Le périmètre lui-même est le bon
    # critère : le torse est, à toutes les hauteurs de coupe utilisées ici,
    # la boucle physiquement la plus grande.
    main_loop = max(loops, key=lambda lp: sum(e.calc_length() for e in lp))
    circumference = sum(e.calc_length() for e in main_loop)
    verts_in_loop = {v for e in main_loop for v in e.verts}

    xs = [v.co.x for v in verts_in_loop]
    ys = [v.co.y for v in verts_in_loop]
    width = (max(xs) - min(xs)) * 100.0
    depth = (max(ys) - min(ys)) * 100.0

    bm_copy.free()
    return {
        "circumference_cm": circumference * 100.0,
        "width_cm": width,
        "depth_cm": depth,
    }


def _measure_tour_at_level(human, bm, level_name: str, height_cm: float) -> dict:
    """Mesure un tour spécifique à sa hauteur anatomique."""
    level = CUT_LEVELS.get(level_name)
    if level is None:
        return None
    return _measure_at_level(bm, level, height_cm)


def _measure_all_tours(human, height_cm: float) -> dict:
    """Mesure tous les tours de tronc sur le maillage évalué."""
    bm = _get_evaluated_mesh(human)
    results = {}
    for level_name in ("chest", "waist", "hips", "neck"):
        m = _measure_tour_at_level(human, bm, level_name, height_cm)
        if m:
            results[level_name] = m
    bm.free()
    return results


def _measure_all(human, height_cm: float) -> dict:
    """
    Mesure TOUTES les mensurations virtuelles du maillage.

    Returns:
        dict avec les mêmes clés que `measurements`/`features` côté serveur
        (body_params.py, ANSUR_MALE/FEMALE, _OPTIMIZATION_MEASURES dans
        morph_weights.py) — PAS les noms internes `level_name` utilisés pour
        indexer CUT_LEVELS. Les deux divergent pour les hanches : le
        vocabulaire réel est "hipbreadth"/"buttockdepth" (singulier, terme
        anatomique dédié), pas "hipsbreadth"/"hipsdepth" — une contrainte
        équivalente à celle déjà documentée dans target_map.py
        (PARAM_TO_TARGET) : un nom qui diverge d'un côté sans l'autre casse
        silencieusement le rapprochement des mesures, pas une erreur.
    """
    bm = _get_evaluated_mesh(human)

    results = {}

    # Correspondance nom interne de coupe -> vocabulaire réel des mesures.
    # chest/waist/neck : le tour ET les largeur/profondeur partagent la même
    # racine des deux côtés, pas de traduction nécessaire. hips diverge.
    OUTPUT_NAMES = {
        "chest": ("chest", "chestbreadth", "chestdepth"),
        "waist": ("waist", "waistbreadth", "waistdepth"),
        "hips":  ("hips", "hipbreadth", "buttockdepth"),
        "neck":  ("neck", "neckbreadth", "neckdepth"),
    }

    # Tours de tronc (par coupe)
    for level_name in ("chest", "waist", "hips", "neck"):
        m = _measure_tour_at_level(human, bm, level_name, height_cm)
        if m:
            circ_name, breadth_name, depth_name = OUTPUT_NAMES[level_name]
            results[circ_name] = m["circumference_cm"]
            results[breadth_name] = m["width_cm"]
            results[depth_name] = m["depth_cm"]

    bm.free()

    # Largeurs/longueurs restantes (à calibrer avec des repères squelettiques)
    # Pour l'instant, on ne mesure que les 4 tours de tronc + neck
    # Les membres (biceps, thigh, wrist, ankle) nécessitent des repères
    # anatomiques spécifiques sur le maillage — à ajouter quand les
    # hauteurs de coupe seront calibrées.

    return results


_TOUR_GROUPS = {
    "chest": ("chest", "chestbreadth", "chestdepth"),
    "waist": ("waist", "waistbreadth", "waistdepth"),
    "hips":  ("hips", "hipbreadth", "buttockdepth"),
    "neck":  ("neck", "neckbreadth", "neckdepth"),
}


def _sanitize_measurements(m: dict, neutral: dict, axis: str, w: float) -> dict:
    """
    Rejette une mesure de tour manifestement fausse plutôt que de
    l'enregistrer telle quelle.

    Un cas concret et confirmé : `leg_ratio` (longueur de jambe) déplace le
    genou/l'entrejambe par rapport aux hauteurs de coupe fixes (CUT_LEVELS,
    des fractions constantes de la hauteur totale) — au-delà d'un certain
    poids, la coupe "hanches" retombe SOUS l'entrejambe et mesure les deux
    cuisses séparées (~53 cm chacune) au lieu du bassin (~103 cm), un
    effondrement de -47 cm mesuré sur ce script pour cette cible précise.
    Rien dans la géométrie ne le distingue formellement d'un vrai effet
    sans reconstruire le suivi anatomique de l'entrejambe à chaque poids —
    hors de portée ici. On le détecte à la place par plausibilité : un
    tour ne devrait, pour l'amplitude testée ici (une seule cible à la
    fois), jamais RÉTRÉCIR de plus de 30 % par rapport au neutre. Un tel
    cas est traité comme un échec de mesure (retour à la valeur neutre,
    delta nul) plutôt qu'enregistré comme un effet réel.
    """
    out = dict(m)
    for tour, (circ_key, breadth_key, depth_key) in _TOUR_GROUPS.items():
        neutral_circ = neutral.get(circ_key, 0.0)
        measured_circ = m.get(circ_key, 0.0)
        if neutral_circ > 0 and measured_circ < 0.7 * neutral_circ:
            print(f"  ATTENTION '{axis}' @ w={w} : {circ_key}={measured_circ:.1f} cm "
                  f"(< 70% du neutre {neutral_circ:.1f}) — mesure rejetée, "
                  f"probablement la coupe tombée sous l'entrejambe ou hors du torse")
            out[circ_key] = neutral_circ
            out[breadth_key] = neutral.get(breadth_key, 0.0)
            out[depth_key] = neutral.get(depth_key, 0.0)
    return out


def _apply_single_target(targets_dir, param: str, weight: float) -> bool:
    """Charge une seule cible à un poids donné. Retourne True si succès."""
    # Chercher dans toutes les tables
    all_targets = {**gen.MEASURE_TARGETS, **gen.SHAPE_TARGETS,
                   **gen.BREADTH_DEPTH_TARGETS, **gen.PROPORTION_TARGETS}

    if param in all_targets:
        sous, racine = all_targets[param]
        return gen._load_target(targets_dir, sous, racine, weight) is not None

    # Cibles spéciales (torso width/depth, fat, muscle, breast)
    if param == "torso_width":
        return gen._load_target(targets_dir, *gen.TORSO_WIDTH_TARGET, weight) is not None
    if param == "torso_depth":
        return gen._load_target(targets_dir, *gen.TORSO_DEPTH_TARGET, weight) is not None

    return False


def calibrate(gender: str, output_path: str) -> None:
    """
    Fonction principale : pour chaque cible, mesure l'effet de poids
    0 / 0.25 / 0.5 / 0.75 / 1.0 sur les mensurations virtuelles.
    """
    gen._clear_scene()
    human = gen._create_human()
    if human is None:
        print("Erreur : impossible de créer le corps MPFB")
        sys.exit(1)

    targets_dir = gen._targets_dir()
    if targets_dir is None:
        print("Cibles MakeHuman introuvables")
        sys.exit(1)

    # Charger toutes les cibles à poids 0 (comme export_base_mesh.py)
    total = 0
    for table in (gen.MEASURE_TARGETS, gen.SHAPE_TARGETS,
                  gen.BREADTH_DEPTH_TARGETS, gen.PROPORTION_TARGETS):
        for _param, (sous, racine) in table.items():
            for sens in ("incr", "decr"):
                if gen._load_fichier(targets_dir, sous, f"{racine}-{sens}.target.gz", 0.0):
                    total += 1
    total += gen._load_fichier(targets_dir, *gen.TORSO_WIDTH_TARGET, 0.0) is not None
    total += gen._load_fichier(targets_dir, *gen.TORSO_DEPTH_TARGET, 0.0) is not None

    if gender == "female":
        for sens in ("up", "down"):
            if gen._load_fichier(targets_dir, "breast", f"breast-volume-vert-{sens}.target.gz", 0.0):
                total += 1

    print(f"{total} shape key(s) chargée(s)")

    # Mesure de référence (maillage neutre, toutes cibles à 0)
    height_neutral = _measure_height(human)
    measurements_neutral = _measure_all(human, height_neutral)
    print(f"Hauteur neutre : {height_neutral:.2f} cm")
    print(f"Mesures neutres : {json.dumps({k: round(v, 1) for k, v in measurements_neutral.items()}, indent=2)}")

    # Calibration : pour chaque axe, mesurer à 5 niveaux de poids
    sensitivity = {}
    axes_to_test = list(gen.MEASURE_TARGETS.keys()) + list(gen.SHAPE_TARGETS.keys()) \
        + list(gen.BREADTH_DEPTH_TARGETS.keys()) + list(gen.PROPORTION_TARGETS.keys()) \
        + ["torso_width", "torso_depth"]

    weight_levels = [0.0, 0.25, 0.5, 0.75, 1.0]

    for axis in axes_to_test:
        print(f"\nCalibration de '{axis}'...")
        axis_data = {"neutral": measurements_neutral}

        for w in weight_levels:
            # Réinitialiser la scène
            gen._clear_scene()
            human = gen._create_human()

            # Recharger toutes les cibles à 0
            for table in (gen.MEASURE_TARGETS, gen.SHAPE_TARGETS,
                          gen.BREADTH_DEPTH_TARGETS, gen.PROPORTION_TARGETS):
                for _param, (sous, racine) in table.items():
                    gen._load_target(targets_dir, sous, racine, 0.0)
            gen._load_target(targets_dir, *gen.TORSO_WIDTH_TARGET, 0.0)
            gen._load_target(targets_dir, *gen.TORSO_DEPTH_TARGET, 0.0)
            if gender == "female":
                for sens in ("up", "down"):
                    gen._load_fichier(targets_dir, "breast", f"breast-volume-vert-{sens}.target.gz", 0.0)

            # Appliquer la cible testée au poids w
            _apply_single_target(targets_dir, axis, w)

            # Mesurer
            h = _measure_height(human)
            m = _sanitize_measurements(_measure_all(human, h), measurements_neutral, axis, w)
            axis_data[f"w{w}"] = m

        sensitivity[axis] = axis_data
        # Afficher un résumé
        for tour in ("chest", "waist", "hips"):
            vals = [axis_data.get(f"w{w}", {}).get(tour, 0) for w in weight_levels]
            deltas = [v - vals[0] for v in vals]
            print(f"  {tour}: {[f'{d:+.1f}' for d in deltas]} cm")

    # Sauvegarder
    output = {
        "gender": gender,
        "neutral_height_cm": height_neutral,
        "neutral_measurements": measurements_neutral,
        "sensitivity": sensitivity,
        "weight_levels": weight_levels,
    }
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nMatrice de sensibilité sauvegardée : {output_path}")


def main() -> None:
    gender = _get_positional(0)
    output_path = _get_positional(1)
    if gender not in ("male", "female") or not output_path:
        print("Usage: blender --background --python calibrate_sensitivity.py -- <male|female> <sortie.json>")
        sys.exit(1)
    calibrate(gender, output_path)


if __name__ == "__main__":
    main()
