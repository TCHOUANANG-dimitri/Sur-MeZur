"""
Inspection de la chaîne de mesure — outil en ligne de commande.

Rien de tout ceci n'est exposé dans l'application : c'est un outil d'atelier,
destiné à comprendre ce que MediaPipe a réellement produit et à confronter ses
estimations à un vrai mètre ruban.

    cd backend
    .\\venv\\Scripts\\python.exe scripts/inspect_pose.py photo_face.jpg ^
        --side photo_profil.jpg --height 175 --weight 78 --sexe male

Produit :
  - un rapport lisible dans le terminal (points, échelle, variables, prédictions)
  - une image annotée `<photo>_annotee.jpg` avec le squelette et les repères
  - optionnellement un JSON complet (--json trace.json)

Avec `--reel`, compare les prédictions à de vraies mensurations et affiche
l'écart — c'est ainsi qu'on mesure le bruit réel de la chaîne.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Rendre `app` importable quel que soit le dossier d'appel.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.vision import pose as pose_mod  # noqa: E402
from app.services.vision import silhouette as silhouette_mod  # noqa: E402
from app.services.vision.features import (  # noqa: E402
    build_geometric_measurements,
    build_model_features,
)
from app.services.vision.scale import estimate_scale  # noqa: E402
from app.services import measurement_model  # noqa: E402

# Nom lisible des 33 points MediaPipe.
LANDMARK_NAMES = [
    "nez", "oeil_int_G", "oeil_G", "oeil_ext_G", "oeil_int_D", "oeil_D", "oeil_ext_D",
    "oreille_G", "oreille_D", "bouche_G", "bouche_D",
    "epaule_G", "epaule_D", "coude_G", "coude_D", "poignet_G", "poignet_D",
    "auriculaire_G", "auriculaire_D", "index_G", "index_D", "pouce_G", "pouce_D",
    "hanche_G", "hanche_D", "genou_G", "genou_D", "cheville_G", "cheville_D",
    "talon_G", "talon_D", "pied_G", "pied_D",
]

# Points réellement utilisés par le calcul des mensurations.
KEY_POINTS = {11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28}

# Segments dessinés sur l'image annotée.
SKELETON = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28),
]

BAR = "-" * 72

# La console Windows est en cp1252 : sans cela, le moindre accent fait planter
# l'affichage avec une UnicodeEncodeError.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def annotate(image_path: Path, result: pose_mod.PoseResult, out_path: Path) -> bool:
    """Dessine le squelette et les points clés sur une copie de la photo."""
    try:
        import cv2
    except ImportError:
        return False

    img = cv2.imread(str(image_path))
    if img is None:
        return False

    for a, b in SKELETON:
        pa, pb = result.point(a), result.point(b)
        cv2.line(img, (int(pa.x), int(pa.y)), (int(pb.x), int(pb.y)), (180, 80, 40), 2)

    for i, lm in enumerate(result.landmarks):
        key = i in KEY_POINTS
        # Vert = point exploité et fiable, orange = exploité mais douteux,
        # gris = non utilisé par le calcul.
        if not key:
            color, radius = (150, 150, 150), 2
        elif lm.visibility >= 0.5:
            color, radius = (60, 200, 60), 5
        else:
            color, radius = (0, 165, 255), 5
        cv2.circle(img, (int(lm.x), int(lm.y)), radius, color, -1)
        if key:
            cv2.putText(img, str(i), (int(lm.x) + 7, int(lm.y) - 7),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

    cv2.imwrite(str(out_path), img)
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="Inspection de la chaîne de mesure")
    ap.add_argument("front", type=Path, help="photo de face")
    ap.add_argument("--side", type=Path, default=None, help="photo de profil")
    ap.add_argument("--height", type=float, required=True, help="taille en cm")
    ap.add_argument("--weight", type=float, required=True, help="poids en kg")
    ap.add_argument("--sexe", choices=["male", "female"], required=True)
    ap.add_argument("--json", type=Path, default=None, help="écrit la trace complète")
    ap.add_argument("--tous-les-points", action="store_true",
                    help="affiche les 33 points, pas seulement ceux utilisés")
    ap.add_argument("--reel", type=Path, default=None,
                    help="JSON de vraies mensurations pour comparer (ex. {\"waist\": 88.5})")
    args = ap.parse_args()

    if not args.front.exists():
        print(f"Photo introuvable : {args.front}")
        return 1

    print(BAR)
    print("INSPECTION DE LA CHAINE DE MESURE")
    print(BAR)
    print(f"  photo de face   : {args.front.name}")
    print(f"  photo de profil : {args.side.name if args.side else '(aucune)'}")
    print(f"  saisie client   : {args.height} cm, {args.weight} kg, {args.sexe}")

    print(f"\n{BAR}\n1. DISPONIBILITE\n{BAR}")
    print(f"  MediaPipe : {'oui' if pose_mod.is_available() else 'NON — ' + str(pose_mod.unavailable_reason())}")
    print(f"  SAM       : {'oui' if silhouette_mod.is_available() else 'non — ' + str(silhouette_mod.unavailable_reason())}")
    print(f"  modele {args.sexe:6} : {'charge' if measurement_model.is_available(args.sexe) else 'ABSENT'}")

    # --- Points de repère ---
    print(f"\n{BAR}\n2. POINTS DE REPERE (photo de face)\n{BAR}")
    front = pose_mod.extract_pose(args.front)
    if front is None:
        print("  ECHEC : aucune pose détectée.")
        print("  Vérifier que le corps entier est visible, de face, sur fond dégagé.")
        return 1

    print(f"  image {front.image_width}x{front.image_height} px, 33 points détectés")
    avg = sum(l.visibility for l in front.landmarks) / 33
    print(f"  visibilité moyenne : {avg:.2f}\n")
    print(f"  {'#':>3}  {'point':<14} {'x':>8} {'y':>8}  {'visib.':>7}  fiabilite")
    print(f"  {'-'*3}  {'-'*14} {'-'*8} {'-'*8}  {'-'*7}  {'-'*9}")
    for i, lm in enumerate(front.landmarks):
        if not args.tous_les_points and i not in KEY_POINTS:
            continue
        flag = "OK" if lm.visibility >= 0.5 else "DOUTEUX"
        star = "*" if i in KEY_POINTS else " "
        print(f"  {i:>3}{star} {LANDMARK_NAMES[i]:<14} {lm.x:>8.1f} {lm.y:>8.1f}  {lm.visibility:>7.3f}  {flag}")
    if not args.tous_les_points:
        print("\n  (* = utilisé par le calcul ; --tous-les-points pour les 33)")

    weak = [i for i in KEY_POINTS if front.point(i).visibility < 0.5]
    if weak:
        print(f"\n  ATTENTION : {len(weak)} point(s) utile(s) peu fiable(s) : "
              f"{', '.join(LANDMARK_NAMES[i] for i in sorted(weak))}")
        print("  Les mesures qui en dépendent seront imprécises.")

    # --- Échelle ---
    print(f"\n{BAR}\n3. ECHELLE PIXEL -> CM\n{BAR}")
    scale = estimate_scale(front, args.height)
    if scale is None:
        print("  ECHEC : pieds non visibles ou cadrage incohérent.")
        return 1
    print(f"  {scale:.4f} cm/pixel  (1 cm = {1/scale:.1f} px)")
    print("  Ancrée sur la taille saisie : une erreur ici décale TOUTES les mesures.")

    # --- Silhouette ---
    print(f"\n{BAR}\n4. SILHOUETTE (SAM)\n{BAR}")
    fw = silhouette_mod.measure_widths(args.front, front, orientation="front")
    sw = None
    side_scale = None
    if args.side and args.side.exists():
        side_pose = pose_mod.extract_pose(args.side)
        if side_pose is not None:
            # Mêmes hauteurs que la face, comme en production : les deux axes de
            # l'ellipse doivent décrire la même section du corps.
            sw = silhouette_mod.measure_widths(
                args.side, side_pose, orientation="side",
                levels=fw.levels if fw else None,
            )
            side_scale = estimate_scale(side_pose, args.height)
        else:
            print("  photo de profil : aucune pose détectée")
    if fw:
        print(f"  face   : poitrine {fw.chest_px*scale:5.1f} cm | taille {fw.waist_px*scale:5.1f} cm"
              f" | hanches {fw.hip_px*scale:5.1f} cm")
        if fw.levels:
            print(f"  lignes : poitrine {fw.levels.chest:.2f} | taille {fw.levels.waist:.2f}"
                  f" | hanches {fw.levels.hip:.2f}  (fractions du torse, détectées)")
    if sw:
        print(f"  profil : poitrine {sw.chest_px*scale:5.1f} cm | taille {sw.waist_px*scale:5.1f} cm"
              f" | fessier {sw.hip_px*scale:5.1f} cm")
    if not fw and not sw:
        print("  indisponible — largeurs estimées depuis le squelette (moins précis)")

    thickness = None
    if fw and sw and side_scale:
        thickness = silhouette_mod.resolve_clothing_thickness(
            front=fw, side=sw, front_cm_per_pixel=scale,
            side_cm_per_pixel=side_scale, weight_kg=args.weight,
        )
    if thickness is not None:
        print(f"  vêtement : {thickness:+.2f} cm d'épaisseur, retirée du tronc "
              f"(résolue par le poids saisi, voir resolve_clothing_thickness)")
    else:
        print("  vêtement : épaisseur non résolue — tronc mesuré habillé")

    # --- Variables ---
    print(f"\n{BAR}\n5. VARIABLES ENVOYEES AU MODELE\n{BAR}")
    feats = build_model_features(front, scale, args.height, args.weight, fw, sw,
                                 side_cm_per_pixel=side_scale,
                                 clothing_thickness_cm=thickness)
    if feats is None:
        print("  ECHEC de construction des variables.")
        return 1
    # Moyennes ANSUR (homme) : repère de plausibilité, pas une vérité par sujet.
    ANSUR_MALE = {
        "biacromialbreadth": 41.6, "bideltoidbreadth": 51.0, "hipbreadth": 34.6,
        "sittingheight": 91.8, "crotchheight": 84.6, "chestbreadth": 28.9,
        "chestdepth": 25.4, "waistbreadth": 32.6, "waistdepth": 23.8, "buttockdepth": 24.6,
    }
    for k, v in feats.items():
        unit = "kg" if k == "weight_kg" else "cm"
        if k in ("stature_m", "weight_kg"):
            origin = "saisi"
        elif "breadth" in k or "depth" in k:
            # Priorité corrigée : sans SAM, ces largeurs viennent du squelette.
            origin = "silhouette" if (fw or sw) else "squelette (estime)"
        else:
            origin = "squelette"
        ref = ANSUR_MALE.get(k)
        note = ""
        if ref and args.sexe == "male":
            ecart = 100 * (v - ref) / ref
            if abs(ecart) > 25:
                note = f"  <-- ABERRANT ({ecart:+.0f}% vs ANSUR {ref})"
            elif abs(ecart) > 12:
                note = f"  <- suspect ({ecart:+.0f}%)"
        print(f"  {k:<20} {v:>8.1f} {unit:<3} ({origin}){note}")

    # --- Prédictions ---
    print(f"\n{BAR}\n6. MENSURATIONS\n{BAR}")
    circ = measurement_model.predict_circumferences(args.sexe, feats)
    geo = build_geometric_measurements(front, scale, args.sexe)

    reel = json.loads(args.reel.read_text(encoding="utf-8")) if args.reel and args.reel.exists() else {}

    if circ:
        header = f"  {'mesure':<16} {'predit':>8}"
        if reel:
            header += f" {'reel':>8} {'ecart':>8} {'%':>7}"
        print(header + "     origine")
        print("  " + "-" * (len(header) + 12))
        for k, v in circ.items():
            line = f"  {k:<16} {v:>8.1f}"
            if reel:
                r = reel.get(k)
                line += f" {r:>8.1f} {v-r:>+8.1f} {100*(v-r)/r:>+6.1f}%" if r else f" {'—':>8} {'—':>8} {'—':>7}"
            print(line + "     modele")
        for k, v in geo.items():
            line = f"  {k:<16} {v:>8.1f}"
            if reel:
                r = reel.get(k)
                line += f" {r:>8.1f} {v-r:>+8.1f} {100*(v-r)/r:>+6.1f}%" if r else f" {'—':>8} {'—':>8} {'—':>7}"
            print(line + "     geometrie")

        if reel:
            pairs = [(v, reel[k]) for k, v in {**circ, **geo}.items() if k in reel]
            if pairs:
                mae = sum(abs(p - r) for p, r in pairs) / len(pairs)
                print(f"\n  ERREUR MOYENNE SUR {len(pairs)} MESURE(S) : {mae:.2f} cm")
                print("  C'est l'erreur réelle de la chaîne, celle qui compte.")
    else:
        print("  Modèle indisponible ou entrée hors bornes — aucune prédiction.")
        for k, v in geo.items():
            print(f"  {k:<16} {v:>8.1f} cm     geometrie")

    # --- Image annotée ---
    out_img = args.front.with_name(args.front.stem + "_annotee.jpg")
    if annotate(args.front, front, out_img):
        print(f"\n{BAR}\n  Image annotée : {out_img}")
        print("  vert = point utilisé et fiable | orange = utilisé mais douteux | gris = ignoré")

    if args.json:
        args.json.write_text(json.dumps({
            "input": {"height_cm": args.height, "weight_kg": args.weight, "sexe": args.sexe},
            "image": {"width": front.image_width, "height": front.image_height},
            "landmarks": [
                {"i": i, "nom": LANDMARK_NAMES[i], "x": round(l.x, 1), "y": round(l.y, 1),
                 "z": round(l.z, 1), "visibility": round(l.visibility, 3)}
                for i, l in enumerate(front.landmarks)
            ],
            "scale_cm_per_px": round(scale, 5),
            "features": feats,
            "circumferences": circ,
            "geometric": geo,
        }, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  Trace JSON    : {args.json}")

    print(BAR)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
