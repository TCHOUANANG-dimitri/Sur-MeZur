#!/usr/bin/env bash
# Mise a jour de l'API apres un `git push` sur main.
#   sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh [--force]
#
# Remplace la procedure O2Switch (copie repo-source -> surmezur-backend) : ici
# le code execute EST le clone git, il n'y a rien a copier.
set -euo pipefail

APP=/srv/surmezur/app
VENV=/srv/surmezur/venv
as_app() { sudo -u surmezur -H "$@"; }

cd "$APP"
avant=$(as_app git rev-parse HEAD)
as_app git pull --ff-only
apres=$(as_app git rev-parse HEAD)

# --force : appliquer le schema et redemarrer meme sans nouveau commit
# (premiere mise en service, restauration d'une base).
if [ "$avant" = "$apres" ] && [ "${1:-}" != "--force" ]; then
  echo "Deja a jour ($(as_app git log --oneline -1))."
  exit 0
fi
echo "Mise a jour ${avant:0:7} -> ${apres:0:7}"

if as_app git diff --name-only "$avant" "$apres" | grep -q '^backend/requirements'; then
  echo "Dependances modifiees : installation..."
  as_app "$VENV/bin/pip" install -r backend/requirements.txt -r backend/requirements-vision.txt
fi

# Schema : tables nouvelles (create_all) puis colonnes nouvelles (script
# additif, sans perte). Fait UNE fois ici, avant le redemarrage, plutot que
# par chacun des processus uvicorn au demarrage.
run_py() {
  # Python de l'application, configuration de production chargee.
  sudo -u surmezur -H bash -c \
    'set -a; . /etc/surmezur/api.env; set +a; cd /srv/surmezur/app/backend; exec /srv/surmezur/venv/bin/python "$@"' \
    _ "$@"
}
run_py -c "import app.models; from app.db.base import Base, engine; Base.metadata.create_all(bind=engine)"
run_py scripts/sync_sqlite_columns.py --apply

systemctl restart surmezur-api

echo -n "Redemarrage"
for _ in $(seq 1 90); do
  if curl -fs http://127.0.0.1:8000/api/health >/dev/null; then
    echo " : OK"
    echo "En production : $(as_app git -C "$APP" log --oneline -1)"
    echo "Retour arriere si besoin : sudo -u surmezur git -C $APP reset --hard $avant && sudo systemctl restart surmezur-api"
    exit 0
  fi
  echo -n "."
  sleep 2
done
echo " : ECHEC, l'API ne repond pas. Journal : journalctl -u surmezur-api -n 100"
exit 1
