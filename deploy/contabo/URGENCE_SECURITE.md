# URGENCE SÉCURITÉ — actions à faire sur le VPS et chez Supabase

> **Document préparé le 08/10/2026 par l'Agent A.** Les actions ci-dessous sont
> **à exécuter par l'utilisateur** (l'agent n'a aucun accès au VPS ni à
> Supabase, et aucun déploiement ne part sans son accord écrit).
>
> Chaque commande est donnée avec son **pourquoi**. Exécutez-les dans l'ordre,
> elles sont indépendantes les unes des autres et chacune est utile seule.
>
> Sévérité globale : **critique**. Le mot de passe admin de production est dans
> l'historique d'un dépôt **public**, et la réinitialisation par OTP renvoie le
> code dans la réponse : n'importe qui peut prendre le contrôle de n'importe
> quel compte.

---

## Ordre recommandé

| # | Action | Temps | Risque si on l'oublie |
|---|---|---|---|
| 1 | Fermer OTP reset + webhook paiement (nginx) | 2 min | Prise de contrôle de n'importe quel compte |
| 2 | Changer le mot de passe admin | 2 min | Connexion admin avec le mot de passe public |
| 3 | `JWT_SECRET` + droits sur `api.env` | 5 min | Forge de jetons admin si le secret est faible/deviné |
| 4 | Mot de passe Supabase | 5 min | Accès direct à la base (toutes les données) |
| 5 | Nettoyage de l'historique git (optionnel, votre décision) | 30 min | Le mot de passe reste consultable tant qu'il est dans l'historique |

Le point 1 est le plus important : il neutralise la faille **tant que le code
corrigé n'est pas déployé**, même si le mot de passe admin est déjà changé.

---

## 1. Fermer immédiatement la réinitialisation par OTP et le webhook paiement

**Pourquoi.** `POST /api/auth/password/reset/request` renvoie actuellement le
code OTP dans la réponse HTTP (champ `dev_code`). N'importe qui, sans compte ni
clé API, peut donc demander la réinitialisation du mot de passe de **n'importe
quel numéro**, admin compris, puis confirmer et se connecter. C'est une faille
de prise de contrôle totale.

Le correctif de code existe en local (`OTP_DEV_CODE=false` → 503), mais **il
n'est pas déployé**. En attendant le déploiement, on coupe au niveau de nginx.

De même `POST /api/payments/webhook` n'a aucune authentification : n'importe
qui peut marquer un paiement « payé ».

**Où.** Fichier de configuration du site Sur-MeZur derrière nginx, **port
8080** (celui qui proxye vers `127.0.0.1:8000`). Trouvez-le :

```bash
sudo grep -rln "proxy_pass.*127.0.0.1:8000\|8080" /etc/nginx/
# en général /etc/nginx/sites-enabled/surmezur.conf ou /etc/nginx/conf.d/surmezur.conf
```

**À ajouter dans le `server { ... }` du port 8080**, au même niveau que les
autres `location` :

```nginx
# URGENCE 08/10/2026 : OTP renvoyé dans la réponse -> prise de contrôle de
# n'importe quel compte. A retirer apres le deploiement de OTP_DEV_CODE=false.
location /api/auth/password/reset/ { return 403; }

# URGENCE 08/10/2026 : webhook sans authentification.
# A retirer seulement quand la verif HMAC (PAYMENT_WEBHOOK_SECRET) est en place.
location /api/payments/webhook { return 403; }
```

**Chargement et test :**

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -i -X POST http://127.0.0.1:8080/api/auth/password/reset/request \
  -H 'Content-Type: application/json' -d '{"phone":"+237696982953"}'
# attendu : HTTP/1.1 403
curl -i -X POST http://127.0.0.1:8080/api/payments/webhook -d '{}'
# attendu : HTTP/1.1 403
curl -i http://127.0.0.1:8080/api/health
# attendu : HTTP/1.1 200 (le reste du site doit continuer de fonctionner)
```

**Ne pas toucher aux autres sites** servis par nginx sur 80/443 (faucon,
taskmanager) : seule la configuration du site Sur-MeZur est modifiée, et
`systemctl reload nginx` recharge sans couper les autres.

> Une fois le code déployé (tâche A1.3), ces deux blocs `location` deviennent
> redondants : vous pouvez les retirer, ou les garder en double protection. Le
> webhook, lui, doit rester bloqué tant que la signature HMAC n'est pas testée.

---

## 2. Changer le mot de passe admin de production

**Pourquoi.** Le mot de passe apparaît dans l'historique de commits du dépôt
**public** (`4fba09c`, `f38d30d`, `8ce3ec8`, `eb925ff`) et il est **toujours
valide** : connexion admin confirmée en production le 08/10/2026. Tant qu'il
n'est pas changé, n'importe qui ayant lu le dépôt est administrateur.

**Commande** (saisie **masquée** : le mot de passe n'apparaît ni à l'écran ni
dans l'historique du shell, ni dans `~/.bash_history`) :

```bash
sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; cd /srv/surmezur/app/backend; /srv/surmezur/venv/bin/python -c "
import getpass
from app.db.base import SessionLocal
from app.models.users import User
from app.core.security import hash_password
p = getpass.getpass(\"Nouveau mot de passe admin : \")
p2 = getpass.getpass(\"Confirmation : \")
if p != p2:
    raise SystemExit(\"les deux saisies different\")
with SessionLocal() as db:
    u = db.query(User).filter(User.phone == \"+237696982953\").one()
    u.password_hash = hash_password(p); db.commit(); print(\"mot de passe change\")
"'
```

**Vérification :**

```bash
curl -s -X POST http://127.0.0.1:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+237696982953","password":"ANCIEN_MOT_DE_PASSE"}'   # attendu : 401/400
```

(À lancer depuis le VPS uniquement : l'ancien mot de passe ne doit évidemment
être essayé nulle part ailleurs.)

**Après le changement :** se déconnecter partout où l'ancien mot de passe a été
utilisé, et ne le réutiliser nulle part ailleurs.

> Le mot de passe doit faire au moins 6 caractères (contrainte actuelle du
> code) ; la tâche A4 portera ce minimum à 6–64 avec une lettre et un chiffre.
> En attendant, choisissez long et unique.

---

## 3. `JWT_SECRET` et droits sur `/etc/surmezur/api.env`

**Pourquoi.** `deploy/contabo/api.env.example` contient encore
`JWT_SECRET=A_REMPLACER`. Si la valeur réelle du VPS est faible (« A_REMPLACER »,
un mot de passe réutilisé, moins de 64 caractères), n'importe qui peut **forger
un jeton admin** sans connaître aucun mot de passe : le serveur ne fait que
vérifier la signature.

```bash
# a) constater la valeur actuelle SANS l'afficher (longueur seulement)
sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; echo "${#JWT_SECRET}"'
# attendu : >= 64. Si c'est court ou si c'est "A_REMPLACER", changer (ci-dessous).

# b) generer un secret neuf (64 caracteres hexa = 256 bits)
sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a
  NEW=$(openssl rand -hex 48)
  sudo sed -i "s#^JWT_SECRET=.*#JWT_SECRET=${NEW}#" /etc/surmezur/api.env
  unset NEW; echo "JWT_SECRET remplace"'

# c) droits : lecture par l'application uniquement, rien pour les autres.
#    L'utilisateur surmezur doit pouvoir lire le fichier (sauvegarde.sh,
#    mettre_a_jour.sh et les commandes ci-dessus le sourcent), donc on
#    prend 600 avec surmezur comme proprietaire.
sudo chown surmezur:surmezur /etc/surmezur/api.env
sudo chmod 600 /etc/surmezur/api.env
sudo ls -l /etc/surmezur/api.env     # attendu : -rw------- 1 surmezur surmezur

# d) rechargement (le service lit EnvironmentFile au demarrage)
sudo systemctl restart surmezur-api
curl -s http://127.0.0.1:8080/api/health    # attendu : 200
```

> **Effet de bord voulu :** changer `JWT_SECRET` déconnecte **tout le monde**
> (tous les jetons existants deviennent invalides). Les utilisateurs devront se
> reconnecter. C'est le comportement souhaité.
>
> Si `api.env` doit rester lisible par `root` **et** `surmezur` mais pas par le
> reste du monde, l'équivalent est `chown root:surmezur` + `chmod 640` — ce qui
> correspond à la consigne déjà écrite dans `api.env.example`. Les deux
> montures sont sûres ; ne laissez **jamais** `644`.

---

## 4. Mot de passe Supabase

**Pourquoi.** Le mot de passe de la base a été montré sur une capture d'écran.
La base contient l'intégralité des données (photos de mesure, numéros, mesures
corporelles). Un mot de passe vu à l'écran doit être considéré comme public.

**Chez Supabase (interface web, votre compte) :**

1. **Database → Reset database password** → générer un mot de passe fort (laisser
   Supabase en produire un, lettres+chiffres).
2. Encoder les caractères spéciaux dans l'URL si vous en choisissez :
   `#`→`%23`, `@`→`%40`, `:`→`%3A`, `/`→`%2F`, `?`→`%3F`, `%`→`%25`.
3. Mettre à jour `DATABASE_URL` sur le VPS :

```bash
sudo nano /etc/surmezur/api.env      # ligne DATABASE_URL, nouveau mot de passe
sudo systemctl restart surmezur-api
sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; psql "$DATABASE_URL" -c "select version();"'
# attendu : la version de PostgreSQL s'affiche
curl -s http://127.0.0.1:8080/api/health   # attendu : 200
```

4. **Vérifier que le rôle `postgres` n'est pas exposé publiquement** :
   le script `backend/scripts/securiser_supabase.py` existe pour cela
   (résumé dans son docstring). En bref : dans Supabase, *Database →
   Settings → Network Restrictions* et *Auth → ...* doivent empêcher
   d'atteindre la base depuis Internet hors des adresses autorisées.

**Autres points à vérifier dans Supabase** :

- *API Settings → JWT Secret* : le secret `anon`/`service_role` a aussi été
  visible sur la capture ; le régénérer ne casse rien côté Sur-MeZur (le
  backend se connecte en `postgres`, il n'utilise pas ces clés).
- Aucun collaborateur ajouté par erreur dans le projet.

---

## 5. Les secrets dans le dépôt — état vérifié le 08/10/2026

### 5.1 État des fichiers suivis (arbre courant)

| Fichier | Constat | État |
|---|---|---|
| `backend/app/seed.py` | `ADMIN_PASSWORD` en clair | **corrigé** (lecture de la variable d'environnement) |
| `README.md` | tableau admin avec le mot de passe | **corrigé** |
| `DEPLOIEMENT_CONTABO.md` | `ADMIN_PASSWORD="<ancien mot de passe>"` dans la commande de seed | **corrigé** |
| `mobile/README.md` (ligne 71) | **mot de passe admin en clair** | **corrigé** par l'Agent A (modification de sécurité uniquement) |
| `backend/.env.example`, `deploy/contabo/api.env.example` | valeurs d'exemple (`change-me-in-production`, `A_REMPLACER`) | conformes |
| `.env`, `*.pem`, `*.key`, `id_rsa` | **aucun fichier sensible suivi** | conforme |

Recherche effectuée (le mot de passe n'est volontairement **pas** reproduit
dans ce document) :

```bash
git grep -nI "<ancien mot de passe>"          # recuperable : git show 4fba09c:backend/app/seed.py
git grep -nI -E "(password|passwd|secret|token|api_key)\s*[:=]\s*[\"'][^\"']{4,}[\"']" -- ':!*.lock'
git ls-files | grep -E '\.env$|\.pem$|\.key$|id_rsa|credentials'
```

Résultat au 08/10/2026 : **plus aucune occurrence dans les fichiers suivis.**

### 5.2 L'historique git (le vrai problème)

Le mot de passe apparaît encore dans l'historique de commits, et le dépôt
GitHub est **public** (état **avant** les corrections de l'arbre courant du
08/10/2026) :

```
4fba09c  backend/app/seed.py:24            ADMIN_PASSWORD = "<ancien mot de passe>"
f38d30d  README.md:90, backend/app/seed.py, mobile/README.md:71
8ce3ec8  DEPLOIEMENT_CONTABO.md, mobile/README.md:71
eb925ff  DEPLOIEMENT_CONTABO.md:517, :562, :787, mobile/README.md:71
```

> La valeur exacte n'est pas recopiée ici (cela reviendrait à republier le
> secret). Elle se lit avec `git show 4fba09c:backend/app/seed.py | grep ADMIN_PASSWORD`.
> **Ne la recopiez dans aucun fichier.**

**Deux options, votre décision :**

**Option A — ne pas réécrire l'historique (recommandé).**
Le mot de passe est changé (action 2) : ce qui reste dans l'historique est un
mot de passe **mort**, qui n'ouvre plus rien. Avantage : aucun coût, aucun
risque. Inconvénient : si quelqu'un a besoin d'un « secret » fort plutôt que
d'un mot de passe, il reste l'odeur du mauvais historique.

**Option B — réécrire l'historique avec `git filter-repo` + force push.**

> ⚠️ **Je ne l'exécute pas et je ne l'exécute pas sans votre accord écrit
> explicite.** Voici ce qu'il casse, pour que vous décisions en connaissance
> de cause :
>
> - **Tout clone existant diverge** : chaque contributeur doit re-cloner ou
>   faire un `git fetch` + `git reset --hard origin/<branche>`. Les branches
>   locales non poussées peuvent être perdues.
> - **Les `SHA` de commits changent** : les liens de commits/PR/commentaires
>   GitHub existants deviennent invalides.
> - **Les clones forkés et les ouvertures de pull request en cours** sont à
>   refaire.
> - **Les déploiements par `git pull` sur le VPS** (`mettre_a_jour.sh`) se
>   mettront en erreur tant que le clone du VPS n'est pas resynchronisé —
>   procédure de rattrapage à prévoir avant de forcer.
> - Le fichier **`agent-b/produit-web`** de l'Agent B, s'il a déjà été poussé,
>   devra être rebase/reset sur la nouvelle histoire.
>
> Commandes (à exécuter par vous, sur une copie du dépôt) si vous choisissez
> cette option :
>
> ```bash
> # 1. sauvegarde complete du depot
> cp -a Sur-MeZur Sur-MeZur.sav
>
> # 2. recuperer la valeur du passe, SANS l'afficher
> cd Sur-MeZur
> OLDPW=$(git show 4fba09c:backend/app/seed.py | sed -n 's/.*ADMIN_PASSWORD *= *"\([^"]*\)".*/\1/p')
>
> # 3. purge de cette valeur sur TOUT l'historique (un seul mot par ligne)
> printf '%s==>REDAIGE\n' "$OLDPW" > /tmp/purge.txt
> git filter-repo --replace-text /tmp/purge.txt
>
> # 4. remettre les remotes (filter-repo les retire)
> git remote add origin https://github.com/TCHOUANANG-dimitri/Sur-MeZur.git
> git remote add korah https://github.com/korah-agency/Sur-MeZur.git
>
> # 5. verification : plus aucune occurrence dans l'historique
> git log --all -S "$OLDPW" --oneline    # doit ne renvoyer rien
> unset OLDPW; shred -u /tmp/purge.txt
>
> # 6. pousser en reecrivant (JAMAIS sans accord ecrit)
> git push --force origin --all
> git push --force korah --all
> ```

### 5.3 Recommandation

1. Faire les actions **1, 2, 3, 4** aujourd'hui (15 minutes, tout est
   réversible sauf... ne pas les faire).
2. Laisser l'option A pour l'historique git (l'arbre courant est déjà propre).
3. Traiter le reste par le déploiement du code corrigé (tâches A1 à A4 du
   cahier des charges), qui supprime la cause racine : `OTP_DEV_CODE=false`,
   limitation de tentatives, webhook signé, fichiers privés protégés.

---

## 6. Liste de contrôle

- [ ] Blocs nginx posés, `nginx -t` OK, `reload` OK, les deux appels testés
      répondent 403, `/api/health` répond 200
- [ ] Mot de passe admin changé, l'ancien refuse la connexion
- [ ] `JWT_SECRET` ≥ 64 caractères et non devinable, `systemctl restart surmezur-api`
- [ ] `/etc/surmezur/api.env` en `600` et appartenant à `surmezur`
- [ ] Mot de passe Supabase régénéré, `DATABASE_URL` à jour, `psql` répond,
      `systemctl restart surmezur-api`, `/api/health` 200
- [ ] Supabase : JWT secret `anon`/`service_role` régénéré, réseau restreint
- [ ] Recherche de l'ancien mot de passe dans l'arbre courant : **aucune
      occurrence** (commandes de la section 5.1)
- [ ] Décision notée sur l'historique git (option A ou B)
- [ ] Rien n'a été déployé ni forcé sans accord écrit
