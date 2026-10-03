#!/usr/bin/env bash
# Sauvegarde nocturne de Sur-MeZur : base SQLite + photos.
# Planifiee par /etc/cron.d/surmezur (voir DEPLOIEMENT_CONTABO.md, etape 9).
#
# - base : copie COHERENTE via l'API de sauvegarde de SQLite, valable meme si
#   une ecriture est en cours (un simple `cp` pourrait copier un fichier a
#   moitie ecrit) ;
# - photos : archive de uploads/, dataset_store/ (collecte), avatar_store/ ;
# - 14 jours conserves sur le serveur ;
# - copie HORS du serveur si RCLONE_REMOTE est defini dans /etc/surmezur/backup.env.
#   Une sauvegarde qui reste sur le VPS ne protege pas de la perte du VPS.
set -euo pipefail

DATA=/srv/surmezur/data
DEST=/srv/surmezur/backups
PY=/srv/surmezur/venv/bin/python
STAMP=$(date +%Y%m%d-%H%M)
KEEP_DAYS=14

[ -f /etc/surmezur/backup.env ] && . /etc/surmezur/backup.env

mkdir -p "$DEST"

"$PY" - "$DATA/sur_mezur.db" "$DEST/sur_mezur-$STAMP.db" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close()
src.close()
PYEOF
gzip -f "$DEST/sur_mezur-$STAMP.db"

dirs=()
for d in uploads dataset_store avatar_store; do
  [ -d "$DATA/$d" ] && dirs+=("$d")
done
tar czf "$DEST/fichiers-$STAMP.tgz" -C "$DATA" "${dirs[@]}"

find "$DEST" -type f \( -name 'sur_mezur-*.db.gz' -o -name 'fichiers-*.tgz' \) -mtime +"$KEEP_DAYS" -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$DEST" "$RCLONE_REMOTE" --max-age 26h --log-level NOTICE
fi

echo "$(date '+%F %T') sauvegarde OK : sur_mezur-$STAMP.db.gz, fichiers-$STAMP.tgz"
