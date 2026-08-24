"""
Fige l'appariement photo -> sujet dans sujets.json.

A executer UNE SEULE FOIS. Les 26 photos sont nommees par horodatage WhatsApp,
sans identifiant de sujet : l'ordre chronologique donne les paires (deux photos
consecutives = un sujet), et c'est la pose qui departage face et profil.

Critere face/profil : le rapport ecartement d'epaules / hauteur de torse. De
face il vaut ~0,6-0,9, de profil il s'effondre (les deux epaules se projettent
presque au meme endroit). Cette separation est nette et ne demande aucun seuil
arbitraire : dans chaque paire, la plus grande valeur est la face.

    python ml/bench/fige_appariement.py

Une fois `photos` rempli dans sujets.json, ce script n'a plus a etre relance :
le banc lit l'appariement fige, pour que deux executions comparent bien les
memes images.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RACINE / "backend"))

PHOTOS = RACINE / "backend" / "uploads" / "measurement_photos"
SUJETS_JSON = Path(__file__).with_name("sujets.json")

_HORODATAGE = re.compile(r"at (\d{1,2})\.(\d{2})\.(\d{2}) (AM|PM)(\d*)")


def cle_temporelle(chemin: Path):
    m = _HORODATAGE.search(chemin.name)
    if m is None:
        raise SystemExit(f"nom de fichier inattendu : {chemin.name}")
    h, mn, s, ampm, suffixe = int(m[1]), int(m[2]), int(m[3]), m[4], m[5]
    if ampm == "PM" and h != 12:
        h += 12
    if ampm == "AM" and h == 12:
        h = 0
    return (h, mn, s, suffixe or "0")


def rapport_epaules(chemin: Path) -> float | None:
    from app.services.vision import pose as pose_mod

    r = pose_mod.extract_pose(str(chemin))
    if r is None:
        return None
    ge, dr = r.point(pose_mod.LEFT_SHOULDER), r.point(pose_mod.RIGHT_SHOULDER)
    ep = r.midpoint(pose_mod.LEFT_SHOULDER, pose_mod.RIGHT_SHOULDER)
    ha = r.midpoint(pose_mod.LEFT_HIP, pose_mod.RIGHT_HIP)
    return abs(ge.x - dr.x) / (abs(ha[1] - ep[1]) or 1.0)


def main() -> None:
    fichiers = sorted(PHOTOS.glob("*.jpeg"), key=cle_temporelle)
    if len(fichiers) != 26:
        print(f"ATTENTION : {len(fichiers)} photos trouvees, 26 attendues")

    donnees = json.loads(SUJETS_JSON.read_text(encoding="utf-8"))
    appariement: dict[str, dict[str, str]] = {}

    for i in range(0, len(fichiers), 2):
        paire = fichiers[i:i + 2]
        sujet = i // 2 + 1
        mesures = [(f, rapport_epaules(f)) for f in paire]
        connus = [(f, v) for f, v in mesures if v is not None]
        if len(connus) < 2:
            print(f"sujet {sujet:2} : pose non detectee sur {len(paire) - len(connus)} photo(s)")
            appariement[str(sujet)] = {
                "face": paire[0].name,
                "profil": paire[1].name if len(paire) > 1 else None,
                "incertain": True,
            }
            continue
        face = max(connus, key=lambda x: x[1])
        profil = min(connus, key=lambda x: x[1])
        appariement[str(sujet)] = {"face": face[0].name, "profil": profil[0].name}
        print(f"sujet {sujet:2} : face r={face[1]:.2f}  profil r={profil[1]:.2f}"
              f"{'   << ECART FAIBLE' if face[1] - profil[1] < 0.15 else ''}")

    donnees["photos"] = appariement
    SUJETS_JSON.write_text(json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nAppariement ecrit dans {SUJETS_JSON}")


if __name__ == "__main__":
    main()
