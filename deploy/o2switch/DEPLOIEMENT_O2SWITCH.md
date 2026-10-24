# Site web Sur-MeZur sur o2switch

Le site (`web/`, Next.js) tourne sur o2switch comme application Node.js ;
le backend reste sur le VPS Contabo, joint en HTTPS sur `api.sur-mezur.com`.
Le navigateur ne parle qu'à `sur-mezur.com` : le site relaie `/api/*` vers
l'API (voir `web/next.config.ts`).

## 1. DNS et certificats

- cPanel › Zone Editor : enregistrement `A` `api` → `169.58.69.36`.
- VPS : `deploy/contabo/nginx-api-https.conf` + `certbot --nginx -d api.sur-mezur.com --redirect`.
- cPanel › SSL/TLS Status : AutoSSL pour `sur-mezur.com` et `www.sur-mezur.com`.

## 2. Application Node.js (cPanel › Setup Node.js App)

| Champ | Valeur |
|---|---|
| Node.js version | 22 (ou 20) |
| Application mode | Production |
| Application root | `surmezur/web` |
| Application URL | `sur-mezur.com` |
| Application startup file | `server.js` |

## 3. Code et réglages (SSH)

```bash
cd ~ && git clone https://github.com/TCHOUANANG-dimitri/Sur-MeZur.git surmezur
nano ~/surmezur/web/.env.production.local
```

Contenu de `.env.production.local` (hors dépôt, jamais commité) :

```
API_ORIGIN=https://api.sur-mezur.com
NEXT_PUBLIC_SITE_URL=https://sur-mezur.com
NEXT_PUBLIC_APK_URL=…      # mêmes valeurs que sur Vercel
NEXT_PUBLIC_APK_VERSION=…
NEXT_PUBLIC_APK_SIZE=…
```

Ces valeurs sont figées au build : après une modification, relancer le script.

## 4. Construction et démarrage

```bash
bash ~/surmezur/deploy/o2switch/mettre_a_jour.sh
```

Le script : `git pull`, `npm install`, `npm run build`, redémarrage
(`tmp/restart.txt`). C'est aussi la commande de chaque mise à jour.

## 5. Vérifications

- `https://sur-mezur.com` : connexion, mesure, catalogue, espace tailleur, PDF de patron.
- Admin › Sécurité : deux connexions depuis deux réseaux différents doivent
  montrer deux IP différentes (sinon, l'IP du visiteur n'est pas transmise et
  la limite de tentatives de connexion toucherait tout le monde).

## 6. Bascule

- Nouvelle appli Android (domaine `sur-mezur.com`, même clé de signature).
- Landing : `NEXT_PUBLIC_APP_URL=https://sur-mezur.com` sur son projet Vercel.
- Garder le projet Vercel `sur-me-zur` ~1 mois (anciennes applis), puis le
  désactiver et fermer le port 8080 du VPS.
