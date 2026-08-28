"""
Infrastructure de test : capture vidéo multi-angle (rotation guidée).

Objectif de ce script (voir la discussion "piste vidéo multi-angle" —
RAPPORT_PROJET.md §6bis et la proposition d'amélioration externe, §3) :
préparer l'outillage pour évaluer, sur une vraie vidéo de rotation, si
fusionner plusieurs largeurs observées sous plusieurs angles réduit
l'erreur de mesure du tronc (poitrine/taille/hanches) par rapport au
pipeline actuel (une seule photo de face + une seule photo de profil).

Ce script NE MODIFIE RIEN en production. Il réutilise tel quel le pipeline
de vision existant (MediaPipe + MobileSAM, `app.services.vision.*`) sur des
frames extraites d'une vidéo, sans changer une ligne de ce pipeline.

État : l'extraction de frames et le calcul d'angle-proxy sont testables dès
maintenant (mécanique pure, aucun sujet réel nécessaire). La partie mesure
(measure_widths) ne peut être vérifiée qu'avec une vraie vidéo d'une
personne — pas encore disponible au moment de l'écriture. Ne pas faire
confiance aux nombres produits avant d'avoir vérifié visuellement les
frames extraites (voir --dump-frames) sur un cas réel.

Usage :
    python exp16_video_multiangle.py <video.mp4> --height 175 --weight 70 \
        --gender female [--n-frames 8] [--dump-frames out_dir/] \
        [--ground-truth chest=90,waist=75,hips=98]

Limite assumée (v1), à lever si les résultats la remettent en cause :
`measure_widths` (silhouette.py) est calibré pour deux orientations
seulement ("front"/"side" — la largeur de bande d'exclusion des bras
diffère entre les deux, voir sa docstring). Pour les angles intermédiaires,
ce script choisit la plus proche des deux plutôt qu'une troisième
exclusion dédiée — une approximation, pas une fusion réellement multi-
angle rigoureuse. La fusion de circonférence elle-même (voir
`fuse_circumference_naive`) applique la formule la plus simple proposée
dans la revue de littérature (moyenne des largeurs x pi) — délibérément
naïve, pour servir de première comparaison, pas de version finale.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# Rend le pipeline de vision existant importable sans installer le projet.
_BACKEND_ROOT = Path(__file__).resolve().parents[3] / "backend"
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


# ---------------------------------------------------------------------------
# Extraction de frames
# ---------------------------------------------------------------------------

@dataclass
class ExtractedFrame:
    path: Path
    t_seconds: float
    blur_score: float  # variance du Laplacien -- plus haut = plus net


def _blur_score(image) -> float:
    import cv2
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def extract_frames(video_path: str | Path, n_frames: int = 8,
                    out_dir: Path | None = None,
                    candidates_per_slot: int = 3) -> list[ExtractedFrame]:
    """
    Extrait `n_frames` images réparties régulièrement sur la durée de la
    vidéo. Pour chaque créneau temporel, échantillonne `candidates_per_slot`
    frames voisines et retient la plus nette (variance du Laplacien) --
    absorbe le flou de mouvement ponctuel plutôt que de le prendre tel quel.

    Rejette explicitement (au lieu d'improviser) si la vidéo ne peut pas
    être ouverte ou est trop courte pour le nombre de frames demandé --
    mieux vaut échouer clairement ici que produire une mesure sur des
    données insuffisantes en aval.
    """
    import cv2

    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(f"Vidéo introuvable : {video_path}")

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Impossible d'ouvrir la vidéo : {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_s = total_frames / fps if fps > 0 else 0.0

    if total_frames < n_frames * candidates_per_slot:
        logger.warning(
            "Vidéo courte (%d frames, %.1fs) pour %d créneaux x %d candidats — "
            "certains créneaux auront moins de candidats que prévu.",
            total_frames, duration_s, n_frames, candidates_per_slot,
        )

    out_dir = Path(out_dir) if out_dir else Path(tempfile.mkdtemp(prefix="exp16_frames_"))
    out_dir.mkdir(parents=True, exist_ok=True)

    results: list[ExtractedFrame] = []
    for slot in range(n_frames):
        # Créneau centré sur une fraction régulière de la vidéo (évite les
        # tout premiers/derniers instants, souvent immobiles avant/après le
        # geste de rotation lui-même).
        center_frac = (slot + 0.5) / n_frames
        center_idx = int(center_frac * total_frames)

        best = None
        span = max(1, total_frames // (n_frames * candidates_per_slot * 2))
        offsets = [0] + [d * span for k in range(1, candidates_per_slot) for d in (k, -k)]
        for off in offsets[:candidates_per_slot]:
            idx = min(max(center_idx + off, 0), total_frames - 1)
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok:
                continue
            score = _blur_score(frame)
            if best is None or score > best[1]:
                best = (frame, score, idx)

        if best is None:
            logger.warning("Créneau %d/%d : aucune frame lisible, ignoré", slot + 1, n_frames)
            continue

        frame, score, idx = best
        t_s = idx / fps if fps > 0 else 0.0
        frame_path = out_dir / f"frame_{slot:02d}_t{t_s:.2f}s.jpg"
        cv2.imwrite(str(frame_path), frame)
        results.append(ExtractedFrame(path=frame_path, t_seconds=t_s, blur_score=score))

    cap.release()
    if not results:
        raise RuntimeError("Aucune frame exploitable extraite de la vidéo")
    return results


# ---------------------------------------------------------------------------
# Angle-proxy : classement face <-> profil, PAS un angle en degrés
# ---------------------------------------------------------------------------

@dataclass
class FrameAngle:
    frame: ExtractedFrame
    ratio: float | None  # largeur épaules / hauteur torse -- haut = face/dos, bas = profil
    facing_camera: bool | None  # True = face, False = dos, None = indéterminable
    orientation_guess: str | None  # "front" | "back" | "side" | None si pose non détectée


def estimate_frame_angle(frame_path: Path):
    """
    Ratio largeur-épaules / hauteur-torse, mentionné dans la revue de
    littérature comme indicateur simple face/profil (déjà présent comme
    IDÉE dans le pipeline existant sous une autre forme -- voir la
    discussion sur l'estimation d'angle -- mais jamais implémenté comme
    fonction dédiée avant ce script).

    Ce n'est PAS un angle en degrés : juste un ordre relatif, valable pour
    classer des frames d'un même sujet entre elles (pas pour comparer entre
    sujets). Une calibration en degrés réels demanderait des vidéos de
    référence à angle connu (voir la proposition externe, §3.3) -- hors
    scope de ce script.

    Ce ratio seul NE DISTINGUE PAS face et dos (un dos large donne le même
    ratio épaules/torse qu'une face large) -- bug confirmé sur un premier
    essai réel : la frame de "référence face" choisie était en réalité une
    vue de dos, biaisant le tour de poitrine de -8 à -10 cm.

    Deuxième signal utilisé pour lever l'ambiguïté : la PROFONDEUR 3D
    (repère `world` de MediaPipe, mètres, origine hanches) du nez comparée
    à celle des épaules. De face, le nez est plus proche de la caméra que
    les épaules (z plus négatif) ; de dos, il est plus loin (z plus grand).
    Un premier essai avec la VISIBILITÉ du nez (au lieu de sa profondeur)
    a échoué : vérifié empiriquement, MediaPipe renvoie une visibilité
    proche de 1.0 même de dos (le modèle extrapole une position plausible
    avec confiance, la visibilité n'encode pas l'occlusion réelle due à
    l'orientation du corps) -- ne pas réutiliser ce signal.

    Returns:
        (ratio, facing_camera, PoseResult) -- facing_camera est None si le
        repère `world` est indisponible ; (None, None, None) si la pose
        n'est pas détectée.
    """
    from app.services.vision import pose as pose_mod

    pose = pose_mod.extract_pose(str(frame_path))
    if pose is None:
        return None, None, None

    shoulder_w = pose.distance(pose_mod.LEFT_SHOULDER, pose_mod.RIGHT_SHOULDER)
    shoulder_mid = pose.midpoint(pose_mod.LEFT_SHOULDER, pose_mod.RIGHT_SHOULDER)
    hip_mid = pose.midpoint(pose_mod.LEFT_HIP, pose_mod.RIGHT_HIP)
    torso_h = abs(hip_mid[1] - shoulder_mid[1])

    facing_camera = None
    if pose.world is not None:
        nose_z = pose.world[pose_mod.NOSE].z
        shoulder_mid_z = (pose.world[pose_mod.LEFT_SHOULDER].z + pose.world[pose_mod.RIGHT_SHOULDER].z) / 2
        facing_camera = nose_z < shoulder_mid_z

    if torso_h <= 0:
        return None, facing_camera, pose
    return shoulder_w / torso_h, facing_camera, pose


def classify_frames(frames: list[ExtractedFrame]) -> list[FrameAngle]:
    """
    Classe chaque frame en "front" (face à la caméra), "back" (de dos) ou
    "side" (profil). Le ratio épaules/torse sépare d'abord l'axe face-dos
    (ratio haut) de l'axe profil (ratio bas, sous la médiane) ; parmi les
    frames sur l'axe face-dos, la profondeur 3D nez/épaules tranche entre
    "front" et "back". Un signal indéterminable (`facing_camera is None`,
    repère 3D absent) est traité comme "back" par défaut -- mieux vaut
    exclure une frame exploitable que risquer de mesurer une vue de dos
    comme si c'était une face (c'est exactement le bug déjà rencontré).
    Les frames "back" sont exclues de la mesure (voir measure_all_frames)
    -- measure_widths n'est calibré que pour "front" et "side".
    """
    results: list[FrameAngle] = []
    ratios = []
    for f in frames:
        ratio, facing_camera, _pose = estimate_frame_angle(f.path)
        results.append(FrameAngle(frame=f, ratio=ratio, facing_camera=facing_camera, orientation_guess=None))
        if ratio is not None:
            ratios.append(ratio)

    if not ratios:
        return results

    ratios_sorted = sorted(ratios)
    median = ratios_sorted[len(ratios_sorted) // 2]
    for r in results:
        if r.ratio is None:
            continue
        if r.ratio >= median:
            r.orientation_guess = "front" if r.facing_camera else "back"
        else:
            r.orientation_guess = "side"
    return results


# ---------------------------------------------------------------------------
# Mesure par frame + fusion
# ---------------------------------------------------------------------------

@dataclass
class LevelWidths:
    chest: list[float] = field(default_factory=list)
    waist: list[float] = field(default_factory=list)
    hip: list[float] = field(default_factory=list)


@dataclass
class LevelWidthsByOrientation:
    """Mêmes largeurs que LevelWidths, séparées par orientation -- nécessaire
    pour fuse_circumference_robust_ellipse (médiane des faces, médiane des
    profils), qui ne doit jamais mélanger largeur et profondeur dans la
    même liste comme le fait la fusion naïve."""
    front: LevelWidths = field(default_factory=LevelWidths)
    side: LevelWidths = field(default_factory=LevelWidths)


def measure_all_frames(frames_angles: list[FrameAngle], height_cm: float) -> dict:
    """
    Mesure chaque frame classée avec le pipeline existant (silhouette.py),
    en imposant les mêmes niveaux anatomiques (`levels`) que la première
    frame "front" trouvée -- même contrat que le pipeline actuel
    (front d'abord, puis les autres mesurées aux mêmes hauteurs).

    Returns:
        dict avec "levels" (niveaux détectés), "cm_per_pixel" (échelle de
        la frame de référence), "widths_cm" (LevelWidths, une valeur par
        frame exploitable, en cm).
    """
    from app.services.vision import pose as pose_mod
    from app.services.vision import silhouette as sil_mod
    from app.services.vision.scale import estimate_scale

    front_candidates = [fa for fa in frames_angles if fa.orientation_guess == "front"]
    if not front_candidates:
        raise RuntimeError("Aucune frame classée 'front' -- impossible de fixer les niveaux de mesure")

    reference = max(front_candidates, key=lambda fa: fa.ratio or 0.0)
    ref_pose = pose_mod.extract_pose(str(reference.frame.path))
    if ref_pose is None:
        raise RuntimeError("Pose non détectée sur la frame de référence")

    cm_per_pixel = estimate_scale(ref_pose, height_cm)
    if not cm_per_pixel:
        raise RuntimeError("Échelle (cm/pixel) non calculable sur la frame de référence")

    ref_widths = sil_mod.measure_widths(str(reference.frame.path), ref_pose, orientation="front")
    if ref_widths is None or ref_widths.levels is None:
        raise RuntimeError("Niveaux de mesure non détectables sur la frame de référence")
    levels = ref_widths.levels

    widths_cm = LevelWidths()
    by_orientation = LevelWidthsByOrientation()
    per_frame_report = []
    rejected_back = 0
    for fa in frames_angles:
        if fa.orientation_guess is None:
            continue
        if fa.orientation_guess == "back":
            # measure_widths n'est calibré que pour "front"/"side" -- une vue
            # de dos avec l'exclusion des bras "front" donnerait une largeur
            # fausse (cause confirmée du biais de -8 à -10 cm sur la
            # poitrine lors du premier essai). Exclue plutôt que mal mesurée.
            rejected_back += 1
            continue
        pose = pose_mod.extract_pose(str(fa.frame.path))
        if pose is None:
            continue
        w = sil_mod.measure_widths(str(fa.frame.path), pose, orientation=fa.orientation_guess, levels=levels)
        if w is None:
            continue
        widths_cm.chest.append(w.chest_px * cm_per_pixel)
        widths_cm.waist.append(w.waist_px * cm_per_pixel)
        widths_cm.hip.append(w.hip_px * cm_per_pixel)
        target = by_orientation.front if fa.orientation_guess == "front" else by_orientation.side
        target.chest.append(w.chest_px * cm_per_pixel)
        target.waist.append(w.waist_px * cm_per_pixel)
        target.hip.append(w.hip_px * cm_per_pixel)
        per_frame_report.append({
            "frame": fa.frame.path.name,
            "t_s": round(fa.frame.t_seconds, 2),
            "ratio": round(fa.ratio, 3) if fa.ratio else None,
            "orientation_guess": fa.orientation_guess,
            "chest_cm": round(w.chest_px * cm_per_pixel, 1),
            "waist_cm": round(w.waist_px * cm_per_pixel, 1),
            "hip_cm": round(w.hip_px * cm_per_pixel, 1),
        })

    return {
        "levels": {"chest": levels.chest, "waist": levels.waist, "hip": levels.hip},
        "cm_per_pixel": cm_per_pixel,
        "widths_cm": widths_cm,
        "by_orientation": by_orientation,
        "per_frame": per_frame_report,
        "reference_frame": reference.frame.path.name,
        "rejected_back": rejected_back,
    }


def _reject_outliers(values: list[float], low_ratio: float = 0.5, high_ratio: float = 1.8) -> tuple[list[float], int]:
    """
    Filtre les largeurs manifestement fausses avant fusion -- absent avant ce
    correctif, ce qui laissait une seule frame de silhouette mal segmentée
    (ex. arrière-plan chargé perturbant MobileSAM) fausser toute la moyenne à
    poids égal. Cas concret rencontré : 6,9 cm de largeur de hanches sur une
    frame par ailleurs nette, contre ~30 cm sur les frames voisines.

    Rejette toute valeur hors de [low_ratio, high_ratio] x médiane des
    valeurs valides -- mêmes ordres de grandeur que la garde de plausibilité
    déjà utilisée pour la mesure du maillage avatar (mesh_measure.py, rejet
    sous 70% du neutre), pas une méthode statistique sophistiquée. Ne
    rejette rien si ça laisserait moins de 3 valeurs (pas assez de données
    pour distinguer un vrai outlier d'une variation normale).
    """
    if len(values) < 3:
        return values, 0
    sorted_v = sorted(values)
    median = sorted_v[len(sorted_v) // 2]
    if median <= 0:
        return values, 0
    kept = [v for v in values if low_ratio * median <= v <= high_ratio * median]
    if len(kept) < 3:
        return values, 0
    return kept, len(values) - len(kept)


def fuse_circumference_naive(widths_cm: list[float]) -> tuple[float | None, int]:
    """
    Fusion la plus simple possible : circonférence ~= pi * moyenne des
    largeurs observées sous plusieurs angles (proposition externe, §3.4).
    Volontairement naïve -- ne remplace PAS l'ellipse face+profil actuelle,
    sert de première comparaison seulement (voir limites en tête de fichier :
    une largeur observée à un angle intermédiaire n'est pas un rayon
    indépendant, c'est une projection oblique -- cette formule l'ignore).

    Returns:
        (circonférence_cm ou None, nombre de valeurs rejetées comme aberrantes)
    """
    valid = [w for w in widths_cm if w and w > 0]
    if len(valid) < 3:
        return None, 0
    kept, n_rejected = _reject_outliers(valid)
    return math.pi * (sum(kept) / len(kept)), n_rejected


def fuse_circumference_ellipse(front_width_cm: float | None, side_depth_cm: float | None) -> float | None:
    """Formule actuelle de production (Ramanujan, ellipse face+profil) -- pour comparaison."""
    if not front_width_cm or not side_depth_cm:
        return None
    a, b = front_width_cm / 2.0, side_depth_cm / 2.0
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


def _median(values: list[float]) -> float | None:
    valid = sorted(v for v in values if v and v > 0)
    if not valid:
        return None
    n = len(valid)
    mid = n // 2
    return valid[mid] if n % 2 else (valid[mid - 1] + valid[mid]) / 2.0


def fuse_circumference_robust_ellipse(front_values_cm: list[float], side_values_cm: list[float]) -> dict:
    """
    Même formule que la production (fuse_circumference_ellipse), mais
    nourrie par la MÉDIANE de plusieurs observations de largeur de face et
    de profondeur de profil (issues de la rotation), au lieu d'une seule
    photo de chaque comme aujourd'hui. Teste directement l'hypothèse de
    départ de la piste vidéo (plusieurs observations réduisent le bruit
    d'une seule photo ratée) sans changer de modèle géométrique -- contrairement
    à fuse_circumference_naive, qui mélangeait largeur et profondeur dans
    une seule moyenne (biais structurel déjà mesuré, pas juste du bruit).

    Returns:
        {"circumference_cm", "front_median_cm", "side_median_cm",
         "n_front", "n_side"}
    """
    front_median = _median(front_values_cm)
    side_median = _median(side_values_cm)
    return {
        "circumference_cm": fuse_circumference_ellipse(front_median, side_median),
        "front_median_cm": front_median,
        "side_median_cm": side_median,
        "n_front": len([v for v in front_values_cm if v and v > 0]),
        "n_side": len([v for v in side_values_cm if v and v > 0]),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_ground_truth(s: str | None) -> dict[str, float]:
    if not s:
        return {}
    out = {}
    for part in s.split(","):
        k, _, v = part.partition("=")
        if k and v:
            out[k.strip()] = float(v.strip())
    return out


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", help="Chemin de la vidéo de rotation")
    parser.add_argument("--height", type=float, required=True, help="Taille déclarée (cm)")
    parser.add_argument("--weight", type=float, default=None, help="Poids déclaré (kg), optionnel")
    parser.add_argument("--gender", default="unknown")
    parser.add_argument("--n-frames", type=int, default=8)
    parser.add_argument("--dump-frames", type=str, default=None,
                         help="Dossier où sauvegarder les frames extraites (inspection visuelle)")
    parser.add_argument("--ground-truth", type=str, default=None,
                         help="ex: chest=90,waist=75,hips=98 (mètre ruban, pour comparaison)")
    args = parser.parse_args()

    ground_truth = _parse_ground_truth(args.ground_truth)
    dump_dir = Path(args.dump_frames) if args.dump_frames else None

    print(f"Extraction de {args.n_frames} frames depuis {args.video}...")
    frames = extract_frames(args.video, n_frames=args.n_frames, out_dir=dump_dir)
    print(f"{len(frames)} frames extraites" + (f" -> {dump_dir}" if dump_dir else " (dossier temporaire)"))

    print("Classement face/dos/profil (ratio épaules/torse + visibilité du nez)...")
    frames_angles = classify_frames(frames)
    n_front = sum(1 for fa in frames_angles if fa.orientation_guess == "front")
    n_back = sum(1 for fa in frames_angles if fa.orientation_guess == "back")
    n_side = sum(1 for fa in frames_angles if fa.orientation_guess == "side")
    n_failed = sum(1 for fa in frames_angles if fa.orientation_guess is None)
    print(f"  front={n_front}  back={n_back}  side={n_side}  pose_non_detectee={n_failed}")

    print("Mesure de chaque frame (MediaPipe + MobileSAM)...")
    result = measure_all_frames(frames_angles, args.height)
    if result["rejected_back"]:
        print(f"  {result['rejected_back']} frame(s) 'dos' exclue(s) de la mesure (voir classement ci-dessus)")

    print(f"\nFrame de référence (face) : {result['reference_frame']}")
    print(f"Échelle : {result['cm_per_pixel']:.4f} cm/pixel")
    print("\nPar frame :")
    for row in result["per_frame"]:
        print(f"  {row}")

    widths = result["widths_cm"]
    by_orientation = result["by_orientation"]
    report = {}
    for name, values in (("chest", widths.chest), ("waist", widths.waist), ("hip", widths.hip)):
        naive, n_rejected = fuse_circumference_naive(values)
        front_values = getattr(by_orientation.front, name)
        side_values = getattr(by_orientation.side, name)
        robust = fuse_circumference_robust_ellipse(front_values, side_values)
        report[name] = {
            "n_frames_valides": len(values),
            "n_aberrantes_rejetees": n_rejected,
            "circonference_naive_cm": round(naive, 1) if naive else None,
            "circonference_ellipse_robuste_cm": round(robust["circumference_cm"], 1) if robust["circumference_cm"] else None,
            "ellipse_robuste_detail": {
                "face_mediane_cm": round(robust["front_median_cm"], 1) if robust["front_median_cm"] else None,
                "profil_mediane_cm": round(robust["side_median_cm"], 1) if robust["side_median_cm"] else None,
                "n_face": robust["n_front"],
                "n_profil": robust["n_side"],
            },
        }
        if name in ground_truth:
            cible = ground_truth[name]
            report[name]["cible_metre_ruban_cm"] = cible
            if naive:
                report[name]["ecart_naive_cm"] = round(naive - cible, 2)
            if robust["circumference_cm"]:
                report[name]["ecart_ellipse_robuste_cm"] = round(robust["circumference_cm"] - cible, 2)

    print("\n=== Résultat fusion multi-angle : naïve (pi * moyenne) vs ellipse robuste (médiane face + médiane profil) ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(
        "\nRappel : comparer ces deux méthodes ET la sortie du pipeline actuel "
        "sur les mêmes deux photos (face+profil uniques) avant toute conclusion "
        "— voir les limites documentées en tête de fichier."
    )


if __name__ == "__main__":
    main()
