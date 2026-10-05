"""
Ferme l'acces direct aux tables pour les roles publics de Supabase.

POURQUOI
Supabase publie automatiquement chaque table du schema `public` par son API
REST (PostgREST), accessible avec la cle « anon » du projet. Notre application
ne s'en sert PAS : seul le backend parle a la base, avec le role `postgres`.
Mais si cette API reste ouverte et qu'une table n'a pas de securite par ligne
(RLS), quiconque obtient l'URL du projet et la cle anon peut lire la table —
`users` compris, avec les empreintes de mots de passe.

CE QUE FAIT LE SCRIPT (idempotent, relancable a chaque mise a jour)
  1. active la RLS sur toutes les tables de `public`, SANS aucune regle :
     les roles `anon` et `authenticated` n'y voient plus aucune ligne ;
  2. retire a ces deux roles tout droit sur les tables et sequences, et pour
     les tables creees plus tard.
Le backend n'est pas concerne : il se connecte en `postgres`, proprietaire des
tables, et le proprietaire n'est pas soumis a la RLS (sauf FORCE, non utilise).

Sans effet sur SQLite ou sur un PostgreSQL qui n'est pas Supabase (les roles
anon / authenticated n'y existent pas : seule l'etape 1 s'applique).

    python scripts/securiser_supabase.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.db.base import engine  # noqa: E402


def main() -> int:
    if engine.dialect.name != "postgresql":
        print("Base non PostgreSQL : rien a faire.")
        return 0
    with engine.begin() as conn:
        tables = [r[0] for r in conn.execute(text("select tablename from pg_tables where schemaname = 'public'"))]
        for t in tables:
            conn.execute(text(f'alter table public."{t}" enable row level security'))
        roles = [r[0] for r in conn.execute(text("select rolname from pg_roles where rolname in ('anon', 'authenticated')"))]
        for role in roles:
            conn.execute(text(f"revoke all on all tables in schema public from {role}"))
            conn.execute(text(f"revoke all on all sequences in schema public from {role}"))
            conn.execute(text(f"alter default privileges in schema public revoke all on tables from {role}"))
            conn.execute(text(f"alter default privileges in schema public revoke all on sequences from {role}"))
    print(f"RLS active sur {len(tables)} table(s) ; droits retires a : {', '.join(roles) or 'aucun role Supabase present'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
