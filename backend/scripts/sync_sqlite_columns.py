"""
Ajoute en base les colonnes présentes dans les modèles mais absentes du
fichier SQLite.

Pourquoi ce script existe
-------------------------
Le projet n'a pas de système de migration (choix d'origine : `create_all()`
+ `seed.py`). Or `create_all()` crée les tables MANQUANTES et rien d'autre :
ajouter un attribut à un modèle déjà déployé ne touche pas la base. La table
garde son ancien schéma, et toute requête qui mentionne la nouvelle colonne
échoue — y compris de simples SELECT, puisque SQLAlchemy liste explicitement
les colonnes.

Le symptôme est trompeur : l'application démarre, répond, et seules les
routes touchant cette table renvoient 500. C'est exactement ce qui s'est
produit le 14/08/2026 en production — `measurements.features` manquait, la
prise de mesure échouait avec « Une erreur inattendue est survenue pendant
l'analyse » alors que le calcul, lui, fonctionnait parfaitement.

Ce que fait le script
---------------------
Il compare chaque table déclarée dans les modèles au schéma réel et émet un
`ALTER TABLE ... ADD COLUMN` pour ce qui manque. C'est la seule opération
qu'il pratique : jamais de suppression, jamais de modification de colonne
existante, jamais de perte de données. Relançable sans risque — une seconde
exécution ne trouve plus rien à faire.

Limites assumées
----------------
- Une colonne NOT NULL sans valeur par défaut ne peut pas être ajoutée à une
  table qui contient déjà des lignes : SQLite ne saurait quoi mettre dans les
  lignes existantes. Le script la signale et passe — à traiter à la main.
- Un type de colonne modifié, une colonne renommée ou supprimée ne sont pas
  détectés : seul l'ajout est couvert.

Usage
-----
    cd backend
    ./venv/Scripts/python.exe scripts/sync_sqlite_columns.py          # aperçu
    ./venv/Scripts/python.exe scripts/sync_sqlite_columns.py --apply  # exécute
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect, text

from app.db.base import Base, engine
from app.models import *  # noqa: F401,F403 -- enregistre tous les modèles sur Base


def _sql_type(column) -> str:
    """Type SQLite de la colonne, tel que SQLAlchemy le compilerait."""
    return column.type.compile(dialect=engine.dialect)


def _default_clause(column) -> str:
    """
    Clause DEFAULT à poser sur une colonne ajoutée.

    Sans elle, les lignes déjà présentes reçoivent NULL — acceptable pour une
    colonne nullable, rédhibitoire pour une NOT NULL (voir plus bas).
    """
    default = column.default
    if default is None or default.is_callable or default.is_sequence:
        return ""
    value = default.arg
    if isinstance(value, bool):
        return f" DEFAULT {1 if value else 0}"
    if isinstance(value, (int, float)):
        return f" DEFAULT {value}"
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f" DEFAULT '{escaped}'"
    return ""


def run(apply: bool) -> int:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    statements: list[str] = []
    skipped: list[str] = []

    # `tables.values()` plutôt que `sorted_tables` : l'ordre n'a aucune
    # importance pour des ALTER TABLE indépendants, et le tri déclenche un
    # avertissement sur le cycle de clés étrangères client_profiles <->
    # measurements, qui n'a rien à voir avec ce qu'on fait ici.
    for table in Base.metadata.tables.values():
        if table.name not in existing_tables:
            # `create_all()` s'en chargera : rien à rattraper ici.
            continue
        actual = {col["name"] for col in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in actual:
                continue
            if not column.nullable and not _default_clause(column):
                skipped.append(
                    f"{table.name}.{column.name} (NOT NULL sans valeur par défaut "
                    "— à ajouter à la main)"
                )
                continue
            statements.append(
                f"ALTER TABLE {table.name} "
                f"ADD COLUMN {column.name} {_sql_type(column)}{_default_clause(column)}"
            )

    if skipped:
        print("À TRAITER MANUELLEMENT :")
        for item in skipped:
            print(f"  - {item}")
        print()

    if not statements:
        print("Aucune colonne manquante — la base est à jour.")
        return 0

    print(f"{len(statements)} colonne(s) manquante(s) :")
    for sql in statements:
        print(f"  {sql}")

    if not apply:
        print("\nAperçu seulement. Relancer avec --apply pour exécuter.")
        return 0

    with engine.begin() as conn:
        for sql in statements:
            conn.execute(text(sql))
    print(f"\n{len(statements)} colonne(s) ajoutée(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(run(apply="--apply" in sys.argv))
