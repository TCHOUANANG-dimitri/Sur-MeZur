# Déployer le backend Sur-MeZur sur un VPS Contabo

Procédure complète, de la commande du serveur à l'arrêt d'O2Switch. À suivre
**dans l'ordre**. Les fichiers de configuration cités sont dans
[`deploy/contabo/`](deploy/contabo/) et arrivent sur le serveur avec le clone
du dépôt.

| | |
|---|---|
| Durée | ~2 h de mise en place + ~30 min de bascule (coupure de service ~15 min) |
| Résultat | API en **HTTPS** sur `https://api.gitingeniering.com`, mises à jour par `git pull`, sauvegarde chaque nuit |
| Il faut | un accès à l'espace client Contabo, au cPanel O2Switch (DNS, SSH) et au compte Vercel |

Conventions : `IP_VPS` = adresse IPv4 du serveur, `smzadmin` = votre compte
d'administration sur le serveur. Les commandes précédées de `$` se tapent sur
le VPS, sauf mention « sur O2Switch » ou « sur votre PC ».

---

## Ce qui change par rapport à O2Switch

| O2Switch | Contabo |
|---|---|
| Passenger + a2wsgi (WSGI) | uvicorn, serveur ASGI natif |
| Code copié de `repo-source` vers `surmezur-backend` | le code exécuté **est** le clone git |
| Worker de mesures lancé par cron | analyse lancée directement après l'envoi des photos (`MEASUREMENT_WORKER_MODE=inline`) |
| HTTP seulement (AutoSSL jamais émis) | HTTPS automatique (Caddy + Let's Encrypt) |
| Sauvegardes : aucune | base + photos chaque nuit, copie hors du serveur |

Les données se déplacent **sans transformation** : la base stocke des chemins
relatifs (`/uploads/...`), jamais l'adresse du serveur.

---

## Étape 1 — Commander le VPS

Dans l'espace client Contabo :

1. **Produit** : *Cloud VPS* avec **au moins 4 vCPU et 8 Go de RAM**. Chaque
   processus de l'API charge torch et MobileSAM (~1 à 1,5 Go), et on en lance
   deux.
2. **Région** : Union européenne (Allemagne). Depuis le Cameroun, la latence
   est la même qu'avec O2Switch, en France.
3. **Image** : **Ubuntu 24.04 LTS**.
4. **Accès** : collez votre clé SSH publique si le formulaire le propose
   (sinon, le mot de passe root arrive par e-mail).

Notez l'adresse IPv4 reçue : c'est `IP_VPS`.

> Pas encore de clé SSH ? Sur votre PC (PowerShell) : `ssh-keygen -t ed25519`,
> puis la clé publique est dans `C:\Users\<vous>\.ssh\id_ed25519.pub`.

---

## Étape 2 — Sécuriser le serveur

Première connexion en root :

```bash
ssh root@IP_VPS
```

**Compte d'administration** (vous ne travaillerez plus en root) :

```bash
adduser smzadmin                      # choisir un mot de passe (sert pour sudo)
usermod -aG sudo smzadmin
mkdir -p /home/smzadmin/.ssh
cp ~/.ssh/authorized_keys /home/smzadmin/.ssh/ 2>/dev/null || true
chown -R smzadmin:smzadmin /home/smzadmin/.ssh && chmod 700 /home/smzadmin/.ssh
```

Si `/root/.ssh/authorized_keys` n'existait pas (pas de clé fournie à la
commande), depuis **votre PC** : `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh smzadmin@IP_VPS "cat >> ~/.ssh/authorized_keys"`.

**Vérifiez dans un SECOND terminal** que `ssh smzadmin@IP_VPS` fonctionne,
puis `sudo -v` réussit. Ne fermez pas la session root avant.

**Interdire root et les mots de passe en SSH** :

```bash
cat > /etc/ssh/sshd_config.d/99-surmezur.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
systemctl restart ssh
```

À partir d'ici, tout se fait en `smzadmin`. Pare-feu, protection contre les
attaques par mot de passe, mises à jour de sécurité automatiques, fuseau
horaire et mémoire d'échange (sécurité si les deux processus de vision
chargent en même temps) :

```bash
$ sudo apt update && sudo apt -y full-upgrade
$ sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
$ sudo apt install -y fail2ban unattended-upgrades
$ sudo dpkg-reconfigure -plow unattended-upgrades        # répondre « Oui »
$ sudo timedatectl set-timezone Africa/Douala
$ sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
$ echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
$ sudo reboot
```

---

## Étape 3 — Installer les logiciels

**Python 3.11**, la version de production actuelle (`backend/.python-version`
indique 3.11.9). Les modèles `.joblib` et MediaPipe 0.10.14 sont validés
avec elle ; Ubuntu 24.04 fournit 3.12 par défaut, on ajoute donc 3.11 :

```bash
$ sudo add-apt-repository -y ppa:deadsnakes/ppa
$ sudo apt install -y python3.11 python3.11-venv python3.11-dev \
      git curl sqlite3 rclone build-essential libgl1 libglib2.0-0t64
```

`libgl1` et `libglib2.0-0t64` sont exigées par OpenCV, que MediaPipe importe.

**Caddy** (proxy HTTPS), depuis son dépôt officiel :

```bash
$ sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
$ sudo apt update && sudo apt install -y caddy
```

---

## Étape 4 — Installer l'application

**Utilisateur dédié, sans connexion possible**, et arborescence :

```
/srv/surmezur/
├── app/        clone git (le code)
├── venv/       environnement Python
├── data/       sur_mezur.db, uploads/, dataset_store/, avatar_store/
└── backups/    sauvegardes nocturnes
/etc/surmezur/api.env   configuration (hors du dépôt)
```

```bash
$ sudo useradd --system --create-home --home-dir /srv/surmezur --shell /usr/sbin/nologin surmezur
$ sudo -u surmezur git clone https://github.com/TCHOUANANG-dimitri/Sur-MeZur.git /srv/surmezur/app
$ sudo -u surmezur mkdir -p /srv/surmezur/data/uploads /srv/surmezur/data/dataset_store /srv/surmezur/data/avatar_store /srv/surmezur/backups
```

**Environnement Python et dépendances** (10 à 15 min : torch CPU, MediaPipe,
OpenCV). Les deux fichiers sont installés **ensemble**, pour que pip résolve
une seule version de NumPy :

```bash
$ sudo -u surmezur python3.11 -m venv /srv/surmezur/venv
$ sudo -u surmezur /srv/surmezur/venv/bin/pip install --upgrade pip wheel
$ cd /srv/surmezur/app/backend
$ sudo -u surmezur -H /srv/surmezur/venv/bin/pip install -r requirements.txt -r requirements-vision.txt
$ sudo -u surmezur /srv/surmezur/venv/bin/python -c "import torch, mediapipe, cv2, mobile_sam, sklearn; print('vision OK, torch', torch.__version__)"
```

Le poids MobileSAM (`backend/ml/weights/mobile_sam.pt`, 40 Mo) est versionné :
il arrive avec le clone, rien à copier.

**Configuration** :

```bash
$ sudo mkdir -p /etc/surmezur
$ sudo cp /srv/surmezur/app/deploy/contabo/api.env.example /etc/surmezur/api.env
$ sudo nano /etc/surmezur/api.env
$ sudo chown root:surmezur /etc/surmezur/api.env && sudo chmod 640 /etc/surmezur/api.env
```

Dans `api.env`, une seule valeur à remplacer : **`JWT_SECRET`**. Reprenez
**exactement** celle d'O2Switch (étape 6) : les sessions en cours restent
valides et personne n'aura à se reconnecter. Le reste est déjà réglé pour ce
serveur ; si vous prenez plus de 4 vCPU, ajustez `VISION_MAX_THREADS`
(nombre de vCPU ÷ 2).

**Service systemd** (démarrage automatique, relance en cas de plantage) :

```bash
$ sudo cp /srv/surmezur/app/deploy/contabo/surmezur-api.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable surmezur-api
```

Ne le démarrez pas encore : la base arrive à l'étape 6.

---

## Étape 5 — Préparer la bascule DNS (la veille)

Dans le **cPanel O2Switch → Zone Editor**, domaine `gitingeniering.com` :

- enregistrement **A** `api` : passez le **TTL à 300** (5 min). Ne changez pas
  encore l'adresse. Le jour J, le changement sera ainsi pris en compte en
  quelques minutes au lieu de plusieurs heures ;
- s'il existe un enregistrement **AAAA** `api` (IPv6), notez-le : il faudra le
  **supprimer** au moment de la bascule, sinon une partie des téléphones
  continuerait d'aller chez O2Switch.

---

## Étape 6 — Répétition à blanc avec une copie des données

Toute la migration est jouée une première fois **sans couper O2Switch**, pour
découvrir les surprises avant le jour J.

### 6.1 Exporter depuis O2Switch

**Sur O2Switch** (SSH, comme pour les déploiements habituels) :

```bash
source /home/sc1jsgw2086/virtualenv/surmezur-backend/3.11/bin/activate
cd /home/sc1jsgw2086/surmezur-backend
grep -E 'DATABASE_URL|JWT_SECRET' .env      # notez le chemin de la base et le secret
```

Exportez la base par l'API de sauvegarde de SQLite (copie cohérente même si
quelqu'un écrit au même moment, contrairement à un `cp`). Remplacez
`CHEMIN_BASE` par le chemin lu dans `DATABASE_URL` (ce qui suit `sqlite:///`) :

```bash
python - <<'EOF'
import sqlite3
src = sqlite3.connect("CHEMIN_BASE")
dst = sqlite3.connect("/home/sc1jsgw2086/export-surmezur.db")
src.backup(dst); dst.close(); src.close()
print("base exportee")
EOF
tar czf ~/export-fichiers.tgz $(for d in uploads dataset_store avatar_store; do [ -d "$d" ] && echo "$d"; done)
ls -lh ~/export-surmezur.db ~/export-fichiers.tgz
```

### 6.2 Transférer vers le VPS

Le plus simple passe par votre PC, qui a déjà accès aux deux serveurs
(**sur votre PC**, PowerShell ; `HOTE_O2SWITCH` = l'hôte SSH habituel) :

```powershell
scp sc1jsgw2086@HOTE_O2SWITCH:export-surmezur.db sc1jsgw2086@HOTE_O2SWITCH:export-fichiers.tgz .
scp export-surmezur.db export-fichiers.tgz smzadmin@IP_VPS:/tmp/
```

### 6.3 Restaurer et démarrer

```bash
$ sudo install -o surmezur -g surmezur -m 640 /tmp/export-surmezur.db /srv/surmezur/data/sur_mezur.db
$ sudo tar xzf /tmp/export-fichiers.tgz -C /srv/surmezur/data
$ sudo chown -R surmezur:surmezur /srv/surmezur/data
$ sqlite3 /srv/surmezur/data/sur_mezur.db "PRAGMA integrity_check; SELECT count(*) FROM users;"
```

Attendu : `ok`, puis le nombre de comptes. Ensuite, schéma à jour (tables de
la collecte, colonnes ajoutées depuis) et premier démarrage :

```bash
$ sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh --force
```

Le script se termine par `Redemarrage : OK`. Sinon : `journalctl -u surmezur-api -n 100`.

### 6.4 Vérifier, sur le serveur lui-même

```bash
# 1. L'API répond
$ curl -s http://127.0.0.1:8000/api/health
# -> {"status":"ok"}

# 2. La chaîne de vision est complète
$ curl -s http://127.0.0.1:8000/api/measurements/capabilities | python3 -m json.tool
# -> vision_enabled: true, MediaPipe, SAM et les modèles disponibles

# 3. Les photos du catalogue sont servies
$ P=$(sqlite3 /srv/surmezur/data/sur_mezur.db "SELECT photo_url FROM garment_models WHERE photo_url IS NOT NULL LIMIT 1")
$ curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8000$P"
# -> 200

# 4. Connexion avec un vrai compte (le compte admin)
$ read -s -p "Mot de passe admin : " PW; echo
$ TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login -H 'Content-Type: application/json' \
    -d "{\"phone\":\"+237696982953\",\"password\":\"$PW\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 5. Une vraie mesure sur deux photos de test du dépôt (sujet réel de 171 cm, 62 kg)
$ cd "/srv/surmezur/app/IMAGES TEST"
$ time curl -s -X POST http://127.0.0.1:8000/api/measurements/debug/analyze -H "Authorization: Bearer $TOKEN" \
    -F "front=@WhatsApp Image 2026-08-10 at 4.52.13 PM.jpeg;type=image/jpeg" \
    -F "side=@WhatsApp Image 2026-08-10 at 4.52.14 PM.jpeg;type=image/jpeg" \
    -F height_cm=171 -F weight_kg=62 -F gender=female | python3 -m json.tool | head -60
```

Le test 5 doit renvoyer les mesures en quelques secondes (la toute première
fois, compter le chargement de torch et de SAM). C'est la preuve que la chaîne
de vision tourne sur ce serveur.

*Facultatif, test des applications réelles* : tunnel SSH depuis votre PC,
`ssh -L 8000:127.0.0.1:8000 smzadmin@IP_VPS`, puis `cd web` et
`$env:API_ORIGIN="http://localhost:8000"; npm run dev`, et une prise de mesure
complète avec un compte client.

La répétition est réussie quand ces tests passent. Les données copiées
seront remplacées le jour J par une copie fraîche.

---

## Étape 7 — La bascule (jour J)

Choisissez une heure creuse. Prévenez les utilisateurs d'une coupure d'environ
15 minutes.

1. **Arrêter O2Switch** (plus aucune écriture dans l'ancienne base) :
   cPanel → *Setup Python App* → application `surmezur-backend` → **Stop**.
   cPanel → *Tâches Cron* → **supprimez** la tâche `app.worker_measurements`.

2. **Export final** : refaites **6.1** puis **6.2** à l'identique.

3. **Restauration sur le VPS** (l'ancienne copie de répétition est mise de côté) :

   ```bash
   $ sudo systemctl stop surmezur-api
   $ sudo mv /srv/surmezur/data /srv/surmezur/data.repetition
   $ sudo -u surmezur mkdir -p /srv/surmezur/data/uploads /srv/surmezur/data/dataset_store /srv/surmezur/data/avatar_store
   $ sudo install -o surmezur -g surmezur -m 640 /tmp/export-surmezur.db /srv/surmezur/data/sur_mezur.db
   $ sudo tar xzf /tmp/export-fichiers.tgz -C /srv/surmezur/data
   $ sudo chown -R surmezur:surmezur /srv/surmezur/data
   $ sqlite3 /srv/surmezur/data/sur_mezur.db "PRAGMA integrity_check;"
   $ sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh --force
   ```

   Refaites les tests 1 et 2 de **6.4**.

4. **DNS** : cPanel → *Zone Editor* → enregistrement **A** `api` → adresse
   **`IP_VPS`**. Supprimez l'éventuel **AAAA** `api`. Vérifiez la propagation
   (sur le VPS) :

   ```bash
   $ dig +short api.gitingeniering.com        # doit afficher IP_VPS
   ```

5. **HTTPS** : dès que le DNS répond `IP_VPS`, installez Caddy (pas avant :
   sans le bon DNS, Let's Encrypt refuse le certificat, et des échecs répétés
   bloquent temporairement les demandes) :

   ```bash
   $ sudo cp /srv/surmezur/app/deploy/contabo/Caddyfile /etc/caddy/Caddyfile
   $ sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
   $ sudo caddy validate --config /etc/caddy/Caddyfile
   $ sudo systemctl reload caddy
   $ sudo journalctl -u caddy -f        # attendre « certificate obtained successfully », puis Ctrl+C
   ```

6. **Vérifications publiques** (depuis votre PC ou le VPS) :

   ```bash
   curl -s https://api.gitingeniering.com/api/health              # {"status":"ok"}, en HTTPS
   curl -s http://api.gitingeniering.com/api/health               # toujours OK en HTTP (transition)
   curl -s https://api.gitingeniering.com/openapi.json | grep -c '"/api/collecte/stats"'   # 1
   ```

7. **Avec l'APK actuelle**, sur un téléphone : connexion, catalogue (images
   visibles), une prise de mesure complète.

8. **Site web** : le proxy Vercel suit le DNS, il fonctionne donc déjà. Faites
   une prise de mesure sur le site pour confirmer.

**Retour arrière** si quelque chose bloque : remettez l'ancienne adresse dans
l'enregistrement A, et relancez l'application dans cPanel. O2Switch n'a pas
changé depuis l'arrêt.

---

## Étape 8 — Passer les applications en HTTPS

Le serveur sert HTTP **et** HTTPS pendant la transition (voir le commentaire
du `Caddyfile`). On fait basculer les clients un par un :

1. **Web (Vercel)** : projet du site → *Settings → Environment Variables* →
   `API_ORIGIN` = `https://api.gitingeniering.com` → **Redeploy**. Même chose
   pour le projet de la collecte quand il sera créé. Dans le dépôt, mettez
   aussi `https://` dans `web/.env.production` et `collecte/.env.production`.
2. **Mobile** : `https://api.gitingeniering.com` dans
   `mobile/src/config.ts` (`PRODUCTION_API_URL`) et dans les trois profils de
   `mobile/eas.json`, puis nouvelle APK (RAPPORT_PROJET.md §10) et diffusion.
3. **Quand plus personne n'utilise l'ancienne APK** : supprimez le bloc
   `http://api.gitingeniering.com { ... }` de `/etc/caddy/Caddyfile` puis
   `sudo systemctl reload caddy`. Caddy redirigera alors tout le HTTP vers
   HTTPS. L'exception « trafic en clair » d'Android
   (`network_security_config.xml`) pourra ensuite être retirée dans une APK
   suivante.

---

## Étape 9 — Sauvegardes

Une sauvegarde qui reste sur le VPS ne protège pas de la perte du VPS. Il faut
une copie **ailleurs** : Google Drive, Backblaze B2, Contabo Object Storage…
Exemple avec un dossier Google Drive :

```bash
$ sudo -u surmezur -H rclone config
#   n (nouveau) -> nom : sauvegarde -> type : drive -> suivre l'assistant
#   (sur un serveur sans navigateur, rclone indique la commande `rclone authorize`
#   à lancer sur votre PC, puis vous recollez le jeton obtenu)
$ echo 'RCLONE_REMOTE=sauvegarde:surmezur-sauvegardes' | sudo tee /etc/surmezur/backup.env
$ sudo chown root:surmezur /etc/surmezur/backup.env && sudo chmod 640 /etc/surmezur/backup.env
```

Planification chaque nuit à 2 h 30, **sous l'utilisateur `surmezur`** (en
root, SQLite pourrait créer des fichiers que l'API ne saurait plus ouvrir) :

```bash
$ echo '30 2 * * * surmezur bash /srv/surmezur/app/deploy/contabo/sauvegarde.sh >> /srv/surmezur/backups/sauvegarde.log 2>&1' | sudo tee /etc/cron.d/surmezur
```

**Testez-la maintenant**, puis vérifiez la présence des fichiers en local et
sur le stockage distant :

```bash
$ sudo -u surmezur -H bash /srv/surmezur/app/deploy/contabo/sauvegarde.sh
$ ls -lh /srv/surmezur/backups
$ sudo -u surmezur -H rclone ls sauvegarde:surmezur-sauvegardes | tail
```

**Restaurer** une sauvegarde (à essayer une fois, pour savoir que ça marche) :

```bash
$ sudo systemctl stop surmezur-api
$ gunzip -c /srv/surmezur/backups/sur_mezur-AAAAMMJJ-HHMM.db.gz | sudo -u surmezur tee /srv/surmezur/data/sur_mezur.db >/dev/null
$ sudo rm -f /srv/surmezur/data/sur_mezur.db-wal /srv/surmezur/data/sur_mezur.db-shm
$ sudo tar xzf /srv/surmezur/backups/fichiers-AAAAMMJJ-HHMM.tgz -C /srv/surmezur/data
$ sudo chown -R surmezur:surmezur /srv/surmezur/data
$ sudo systemctl start surmezur-api
```

Contabo propose aussi des **instantanés** du VPS dans son panneau. C'est utile
avant une opération risquée (mise à jour système), mais ce n'est pas une
sauvegarde : l'instantané est chez le même hébergeur.

---

## Étape 10 — Après la bascule

1. **Changer le mot de passe du compte admin** : il figure en clair dans le
   `README.md` et `backend/app/seed.py`, et le dépôt GitHub est public.
   Retirez-le aussi de ces deux fichiers.
2. **Supprimer les comptes de test** signalés par le rapport : `+23760000001`
   (« ZZ Test Diagnostic ») et `+237634201648` (« ZZ Test Web Mesure »).
3. **Surveillance** (facultatif, gratuit) : un moniteur UptimeRobot ou
   équivalent sur `https://api.gitingeniering.com/api/health`, qui prévient
   par e-mail si l'API tombe.
4. **Garder O2Switch arrêté deux semaines** comme solution de repli, puis
   supprimer l'application Python et ses données dans cPanel.
   `DEPLOIEMENT.txt` devient alors obsolète.
5. Supprimez la copie de répétition une fois rassuré :
   `sudo rm -rf /srv/surmezur/data.repetition`.

---

## Au quotidien

**Mettre à jour l'API** après un `git push` sur `main` :

```bash
$ sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh
```

Le script récupère le code, réinstalle les dépendances si `requirements*.txt`
a changé, crée les tables nouvelles et ajoute les colonnes manquantes (jamais
de suppression), redémarre l'API, vérifie qu'elle répond, et affiche la
commande de retour arrière.

| Besoin | Commande |
|---|---|
| Journal de l'API en direct | `journalctl -u surmezur-api -f` |
| État du service | `systemctl status surmezur-api` |
| Redémarrer | `sudo systemctl restart surmezur-api` |
| Journal HTTPS / accès | `sudo journalctl -u caddy -f` et `/var/log/caddy/surmezur-api.log` |
| Mémoire et processeur | `htop` (`sudo apt install htop`) |
| Espace disque | `df -h /srv` |
| Dernières sauvegardes | `tail /srv/surmezur/backups/sauvegarde.log` |

## Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `DEMARRAGE REFUSE : le telephone ne pourrait pas joindre l'API` dans le journal | `SURMEZUR_ALLOW_LOCALHOST=1` absent | il est dans `surmezur-api.service` : refaites `sudo cp …service /etc/systemd/system/ && sudo systemctl daemon-reload` |
| Erreur 500 sur certaines routes seulement | colonne manquante en base | `sudo bash …/mettre_a_jour.sh --force` (exécute `sync_sqlite_columns.py`) |
| `ImportError: libGL.so.1` | dépendance système d'OpenCV | `sudo apt install -y libgl1 libglib2.0-0t64` |
| `attempt to write a readonly database` | fichiers de `data/` appartenant à root | `sudo chown -R surmezur:surmezur /srv/surmezur/data` |
| Le certificat ne s'obtient pas | DNS pas encore propagé, ou port 80/443 fermé | `dig +short api.gitingeniering.com`, `sudo ufw status`, puis `sudo systemctl reload caddy` |
| Le processus est tué sans message | mémoire insuffisante | `journalctl -k | grep -i oom` ; passer à `--workers 1` dans le service ou prendre un VPS plus grand |
| Mesures lentes | processeur partagé chargé | comparer avec le test 5 de l'étape 6.4 ; ajuster `VISION_MAX_THREADS` |
