#!/usr/bin/env bash
# Mise a jour du site web Sur-MeZur sur o2switch (a lancer en SSH) :
#   bash ~/surmezur/deploy/o2switch/mettre_a_jour.sh
#
# Recupere le code, installe les dependances, reconstruit le site et le
# redemarre. Le backend (Contabo) n'est pas concerne.
set -euo pipefail

DEPOT="${DEPOT:-$HOME/surmezur}"
WEB="$DEPOT/web"

# Environnement Node de l'application cPanel (cree par « Setup Node.js App »).
ACTIVATE=$(ls "$HOME"/nodevenv/surmezur/web/*/bin/activate 2>/dev/null | sort -V | tail -n 1 || true)
if [ -z "$ACTIVATE" ]; then
  echo "Environnement Node introuvable : creez d'abord l'application dans cPanel (Setup Node.js App, racine surmezur/web)." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ACTIVATE"

# Les reglages (adresse de l'API, adresse du site...) sont lus AU BUILD.
if [ ! -f "$WEB/.env.production.local" ]; then
  echo "Fichier $WEB/.env.production.local manquant (voir DEPLOIEMENT_O2SWITCH.md)." >&2
  exit 1
fi

echo "== Code"
git -C "$DEPOT" pull --ff-only

echo "== Dependances"
cd "$WEB"
# `npm install` et non `npm ci` : node_modules est un lien vers
# l'environnement cPanel, que `npm ci` supprimerait.
npm install --no-audit --no-fund

echo "== Construction"
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" npm run build

echo "== Redemarrage"
mkdir -p "$WEB/tmp"
touch "$WEB/tmp/restart.txt"

echo "Termine. Verifiez https://sur-mezur.com"
