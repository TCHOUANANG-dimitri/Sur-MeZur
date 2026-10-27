"""
Propose un nom et une description (français et anglais) pour chaque modèle
du catalogue, d'après sa photo de couverture, avec Qwen3-VL 4B.

Rien n'est appliqué : chaque résultat est rangé en PROPOSITION
(`ai_status = "proposed"`), relue dans Admin > Catalogue > Noms IA.

Sur le processeur du VPS, une photo prend 1 à 3 minutes : les 300 modèles
demandent une nuit. Le script enregistre chaque modèle dès qu'il est fait ;
interrompu, il reprend là où il s'était arrêté (les modèles déjà analysés
sont sautés, sauf --refaire). Le serveur de vision ne traite qu'une photo à
la fois : pendant le lot, l'analyse « Nouveau patron » des tailleurs attend
son tour — d'où l'intérêt de le lancer la nuit.

Usage (depuis backend/, avec les réglages de l'API, dont VL_URL) :
    python scripts/nommer_catalogue.py --essai --limite 5   # affiche, n'enregistre rien
    python scripts/nommer_catalogue.py                      # tout le catalogue
    python scripts/nommer_catalogue.py --categorie Kaba --limite 20
    python scripts/nommer_catalogue.py --refaire            # réanalyse aussi les déjà faits

Sur le VPS : voir deploy/contabo/VISION_PATRONS.md (« Noms du catalogue »).
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import joinedload  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.models.catalog import Category, GarmentModel  # noqa: E402
from app.services import catalogue_nommage as nommage  # noqa: E402
from app.services.patrons.vision import AnalyseImpossible  # noqa: E402


def _duree(s: float) -> str:
    m, s = divmod(int(s), 60)
    h, m = divmod(m, 60)
    return f"{h} h {m:02d}" if h else f"{m} min {s:02d}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--essai", action="store_true", help="affiche les propositions sans rien enregistrer")
    ap.add_argument("--limite", type=int, default=0, help="nombre maximal de modèles à analyser")
    ap.add_argument("--categorie", help="seulement cette catégorie (nom, ex. Kaba)")
    ap.add_argument("--refaire", action="store_true", help="réanalyse aussi les modèles déjà analysés")
    ap.add_argument("--site", default="https://app.sur-mezur.com",
                    help="adresse publique de l'application, pour afficher le lien de chaque photo")
    args = ap.parse_args()
    site = args.site.rstrip("/")

    if not settings.vl_url:
        print("VL_URL n'est pas réglé : le service de vision est introuvable.", file=sys.stderr)
        return 2

    with SessionLocal() as db:
        q = db.query(GarmentModel).options(joinedload(GarmentModel.category)).filter(GarmentModel.photo_url.isnot(None))
        if args.categorie:
            q = q.join(Category).filter(Category.name.ilike(args.categorie))
        if not args.refaire:
            q = q.filter(GarmentModel.ai_status.is_(None))
        modeles = q.order_by(GarmentModel.category_id, GarmentModel.name).all()
        if args.limite:
            modeles = modeles[: args.limite]

        # Noms déjà pris (catalogue + propositions) : deux modèles ne
        # reçoivent jamais le même nom.
        pris = {nommage.cle_nom(n) for (n,) in db.query(GarmentModel.name)}
        for (s,) in db.query(GarmentModel.ai_suggestion).filter(GarmentModel.ai_status == "proposed"):
            if s and s.get("name"):
                pris.add(nommage.cle_nom(s["name"]))

        print(f"{len(modeles)} modèle(s) à analyser · vision : {settings.vl_url}" + (" · ESSAI" if args.essai else ""))
        debut = time.monotonic()
        faits = echecs = 0
        for i, m in enumerate(modeles, 1):
            t0 = time.monotonic()
            cat = m.category.name if m.category else ""
            genre = m.category.gender if m.category else ""
            try:
                fiche = nommage.analyser(nommage.lire_photo(m.photo_url))
                prop = nommage.proposition(cat, genre, fiche, pris, m.id)
            except (AnalyseImpossible, OSError) as e:
                echecs += 1
                print(f"[{i}/{len(modeles)}] {m.name} : ÉCHEC — {e}")
                if not args.essai:
                    m.ai_suggestion = {"erreur": str(e)[:300]}
                    m.ai_status = "failed"
                    db.commit()
                continue
            pris.add(nommage.cle_nom(prop["name"]))
            faits += 1
            ecoule = time.monotonic() - debut
            reste = ecoule / i * (len(modeles) - i)
            print(f"[{i}/{len(modeles)}] {m.name} → {prop['name']} / {prop['name_en']}"
                  f"  ({time.monotonic() - t0:.0f} s, reste ~{_duree(reste)})")
            # Lien de la photo : en essai rien n'est enregistré, l'admin ne
            # peut donc pas la montrer ; on l'ouvre dans le navigateur.
            lien = m.photo_url if m.photo_url.startswith("http") else f"{site}{m.photo_url}"
            print(f"    Photo : {lien}")
            if args.essai:
                print(f"    FR : {prop['description']}\n    EN : {prop['description_en']}")
                continue
            m.ai_suggestion = prop
            m.ai_status = "proposed"
            db.commit()

    print(f"Terminé : {faits} proposition(s), {echecs} échec(s), en {_duree(time.monotonic() - debut)}."
          + ("" if args.essai else " À relire dans Admin > Catalogue > Noms IA."))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
