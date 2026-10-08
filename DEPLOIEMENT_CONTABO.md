# Déployer le backend Sur-MeZur sur Contabo, avec la base chez Supabase

Procédure complète, de la commande du serveur à la mise en service. Chaque
commande est suivie de **son pourquoi** : ce qu'elle fait, et ce qui se
passerait sans elle. À suivre **dans l'ordre**.

Les fichiers de configuration cités sont dans [`deploy/contabo/`](deploy/contabo/)
et arrivent sur le serveur avec le clone du dépôt.

**Périmètre actuel : la version WEB** (le site et l'application de collecte),
avec l'API joignable par **l'adresse IP du serveur**, sans nom de domaine.
L'application mobile, le nom de domaine et le HTTPS de bout en bout font
l'objet d'une [phase 2](#phase-2--nom-de-domaine-https-et-application-mobile),
à faire plus tard.

```
                 HTTPS                    HTTP, par l'IP        ┌─ VPS Contabo ──────────────────────┐
 navigateur ──────────────► Vercel ──────────────────────────►│ Caddy :80 ─► API (127.0.0.1:8000)    │──► Supabase
 (site, collecte)           relaie /api/*  http://IP_VPS/api/* │              MediaPipe, MobileSAM    │    PostgreSQL
                                                                │              photos sur le disque    │    (la base)
                                                                └──────────────────────────────────────┘
```

*Pourquoi ce montage fonctionne sans domaine :* le navigateur ne parle
**qu'à Vercel**, en HTTPS. C'est le serveur Vercel qui relaie chaque appel
`/api/...` vers l'API (les « rewrites » de `web/next.config.ts`). Il peut le
faire en HTTP, vers une adresse IP, sans certificat ; le navigateur, lui, ne
voit que des adresses HTTPS de Vercel. La caméra dans la page reste donc
disponible.

| | |
|---|---|
| Ce qu'on obtient | site web et collecte branchés sur le nouveau backend ; base PostgreSQL **gérée par Supabase** ; photos sur le disque du VPS ; mises à jour par `git pull` ; sauvegarde chaque nuit |
| Il faut | un accès à l'espace client Contabo, un compte Supabase, le compte Vercel — **pas de nom de domaine** |
| Pas encore | chiffrement entre Vercel et le VPS, application mobile (phase 2) |
| Durée | ~2 h de mise en place |

Conventions : `IP_VPS` = adresse IPv4 du serveur, `smzadmin` = votre compte
d'administration sur le serveur. Les commandes précédées de `$` se tapent sur
le VPS ; les autres sont précisées (« sur votre PC », « dans Supabase »).

---

## ⚠️ En parallèle : le nom de domaine actuel expire

Vérifié le 5 octobre 2026 :

| | |
|---|---|
| Domaine | `gitingeniering.com` |
| Enregistré chez | **Scaleway SAS** |
| DNS gérés par | **O2Switch** (`ns1.o2switch.net`, `ns2.o2switch.net`) |
| **Expiration** | **7 octobre 2026** |

**Il ne bloque pas la version web** décrite ici, qui passe par l'adresse IP.
Mais :

1. **Sans renouvellement avant le 7 octobre**, tout ce qui utilise encore ce
   nom s'arrête : l'API d'O2Switch, l'application mobile déjà installée, et
   la phase 2 qui en aura besoin. Retrouvez qui paie ce domaine (compte
   O2Switch ou compte Scaleway) et renouvelez-le. Si le compte O2Switch est
   bloqué, c'est peut-être lié à une facture ou à ce renouvellement :
   contactez leur support (formulaire ou téléphone sur o2switch.fr) avec le
   nom de domaine et l'adresse e-mail du compte.
2. **Tant que l'accès O2Switch est perdu**, ses DNS ne peuvent pas être
   modifiés : la phase 2 se fera avec ce domaine si l'accès revient, ou avec
   un autre sinon.

---

## Vous aviez suivi l'ancienne version jusqu'à l'étape 6 ?

L'ancienne procédure gardait la base SQLite et commençait l'étape 6 par une
copie des données d'O2Switch, impossible sans accès au compte. Celle-ci met la
base chez Supabase et démarre avec une base neuve.

- **Étapes 1 à 4 : déjà faites, elles restent valables.** Ne les refaites pas.
- **Ancienne étape 5 (TTL du DNS chez O2Switch) :** sans objet tant que
  l'accès O2Switch est perdu.
- **Reprenez à l'étape 3 bis** (client PostgreSQL), puis à l'**étape 5**
  ci-dessous.

---

## Ce qui change par rapport à O2Switch

| O2Switch | Contabo + Supabase |
|---|---|
| Passenger + a2wsgi (WSGI) | uvicorn, serveur ASGI natif |
| Code copié de `repo-source` vers `surmezur-backend` | le code exécuté **est** le clone git |
| Base SQLite, fichier sur le serveur | **PostgreSQL chez Supabase**, sauvegardée chaque nuit |
| Colonnes ajoutées à la main (`sync_sqlite_columns.py`) | même script, compatible PostgreSQL, lancé à chaque mise à jour |
| Worker de mesures lancé par cron | analyse lancée directement après l'envoi des photos |
| HTTP seulement (AutoSSL jamais émis) | navigateur ↔ Vercel en HTTPS dès maintenant ; HTTPS automatique jusqu'au VPS (Caddy + Let's Encrypt) en phase 2 |
| Aucune sauvegarde | base + photos chaque nuit, copie hors du serveur |

---

## Étape 1 — Commander le VPS

Dans l'espace client Contabo :

1. **Produit** : *Cloud VPS* avec **au moins 4 vCPU et 8 Go de RAM**.
   *Pourquoi :* l'API lance deux processus, et chacun charge torch et
   MobileSAM pour la mesure par photo (~1 à 1,5 Go chacun). Avec moins de
   mémoire, le système tue un processus en pleine analyse.
2. **Région** : Union européenne (Allemagne).
   *Pourquoi :* Supabase propose la région Francfort ; avec les deux au même
   endroit, chaque requête à la base prend quelques millisecondes au lieu de
   plusieurs dizaines. Depuis le Cameroun, la latence est la même qu'avec
   O2Switch, en France.
3. **Image** : **Ubuntu 24.04 LTS**.
   *Pourquoi :* version maintenue jusqu'en 2029, et celle pour laquelle toutes
   les commandes ci-dessous ont été écrites.
4. **Accès** : collez votre clé SSH publique si le formulaire le propose.
   *Pourquoi :* une clé est impossible à deviner, contrairement à un mot de
   passe ; c'est la seule méthode de connexion qu'on laissera ouverte.

Notez l'adresse IPv4 reçue : c'est `IP_VPS`.

> Pas encore de clé SSH ? Sur votre PC (PowerShell) : `ssh-keygen -t ed25519`.
> La clé publique, à donner, est `C:\Users\<vous>\.ssh\id_ed25519.pub` ; la
> clé privée (sans `.pub`) ne quitte jamais votre PC.

---

## Étape 2 — Sécuriser le serveur

Première connexion en root :

```bash
ssh root@IP_VPS
```

*Pourquoi root ici seulement :* c'est le seul compte qui existe sur un serveur
neuf. On s'en sert pour créer un compte nominatif, puis on interdit la
connexion directe en root.

**Compte d'administration** :

```bash
adduser smzadmin
usermod -aG sudo smzadmin
mkdir -p /home/smzadmin/.ssh
cp ~/.ssh/authorized_keys /home/smzadmin/.ssh/ 2>/dev/null || true
chown -R smzadmin:smzadmin /home/smzadmin/.ssh && chmod 700 /home/smzadmin/.ssh
```

*Pourquoi :*
- `adduser` crée le compte et demande un mot de passe. Il ne servira pas à
  se connecter (on n'autorisera que la clé), seulement à confirmer les
  commandes `sudo`.
- `usermod -aG sudo` permet à ce compte d'exécuter une commande en tant
  qu'administrateur en la préfixant par `sudo`. Chaque action sensible est
  ainsi volontaire et tracée.
- Les trois dernières lignes recopient votre clé SSH vers le nouveau compte.
  Les droits `700` sont exigés par SSH, qui refuse une clé lisible par
  d'autres utilisateurs.

Si `/root/.ssh/authorized_keys` n'existait pas (pas de clé donnée à la
commande), **sur votre PC** :

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh smzadmin@IP_VPS "cat >> ~/.ssh/authorized_keys"
```

**Dans un SECOND terminal**, vérifiez que `ssh smzadmin@IP_VPS` fonctionne,
puis que `sudo -v` réussit. *Pourquoi :* l'étape suivante coupe l'accès root.
Si le nouveau compte ne marchait pas, vous perdriez l'accès au serveur ; la
première session root reste ouverte en secours tant que ce n'est pas vérifié.

**Interdire root et les mots de passe en SSH** :

```bash
cat > /etc/ssh/sshd_config.d/99-surmezur.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
systemctl restart ssh
```

*Pourquoi :* un serveur exposé sur Internet reçoit des milliers de tentatives
de connexion par jour, presque toutes sur `root` avec des mots de passe
courants. Sans root ni mot de passe, ces attaques n'ont plus aucune prise.
Le fichier est placé dans `sshd_config.d/` pour qu'une mise à jour d'Ubuntu
ne l'écrase pas.

À partir d'ici, tout se fait en `smzadmin`.

```bash
$ sudo apt update && sudo apt -y full-upgrade
```
*Pourquoi :* l'image fournie a plusieurs semaines ; on applique les correctifs
de sécurité avant d'ouvrir quoi que ce soit.

```bash
$ sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```
*Pourquoi :* le pare-feu ne laisse entrer que SSH (administration), 80 et 443
(HTTP et HTTPS, pour Caddy). L'API elle-même écoute sur le port 8000 mais
seulement en interne : même un oubli de configuration ne l'exposerait pas.
`OpenSSH` est autorisé **avant** l'activation, sinon la session en cours
serait coupée.

```bash
$ sudo apt install -y fail2ban unattended-upgrades
$ sudo dpkg-reconfigure -plow unattended-upgrades        # répondre « Oui »
```
*Pourquoi :* fail2ban bannit pour un temps une adresse qui multiplie les
échecs de connexion. unattended-upgrades installe seul les correctifs de
sécurité chaque jour : un serveur qu'on oublie de mettre à jour finit
toujours par être vulnérable.

```bash
$ sudo timedatectl set-timezone Africa/Douala
```
*Pourquoi :* les journaux et les noms des sauvegardes seront à l'heure de
l'équipe, ce qui évite des erreurs de lecture au moment d'un incident.

```bash
$ sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
$ echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
*Pourquoi :* 4 Go de mémoire d'échange sur le disque. Lorsque les deux
processus de l'API chargent torch au même moment, la mémoire monte en pointe ;
sans espace d'échange, Linux tue un processus. `chmod 600` empêche quiconque
de lire ce fichier, qui peut contenir des données en mémoire. La ligne dans
`/etc/fstab` le réactive à chaque redémarrage.

```bash
$ sudo reboot
```
*Pourquoi :* la mise à jour a pu changer le noyau, qui ne s'applique qu'au
redémarrage.

---

## Étape 3 — Installer les logiciels

```bash
$ sudo add-apt-repository -y ppa:deadsnakes/ppa
$ sudo apt install -y python3.11 python3.11-venv python3.11-dev \
      git curl sqlite3 rclone build-essential libgl1 libglib2.0-0t64
```
*Pourquoi :*
- **Python 3.11** : version de production actuelle (`backend/.python-version`).
  Les modèles de mesure `.joblib` et MediaPipe 0.10.14 ont été validés avec
  elle. Ubuntu 24.04 fournit 3.12 par défaut, d'où le dépôt deadsnakes qui
  propose les autres versions.
- `git` récupère le code ; `curl` sert aux vérifications ; `sqlite3` reste
  utile pour lire une ancienne base O2Switch le jour où elle revient
  (étape 12) ; `rclone` envoie les sauvegardes hors du serveur.
- `build-essential` et `python3.11-dev` permettent à pip de compiler un
  paquet qui n'aurait pas de version précompilée.
- `libgl1` et `libglib2.0-0t64` sont exigées par OpenCV, que MediaPipe
  importe. Sans elles, l'API démarre mais la mesure échoue sur `libGL.so.1`.

**Caddy** (le serveur web frontal, qui gère le HTTPS), depuis son dépôt officiel :

```bash
$ sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
$ sudo apt update && sudo apt install -y caddy
```
*Pourquoi :* Caddy obtient et renouvelle seul les certificats HTTPS, là où
nginx demande certbot et une configuration à part. On passe par son dépôt
officiel, dont la version est plus récente que celle d'Ubuntu. La clé `gpg`
permet à apt de vérifier que les paquets viennent bien de Caddy.

## Étape 3 bis — Client PostgreSQL (pour les sauvegardes)

```bash
$ sudo apt install -y postgresql-common
$ sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
$ sudo apt install -y postgresql-client-17
```
*Pourquoi :* `pg_dump`, qui fera la sauvegarde nocturne de la base, refuse
de sauvegarder un serveur **plus récent** que lui. Ubuntu 24.04 fournit la
version 16, alors que les projets Supabase récents tournent en PostgreSQL 17.
Le script officiel ajoute le dépôt de PostgreSQL, qui propose toutes les
versions. Seul le **client** est installé : la base, elle, est chez Supabase.
Si votre projet Supabase indique une autre version (étape 5), installez le
client de **cette** version ou d'une plus récente.

---

## Étape 4 — Installer l'application

```
/srv/surmezur/
├── app/        clone git (le code)
├── venv/       environnement Python
├── data/       uploads/, dataset_store/, avatar_store/ (les photos)
└── backups/    sauvegardes nocturnes
/etc/surmezur/api.env   configuration (hors du dépôt)
```

*Pourquoi cette organisation :* code, données et configuration sont séparés.
Un `git pull` ne touche que le code ; une erreur dans le code ne peut pas
effacer les photos ; et le secret de configuration n'entre jamais dans git.

```bash
$ sudo useradd --system --create-home --home-dir /srv/surmezur --shell /usr/sbin/nologin surmezur
```
*Pourquoi :* l'API tourne sous un utilisateur dédié, sans droits
d'administration et sans possibilité de connexion (`nologin`). Si une faille
de l'application était exploitée, l'attaquant serait enfermé dans ce compte
et ne pourrait pas prendre le contrôle du serveur.

```bash
$ sudo -u surmezur git clone https://github.com/TCHOUANANG-dimitri/Sur-MeZur.git /srv/surmezur/app
$ sudo -u surmezur mkdir -p /srv/surmezur/data/uploads /srv/surmezur/data/dataset_store /srv/surmezur/data/avatar_store /srv/surmezur/backups
```
*Pourquoi :* `sudo -u surmezur` fait exécuter la commande par l'utilisateur
de l'application, qui devient propriétaire des fichiers et pourra les mettre à
jour. Le dépôt est public : le clone se fait sans identifiant.

```bash
$ sudo -u surmezur python3.11 -m venv /srv/surmezur/venv
$ sudo -u surmezur /srv/surmezur/venv/bin/pip install --upgrade pip wheel
$ cd /srv/surmezur/app/backend
$ sudo -u surmezur -H /srv/surmezur/venv/bin/pip install -r requirements.txt -r requirements-vision.txt
$ sudo -u surmezur /srv/surmezur/venv/bin/python -c "import torch, mediapipe, cv2, mobile_sam, sklearn, psycopg; print('OK, torch', torch.__version__)"
```
*Pourquoi :*
- L'environnement virtuel (`venv`) isole les versions exactes des paquets de
  l'application de celles du système, qu'une mise à jour d'Ubuntu ne peut
  alors pas casser.
- Les deux fichiers de dépendances sont installés **ensemble** pour que pip
  choisisse une seule version de NumPy compatible avec les deux. Comptez 10
  à 15 minutes (torch CPU, MediaPipe, OpenCV).
- `-H` place le cache de pip dans `/srv/surmezur`, le dossier de
  l'utilisateur, et non dans celui de `smzadmin`.
- La dernière ligne vérifie que tout s'importe, y compris `psycopg`, le
  pilote PostgreSQL. Mieux vaut le découvrir ici que dans un message
  d'erreur de l'API.

Le poids de MobileSAM (`backend/ml/weights/mobile_sam.pt`, 40 Mo) est
versionné dans le dépôt : il arrive avec le clone.

```bash
$ sudo cp /srv/surmezur/app/deploy/contabo/surmezur-api.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable surmezur-api
```
*Pourquoi :* systemd démarre l'API au démarrage du serveur et la relance si
elle plante. `daemon-reload` lui fait lire le nouveau fichier ; `enable`
inscrit le démarrage automatique. On ne la **démarre** pas encore : elle n'a
pas de base.

---

## Étape 5 — Créer la base chez Supabase

**Dans Supabase** (supabase.com, *New project*) :

1. **Organisation et nom** : `sur-mezur`.
2. **Mot de passe de la base** : cliquez sur *Generate a password*, puis
   copiez-le dans votre gestionnaire de mots de passe.
   *Pourquoi :* c'est la clé de toutes les données. Un mot de passe généré
   n'a que des lettres et des chiffres, ce qui évite de devoir encoder des
   caractères spéciaux dans l'adresse de connexion (étape 6). Ne le collez
   dans aucune messagerie.
3. **Région** : *Central EU (Frankfurt)*.
   *Pourquoi :* au plus près du VPS (Allemagne) ; chaque page de l'application
   fait plusieurs requêtes à la base, et la latence s'additionne.
4. **Offre** : en production, l'offre gratuite a deux limites, à vérifier
   au moment de choisir : le projet peut être **mis en pause** après une
   période d'inactivité, et elle n'inclut pas de sauvegarde téléchargeable.
   La sauvegarde nocturne de l'étape 11 couvre le second point ; pour le
   premier, l'offre payante est la solution sûre.

Une fois le projet créé :

- **Version de PostgreSQL** : *Project Settings → Infrastructure*. Si elle
  est supérieure à 17, installez le client correspondant (étape 3 bis).
- **Couper l'API REST automatique** : *Project Settings → Data API*,
  désactivez-la si l'option est proposée.
  *Pourquoi :* Supabase publie chaque table par une API web. Sur-MeZur ne
  s'en sert pas, puisque seul le backend parle à la base. La laisser ouverte
  serait une porte inutile. Le script `securiser_supabase.py`, lancé à chaque
  mise à jour, la ferme de toute façon table par table (étape 7).
- **Récupérer l'adresse de connexion** : bouton **Connect** en haut de la
  page, onglet *Connection string*, choix **Session pooler**. Elle a cette
  forme :
  `postgresql://postgres.REF:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`

  *Pourquoi le « Session pooler » :*
  - la **connexion directe** (`db.REF.supabase.co`) n'est joignable qu'en
    IPv6 sur les offres de base ; le pooler l'est en IPv4, comme tout VPS ;
  - le **Transaction pooler** (port 6543) sert aux fonctions serverless. Notre
    API garde ses connexions ouvertes et utilise des requêtes préparées, que
    ce mode ne supporte pas (erreur « prepared statement does not exist »).

---

## Étape 6 — Brancher l'API sur Supabase

**Mettre le code à jour** (si vous aviez cloné avant le passage à Supabase) :

```bash
$ cd /srv/surmezur/app && sudo -u surmezur git pull --ff-only
$ sudo -u surmezur -H /srv/surmezur/venv/bin/pip install -r backend/requirements.txt
```
*Pourquoi :* le passage à PostgreSQL a ajouté le pilote `psycopg` aux
dépendances, ainsi que les scripts de migration et de sécurisation.
`--ff-only` refuse de mélanger l'historique si le clone avait été modifié à
la main : on le saurait au lieu de le subir.

**La configuration** :

```bash
$ sudo mkdir -p /etc/surmezur
$ sudo cp /srv/surmezur/app/deploy/contabo/api.env.example /etc/surmezur/api.env
$ sudo nano /etc/surmezur/api.env
$ sudo chown root:surmezur /etc/surmezur/api.env && sudo chmod 640 /etc/surmezur/api.env
```
*Pourquoi :* le fichier vit dans `/etc`, hors du dépôt, pour qu'un `git pull`
ne puisse ni l'écraser ni le publier. Les droits `640 root:surmezur` le
rendent lisible par l'API et modifiable seulement par un administrateur : il
contient le mot de passe de la base.

Dans `api.env`, remplacez deux valeurs :

1. **`DATABASE_URL`** : l'adresse de l'étape 5, avec votre mot de passe à
   la place de `[YOUR-PASSWORD]` (sans les crochets), et **`?sslmode=require`
   ajouté à la fin**.
   *Pourquoi `sslmode=require` :* la connexion traverse Internet entre
   l'Allemagne et Francfort ; elle doit être chiffrée, et Supabase refuse
   d'ailleurs les connexions en clair. Si le mot de passe contient `#`, `@`,
   `:`, `/`, `?` ou `%`, encodez-le (`#` → `%23`, `@` → `%40` : la liste est
   dans le fichier).
2. **`JWT_SECRET`** : une valeur neuve, générée sur le VPS :
   ```bash
   $ python3 -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
   *Pourquoi une valeur neuve :* sans accès à O2Switch, on ne peut pas
   reprendre l'ancienne. Ses seules conséquences : les utilisateurs devront se
   reconnecter, ce qu'ils feraient de toute façon avec une base neuve.

**Tester la connexion avant tout le reste** :

```bash
$ sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; psql "$DATABASE_URL" -c "select version();"'
```
*Pourquoi :* si l'adresse, le mot de passe ou le réseau posent problème, on
le voit ici avec un message clair de PostgreSQL, et non noyé dans le journal
de l'API. La commande lit `api.env` exactement comme l'API le fera. Attendu :
une ligne `PostgreSQL 17...`.

---

## Étape 7 — Initialiser la base

**Créer les tables, les sécuriser et démarrer l'API** :

```bash
$ sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh --force
```
*Pourquoi :* c'est le script de mise à jour, forcé même sans nouveau commit.
Il fait, dans l'ordre :
1. il crée les 30 tables (`create_all`) ;
2. il ajoute les colonnes manquantes (aucune sur une base neuve) ;
3. il **ferme l'accès public aux tables** (`securiser_supabase.py`) : sécurité
   par ligne activée, droits retirés aux rôles publics de Supabase ;
4. il démarre l'API et attend qu'elle réponde.

Il se termine par `Redemarrage : OK`. Sinon : `journalctl -u surmezur-api -n 100`.

**Importer le catalogue** (304 modèles, 6 catégories, tissus, accessoires,
barème) depuis la base locale de développement. **Sur votre PC**, depuis `Sur-MeZur-App\backend` :

```powershell
scp sur_mezur.db smzadmin@IP_VPS:/tmp/catalogue.db
scp -r uploads/homme uploads/femme uploads/garment-models smzadmin@IP_VPS:/tmp/
```
*Pourquoi :* la base locale contient le catalogue complet, et
`uploads/homme` et `uploads/femme` contiennent ses 302 photos. Les modèles
enregistrent le **chemin** de leur photo (`/uploads/homme/...`), il faut donc
copier les deux. Comptez quelques minutes pour les photos.

**Sur le VPS** :

```bash
$ sudo cp -r /tmp/homme /tmp/femme /tmp/garment-models /srv/surmezur/data/uploads/
$ sudo chown -R surmezur:surmezur /srv/surmezur/data/uploads
$ sudo install -o surmezur -g surmezur -m 600 /tmp/catalogue.db /srv/surmezur/catalogue.db
```
*Pourquoi :* les photos rejoignent le dossier que l'API sert sous `/uploads`.
`chown` les rend à l'utilisateur de l'API, qui doit pouvoir les lire (et
supprimer celles d'un modèle effacé par l'admin). La base est rangée hors de
`/tmp`, que le système vide au redémarrage.

```bash
$ cd /srv/surmezur/app/backend
$ sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; /srv/surmezur/venv/bin/python scripts/migrer_vers_postgres.py --source sqlite:////srv/surmezur/catalogue.db'
```
*Pourquoi :* **aperçu seulement**, rien n'est écrit. Le script liste ce
qu'il copierait. En mode `catalogue` (le défaut), il prend les catégories,
les modèles, les tissus, les accessoires et le barème, mais **aucun compte** :
les comptes de la base locale sont des comptes de test.

```bash
$ sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; /srv/surmezur/venv/bin/python scripts/migrer_vers_postgres.py --source sqlite:////srv/surmezur/catalogue.db --appliquer'
```
*Pourquoi :* la même commande avec `--appliquer` écrit dans Supabase. Elle
peut être relancée sans risque : une ligne déjà présente est ignorée, jamais
dupliquée ni écrasée. Les 4 barres obliques de `sqlite:////` désignent un
chemin absolu.

**Créer le compte administrateur** :

```bash
$ read -s -p "Mot de passe admin (6 caractères, lettres ET chiffres) : " ADMIN_PASSWORD; echo
$ sudo -u surmezur ADMIN_PASSWORD="$ADMIN_PASSWORD" bash -c 'set -a; . /etc/surmezur/api.env; set +a; cd /srv/surmezur/app/backend; /srv/surmezur/venv/bin/python -m app.seed'
$ unset ADMIN_PASSWORD
```
*Pourquoi :*
- `read -s` saisit le mot de passe **sans l'afficher** et sans qu'il entre
  dans l'historique du terminal, contrairement à une valeur tapée dans la
  commande.
- `app.seed` crée le compte admin (`+237696982953`). Il ne crée tissus,
  accessoires et barème que si leurs tables sont **vides** : c'est pourquoi
  il passe **après** l'import du catalogue, qui les a déjà remplies (dans
  l'autre ordre, on obtiendrait des doublons).
- Le mot de passe n'est plus écrit dans le code : l'ancien figurait en clair
  dans un dépôt **public**.
- `unset` efface la variable de la session.

---

## Étape 8 — Vérifier l'API (avant d'ouvrir au public)

Toutes ces vérifications se font **sur le serveur lui-même**, sans nom de
domaine ni HTTPS.

```bash
$ curl -s http://127.0.0.1:8000/api/health
```
*Pourquoi :* l'API répond (`{"status":"ok"}`).

```bash
$ curl -s http://127.0.0.1:8000/api/measurements/capabilities | python3 -m json.tool
```
*Pourquoi :* la chaîne de mesure est complète. Attendu : `vision_enabled`
vrai, avec MediaPipe, SAM et les modèles disponibles. Si une brique manque,
la mesure échouerait chez les clients.

```bash
$ curl -s http://127.0.0.1:8000/api/categories | python3 -m json.tool | head -20
$ P=$(curl -s http://127.0.0.1:8000/api/models | python3 -c "import sys,json; print(next(m['photo_url'] for m in json.load(sys.stdin) if m.get('photo_url')))")
$ curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8000$P"
```
*Pourquoi :* le catalogue est bien lu depuis Supabase, et une de ses photos
est servie (`200`) : la base et le disque concordent.

```bash
$ read -s -p "Mot de passe admin : " PW; echo
$ TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login -H 'Content-Type: application/json' \
    -d "{\"phone\":\"+237696982953\",\"password\":\"$PW\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"); unset PW
$ cd "/srv/surmezur/app/IMAGES TEST"
$ time curl -s -X POST http://127.0.0.1:8000/api/measurements/debug/analyze -H "Authorization: Bearer $TOKEN" \
    -F "front=@WhatsApp Image 2026-08-10 at 4.52.13 PM.jpeg;type=image/jpeg" \
    -F "side=@WhatsApp Image 2026-08-10 at 4.52.14 PM.jpeg;type=image/jpeg" \
    -F height_cm=171 -F weight_kg=62 -F gender=female | python3 -m json.tool | head -40
```
*Pourquoi :*
- la connexion prouve que les comptes et les mots de passe fonctionnent
  avec Supabase ;
- l'analyse de deux photos de test du dépôt prouve que **la mesure par photo
  tourne sur ce serveur**, de bout en bout. `time` donne sa durée réelle :
  quelques secondes, plus le chargement de torch la toute première fois.

**Dans Supabase → Table Editor**, vous devez voir les tables, 304 lignes
dans `garment_models` et un seul compte dans `users`. *Pourquoi :* une
dernière vérification, faite de l'extérieur du serveur.

---

## Étape 9 — Ouvrir l'API à Vercel, par l'adresse IP

Jusqu'ici, l'API ne répondait qu'**à l'intérieur** du serveur
(`127.0.0.1:8000`). On l'ouvre maintenant à Vercel par l'adresse IP, sur le
port 80, derrière Caddy.

*Pourquoi pas le mobile à ce stade :* l'application mobile appelle l'API
**directement**, sans passer par Vercel. L'adresse est inscrite dans l'APK, et
Android bloque le HTTP sauf exception déclarée. Il lui faut un nom de domaine
en HTTPS (phase 2).

```bash
$ sudo cp /srv/surmezur/app/deploy/contabo/Caddyfile.ip /etc/caddy/Caddyfile
$ sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
$ sudo caddy validate --config /etc/caddy/Caddyfile
$ sudo systemctl enable caddy
$ sudo systemctl restart caddy
$ systemctl status caddy --no-pager | head -5        # doit indiquer « active (running) »
$ curl -s http://127.0.0.1/api/health                # {"status":"ok"}
```
*Pourquoi :*
- `Caddyfile.ip` sert l'API sur le **port 80 de l'adresse IP** (`:80` =
  n'importe quel nom ou adresse) et relaie vers `127.0.0.1:8000`. Sans nom de
  domaine, Caddy ne tente aucun certificat : l'avertissement « server is
  listening only on the HTTP port » de `validate` est donc **normal** ;
- on passe tout de même par Caddy plutôt que d'ouvrir le port 8000 : l'API
  reste invisible de l'extérieur, Caddy garde les limites de taille et de
  durée des envois de photos, et le jour où le domaine arrive, il suffit de
  changer de `Caddyfile` sans toucher au pare-feu ni à l'API ;
- `validate` attrape une faute **avant** d'appliquer ;
- `enable` démarre Caddy à chaque démarrage du serveur ; `restart` (et non
  `reload`) applique la configuration **que Caddy soit déjà lancé ou non** —
  `reload` échoue avec « caddy.service is not active » s'il ne tournait pas ;
- le dernier `curl` passe par Caddy (port 80) et non directement par l'API
  (port 8000) : il prouve que le relais fonctionne.

**Sur votre PC**, vérifiez que l'API répond par l'adresse IP :

```powershell
curl.exe -s http://IP_VPS/api/health
curl.exe -s http://IP_VPS/api/measurements/capabilities
```
*Pourquoi :* c'est exactement le chemin que prendra Vercel. Si le PC n'obtient
pas de réponse, Vercel non plus : il faut alors vérifier `sudo ufw status`
(port 80 ouvert) et `sudo journalctl -u caddy -n 50`.

**À savoir, et à ne pas laisser durer :** entre Vercel et le VPS, le trafic
circule **en clair** sur Internet, y compris les mots de passe à la
connexion et les photos. C'est le même niveau qu'aujourd'hui avec O2Switch,
qui n'a jamais eu de HTTPS, mais pas un état définitif. Dès que vous avez un
nom de domaine, même un sous-domaine gratuit, passez à la phase 2.

---

## Étape 10 — Brancher le site web et la collecte

**Dans Vercel**, sur le projet du **site** puis sur celui de la
**collecte** : *Settings → Environment Variables* → `API_ORIGIN` =
`http://IP_VPS` (sans `/` final) → **Redeploy**.

*Pourquoi :*
- le site n'appelle jamais l'API directement : c'est le serveur Vercel qui
  relaie vers `API_ORIGIN`. Changer cette seule variable fait basculer tout
  le site vers le nouveau backend ;
- la variable est lue **au moment du build** (les rewrites sont figées dans
  la version déployée), d'où le *Redeploy* : sans lui, le site continuerait
  d'appeler l'ancienne adresse ;
- on la règle dans le tableau de bord, sans toucher à `web/.env.production`
  ni à `collecte/.env.production` : la variable du tableau de bord prime sur
  ces fichiers, et le jour du passage au nom de domaine, on la changera au
  même endroit, sans commit.

**Vérification de bout en bout**, dans un navigateur :

1. ouvrez le site et créez un compte client (ou connectez-vous) ;
2. faites une prise de mesure complète (deux photos) ;
3. sur l'application de collecte, connectez-vous avec le compte admin et
   ouvrez l'onglet *Équipe*.

*Pourquoi :* chaque action traverse toute la chaîne : navigateur, Vercel,
Caddy, API, Supabase, puis le disque pour les photos. Si l'une échoue, le
détail affiché sous le message d'erreur du site indique l'étape en cause, et
le journal de l'API (`journalctl -u surmezur-api -f`) dit pourquoi.

---

## Étape 11 — Sauvegardes

La base est chez Supabase, les photos sur le VPS : il faut sauvegarder **les
deux**, et **hors** du VPS.

**Destination hors du serveur** (exemple : un dossier Google Drive) :

```bash
$ sudo -u surmezur -H rclone config
#   n (nouveau) -> nom : sauvegarde -> type : drive -> suivre l'assistant
#   (sans navigateur sur le serveur, rclone indique la commande `rclone authorize`
#   à lancer sur votre PC, puis vous recollez le jeton obtenu)
$ echo 'RCLONE_REMOTE=sauvegarde:surmezur-sauvegardes' | sudo tee /etc/surmezur/backup.env
$ sudo chown root:surmezur /etc/surmezur/backup.env && sudo chmod 640 /etc/surmezur/backup.env
```
*Pourquoi :* une sauvegarde qui reste sur le VPS disparaît avec lui (panne,
résiliation, erreur de manipulation). rclone sait écrire vers des dizaines de
services. Sa configuration est faite **sous `surmezur`**, l'utilisateur qui
lancera la sauvegarde.

**Planification chaque nuit à 2 h 30** :

```bash
$ echo '30 2 * * * surmezur bash /srv/surmezur/app/deploy/contabo/sauvegarde.sh >> /srv/surmezur/backups/sauvegarde.log 2>&1' | sudo tee /etc/cron.d/surmezur
```
*Pourquoi :* `cron.d` permet de désigner l'utilisateur (`surmezur`), qui
possède les photos. Le script :
- fait un `pg_dump` de la base Supabase (format compressé, restaurable
  table par table) ;
- archive les photos ;
- garde 14 jours sur le VPS ;
- envoie le tout vers `RCLONE_REMOTE`.

L'heure creuse évite de ralentir l'API pendant la journée.

**Testez maintenant**, sans attendre la nuit :

```bash
$ sudo -u surmezur -H bash /srv/surmezur/app/deploy/contabo/sauvegarde.sh
$ ls -lh /srv/surmezur/backups
$ sudo -u surmezur -H rclone ls sauvegarde:surmezur-sauvegardes | tail
```
*Pourquoi :* une sauvegarde jamais testée n'en est pas une. Si `pg_dump`
refuse avec « server version mismatch », le client installé à l'étape 3 bis
est plus ancien que la base : installez la bonne version.

**Restaurer** (à essayer une fois, pour savoir que ça marche) :

```bash
# Base : recharge le contenu d'une sauvegarde dans Supabase
$ sudo systemctl stop surmezur-api
$ sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; pg_restore --clean --if-exists --no-owner --no-privileges -d "${DATABASE_URL/+psycopg/}" /srv/surmezur/backups/base-AAAAMMJJ-HHMM.dump'
# Photos
$ sudo tar xzf /srv/surmezur/backups/fichiers-AAAAMMJJ-HHMM.tgz -C /srv/surmezur/data
$ sudo chown -R surmezur:surmezur /srv/surmezur/data
$ sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh --force
```
*Pourquoi :*
- l'API est arrêtée pour que personne n'écrive pendant la restauration ;
- `--clean --if-exists` remplace les tables existantes par celles de la
  sauvegarde ;
- `--no-owner --no-privileges` ignore les propriétaires d'origine, que
  Supabase n'autoriserait pas à recréer ;
- le script de mise à jour remet la sécurisation et redémarre l'API.

Supabase propose aussi ses propres sauvegardes selon l'offre, et Contabo des
**instantanés** du VPS : utiles avant une opération risquée, mais chez le même
fournisseur que l'original. Ils ne remplacent donc pas une copie ailleurs.

---

## Étape 12 — Récupérer les données d'O2Switch, le jour où l'accès revient

Les comptes, les mesures et les commandes saisis en production sont restés sur
O2Switch. Quand l'accès revient, **sur O2Switch** :

```bash
source /home/sc1jsgw2086/virtualenv/surmezur-backend/3.11/bin/activate
cd /home/sc1jsgw2086/surmezur-backend
grep DATABASE_URL .env                       # chemin de la base
python - <<'EOF'
import sqlite3
src = sqlite3.connect("CHEMIN_BASE")         # ce qui suit « sqlite:/// »
dst = sqlite3.connect("/home/sc1jsgw2086/export-surmezur.db")
src.backup(dst); dst.close(); src.close()
EOF
tar czf ~/export-fichiers.tgz $(for d in uploads dataset_store avatar_store; do [ -d "$d" ] && echo "$d"; done)
```
*Pourquoi :* l'API de sauvegarde de SQLite produit une copie cohérente même
si quelqu'un écrit au même moment ; un `cp` pourrait copier un fichier à moitié
écrit. L'archive rassemble les photos des clients et des tailleurs.

Transférez les deux fichiers vers le VPS en passant par votre PC (`scp`, comme
à l'étape 7), puis **sur le VPS** :

```bash
$ sudo install -o surmezur -g surmezur -m 600 /tmp/export-surmezur.db /srv/surmezur/production-o2switch.db
$ sudo tar xzf /tmp/export-fichiers.tgz -C /srv/surmezur/data --skip-old-files
$ sudo chown -R surmezur:surmezur /srv/surmezur/data
$ cd /srv/surmezur/app/backend
$ sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; /srv/surmezur/venv/bin/python scripts/migrer_vers_postgres.py --source sqlite:////srv/surmezur/production-o2switch.db --perimetre tout'
$ sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; /srv/surmezur/venv/bin/python scripts/migrer_vers_postgres.py --source sqlite:////srv/surmezur/production-o2switch.db --perimetre tout --appliquer'
$ sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh --force
```
*Pourquoi :*
- `--skip-old-files` n'écrase aucune photo déjà présente sur le VPS ;
- `--perimetre tout` copie **toutes** les tables, dans l'ordre imposé par
  leurs liens (un profil après son compte, etc.) ;
- l'aperçu d'abord, l'écriture ensuite ;
- une ligne déjà présente est ignorée. Une ligne qui contredit une donnée
  existante (par exemple un numéro de téléphone réinscrit entre-temps sur le
  nouveau serveur) est **signalée et laissée de côté**, sans bloquer le
  reste : à traiter au cas par cas ;
- le script de mise à jour sécurise les tables et redémarre l'API.

---

## Étape 13 — Après la mise en service

1. **Le mot de passe admin** n'est plus dans le code, mais l'ancien mot de passe
   reste lisible dans l'historique du dépôt public : ne le réutilisez nulle
   part.
2. **Surveillance** (facultatif, gratuit) : un moniteur UptimeRobot ou
   équivalent sur `http://IP_VPS/api/health` (puis sur l'adresse HTTPS en
   phase 2), qui prévient par e-mail si l'API tombe.
3. **Comptes de la collecte** : connectez-vous à l'application de collecte
   avec le compte admin, onglet *Équipe*, pour créer les comptes des agents.
4. **O2Switch** : une fois les données récupérées (étape 12) et la phase 2
   faite, l'application Python d'O2Switch peut être supprimée.
   `DEPLOIEMENT.txt` devient alors obsolète.

---

## Phase 2 — Nom de domaine, HTTPS et application mobile

À faire quand un nom de domaine est disponible. Elle chiffre le dernier
tronçon (Vercel → VPS) et permet de rebrancher l'application mobile.

### 1. Choisir le nom

**Si vous avez récupéré la gestion des DNS de `gitingeniering.com`** (et
renouvelé le domaine) : dans la zone DNS du domaine (cPanel O2Switch → *Zone Editor*, tant que les DNS
y sont) :

- enregistrement **A** `api` → **`IP_VPS`** ;
- **supprimez** un éventuel enregistrement **AAAA** `api`.

*Pourquoi supprimer l'AAAA :* il donnerait une adresse IPv6 chez O2Switch, et
les téléphones en IPv6 continueraient d'aller à l'ancien serveur.

**Sinon**, il faut **un autre nom de domaine** dont vous contrôlez les DNS :

- un nouveau domaine (quelques euros par an chez n'importe quel registraire),
  puis un enregistrement A `api.nouveau-domaine.com` → `IP_VPS` ;
- ou, en attendant, un sous-domaine gratuit (DuckDNS, par exemple).

*Pourquoi un nom est indispensable ici :* l'application mobile doit joindre
l'API en HTTPS, et un certificat HTTPS se délivre pour un nom, pas pour une
adresse IP.

Avec un autre nom, remplacez-le dans le `Caddyfile` (ci-dessous) et
**supprimez son bloc `http://`** : il ne servait qu'aux anciennes APK, qui
appellent `api.gitingeniering.com` et ne pourront de toute façon plus joindre
le nouveau serveur.

### 2. Faire pointer le nom vers le VPS et activer le HTTPS

Vérifiez que le nom pointe vers le VPS :

```bash
$ dig +short api.gitingeniering.com        # (ou votre nouveau nom) — doit afficher IP_VPS
```
*Pourquoi attendre :* Let's Encrypt vérifie que le nom mène bien à ce
serveur. Tenter trop tôt échoue, et plusieurs échecs bloquent temporairement
les demandes de certificat.

```bash
$ sudo cp /srv/surmezur/app/deploy/contabo/Caddyfile /etc/caddy/Caddyfile
$ sudo nano /etc/caddy/Caddyfile                     # autre nom : le remplacer, retirer le bloc http://
$ sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
$ sudo caddy validate --config /etc/caddy/Caddyfile
$ sudo systemctl reload caddy
$ sudo journalctl -u caddy -f        # attendre « certificate obtained successfully », puis Ctrl+C
```
*Pourquoi :*
- le `Caddyfile` fait de Caddy un relais : il reçoit le HTTPS, le déchiffre
  et transmet à l'API sur `127.0.0.1:8000`. Il limite aussi la taille d'un
  envoi (30 Mo) et laisse 180 s aux envois de photos sur réseau lent ;
- le dossier de journaux doit appartenir à `caddy`, qui tourne sans droits ;
- `validate` attrape une faute de frappe **avant** de recharger, ce qui
  évite de couper un service qui tournait ;
- `reload` applique sans interruption (Caddy tourne depuis l'étape 9 ; s'il
  est arrêté, « caddy.service is not active », utilisez `restart`), et le
  journal montre l'obtention du certificat.

```bash
curl -s https://api.gitingeniering.com/api/health
curl -s https://api.gitingeniering.com/openapi.json | grep -c '"/api/collecte/stats"'   # 1
```
*Pourquoi :* la même vérification qu'à l'étape 8, mais cette fois depuis
l'extérieur, en HTTPS, par le nom public. Ce `Caddyfile` remplace
`Caddyfile.ip` : l'accès par l'adresse IP en HTTP s'arrête.

---

### 3. Basculer le site sur le nom

Dans Vercel (site et collecte) : `API_ORIGIN` = `https://api.gitingeniering.com`
(ou votre nouveau nom) → **Redeploy**. Mettez la même valeur dans
`web/.env.production` et `collecte/.env.production`.
*Pourquoi faire les deux :* le tableau de bord s'applique tout de suite ; les
fichiers gardent la bonne valeur pour un futur projet Vercel créé sans elle.

### 4. Rebrancher l'application mobile

La nouvelle adresse en `https://` dans `mobile/src/config.ts`
(`PRODUCTION_API_URL`) et dans les trois profils de `mobile/eas.json`, puis
une nouvelle APK (RAPPORT_PROJET.md §10).
*Pourquoi une nouvelle APK :* l'adresse est inscrite dans l'APK à la
compilation ; les APK déjà installées appellent toujours l'ancienne adresse.
Une fois la nouvelle APK installée partout, l'exception « trafic en clair »
d'Android (`network_security_config.xml`) pourra être retirée.

---

## Au quotidien

**Mettre à jour l'API** après un `git push` sur `main` :

```bash
$ sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh
```

*Pourquoi un seul script :* il fait tout ce qu'une mise à jour exige, dans le
bon ordre :
- il récupère le code ;
- il réinstalle les dépendances si `requirements*.txt` a changé ;
- il crée les tables nouvelles, ajoute les colonnes manquantes (jamais de
  suppression) et sécurise les tables ;
- il redémarre l'API et vérifie qu'elle répond ;
- il affiche la commande de retour arrière.

| Besoin | Commande |
|---|---|
| Journal de l'API en direct | `journalctl -u surmezur-api -f` |
| État du service | `systemctl status surmezur-api` |
| Redémarrer | `sudo systemctl restart surmezur-api` |
| Journal de Caddy / accès | `sudo journalctl -u caddy -f` et `/var/log/caddy/surmezur-api.log` |
| Mémoire et processeur | `htop` (`sudo apt install htop`) |
| Espace disque | `df -h /srv` |
| Dernières sauvegardes | `tail /srv/surmezur/backups/sauvegarde.log` |
| Données | Supabase → *Table Editor* (lecture), ou `psql` comme à l'étape 6 |

## Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `password authentication failed` | mot de passe erroné ou caractère spécial non encodé dans `DATABASE_URL` | vérifier dans Supabase (*Database → Settings*), encoder `#` `@` `:` `/` `?` `%` |
| `Network is unreachable` vers `db.xxx.supabase.co` | connexion **directe**, joignable seulement en IPv6 | utiliser l'adresse du **Session pooler** (étape 5) |
| `prepared statement ... does not exist` | **Transaction pooler** (port 6543) | utiliser le Session pooler (port 5432) |
| `remaining connection slots are reserved` / trop de connexions | pool trop grand pour l'offre | baisser `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` dans `api.env`, puis redémarrer |
| L'API répondait puis échoue après une longue inactivité | projet Supabase mis en pause (offre gratuite) | le réactiver dans Supabase ; passer à une offre sans pause |
| `server version mismatch` au `pg_dump` | client PostgreSQL plus ancien que la base | `sudo apt install postgresql-client-NN` (NN = version de la base) |
| `DEMARRAGE REFUSE : le telephone ne pourrait pas joindre l'API` | `SURMEZUR_ALLOW_LOCALHOST=1` absent | il est dans `surmezur-api.service` : le recopier, puis `sudo systemctl daemon-reload` |
| Erreur 500 sur certaines routes seulement | colonne manquante | `sudo bash …/mettre_a_jour.sh --force` |
| `ImportError: libGL.so.1` | dépendance système d'OpenCV | `sudo apt install -y libgl1 libglib2.0-0t64` |
| Photos du catalogue en 404 | photos non copiées (étape 7) ou mauvais propriétaire | vérifier `/srv/surmezur/data/uploads/homme`, puis `sudo chown -R surmezur:surmezur /srv/surmezur/data` |
| Le site affiche « Le service rencontre un problème » ou « La connexion a été interrompue » | Vercel n'atteint pas l'API | depuis votre PC, `curl.exe -s http://IP_VPS/api/health` ; vérifier `API_ORIGIN` (sans `/` final) et qu'un *Redeploy* a suivi son changement |
| `curl http://IP_VPS/...` ne répond pas | port 80 fermé ou Caddy arrêté | `sudo ufw status` (le port 80 doit être autorisé), `systemctl status caddy` ; s'il est arrêté : `sudo systemctl enable caddy && sudo systemctl restart caddy`, puis `sudo journalctl -u caddy -n 50` en cas d'échec |
| `caddy.service is not active, cannot reload` | Caddy n'a jamais été démarré | `sudo systemctl enable caddy && sudo systemctl restart caddy` |
| Phase 2 : le certificat ne s'obtient pas | DNS pas encore propagé, ou ports 80/443 fermés | `dig +short NOM`, `sudo ufw status`, puis `sudo systemctl restart caddy` |
| Le processus est tué sans message | mémoire insuffisante | `journalctl -k \| grep -i oom` ; `--workers 1` dans le service, ou un VPS plus grand |
