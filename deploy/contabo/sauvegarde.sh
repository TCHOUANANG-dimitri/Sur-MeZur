#!/usr/bin/env bash
# Sauvegarde nocturne de Sur-MeZur : base de donnees + photos.
# Planifiee par /etc/cron.d/surmezur, sous l'utilisateur surmezur
# (voir DEPLOIEMENT_CONTABO.md, etape 11).
#
# - base PostgreSQL (Supabase) : pg_dump au format « custom » (-Fc), compresse
#   et restaurable table par table avec pg_restore. Les offres Supabase de
#   base ne gardent pas de sauvegarde telechargeable : celle-ci est la notre.
# - base SQLite (si DATABASE_URL est en sqlite) : copie COHERENTE par l'API de
#   sauvegarde de SQLite (un simple cp pourrait copier un fichier en cours
#   d'ecriture).
# - photos : archive de uploads/, dataset_store/ (collecte), avatar_store/ —
#   elles restent sur le disque du VPS, pas dans Supabase.
# - 14 jours conserves sur le VPS, et copie HORS du VPS si RCLONE_REMOTE est
#   defini dans /etc/surmezur/backup.env : une sauvegarde qui reste sur le
#   serveur ne protege pas de la perte du serveur.
set -euo pipefail

DATA=/srv/surmezur/data
DEST=/srv/surmezur/backups
PY=/srv/surmezur/venv/bin/python
STAMP=$(date +%Y%m%d-%H%M)
KEEP_DAYS=14

# DATABASE_URL (et le reste de la configuration de l'API).
set -a
. /etc/surmezur/api.env
[ -f /etc/surmezur/backup.env ] && . /etc/surmezur/backup.env
set +a

mkdir -p "$DEST"

case "$DATABASE_URL" in
  postgres*)
    # pg_dump ne connait pas le suffixe SQLAlchemy « +psycopg ».
    URL="${DATABASE_URL/+psycopg/}"
    pg_dump --format=custom --no-owner --no-privileges --file="$DEST/base-$STAMP.dump" "$URL"
    BASE="base-$STAMP.dump"
    ;;
  sqlite*)
    FICHIER="${DATABASE_URL#sqlite:///}"
    "$PY" - "$FICHIER" "$DEST/base-$STAMP.db" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close()
src.close()
PYEOF
    gzip -f "$DEST/base-$STAMP.db"
    BASE="base-$STAMP.db.gz"
    ;;
  *)
    echo "DATABASE_URL non reconnue" >&2
    exit 1
    ;;
esac

dirs=()
for d in uploads dataset_store avatar_store; do
  [ -d "$DATA/$d" ] && dirs+=("$d")
done
tar czf "$DEST/fichiers-$STAMP.tgz" -C "$DATA" "${dirs[@]}"

find "$DEST" -type f \( -name 'base-*' -o -name 'fichiers-*.tgz' \) -mtime +"$KEEP_DAYS" -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$DEST" "$RCLONE_REMOTE" --max-age 26h --exclude 'sauvegarde.log' --log-level NOTICE
fi

echo "$(date '+%F %T') sauvegarde OK : $BASE, fichiers-$STAMP.tgz"
