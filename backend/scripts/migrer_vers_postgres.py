"""
Copie une base SQLite Sur-MeZur vers la base PostgreSQL (Supabase) designee
par DATABASE_URL.

Deux usages :
  --perimetre catalogue  (defaut) categories, modeles, tissus, accessoires,
                         bareme de commission. Pour demarrer une base neuve
                         avec le catalogue de la base locale de developpement.
                         Les comptes ne sont PAS copies (ce sont des comptes de
                         test) ; `created_by` des modeles est remis a vide.
  --perimetre tout       toutes les tables. Pour importer la base de production
                         exportee d'O2Switch, le jour ou l'acces revient.

Sans --appliquer, le script n'ecrit RIEN : il affiche ce qu'il ferait.
Relancable sans risque : une ligne dont l'identifiant existe deja est ignoree
(ON CONFLICT DO NOTHING), jamais ecrasee.

Pourquoi un script plutot que pg_dump/pgloader : les types (booleens stockes
0/1, dates en texte, JSON en texte dans SQLite) sont reconvertis par les
modeles SQLAlchemy eux-memes, exactement comme l'application les lit ; et
PostgreSQL impose les cles etrangeres que SQLite laissait passer (PRAGMA
foreign_keys jamais active ici) : les lignes orphelines sont signalees une a
une au lieu de faire echouer tout l'import.

Usage (depuis backend/, DATABASE_URL pointant vers Supabase) :
    python scripts/migrer_vers_postgres.py --source sqlite:///./sur_mezur.db
    python scripts/migrer_vers_postgres.py --source sqlite:///./sur_mezur.db --appliquer
"""

from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, inspect, select, update  # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402
from sqlalchemy.exc import IntegrityError, SAWarning  # noqa: E402
from sqlalchemy.schema import sort_tables  # noqa: E402

from app.db.base import Base, engine as destination  # noqa: E402
from app.models import *  # noqa: F401,F403,E402 -- enregistre tous les modeles

CATALOGUE = ["categories", "garment_models", "fabrics", "accessories", "commission_tiers"]
LOT = 200


def _ordre(tables_voulues: set[str]):
    """Ordre de copie : chaque table APRES celles qu'elle reference.

    Le tri par defaut de SQLAlchemy echoue sur le cycle client_profiles
    (default_measurement_id) <-> measurements (client_id) et place alors les
    tables du cycle n'importe ou — client_profiles passait avant users, et
    toutes ses lignes etaient rejetees. On trie donc en ignorant les cles
    etrangeres FACULTATIVES : elles sont copiees vides puis reportees une fois
    toutes les tables en place (voir `a_differer`). Il ne reste alors que des
    dependances obligatoires, sans cycle."""
    tables = [t for t in Base.metadata.tables.values() if t.name in tables_voulues]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SAWarning)
        return sort_tables(tables, skip_fn=lambda fk: fk.parent.nullable)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="URL SQLAlchemy de la base SQLite source")
    ap.add_argument("--perimetre", choices=["catalogue", "tout"], default="catalogue")
    ap.add_argument("--appliquer", action="store_true")
    args = ap.parse_args()

    if destination.dialect.name != "postgresql":
        print(f"DATABASE_URL ne designe pas une base PostgreSQL ({destination.url.render_as_string(hide_password=True)}).")
        return 1
    source = create_engine(args.source)
    print(f"Source      : {args.source}")
    print(f"Destination : {destination.url.render_as_string(hide_password=True)}")
    print(f"Perimetre   : {args.perimetre} — {'ECRITURE' if args.appliquer else 'apercu seulement'}\n")

    tables_source = set(inspect(source).get_table_names())
    voulues = set(CATALOGUE) if args.perimetre == "catalogue" else set(Base.metadata.tables)
    ordre = _ordre(voulues & tables_source)

    if args.appliquer:
        Base.metadata.create_all(bind=destination)

    deja_inserees: set[str] = set()
    differees: list[tuple] = []  # (table, colonne, [(id, valeur)])
    total, orphelines = 0, 0

    for table in ordre:
        cols_source = {c["name"] for c in inspect(source).get_columns(table.name)}
        cols = [c for c in table.columns if c.name in cols_source]
        with source.connect() as cs:
            lignes = [dict(r) for r in cs.execute(select(*cols)).mappings()]

        # Cle etrangere facultative vers une table pas encore copiee (cycle) :
        # copiee vide, puis renseignee une fois toutes les tables en place.
        a_differer = [
            c.name for c in table.columns
            if c.nullable and c.name in cols_source and any(
                fk.column.table.name not in deja_inserees and fk.column.table.name != table.name
                for fk in c.foreign_keys
            )
        ]
        if args.perimetre == "catalogue":
            # Cle etrangere vers une table HORS du perimetre (les tailleurs,
            # qui ne sont pas copies) : videe, sinon elle designerait une
            # ligne inexistante. Ex. garment_models.created_by,
            # fabrics.owner_tailor_id.
            hors = [
                c.name for c in table.columns
                if c.name in cols_source and any(fk.column.table.name not in voulues for fk in c.foreign_keys)
            ]
            for ligne in lignes:
                for nom in hors:
                    ligne[nom] = None
            a_differer = [c for c in a_differer if c not in hors]
        for nom in a_differer:
            valeurs = [(l["id"], l[nom]) for l in lignes if l.get(nom) is not None]
            if valeurs:
                differees.append((table, nom, valeurs))
            for l in lignes:
                l[nom] = None

        print(f"{table.name:28} {len(lignes):6} ligne(s)" + (f"  (differees : {', '.join(a_differer)})" if a_differer else ""))
        total += len(lignes)
        if args.appliquer and lignes:
            stmt = pg_insert(table).on_conflict_do_nothing(index_elements=[c for c in table.primary_key.columns])
            for i in range(0, len(lignes), LOT):
                lot = lignes[i : i + LOT]
                try:
                    with destination.begin() as cd:
                        cd.execute(stmt, lot)
                except IntegrityError:
                    # Une ligne orpheline (cle etrangere vers rien) fait
                    # echouer le lot entier : on repasse ligne a ligne pour
                    # copier tout le reste et nommer les fautives.
                    for ligne in lot:
                        try:
                            with destination.begin() as cd:
                                cd.execute(stmt, [ligne])
                        except IntegrityError as e:
                            orphelines += 1
                            print(f"    ignoree (orpheline) {table.name} id={ligne.get('id')} : {str(e.orig).splitlines()[0]}")
        deja_inserees.add(table.name)

    for table, nom, valeurs in differees:
        print(f"{table.name}.{nom} : {len(valeurs)} valeur(s) a reporter")
        if args.appliquer:
            with destination.begin() as cd:
                for id_, val in valeurs:
                    cd.execute(update(table).where(table.c.id == id_).values({nom: val}))

    print(f"\n{total} ligne(s) lue(s){f', {orphelines} orpheline(s) ignoree(s)' if orphelines else ''}.")
    if not args.appliquer:
        print("Apercu seulement : relancer avec --appliquer pour ecrire.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
