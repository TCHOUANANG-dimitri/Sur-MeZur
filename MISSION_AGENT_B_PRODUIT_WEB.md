# Mission Agent B — Produit web : page d'accueil, inscription, espace tailleur, application Android

> Document de travail pour un agent qui démarre **sans contexte**. Tout ce qu'il
> faut savoir est ici. Un second agent (Agent A, `MISSION_AGENT_A_PLATEFORME.md`)
> travaille **en parallèle** sur le backend, l'administration, la sécurité et le
> déploiement. Lisez la section « Coordination » avant de toucher un fichier.

---

## 1. Le projet en bref

Sur-MeZur met en relation clients et tailleurs au Cameroun. On prend deux photos
(face et profil) ; une chaîne de vision en extrait **12 mensurations de
couture**. Le site web (Next.js) permet déjà de mesurer **sans compte** : un
compte « invité » est créé à la volée, la personne voit une partie de ses
mesures, puis crée son compte pour tout voir.

**Nouvelle orientation produit (octobre 2026) — c'est votre cap :**
- Objectif n°1 : **un maximum d'utilisateurs**. Deux services mis en avant,
  **gratuits** pour l'instant (payants plus tard, **aucun prix affiché**) :
  1. la **prise de mesure par photo** (existe) ;
  2. la **génération de patron de vêtement à partir d'une image** (nouvelle,
     **côté tailleur seulement** pour l'instant). L'interface doit être
     **opérationnelle de bout en bout** ; le moteur côté serveur est une
     version « aperçu », qui sera améliorée plus tard.
- **Le web seulement.** L'application mobile Expo (`mobile/`) est mise de
  côté : on n'y touche pas. À la place, le site web est **emballé en
  application Android légère** (APK téléchargeable depuis le site).
- Parcours : une personne essaie la mesure **avant** de créer un compte, puis
  choisit de créer un compte **client** ou **tailleur**.
- Côté **client** : pas de grosse modification. Côté **tailleur** : un nouvel
  espace web, **ultra simple et utile au quotidien** (section A3).
- **Plus aucune transaction d'argent** dans la plateforme. L'envoi de commande
  client → tailleur reste.
- **Vérification des tailleurs désactivée** pour l'instant : aucun écran ne doit
  la réclamer ni bloquer un tailleur.

## 2. Le dépôt

Racine : `F:\Projects\Sur-MeZur\Sur-MeZur-App` (Windows ; Git Bash et
PowerShell disponibles ; Node 24). Le dépôt GitHub est **public** : aucun
secret dans les fichiers (keystore, mots de passe, jetons).

| Dossier | Rôle |
|---|---|
| `web/` | **Votre terrain.** Next.js 15, App Router, TypeScript, `src/`, alias `@/*`. Déployé sur Vercel : `https://sur-me-zur.vercel.app`. `/api/*` et `/uploads/*` sont réécrits côté serveur vers `API_ORIGIN` (`web/next.config.ts`). |
| `backend/` | API FastAPI. **Fichiers de l'Agent A**, mais vous pouvez la lancer en local pour tester. |
| `mobile/` | Ancienne application mobile : **référence fonctionnelle** de l'espace tailleur (`mobile/app/tailor/**`), à lire, jamais à modifier. |
| `android-twa/` | **À créer** : emballage Android (tâche B5). |

Lancer en local :
```
# API (terminal 1)
cd backend
$env:SURMEZUR_ALLOW_LOCALHOST=1      # PowerShell
./venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
# Site (terminal 2) — web/.env.local contient API_ORIGIN=http://localhost:8000
cd web
npm run dev
```
Contrôles obligatoires avant chaque commit : `npx tsc --noEmit` et
`npm run build` dans `web/`.

### Ce qui existe déjà dans `web/` (côté public et client)

- `/` redirige vers `/mesurer`. **Il n'y a pas de page d'accueil** dans le dépôt :
  l'ancienne vivait sur `gitingeniering.com`, domaine **expiré le 07/10/2026**.
  `src/styles/landing.css` est un reste inutilisé.
- `/mesurer` : parcours de mesure sans compte (`components/MeasureFlow.tsx`,
  `components/CameraCapture.tsx`), puis `/mesurer/resultat/[id]` : résultat
  partiel et appel à créer un compte.
- `/inscription` : client seulement aujourd'hui (rôle figé). `/connexion`,
  `/mot-de-passe-oublie`.
- Espace client `(client)` : accueil, modèles, proposer un modèle, mes mesures,
  fiche imprimable, profil. Navigation : `components/Shell.tsx`
  (`CLIENT_NAV`). Kit d'interface : `components/ui.tsx`, styles dans
  `src/styles/*.css`. Icônes : `components/icons.tsx` (lucide-react).
- Client d'API : `src/lib/api/client.ts` (jetons en localStorage,
  renouvellement automatique, en-tête `X-SMZ-Platform: web`, `downloadFile`,
  événement `smz:maintenance` sur 503) ; routes dans `src/lib/api/endpoints.ts`,
  types dans `src/lib/api/types.ts`. `endpoints.ts` contient déjà `PublicApi`
  (config publique, canaux d'acquisition, pages d'info, contact),
  `AuthApi.mfa`, `AuthApi.logout` et `UsersApi.changePassword`.
- `/admin/**` : administration (Agent A). N'y touchez pas.

### Ce que le backend offre déjà (non déployé, branche de l'Agent A)

- `GET /api/public/config` : `banner` (bandeau), `maintenance`, `cities`,
  `signup_source_question`, et bientôt `features` (voir 5).
- `GET /api/public/acquisition-channels` : réponses à « Comment nous avez-vous
  connu ? ».
- `POST /api/auth/register` accepte `city` et `acquisition` :
  `{source, source_other, utm: {utm_source, utm_medium, utm_campaign, utm_content, utm_term}, referral_code, landing_path}`.
- `POST /api/auth/login` peut répondre `must_change_password: true` (mot de
  passe provisoire posé par l'équipe), ou `mfa_required: true` +
  `mfa_token` (administrateur protégé : `POST /api/auth/mfa`).
- `POST /api/me/password {current_password, new_password}`.
- `GET /api/public/pages/{slug}` (faq, conditions, confidentialite),
  `POST /api/support/tickets` (contact, ouvert aux visiteurs).
- Maintenance : toute route publique répond 503 avec un message.

---

## 3. Tâches

Ordre conseillé : B0, puis B1 et B2, puis B3 (dès que le contrat API est
publié par l'Agent A ; en attendant, travaillez avec des données simulées
derrière la même interface), puis B4, puis B5, puis B6. Chaque tâche se termine
par `npx tsc --noEmit`, `npm run build` et une vérification dans le navigateur
à **375 px** et **1440 px** (captures dans le compte rendu).

### B0 — Mise en place

1. Attendez que l'Agent A ait committé le travail en cours sur
   `agent-a/plateforme` (sa tâche A1.1), puis créez `agent-b/produit-web`
   depuis cette branche. Si elle n'existe pas encore, demandez à l'utilisateur ;
   **ne committez pas** le travail en cours de l'Agent A vous-même.
2. Messages de commit en français, terminés par
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### B1 — Page d'accueil orientée conversion (`/`)

1. **Recherche** (une demi-journée au plus) : étudiez la structure des
   meilleures pages d'accueil de produits grand public, mobile d'abord, et ce
   qui fait convertir (une proposition de valeur en une phrase, un seul appel à
   l'action principal répété, preuve sociale près du haut, « comment ça marche »
   en 3 étapes, levée des objections, FAQ courte, page rapide). Cherchez des
   exemples d'outils « mesure ou essayage par photo » et de produits pour
   artisans. Résumez vos sources et les principes retenus en 10 à 15 lignes en
   tête de `web/src/app/(public)/accueil-notes.md`.
2. **Structure cible** (courte : 7 sections au plus, sans prix) :
   1. **Bandeau principal** : promesse claire (« Vos mesures de couture en
      2 photos, gratuitement »), sous-titre, **CTA principal**
      « Prendre mes mesures » → `/mesurer`, CTA secondaire « Je suis tailleur »
      → section tailleurs. Visuel : silhouette et mesures (réutilisez
      `components/Silhouettes.tsx`), pas de photo lourde.
   2. **Bande de confiance** : 2 à 4 faits vérifiables (gratuit, sans mètre
      ruban, photos supprimables, fait pour le Cameroun). **Aucun chiffre
      inventé** : pas de faux avis, pas de faux compteur d'utilisateurs.
   3. **Comment ça marche** en 3 étapes (infos, 2 photos, mesures + fiche à
      imprimer ou partager).
   4. **Deux publics** côte à côte : clients (mesures, modèles, envoi au
      tailleur) et tailleurs (carnet de clients, mesures par photo, suivi des
      travaux), chacun avec son CTA.
   5. **Patron à partir d'une photo — bientôt** : présenté comme une
      fonctionnalité à venir, avec un aperçu visuel (pièces de patron en SVG) et
      un CTA « Créer mon compte tailleur pour l'essayer en avant-première ».
   6. **FAQ** (5 questions au plus : précision, confidentialité des photos,
      gratuité, tailleurs, application Android).
   7. **Appel final** + pied de page : contact, conditions, confidentialité,
      « Télécharger l'application Android » (`/telecharger`).
3. **Technique** : page **statique** (composant serveur, aucun appel API au
   chargement), images optimisées (`next/image`), pas de bibliothèque
   d'animation. Visez un LCP < 2,5 s en 4G et un score Lighthouse mobile
   ≥ 90 en performance, accessibilité et SEO. Métadonnées Open Graph (aperçu
   WhatsApp et Facebook), `<title>` et description en français. Un client
   connecté qui ouvre `/` va sur son espace ; un tailleur, sur `/tailleur`.
4. **Suivi de l'acquisition (14.10)** : un petit composant client, monté dans
   `app/layout.tsx`, lit **à la première visite** les paramètres `utm_*`, `ref`
   et `code` de l'adresse et le chemin d'arrivée. Il les garde 30 jours en
   localStorage (accès dans un `try/catch`), puis l'inscription les envoie dans
   `acquisition`.
5. Bandeau du site (11.2) : composant monté dans `app/layout.tsx`, alimenté par
   `/api/public/config` (tons info, alerte, promo ; lien facultatif ; refermable
   par la personne). **Mode maintenance** : à la réception de l'événement
   `smz:maintenance` ou si `config.maintenance.enabled`, afficher une page de
   maintenance propre avec le message.

### B2 — Inscription, connexion et pages de service

1. **Choix du rôle après l'essai de mesure** : sur `/mesurer/resultat/[id]`,
   puis sur `/inscription`, deux choix clairs : « Je suis client » et « Je suis
   tailleur ». Le compte invité est converti dans les deux cas (envoi de
   `guest_token` ; l'Agent A gère la conversion en tailleur). Champs tailleur
   **facultatifs** : nom de l'atelier, ville (liste tirée de `config.cities`),
   quartier. Rien n'est exigé pour la vérification.
2. **« Comment nous avez-vous connu ? »** (14.9) : liste déroulante facultative
   (`/api/public/acquisition-channels`), avec un champ libre si « Autre ».
   Affichée seulement si `config.signup_source_question`. Plus le code de
   parrainage ou promo, s'il est dans l'adresse ou saisi.
3. **Connexion** : gérer `mfa_required` (écran « code à 6 chiffres », appel
   `AuthApi.mfa`) et `must_change_password` (redirection vers
   `/changer-mot-de-passe`).
4. **`/changer-mot-de-passe`** : ancien et nouveau mot de passe, puis retour au
   parcours. `components/RequireRole.tsx` y renvoie déjà quand
   `must_change_password` est vrai.
5. **`/mot-de-passe-oublie`** : si l'API répond 503 (OTP désactivé), afficher
   « Contactez le support : un mot de passe provisoire vous sera communiqué »
   et un lien vers `/contact`.
6. **`/contact`** (12.1) : formulaire (nom et téléphone ou e-mail si non
   connecté, catégorie, objet, message) → `PublicApi.contact`, puis
   confirmation avec le numéro de demande.
7. **`/infos/[slug]`** : FAQ, conditions, confidentialité (`PublicApi.page`),
   rendu Markdown simple et **sûr** (texte échappé ; vous pouvez reprendre
   `renderMarkdown` de `components/admin/kit.tsx` en le copiant dans
   `src/lib/markdown.ts`).
8. **Numéro de téléphone** : dans `components/fields.tsx` (`PhoneField`), si la
   personne colle un numéro avec indicatif (`+237…`, `00237…`, `237…`) ou un 0
   initial, ne gardez que la partie locale, pour ne jamais produire
   `+237237…`. Le serveur normalise aussi (Agent A).
9. **Mots de passe** : alignez `src/lib/password.ts` sur la nouvelle règle de
   l'Agent A (6 à 64 caractères, au moins une lettre et un chiffre) quand il
   vous la confirme.

### B3 — Espace tailleur web (`/tailleur`)

Lisez d'abord `mobile/app/tailor/**` (tableau de bord, commandes, chat,
patron, profil, prêt-à-porter) pour reprendre ce qui sert, **sans** ce qui a
trait à l'argent.

**Principe : ultra simple.** Un tailleur doit pouvoir, au téléphone et en
moins d'une minute, retrouver un client, ses mesures et sa date de livraison.
Gros boutons, peu de texte, aucun écran de configuration obligatoire.

**Fonctionnalités à livrer** (les intitulés entre parenthèses sont les écrans) :

1. **Accueil** (`/tailleur`) : « À livrer cette semaine », « En retard »,
   « Nouvelles commandes reçues », et trois gros boutons : « Mesurer un
   client », « Nouveau travail », « Patron à partir d'une photo ».
2. **Carnet de clients** (`/tailleur/clients`, `/tailleur/clients/[id]`) :
   recherche par nom ou téléphone, ajout en 3 champs (nom, téléphone, sexe),
   boutons **Appeler** et **WhatsApp** (`tel:` et `https://wa.me/…`), notes,
   historique des mesures et des travaux du client.
3. **Mesurer un client** : par photo (réutilisez `MeasureFlow` et
   `CameraCapture`, en les branchant sur les routes tailleur, sans dupliquer
   la logique) **ou** au mètre ruban (formulaire des 12 mesures, mêmes libellés
   que `src/lib/measurements.ts`). Résultat rangé dans le carnet.
4. **Fiche de mesures** : imprimable (reprenez le style de
   `(client)/mesures/[id]/fiche`), et **partageable par WhatsApp** (lien de
   partage public en lecture seule, qui expire).
5. **Carnet de travaux** (`/tailleur/travaux`) : vêtements commandés en direct
   (hors plateforme) : client, description, photo du modèle, date de livraison,
   statut (à faire, en cours, prêt, livré), prix convenu, **avance reçue et
   reste à payer** (simple note de calcul, **aucune transaction**). Filtres
   « cette semaine », « en retard ».
6. **Commandes reçues via Sur-MeZur** (`/tailleur/commandes`) : accepter ou
   refuser (avec motif), faire avancer le statut, messagerie, mesures du client
   et modèle demandé. **Ni offre, ni devis, ni paiement.**
7. **Patron à partir d'une photo** (`/tailleur/patrons`, `/tailleur/patrons/nouveau`,
   `/tailleur/patrons/[id]`) : parcours opérationnel de bout en bout :
   1. photo du modèle (appareil photo ou galerie, compressée avec
      `src/lib/imageCompress.ts`) ;
   2. type de vêtement ;
   3. client du carnet (ses mesures) ou mesures saisies ;
   4. envoi, attente (statut interrogé toutes les 2 s) ;
   5. affichage du patron (SVG zoomable), impression A4 en tuiles, liste des
      pièces.

   Bandeau clair : « Aperçu — la génération à partir de l'image s'améliore
   bientôt ». Historique des patrons.
8. **Profil** (`/tailleur/profil`) : nom de l'atelier, ville et quartier,
   téléphone, présentation, photo de l'atelier, langue, déconnexion. **Pas**
   d'écran de vérification.
9. **Navigation** : ajoutez `TAILOR_NAV` dans `components/Shell.tsx` (Accueil,
   Clients, Travaux, Patrons, Profil ; les commandes reçues sont accessibles
   depuis l'accueil avec un compteur). Garde de route `RequireRole role="tailor"`
   (ajoutez `"tailor"` au type si besoin). Après connexion, un tailleur va sur
   `/tailleur`.

**Retirés de l'interface tailleur** (le code mobile reste, rien n'est porté
sur le web) : écran **Finances** et commissions, **négociation** en 3 offres,
**devis** avec commission, **paiements** Mobile Money et séquestre, écran de
**vérification**. Le **prêt-à-porter** n'est pas porté dans cette première
version (fonction de vente, hors du cap « mesure et patron »). Signalez-le
dans le compte rendu : l'utilisateur tranchera.

Côté **client** (changements minimes) : dans l'envoi de commande à un
tailleur, s'il existe dans l'espace client web, retirez tout montant et tout
paiement. Le reste ne bouge pas.

API : créez `src/lib/api/tailor.ts` (vos appels tailleur) en suivant **le
contrat de la section 5**. Tant que l'Agent A n'a pas livré une route, gardez
une implémentation simulée (`src/lib/api/tailor.mock.ts`), activée par
`NEXT_PUBLIC_TAILOR_MOCK=1`, avec **exactement** la même signature, et retirez
la simulation quand la vraie route existe.

### B4 — PWA

- `app/manifest.ts` (Next 15) : nom « Sur-MeZur », nom court, `start_url: "/"`,
  `display: "standalone"`, couleurs (`#5b21b6`), icônes 192 et 512 px,
  **maskable** comprises (générez-les à partir de `public/logo-mark.png`).
- Service worker minimal (`public/sw.js`), enregistré seulement en production :
  page hors connexion (« Vous êtes hors ligne ») et mise en cache des
  ressources statiques seulement, **jamais** de `/api/*`.
- Vérifiez l'installabilité dans Chrome (Lighthouse « Installable »).

### B5 — Application Android légère (`android-twa/`) et page `/telecharger`

**Choix technique : Trusted Web Activity (TWA) générée avec Bubblewrap.**
L'APK ne contient qu'une coquille qui ouvre le site dans Chrome, en plein écran,
sans barre d'adresse. Il pèse moins de 1 Mo, la caméra fonctionne (c'est
Chrome), et les mises à jour du site arrivent sans republier l'APK.
Alternative à n'utiliser que si la TWA est impossible : Capacitor avec
`server.url` distant (environ 4 Mo). Justifiez le choix dans le README.

1. `android-twa/README.md` : prérequis (Node, JDK 17, Android SDK : Bubblewrap
   sait les installer), commandes exactes (`npx @bubblewrap/cli init
   --manifest=https://sur-me-zur.vercel.app/manifest.webmanifest`,
   `bubblewrap build`), et ce que fait chacune.
2. `android-twa/twa-manifest.json` versionné : identifiant
   `com.surmezur.app`, `host: sur-me-zur.vercel.app` (prévoir le changement
   quand un domaine sera acheté), couleurs, icônes, `minSdkVersion: 21`,
   `enableNotifications: false`. Options de taille : pas de bibliothèque en
   plus, `shrinkResources` et `minifyEnabled` activés.
3. **Signature** : script qui génère la clé (`keytool`) **hors du dépôt**
   (ex. `%USERPROFILE%\.surmezur\android.keystore`). Ajoutez
   `*.keystore`, `*.jks`, `android-twa/app/build/` et les mots de passe au
   `.gitignore`. Notez l'empreinte SHA-256 de la clé.
4. **Digital Asset Links** : `web/public/.well-known/assetlinks.json` avec le
   paquet et l'empreinte SHA-256 (sans lui, Chrome affiche une barre d'adresse
   dans l'application). Vérifiez que Vercel le sert avec
   `Content-Type: application/json`.
5. **Distribution** : l'APK n'est pas versionné dans le dépôt. Publiez-le en
   pièce jointe d'une *release* GitHub, ou dans un stockage de fichiers. La page
   `/telecharger` pointe vers ce lien (variable `NEXT_PUBLIC_APK_URL`) et
   affiche : bouton « Télécharger l'application (moins de 1 Mo) », version,
   taille, comment autoriser l'installation d'applications inconnues sur
   Android (3 étapes avec captures schématiques), et, en alternative,
   « Installer depuis Chrome » (PWA). Sur iPhone : expliquer « Ajouter à
   l'écran d'accueil ».
6. Construisez l'APK une fois, vérifiez sa taille et testez-le sur un émulateur
   ou un téléphone Android : mesure par photo (caméra), connexion, retour
   arrière. Consignez les résultats.

### B6 — Compte rendu

`COMPTE_RENDU_AGENT_B.md` : écrans livrés (avec captures à 375 px et
1440 px), sources et principes de la page d'accueil, résultats Lighthouse,
taille de l'APK et tests, ce qui reste, questions pour l'utilisateur (dont le
prêt-à-porter).

---

## 4. Règles de qualité (toutes les tâches)

- Français partout ; dates jj/mm/aaaa ; montants en FCFA ; aucun prix
  d'abonnement affiché.
- Mobile d'abord (360 px), sans défilement horizontal ; cibles tactiles
  ≥ 44 px ; utilisable au clavier ; contrastes AA ; `alt` sur les images.
- Pas de nouvelle dépendance lourde. Toute dépendance ajoutée doit être
  justifiée dans le compte rendu.
- Aucun contenu inventé présenté comme réel (avis, chiffres, logos de
  partenaires).
- Toute donnée personnelle (photos, mesures) reste derrière l'authentification ;
  les liens de partage sont en lecture seule et expirent.
- Réutilisez les composants existants (`ui.tsx`, `fields.tsx`, `MeasureFlow`,
  `CameraCapture`, `Silhouettes`) plutôt que d'en créer des variantes.

## 5. Contrat d'interface avec l'Agent A

L'Agent A implémente ces routes. Il publiera les schémas JSON exacts dans
`CONTRAT_API_TAILLEUR.md` à la racine : **lisez-le dès qu'il existe**, il fait
foi en cas d'écart.

```
GET  /api/public/config            -> {..., features: {tailor_verification, payments, negotiation, pattern_generation}}
POST /api/auth/register            role=client|tailor, guest_token?, shop_name?, city?, quartier?, acquisition?
POST /api/auth/password/reset/request -> 503 + message si la réinitialisation par code est désactivée

GET    /api/tailor/dashboard
GET    /api/tailor/clients?q=           POST /api/tailor/clients
GET    /api/tailor/clients/{id}         PATCH/DELETE /api/tailor/clients/{id}
POST   /api/tailor/clients/{id}/measurements           (saisie manuelle, 12 clés de mesure)
POST   /api/tailor/clients/{id}/measure-session         (height_cm, weight_kg, gender) -> session
POST   /api/tailor/measure-session/{sid}/photos         (front, side) multipart
GET    /api/tailor/measure-session/{sid}                (statut, comme /measurements/session/{id})
POST   /api/tailor/clients/{id}/share  -> {url, expires_at}
GET    /api/public/fiches/{token}      (lecture seule, sans compte)

GET    /api/tailor/jobs?status=&due=week|late   POST /api/tailor/jobs
PATCH  /api/tailor/jobs/{id}           DELETE /api/tailor/jobs/{id}

GET    /api/orders                      (commandes reçues, rôle tailor)
POST   /api/orders/{id}/accept          POST /api/orders/{id}/decline {reason}
POST   /api/orders/{id}/status {status}
GET/POST /api/orders/{id}/chat

POST   /api/tailor/patterns            multipart image, garment_type, tailor_client_id? | measurements?
GET    /api/tailor/patterns            GET /api/tailor/patterns/{id}
GET    /api/tailor/patterns/{id}/svg   DELETE /api/tailor/patterns/{id}
```

Le SVG d'un patron et les photos sont servis par des routes **protégées** : une
balise `<img>` n'envoie pas le jeton. Téléchargez-les avec le jeton et
affichez-les via `URL.createObjectURL` (voir `AuthImage` dans
`components/admin/kit.tsx`, à copier, pas à importer), ou utilisez les URL
signées si l'Agent A les fournit.

## 6. Coordination avec l'Agent A

- **Vos fichiers** : `web/src/app/page.tsx`, `web/src/app/(public)/**`,
  `web/src/app/(client)/**`, `web/src/app/tailleur/**`, `connexion`,
  `inscription`, `mot-de-passe-oublie`, `changer-mot-de-passe`, `mesurer`,
  `contact`, `infos`, `telecharger`, `web/src/app/layout.tsx`,
  `web/src/app/manifest.ts`, `web/src/components/*.tsx` (hors `admin/`),
  `web/src/lib/**` (sauf `lib/api/admin.ts`), `web/src/styles/*.css` (sauf
  `admin*.css`), `web/public/**`, `web/next.config.ts`, `android-twa/**`.
- **Fichiers de l'Agent A (ne pas modifier)** : `backend/**`, `deploy/**`,
  `web/src/app/admin/**`, `web/src/components/admin/**`,
  `web/src/lib/api/admin.ts`, `web/src/styles/admin*.css`, `DEPLOIEMENT_*.md`.
- **Partagé, avec précaution** : `web/src/lib/api/client.ts` (le prévenir avant
  toute modification). `web/next.config.ts` est à vous, mais l'Agent A vous
  fournira le bloc `headers()` de sécurité (CSP, etc.) à intégrer **tel quel**.
  Vérifiez que la CSP laisse passer la caméra, les polices Google et
  `/api`.
- Branche : `agent-b/produit-web`. Fusions vers `main` à valider par
  l'utilisateur. Aucun `git push --force`, aucun déploiement Vercel, aucune
  publication d'APK sans accord écrit de l'utilisateur.
