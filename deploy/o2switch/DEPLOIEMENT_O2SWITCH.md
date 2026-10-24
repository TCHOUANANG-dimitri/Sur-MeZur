# Sur-MeZur sur o2switch

Deux applications Node.js (cPanel › Setup Node.js App) :

| Site | Adresse | Dossier | Rôle |
|---|---|---|---|
| Landing | `sur-mezur.com` | `landing/` (Next 16) | présentation, téléchargement de l'APK |
| Application | `app.sur-mezur.com` | `web/` (Next 15) | l'application (clients, tailleurs, admin) |

Le backend reste sur le VPS Contabo, joint en HTTPS sur `api.sur-mezur.com`.
Le navigateur ne parle qu'à l'application : elle relaie `/api/*` vers l'API
(voir `web/next.config.ts`).

## 1. DNS et certificats

- Domaine acheté chez LWS, serveurs DNS `ns1.o2switch.net` / `ns2.o2switch.net`.
- cPanel › Zone Editor : `A` `api` → `169.58.69.36` (le sous-domaine `app`
  est créé par cPanel › Domaines).
- VPS : `deploy/contabo/nginx-api-https.conf` + `certbot --nginx -d api.sur-mezur.com --redirect`.
- cPanel › Let's Encrypt SSL : certificats pour `sur-mezur.com`,
  `www.sur-mezur.com` et `app.sur-mezur.com` (décocher les noms techniques
  `*.universe.wf`).

## 2. Applications Node.js (cPanel › Setup Node.js App)

| Champ | Landing | Application |
|---|---|---|
| Node.js version | 22 | 22 |
| Application mode | Production | Production |
| Application root | `surmezur/landing` | `surmezur/web` |
| Application URL | `sur-mezur.com` | `app.sur-mezur.com` |
| Application startup file | `server.js` | `server.js` |

## 3. Code et réglages (SSH)

```bash
cd ~ && git clone https://github.com/TCHOUANANG-dimitri/Sur-MeZur.git surmezur
```

`~/surmezur/web/.env.production.local` (hors dépôt) :

```
API_ORIGIN=https://api.sur-mezur.com
NEXT_PUBLIC_SITE_URL=https://app.sur-mezur.com
NEXT_PUBLIC_LANDING_URL=https://sur-mezur.com
NEXT_PUBLIC_APK_URL=https://sur-mezur.com/android/sur-mezur.apk
NEXT_PUBLIC_APK_VERSION=
NEXT_PUBLIC_APK_SIZE=
```

`~/surmezur/landing/.env.production.local` (hors dépôt) :

```
NEXT_PUBLIC_SITE_URL=https://sur-mezur.com
NEXT_PUBLIC_APP_URL=https://app.sur-mezur.com
```

Ces valeurs sont figées au build : après une modification, relancer le script.

## 4. Construction et démarrage

```bash
bash ~/surmezur/deploy/o2switch/mettre_a_jour.sh          # les deux sites
bash ~/surmezur/deploy/o2switch/mettre_a_jour.sh web      # l'application seule
bash ~/surmezur/deploy/o2switch/mettre_a_jour.sh landing  # la landing seule
```

Le script : `git pull`, `npm install` (outils de build compris), construction
dans un seul processus (limites du mutualisé), redémarrage (`tmp/restart.txt`).
Journal : `build.log` dans le dossier du site. Après une mise à jour du dépôt
qui touche le script lui-même, faire d'abord `git -C ~/surmezur pull`.

## 5. Vérifications

- `https://sur-mezur.com` : landing ; les boutons mènent à `app.sur-mezur.com`.
- `https://app.sur-mezur.com` : connexion, mesure, catalogue, espace tailleur, PDF de patron.
- Admin › Sécurité : deux connexions depuis deux réseaux différents doivent
  montrer deux IP différentes (sinon la limite de tentatives de connexion
  toucherait tout le monde).

## 6. Bascule

- Nouvelle appli Android pour `app.sur-mezur.com` (même clé de signature),
  publiée dans `landing/public/android/`.
- Garder les projets Vercel ~1 mois (anciennes applis), puis les désactiver
  et fermer le port 8080 du VPS.
