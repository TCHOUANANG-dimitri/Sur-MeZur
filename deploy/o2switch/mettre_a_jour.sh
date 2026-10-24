#!/usr/bin/env bash
# Mise a jour des sites Sur-MeZur sur o2switch (a lancer en SSH) :
#   bash ~/surmezur/deploy/o2switch/mettre_a_jour.sh          # les deux
#   bash ~/surmezur/deploy/o2switch/mettre_a_jour.sh web      # l'application (app.sur-mezur.com)
#   bash ~/surmezur/deploy/o2switch/mettre_a_jour.sh landing  # la landing (sur-mezur.com)
#
# Pour chaque site : dependances, construction, redemarrage. Le code est
# recupere une fois au debut. Le backend (Contabo) n'est pas concerne.
set -euo pipefail

DEPOT="${DEPOT:-$HOME/surmezur}"
CIBLE="${1:-tout}"
case "$CIBLE" in
  web) SITES=(web) ;;
  landing) SITES=(landing) ;;
  tout) SITES=(web landing) ;;
  *) echo "Usage : $0 [web|landing|tout]" >&2; exit 2 ;;
esac

echo "== Code"
git -C "$DEPOT" pull --ff-only

construire() {
  local site="$1" dossier="$DEPOT/$1"
  echo
  echo "######## $site"
  # Environnement Node de l'application cPanel (« Setup Node.js App »,
  # racine surmezur/<site>).
  local activate
  activate=$(ls "$HOME"/nodevenv/surmezur/"$site"/*/bin/activate 2>/dev/null | sort -V | tail -n 1 || true)
  if [ -z "$activate" ]; then
    echo "Environnement Node introuvable : creez l'application dans cPanel (Setup Node.js App, racine surmezur/$site)." >&2
    return 1
  fi
  # Les reglages (adresses...) sont lus AU BUILD.
  if [ ! -f "$dossier/.env.production.local" ]; then
    echo "Fichier $dossier/.env.production.local manquant (voir DEPLOIEMENT_O2SWITCH.md)." >&2
    return 1
  fi
  (
    # Le script d'activation de cPanel lit des variables qui peuvent ne pas
    # exister : on suspend `set -u` le temps de le charger.
    set +u
    # shellcheck disable=SC1090
    source "$activate"
    set -u
    cd "$dossier"
    echo "== Dependances"
    # `npm install` et non `npm ci` : node_modules est un lien vers
    # l'environnement cPanel, que `npm ci` supprimerait. L'environnement est
    # en production : `NODE_ENV=development` + `--include=dev` installent
    # aussi TypeScript, Tailwind... qui servent au build.
    NODE_ENV=development npm install --include=dev --no-audit --no-fund
    echo "== Construction (journal : $dossier/build.log)"
    # Un seul processus de construction (voir next.config.ts) : les limites
    # du compte mutualise tuent les workers en trop. `--webpack` pour la
    # landing (Next 16, dont le bundler par defaut ouvre un fil par coeur).
    export NEXT_BUILD_CPUS="${NEXT_BUILD_CPUS:-1}"
    export NEXT_TELEMETRY_DISABLED=1
    local options=()
    [ "$site" = landing ] && options=(--webpack)
    NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npx next build ${options[@]+"${options[@]}"} 2>&1 | tee "$dossier/build.log"
    test "${PIPESTATUS[0]}" -eq 0
    echo "== Redemarrage"
    mkdir -p tmp && touch tmp/restart.txt
  )
}

for site in "${SITES[@]}"; do
  construire "$site"
done

echo
echo "Termine. Verifiez https://sur-mezur.com et https://app.sur-mezur.com"
