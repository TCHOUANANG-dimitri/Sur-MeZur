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
    python scripts/nommer_catalogue.py --echecs             # ne reprend que les échecs

Si le service de vision ne répond plus (arrêté, mémoire saturée), le lot
attend qu'il revienne (jusqu'à ~4 min) puis s'ARRÊTE sans toucher aux
modèles restants : on le relance quand le service est reparti.

Sur le VPS : voir deploy/contabo/VISION_PATRONS.md (« Noms du catalogue »).
"""

from __future__ import annotations

import argparse
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import joinedload  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.models.catalog import Category, GarmentModel  # noqa: E402
from app.services import catalogue_nommage as nommage  # noqa: E402
from app.services.patrons.vision import AnalyseImpossible  # noqa: E402


def _service_ok(url: str) -> bool:
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=10) as r:
            return r.status == 200
    except OSError:
        return False


def _attendre_service(url: str) -> bool:
    """Le service de vision est tombé : on lui laisse le temps de repartir
    (systemd le relance), sinon on abandonne."""
    for pause in (30, 60, 150):
        print(f"    service de vision injoignable : nouvel essai dans {pause} s")
        time.sleep(pause)
        if _service_ok(url):
            return True
    return False


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
    ap.add_argument("--echecs", action="store_true", help="ne reprend que les modèles en échec")
    ap.add_argument("--delai", type=float, default=0,
                    help="secondes accordées par photo (défaut : VL_TIMEOUT_S, 300)")
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
        if args.echecs:
            q = q.filter(GarmentModel.ai_status == "failed")
        elif not args.refaire:
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
        delai = args.delai or settings.vl_timeout_s
        # Le service ne répond plus à temps plusieurs fois de suite : inutile
        # de passer la nuit à échouer photo après photo, on s'arrête.
        sans_reponse = 0
        for i, m in enumerate(modeles, 1):
            t0 = time.monotonic()
            cat = m.category.name if m.category else ""
            genre = m.category.gender if m.category else ""
            try:
                contenu = nommage.lire_photo(m.photo_url)
            except OSError as e:
                contenu, erreur_photo = None, e
            try:
                if contenu is None:
                    raise erreur_photo
                try:
                    fiche = nommage.analyser(contenu, timeout_s=delai)
                except AnalyseImpossible as e:
                    # Service tombé (pas une photo illisible) : on attend
                    # qu'il revienne, une fois, puis on réessaie ce modèle.
                    if "injoignable" not in str(e):
                        raise
                    if not _attendre_service(settings.vl_url):
                        print(f"[{i}/{len(modeles)}] service de vision toujours injoignable : lot ARRÊTÉ."
                              " Les modèles restants ne sont pas touchés ; relancez quand le service répond.")
                        break
                    fiche = nommage.analyser(contenu, timeout_s=delai)
                prop = nommage.proposition(cat, genre, fiche, pris, m.id)
            except (AnalyseImpossible, OSError) as e:
                if "injoignable" in str(e):
                    sans_reponse += 1
                    if sans_reponse >= 3:
                        print(f"[{i}/{len(modeles)}] {m.name} : pas de réponse 3 fois de suite : lot ARRÊTÉ."
                              " Vérifiez le service (systemctl status surmezur-vl, free -h), puis relancez avec --echecs.")
                        break
                echecs += 1
                print(f"[{i}/{len(modeles)}] {m.name} : ÉCHEC — {e}")
                if not args.essai:
                    m.ai_suggestion = {"erreur": str(e)[:300]}
                    m.ai_status = "failed"
                    db.commit()
                continue
            sans_reponse = 0
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
