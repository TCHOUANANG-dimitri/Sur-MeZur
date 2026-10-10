# Mission Agent A — Plateforme : backend, administration web, sécurité, déploiement

> Document de travail pour un agent qui démarre **sans contexte**. Tout ce qu'il
> faut savoir est ici. Un second agent (Agent B, `MISSION_AGENT_B_PRODUIT_WEB.md`)
> travaille **en parallèle** sur le site public, l'espace tailleur web, la page
> d'accueil et l'application Android. Lisez la section « Coordination » avant
> de toucher un fichier.

---

## 1. Le projet en bref

Sur-MeZur met en relation clients et tailleurs au Cameroun. Un client prend
deux photos (face et profil), une chaîne de vision en extrait ses mensurations
de couture (12 mesures), puis il peut envoyer une commande à un tailleur.

**Nouvelle orientation produit (octobre 2026) :**
- Objectif n°1 : **un maximum d'utilisateurs**. Deux services mis en avant,
  **gratuits** pour l'instant (payants plus tard) :
  1. la **prise de mesure par photo** (existe) ;
  2. la **génération de patron à partir d'une image** (à créer ; pour l'instant
     côté tailleur seulement ; l'interface doit être opérationnelle, le calcul
     réel viendra plus tard, une version « aperçu » suffit).
- **Le web seulement** : l'application mobile React Native (`mobile/`) est mise
  de côté. On n'y touche pas.
- On garde les espaces **client** et **admin**. On ajoute un **espace tailleur
  web**, construit par l'Agent B.
- **Plus de transaction d'argent** dans la plateforme : pas d'acompte, pas de
  solde, pas de séquestre, pas de commission. **L'envoi de commande client →
  tailleur reste**, ainsi que le suivi et la messagerie.
- **Vérification des tailleurs désactivée** pour l'instant, sans supprimer le
  code : flexibilité maximale pour les premiers utilisateurs.

## 2. Le dépôt

Racine : `F:\Projects\Sur-MeZur\Sur-MeZur-App` (Windows ; Git Bash et
PowerShell disponibles). Le dépôt GitHub est **public**.

| Dossier | Rôle |
|---|---|
| `backend/` | API FastAPI + SQLAlchemy 2. Base : SQLite en local, PostgreSQL (Supabase) en production. Pas d'Alembic : `create_all` + `scripts/sync_sqlite_columns.py --apply` (ajout de colonnes). |
| `web/` | Next.js 15 (App Router, TypeScript). Site public, espace client, **administration** (`src/app/admin`). Déployé sur Vercel (`https://sur-me-zur.vercel.app`) ; `/api/*` est réécrit vers `API_ORIGIN`. |
| `collecte/` | Application Next.js de la campagne de collecte (agents de terrain). |
| `mobile/` | Application Expo. **Hors périmètre.** |
| `deploy/contabo/` | Service systemd, scripts de mise à jour et de sauvegarde du VPS. |
| `pipeline_anny/`, `opencode test/` | Travaux d'un autre outil. **Ne pas toucher, ne pas committer.** |

Production : VPS Contabo `169.58.69.36`. L'API est servie par nginx sur le
**port 8080** (`http://169.58.69.36:8080`), en proxy vers uvicorn
`127.0.0.1:8000` (service `surmezur-api`). Utilisateur applicatif `surmezur`,
code dans `/srv/surmezur/app`, variables dans `/etc/surmezur/api.env`. nginx
sert aussi d'autres sites sur 80/443 (faucon, taskmanager) : **ne pas désactiver
nginx**. Base PostgreSQL chez Supabase (pooler session, port 5432).
Le domaine `gitingeniering.com` **a expiré le 07/10/2026** : `api.gitingeniering.com`
ne répond plus.

Lancer l'API en local :
```
cd backend
$env:SURMEZUR_ALLOW_LOCALHOST=1   # (PowerShell)
./venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
```
Tests de l'administration (base SQLite jetable, ne touche pas la base locale) :
```
cd backend
./venv/Scripts/python.exe -m tests.test_admin_web     # doit finir par « 0 echec(s) »
```
Contrôle du web :
```
cd web
npx tsc --noEmit
npm run build
```

## 3. État des lieux (audit du 08/10/2026)

### 3.1 Travail en cours NON commité (à reprendre, pas à refaire)

Un cahier des charges de l'administration web (15 modules, M0 à M14 : socle,
tableau de bord, utilisateurs, tailleurs, catalogue, commandes, paiements,
litiges, avis, mesure, collecte, communication, support, sécurité,
statistiques d'utilisateurs et acquisition) a été **implémenté côté backend et
testé** :

- Nouveaux modèles : `backend/app/models/admin.py` (journal d'audit, notes
  internes, réglages, sessions admin, connexions, activité quotidienne,
  annonces, modèles de messages, pages d'info, support),
  `models/acquisition.py` (canaux, campagnes, origine des comptes,
  commentaires d'acquisition, objectifs), `models/operations.py` (historique
  de vérification, retours d'essayage, messages de litige, signalements
  d'avis, remboursements, versements).
- Colonnes ajoutées sur `users`, `tailor_profiles`, `garment_models`,
  `ready_to_wear`, `orders`, `reviews`, `measurement_sessions` (31 au total ;
  `sync_sqlite_columns.py --apply` les ajoute en production, vérifié sur une
  copie de la base).
- Services : `admin_perms.py` (rôles super_admin / moderator / support /
  finance), `audit.py`, `activity.py` (activité, sessions admin, connexions),
  `platform_settings.py` (réglages modifiables), `totp.py` (double
  authentification), `tables.py` (pagination, tri, export CSV), `user_stats.py`
  (actifs, churn, cohortes, activation, retours, canaux, objectifs),
  `account_tools.py` (invités, doublons, fusion, export RGPD), `acquisition.py`.
- Routeurs : `api/v1/admin_*.py` (core, users, tailors, catalog, orders,
  payments, reviews, measure, comms, security, growth) et `support.py` (routes
  publiques : config, pages, contact, canaux).
- `auth.py` réécrit : origine de l'inscription, historique des connexions,
  sessions admin révocables, double authentification (`/auth/mfa`), mot de
  passe provisoire, `/auth/logout`, **réinitialisation par OTP interdite aux
  comptes admin**.
- Mode maintenance (middleware dans `main.py`), données de départ (canaux,
  modèles de messages, pages), nettoyage quotidien des comptes invités.
- `backend/tests/test_admin_web.py` : environ 150 contrôles, **tous verts**.

Côté **web admin**, le socle est écrit et compile :
`web/src/lib/api/admin.ts` (toutes les routes admin typées),
`components/admin/{AdminContext,AdminShell,Feedback,DataTable,kit,Charts,format}.tsx|ts`,
`styles/admin-web.css` (thème sombre compris), `app/admin/layout.tsx`, et trois
pages : `vue-ensemble` (tableau de bord), `a-traiter`, `utilisateurs` (liste).
**Le reste des pages admin est à écrire** (voir A3).

`DEPLOIEMENT_CONTABO.md` : le mot de passe admin, qui y figurait en clair, a
été retiré de la copie de travail.

### 3.2 Constats de sécurité (vérifiés en production le 08/10/2026)

| Gravité | Constat | Preuve |
|---|---|---|
| **Critique** | Le mot de passe du compte admin de production figure dans l'historique du dépôt **public** (commits `4fba09c`, `f38d30d`, `8ce3ec8`, `eb925ff`) et il est **toujours valide**. | Connexion admin réussie via `https://sur-me-zur.vercel.app/api/auth/login`. |
| **Critique** | `POST /api/auth/password/reset/request` renvoie le code OTP dans la réponse (`dev_code`) : **n'importe qui peut réinitialiser le mot de passe de n'importe quel compte**, admin compris. | Code obtenu en production pour le numéro admin. Corrigé pour les admins dans le code local, **pas déployé** ; toujours ouvert pour clients et tailleurs. |
| Haute | `POST /api/payments/webhook` sans authentification : n'importe qui peut marquer un paiement « payé ». `GET /api/payments/order/{id}` et `/split` sans authentification. | Lecture du code + appel anonyme qui répond 200. |
| Haute | Pièces d'identité des tailleurs et photos corporelles des clients servies **publiquement** sous `/uploads/...` (noms aléatoires, mais publics et sans expiration). | `services/storage.py`, `main.py` (`StaticFiles`). |
| Haute | Trafic Vercel → VPS en **HTTP clair** (mots de passe, jetons). | `API_ORIGIN=http://169.58.69.36:8080`. |
| Moyenne | Aucune limitation de tentatives (connexion, OTP, création d'invités, formulaire de contact) ; mots de passe de **6 caractères exactement**. | `schemas/auth.py`. |
| Moyenne | `python-jose 3.3.0` : vulnérabilités connues (CVE-2024-33663, CVE-2024-33664). | `requirements.txt`. |
| Moyenne | `/api/measurements/debug/analyze` ouvert à tout compte connecté (renvoie toute la trace). | `measurements.py`. |
| Moyenne | Pas d'en-têtes de sécurité (CSP, HSTS, X-Frame-Options) côté Next et nginx ; jetons en `localStorage`. | `web/next.config.ts`. |
| À vérifier | `JWT_SECRET` réellement changé sur le VPS (`A_REMPLACER` dans l'exemple) ; droits 600 sur `api.env` ; mot de passe Supabase changé (il a été visible sur une capture d'écran). | VPS. |

### 3.3 Diagnostic « je n'arrive pas à me connecter »

- L'API répond (`/api/health` OK en direct et via Vercel) et la connexion admin
  fonctionne avec le mot de passe défini au déploiement.
- Causes probables chez l'utilisateur :
  1. **application mobile ou ancien lien** : ils visent `api.gitingeniering.com`,
     mort depuis l'expiration du domaine ;
  2. **application collecte** : sa variable Vercel `API_ORIGIN` n'est peut-être
     pas `http://169.58.69.36:8080`, ou le *Redeploy* n'a pas suivi ;
  3. **mot de passe** différent de celui posé au seed ;
  4. **saisie du numéro** : le serveur compare la chaîne exacte. Un indicatif
     saisi deux fois ou un 0 initial donne « Invalid phone or password ».
- Le correctif côté code est la tâche A1.4 (normalisation du numéro).

---

## 4. Tâches

Ordre imposé : **A0 → A1 → A2**, puis A3 et A4 en parallèle de l'Agent B,
puis A5 et A6. Chaque tâche se termine par ses contrôles. Ne passez pas à la
suivante avec un test rouge.

### A0 — Mise en sécurité immédiate (avant tout le reste)

Les actions **sur le VPS et chez Supabase** sont faites par l'utilisateur :
préparez les commandes exactes, avec le « pourquoi » de chacune, dans
`deploy/contabo/URGENCE_SECURITE.md`, puis signalez-les dans votre compte rendu.

1. **Changer le mot de passe admin de production** sans le faire apparaître
   dans l'historique du shell. Commande à fournir (lecture masquée) :
   ```
   sudo -u surmezur bash -c 'set -a; . /etc/surmezur/api.env; set +a; cd /srv/surmezur/app/backend; /srv/surmezur/venv/bin/python -c "
   import getpass
   from app.db.base import SessionLocal
   from app.models.users import User
   from app.core.security import hash_password
   p = getpass.getpass(\"Nouveau mot de passe admin : \")
   with SessionLocal() as db:
       u = db.query(User).filter(User.phone == \"+237696982953\").one()
       u.password_hash = hash_password(p); db.commit(); print(\"mot de passe change\")
   "'
   ```
2. **Fermer tout de suite la réinitialisation par OTP en production** (en
   attendant le déploiement du code corrigé) : bloc nginx dans le site
   Sur-MeZur (port 8080), puis `sudo nginx -t && sudo systemctl reload nginx` :
   ```
   location /api/auth/password/reset/ { return 403; }
   location /api/payments/webhook { return 403; }
   ```
3. Vérifier `JWT_SECRET` (au moins 64 caractères aléatoires, `openssl rand -hex 48`),
   `chmod 600 /etc/surmezur/api.env`, et le changement du mot de passe Supabase.
   Changer `JWT_SECRET` déconnecte tout le monde : c'est voulu.
4. Dans le code : vérifier qu'**aucun secret** ne reste dans le dépôt
   (`git grep -nI -E "password|secret|token" -- ':!*.lock'`, en relisant à la main).
   Ne pas réécrire l'historique sans l'accord de l'utilisateur. Proposez
   l'option (git filter-repo + force push) en expliquant ce qu'elle casse.

**Fini quand** : le document d'urgence existe, aucun secret n'est dans les
fichiers suivis, et les commandes ont été relues.

### A1 — Commit du socle et corrections de base

1. Créez la branche `agent-a/plateforme` depuis `main` et committez le travail
   en cours de la section 3.1 (backend et web admin). Ne committez **ni**
   `pipeline_anny/`, **ni** les suppressions de `opencode test/`.
   Messages en français. Terminez chaque message par la ligne
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
2. Relancez `tests.test_admin_web`, `npx tsc --noEmit` et `npm run build` dans `web/`.
3. **Réinitialisation de mot de passe pour tous les comptes** : ajoutez un
   réglage d'environnement `OTP_DEV_CODE` (défaut `false`). Quand il vaut
   `false`, `/auth/otp/request` et `/auth/password/reset/request` ne renvoient
   **jamais** le code, et la réinitialisation en libre-service répond 503 avec
   le message « Contactez le support : un mot de passe provisoire vous sera
   communiqué ». Le parcours de secours est la fonction admin 2.6 (mot de passe
   provisoire), qui existe déjà. Prévenez l'Agent B : l'écran
   « mot de passe oublié » doit afficher ce message et un lien vers `/contact`.
4. **Normalisation du numéro** (`app/services/phone.py`) : conservez le `+` et
   les chiffres, supprimez espaces et tirets, transformez `00` en `+`,
   supprimez un indicatif `+237` doublé, et, en l'absence d'indicatif, ajoutez
   `+237` devant un numéro local camerounais (9 chiffres commençant par 6 ou 2).
   À appliquer à l'inscription, à la connexion, à la réinitialisation, à la
   création de membre d'équipe et d'agent de collecte. Ajoutez un script
   `scripts/normaliser_telephones.py` (aperçu par défaut, `--apply` pour écrire)
   qui signale les doublons créés par la normalisation au lieu de fusionner.
5. **Limitation de tentatives** (`app/services/rate_limit.py`, en mémoire par
   processus, sans nouvelle dépendance) :
   - connexion : 10 essais par 15 min par numéro et par IP ;
   - `/auth/mfa` : 5 par jeton ;
   - `/auth/guest` : 30 par heure par IP ;
   - `/support/tickets` anonyme : 5 par heure par IP ;
   - inscription : 10 par heure par IP.
   Réponse 429 avec un message en français. L'IP vient de `X-Forwarded-For` ou
   `X-Real-IP` (Vercel et nginx).

### A2 — Nouvelle orientation produit (backend)

Toutes les règles ci-dessous passent par des **réglages** (`platform_settings.DEFAULTS`)
lisibles par `/api/public/config` dans une clé `features`, pour pouvoir les
rallumer plus tard sans toucher au code :
```
"features": {
  "tailor_verification": false,   # A2.1
  "payments": false,              # A2.2
  "negotiation": false,           # A2.2
  "pattern_generation": "preview" # "off" | "preview" | "on"   (A2.4)
}
```

**A2.1 Vérification des tailleurs désactivée (pas supprimée).**
- `features.tailor_verification=false` : aucune route ne bloque un tailleur non
  vérifié (cherchez `VerificationStatus.approved`, par exemple
  `catalog.py` vers la ligne 311, pour le prêt-à-porter). Les badges « vérifié »
  ne sont plus exposés comme garantie : ajoutez `verification_enabled` dans les
  réponses publiques des tailleurs.
- Le compteur « Vérifications », la file « À traiter » et le menu admin
  masquent la vérification quand elle est désactivée (A3).
- Le code des routes de vérification reste en place.

**A2.2 Commandes sans argent.**
- `features.payments=false` : `/payments/*` répond 404 (« Paiements désactivés »).
  Le webhook reste **désactivé** tant que le vrai fournisseur n'est pas branché.
  **Quand on le réactivera**, il devra vérifier une signature HMAC
  (`PAYMENT_WEBHOOK_SECRET`) ; écrivez déjà cette vérification.
- `GET /payments/order/{id}` et `/split` : exiger d'être partie à la commande
  (`require_order_participant`), même réactivés.
- Patron d'une commande (`api/v1/patterns.py`) : supprimez la condition
  « acompte payé » (règle RG-07) quand `payments=false`.
- Flux de commande simplifié, sans négociation (`negotiation=false`) :
  1. le client envoie une commande au tailleur (modèle, mesures, notes, date
     souhaitée, budget **indicatif** facultatif) ;
  2. le tailleur l'accepte ou la refuse, avec un motif ;
  3. il fait avancer le statut : `new` → `in_progress` → `ready_for_pickup` →
     `finished_delivered` ; le client est notifié à chaque étape (c'est déjà le
     cas dans `orders.py::set_order_status`) ;
  4. la messagerie de commande reste.

  Ajoutez `POST /orders/{id}/accept` et `POST /orders/{id}/decline {reason}`
  côté tailleur, ainsi que les statuts `declined` et `cancelled` (par le client
  tant que la commande est `new`). `first_offer_amount` devient facultatif à la
  création. Les offres, devis et modifications restent dans le code mais ne sont
  plus exigés.
- Le prix convenu reste une information saisie par le tailleur (`agreed_price`),
  **sans** encaissement : le tailleur peut noter l'avance reçue en main propre
  (tâche A2.3, « suivi de paiement manuel »).

**A2.3 API de l'espace tailleur web.** C'est le **contrat partagé avec l'Agent
B** (section 5). Créez `app/models/tailor_tools.py` et `app/api/v1/tailor_space.py`
(préfixe `/tailor`, rôle `tailor`) :
- **Carnet de clients** : un tailleur enregistre ses propres clients, même
  quand ils n'ont pas de compte. Modèle `TailorClient` : `tailor_id`, `full_name`,
  `phone`, `gender`, `notes`, `linked_user_id` (facultatif, si le client a un
  compte Sur-MeZur).
- **Mesures d'un client du carnet** : modèle `TailorClientMeasurement`
  (`tailor_client_id`, `data` avec les 12 clés de mesure du parcours client,
  `source` manual | photo, `height_cm`, `weight_kg`, `note`). Saisie manuelle,
  ou mesure par photo réutilisant la chaîne de vision existante
  (`api/v1/measurements.py`, fonctions `_measure` et `_run_measurement_job`).
  Les sessions de mesure exigent aujourd'hui un `client_id` (profil client) :
  ajoutez un `tailor_client_id` facultatif à `MeasurementSession` plutôt que de
  dupliquer la chaîne.
- **Suivi de commande simplifié pour les commandes hors plateforme** : modèle
  `TailorJob` (« travail ») pour les vêtements commandés en direct, sans passer
  par la plateforme : client du carnet, description, modèle ou photo de
  référence, date de livraison, statut (à faire / en cours / prêt / livré),
  prix convenu, **avance reçue** (montant saisi à la main, aucune transaction).
- **Tableau de bord tailleur** : commandes reçues par statut, travaux à livrer
  cette semaine et en retard, nombre de clients du carnet.
- **Partage** : jeton de partage public en lecture seule d'une fiche de mesures
  (`GET /public/fiches/{token}`, expirant au bout de 30 jours) pour l'envoyer au
  client par WhatsApp.
- **Inscription tailleur depuis le web** : `/auth/register` avec `role=tailor`
  accepte un `guest_token`. Le compte invité est converti en tailleur : le
  `ClientProfile` est conservé, un `TailorProfile` est créé, et la mesure prise
  en invité devient l'entrée « Moi (mesure d'essai) » de son carnet. Champs
  facultatifs : `shop_name`, `city`, `quartier`.

**A2.4 Patron à partir d'une image (version « aperçu »).** Modèle
`PatternRequest` : `tailor_id`, `image_url` (stockage **protégé**, voir A4),
`garment_type` (robe, jupe, chemise, pantalon, boubou, kaba…), `tailor_client_id`
ou `measurement` saisie, `status` processing | ready | failed, `result`
(pièces, SVG, notes), `engine` (« preview-v0 »).
- `POST /tailor/patterns` (multipart : `image`, `garment_type`,
  `tailor_client_id` ou `measurements` en JSON) crée la demande et lance le
  traitement en tâche de fond.
- Moteur « preview-v0 » : génère un **patron de base** à plat (pièces devant,
  dos, manche ou jambe selon le type) à partir des mesures, en SVG à l'échelle
  1:1 (en mm), avec les marges de couture indiquées. Partez de
  `services/mock_ai.generate_pattern_svg` et améliorez-le pour qu'il soit
  lisible et imprimable sur A4 (tuiles avec repères d'assemblage). L'image sert
  pour l'instant de référence visuelle, stockée et affichée. Le résultat porte
  la mention « Aperçu — la génération à partir de l'image arrive bientôt ».
- `GET /tailor/patterns`, `GET /tailor/patterns/{id}`,
  `GET /tailor/patterns/{id}/svg` (protégé), `DELETE /tailor/patterns/{id}`.
- Interface pensée pour brancher plus tard un vrai moteur (`engine` différent),
  sans changer le contrat.

**A2.5 Données de départ et réglages.** Ajoutez les nouveaux réglages à
`DEFAULTS`, à `SETTING_LABELS` (`admin_security.py`) et à `PUBLIC_KEYS` si
nécessaire. Étendez `tests/test_admin_web.py`, ou créez `tests/test_tailor_space.py`,
pour couvrir A1.3 à A2.4 : inscription tailleur depuis un invité, carnet,
mesure manuelle, travail, patron aperçu, partage, flux de commande sans
paiement, paiements désactivés, limitation de tentatives.

### A3 — Terminer l'administration web

Le socle est écrit (section 3.1). Respectez ses conventions : `DataTable` +
`useUrlState` pour toute liste (filtres dans l'adresse, export CSV, colonnes,
sélection, actions groupées) ; `useFeedback().confirm` avec motif pour toute
action grave ; `toast(..., { undo })` pour une action réversible ; `useLoad`,
`Loading`, `ErrorState` pour les états ; `Notes` sur chaque fiche ; formats de
`components/admin/format.ts` (jj/mm/aaaa, FCFA). Toutes les routes sont déjà
typées dans `web/src/lib/api/admin.ts`.

Pages à écrire ou réécrire sous `web/src/app/admin/` (les anciennes pages
`avis`, `catalogue`, `commandes`, `commission`, `litiges`, `verifications`
sont à remplacer) :

| Page | Contenu | Réf. cahier |
|---|---|---|
| `utilisateurs/[id]` | Fiche complète : profil, mesures avec correction tracée et historique, commandes, litiges, avis, connexions, demandes de support, origine d'acquisition avec commentaires et formulaire de qualification, notes ; actions suspendre/réactiver (motif), mot de passe provisoire (affiché une fois), export des données, suppression (super-admin) ; version imprimable. | 2.3–2.6, 2.9, 13.6, 14.11 |
| `utilisateurs/doublons` | Paires probables, choix du compte conservé, fusion (clients). | 2.8 |
| `tailleurs` | Qualité (note, litiges, retards, alertes), mise en avant et ordre, carte et répartition par ville et quartier. | 3.6–3.8 |
| `verifications` | Visionneuse (zoom, rotation, côte à côte), décision motivée avec modèles de messages, demande de complément, historique. **Masquée du menu quand `tailor_verification=false`**, avec un bandeau « désactivée ». | 3.1–3.5 |
| `catalogue` | Onglets : modèles (filtres, statut, mise en avant, ordre), modération, catégories, photos par glisser-déposer avec couverture, aperçu côté client, statistiques par modèle, tissus et accessoires, prêt-à-porter, import en masse. | M4 |
| `commandes` et `commandes/[id]` | Liste filtrable, alertes de retard ; dossier chronologique (modèle, mesures, messages, retour d'essayage, notes), annulation, changement de statut motivé, saisie du retour d'essayage, impression. | M5 |
| `litiges` et `litiges/[id]` | Liste avec ancienneté et alertes, statistiques des causes ; dossier, échanges avec les parties, décision graduée. **Sans argent** : avec `payments=false`, les décisions « remboursement » deviennent « en faveur du client » et aucun remboursement n'est créé. | M7 |
| `paiements` (+ `paiements/recu/[id]`, `commission`) | Code conservé, **masqué** quand `payments=false`. | M6 |
| `avis` | Filtres, signalements, réponse du tailleur, actions groupées. | M8 |
| `mesure` et `mesure/[id]` | Journal des analyses, santé, état de la chaîne, précision observée ; diagnostic avec photos si consentement. Ajoutez les mesures faites par les tailleurs (A2.3). | M9 |
| `collecte` | Fiches à relire (photos via `AuthImage`), objectifs par sous-groupe, agents, export. | M10 |
| `communication` | Annonces avec aperçu de l'audience, bandeau du site, modèles de messages, pages d'information. | M11 |
| `support` et `support/[id]` | File des demandes, attribution, réponse, rattachement à un compte ou une commande. | M12 |
| `statistiques` | Total à date, nouveaux par jour, actifs (jour, semaine, mois et part des actifs du mois qui reviennent chaque jour), churn, cohortes, activation, retours, segmentation (rôle, ville, sexe, support, canal), rapport téléchargeable. Ajoutez les indicateurs du nouveau produit : mesures par photo (invités et inscrits), inscriptions tailleurs, patrons générés. | M14 |
| `acquisition` | File des nouvelles acquisitions à qualifier (une par une ou en lot), canaux, campagnes avec budget et coût d'acquisition, objectifs, générateur de liens de campagne (`?utm_source=…&utm_campaign=…` vers la page d'accueil). | 14.9–14.15 |
| `equipe`, `journal`, `reglages`, `etat`, `securite` | Équipe et rôles ; journal filtrable et exportable ; réglages (formulaires lisibles, pas du JSON brut), dont les nouveaux `features` ; état technique ; mon compte : double authentification (afficher la clé et un QR code généré côté navigateur, sans dépendance lourde), sessions ouvertes. | M13 |

Également : la page `vue-ensemble` doit mettre en avant les deux services
(mesures réalisées et patrons générés). Le menu
(`components/admin/AdminShell.tsx`) masque Paiements et Vérifications selon
`features`. Exigences Q1 à Q8 du cahier : de 360 px à 1920 px sans défilement
horizontal, clavier, contrastes, libellés sur les icônes, français.

**Fini quand** : toutes les pages existent, `npx tsc --noEmit` et
`npm run build` passent, et chaque page a été ouverte dans le navigateur contre
l'API locale (captures d'écran à 375 px et 1440 px dans votre compte rendu).

### A4 — Revue de sécurité complète et corrections

Couvrez au minimum les points de 3.2, puis faites une passe complète :
1. **Fichiers privés** : déplacez pièces d'identité, photos de mesure, images
   de patron et photos de litige hors de `/uploads` public, dans un dossier
   protégé (même logique que `dataset_dir`). Servez-les par des routes qui
   vérifient le droit (propriétaire, partie à la commande, admin avec la bonne
   permission), ou par des URL signées qui expirent (HMAC + date, 15 min) pour
   les balises `<img>`. Script de migration des fichiers existants, avec
   mise à jour des URL en base (aperçu puis `--apply`). Le catalogue
   (`garment-models`) reste public.
2. Remplacez `python-jose` par `PyJWT` (même format de jeton, tests à jour).
3. Mots de passe : acceptez de 6 à 64 caractères (au moins une lettre et un
   chiffre). Garder 6 au minimum évite de casser les comptes existants.
   Coordonnez avec l'Agent B : `web/src/lib/password.ts`.
4. `/measurements/debug/analyze` : admin seulement, et désactivée si
   `ENV=production`.
5. En-têtes : dans `web/next.config.ts` (fichier de l'Agent B : envoyez-lui le
   bloc `headers()` exact à ajouter, ne le modifiez pas vous-même), CSP stricte,
   `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
   (caméra autorisée pour le site lui-même). Côté nginx :
   `client_max_body_size`, `server_tokens off`.
6. Contrôle d'accès : relisez **chaque** route (`grep -n "@router" app/api/v1/*.py`)
   et dressez le tableau route → qui peut l'appeler → vérification faite.
   Corrigez tout accès par identifiant sans contrôle de propriété (IDOR).
7. Validation des envois : type réel de l'image (signature des premiers
   octets), taille maximale (10 Mo), refus des SVG envoyés par les
   utilisateurs.
8. Dépendances : `pip-audit` sur `backend/requirements.txt`, `npm audit` dans
   `web/` et `collecte/` ; corrigez ou justifiez chaque alerte.
9. **HTTPS de l'API** : rédigez dans `DEPLOIEMENT_CONTABO.md` la procédure
   (nouveau domaine ou renouvellement de `gitingeniering.com`, certbot avec
   nginx, `API_ORIGIN` en https), sans l'exécuter.
10. Rapport : `SECURITE_AUDIT.md`, avec un tableau constat → gravité →
    correction → preuve (test ou commande).

### A5 — Déploiement

- Mettez à jour `DEPLOIEMENT_CONTABO.md` pour la réalité actuelle : nginx sur
  8080 (ajoutez `deploy/contabo/nginx-surmezur.conf`), domaine expiré,
  `API_ORIGIN=http://169.58.69.36:8080` sur les deux projets Vercel,
  `sync_sqlite_columns.py --apply` après chaque mise à jour du schéma (le
  script `mettre_a_jour.sh` le fait), cron de sauvegarde, variable
  `BACKUP_DIR` (pour la page État technique), `OTP_DEV_CODE=false`.
- Préparez la mise en production pas à pas pour l'utilisateur. N'exécutez
  rien sur le VPS vous-même.

### A6 — Compte rendu

`COMPTE_RENDU_AGENT_A.md` : ce qui est fait, testé et comment ; ce qui reste ;
les décisions prises ; les actions demandées à l'utilisateur (VPS, Supabase,
Vercel).

---

## 5. Contrat d'interface avec l'Agent B (à respecter à la lettre)

L'Agent B code l'interface **en même temps** que vous codez l'API. Il se fie
à ce contrat. Si vous devez le changer, écrivez le changement dans
`CONTRAT_API_TAILLEUR.md` (créez-le **dès le début de A2**, avec les schémas
JSON exacts) et prévenez-le.

```
GET  /api/public/config            -> {..., features: {tailor_verification, payments, negotiation, pattern_generation}}
POST /api/auth/register            role=client|tailor, guest_token?, shop_name?, city?, quartier?, acquisition?
POST /api/auth/password/reset/request -> 503 + message si OTP_DEV_CODE=false

GET    /api/tailor/dashboard
GET    /api/tailor/clients?q=           POST /api/tailor/clients
GET    /api/tailor/clients/{id}         PATCH/DELETE /api/tailor/clients/{id}
POST   /api/tailor/clients/{id}/measurements           (saisie manuelle)
POST   /api/tailor/clients/{id}/measure-session         (height_cm, weight_kg, gender) -> session
POST   /api/tailor/measure-session/{sid}/photos         (front, side) multipart
GET    /api/tailor/measure-session/{sid}                (statut, comme /measurements/session/{id})
POST   /api/tailor/clients/{id}/share  -> {url, expires_at}
GET    /api/public/fiches/{token}      (lecture seule, sans compte)

GET    /api/tailor/jobs?status=&due=week|late   POST /api/tailor/jobs
PATCH  /api/tailor/jobs/{id}           DELETE /api/tailor/jobs/{id}

GET    /api/orders                      (commandes reçues, déjà existant, rôle tailor)
POST   /api/orders/{id}/accept          POST /api/orders/{id}/decline {reason}
POST   /api/orders/{id}/status {status} (existant)
GET/POST /api/orders/{id}/chat          (existant)

POST   /api/tailor/patterns            multipart image, garment_type, tailor_client_id? | measurements?
GET    /api/tailor/patterns            GET /api/tailor/patterns/{id}
GET    /api/tailor/patterns/{id}/svg   DELETE /api/tailor/patterns/{id}
```

## 6. Coordination avec l'Agent B

- **Vos fichiers** : `backend/**`, `deploy/**`, `DEPLOIEMENT_*.md`,
  `web/src/app/admin/**`, `web/src/components/admin/**`,
  `web/src/lib/api/admin.ts`, `web/src/styles/admin*.css`, `collecte/**`
  (sécurité seulement), `SECURITE_AUDIT.md`, `CONTRAT_API_TAILLEUR.md`.
- **Fichiers de l'Agent B (ne pas modifier)** : `web/src/app/page.tsx`,
  `web/src/app/(client)/**`, `web/src/app/tailleur/**`, `connexion`,
  `inscription`, `mot-de-passe-oublie`, `mesurer`, `telecharger`, `contact`,
  `infos`, `web/src/components/*.tsx` (hors `admin/`), `web/src/lib/api/endpoints.ts`,
  `web/src/lib/api/types.ts`, `web/src/lib/api/tailor.ts`, `web/public/**`,
  `web/next.config.ts`, `android-twa/**`.
- **Partagé** : `web/src/lib/api/client.ts` (déjà modifié : en-tête
  `X-SMZ-Platform`, `downloadFile`, `api.put`, maintenance). Ne le touchez
  plus sans prévenir l'Agent B.
- Branches : vous travaillez sur `agent-a/plateforme`, l'Agent B sur
  `agent-b/produit-web`, créée **après** votre commit A1.1, depuis votre
  branche. Fusions vers `main` à valider par l'utilisateur.
- Aucun `git push --force`, aucun déploiement, aucune commande sur le VPS sans
  accord écrit de l'utilisateur.
