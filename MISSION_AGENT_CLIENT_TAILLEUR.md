# Mission : relier clients et tailleurs, localisation, finances du tailleur

Consignes pour l'agent qui réalisera ces travaux. Lis tout avant de commencer.
Rédigé le 2026-10-22, état du dépôt : commit qui ajoute ce fichier.

## 0. Règles non négociables

- **Le dépôt est PUBLIC.** Aucun secret dans le code ni dans les commits : pas de mot de passe, pas de jeton, pas de clé de keystore. Ces éléments restent dans `%USERPROFILE%\.surmezur` ou dans `api.env` sur le VPS.
- **Les photos de personnes sont des données personnelles.** Ne les mets jamais en ligne et ne les copie pas dans le dépôt. Aucune capture d'une personne dans les rapports ni dans les tests.
- **Ne lance aucune commande sur le VPS.** C'est l'utilisateur qui les exécute, notamment `sudo bash /srv/surmezur/app/deploy/contabo/mettre_a_jour.sh`.
- **Git.** Pas de commit ni de push sans l'accord explicite de l'utilisateur. Pas de force push, pas de réécriture d'historique. Les fichiers `landing/AGENTS.md` et `landing/CLAUDE.md` restent hors commit.
- **Langue.** Réponses, textes de l'interface et messages de commit en français.
- **Tests.** Teste dans un vrai navigateur avant d'annoncer que c'est fini (voir §6).

## 1. Ce qu'on veut, en une phrase par point

1. **Annuaire des tailleurs côté client.** Le client voit la liste des tailleurs de l'application et ouvre leur profil : atelier, bio, localisation, note.
2. **Envoi de commande.** Depuis le profil d'un tailleur, le client lui envoie ses mesures. Il y joint, le cas échéant, le modèle qu'il a choisi dans l'application.
3. **Contact client → tailleur**, avec les mêmes fonctions que côté tailleur → client :
   - appeler, avec copie du numéro ;
   - WhatsApp, avec un message pré-rempli qui dit que le client vient de Sur-MeZur ;
   - enregistrer le tailleur dans les contacts du téléphone.
4. **Localisation sur le profil tailleur.** Le tailleur la renseigne et les clients la voient.
5. **Finances du tailleur.** Une page simple pour suivre l'argent qui entre dans son activité.

## 2. Décisions déjà prises

Les questions ci-dessous étaient ambiguës et ont été tranchées comme indiqué. Si l'utilisateur dit autre chose, c'est lui qui a raison.

- **L'envoi des mesures passe par une commande.** On utilise le système de commandes qui existe déjà : `POST /api/orders` avec `measurement_id` et `garment_model_id`. Le tailleur la reçoit dans `/tailleur/commandes`, qui sait déjà afficher les mesures et le modèle demandé. On ne crée pas de nouveau canal.
- **La localisation se saisit en texte, avec un point GPS facultatif.** Les champs texte sont la ville, le quartier et un repère (« face pharmacie X »). Le point GPS est pris avec un bouton « Utiliser ma position ». Le lien « Itinéraire » ouvre Google Maps. On n'intègre pas de carte : ni clé d'API, ni CSP à ouvrir aux tuiles.
- **Les finances sont calculées à partir des travaux et complétées par des entrées manuelles.** Il n'y a ni paiement en ligne ni lien avec Mobile Money. C'est un carnet de recettes, pas plus.
- **L'annuaire est visible par tous, même sans compte.** Le **numéro de téléphone** du tailleur n'est donné qu'aux utilisateurs connectés, pour limiter l'aspiration des numéros. Un invité voit « Connectez-vous pour contacter ce tailleur ». L'envoi de commande exige un compte client.
- **Le tailleur peut masquer son numéro.** La case « Afficher mon numéro aux clients » est cochée par défaut, dans `/tailleur/profil`.

## 3. Ce qui existe déjà : à réutiliser, pas à réécrire

### Backend (`backend/`, FastAPI + SQLAlchemy 2)

- **`app/models/users.py` › `TailorProfile`.** Champs : `shop_name`, `bio`, `city`, `quartier`, `lat`, `lng`, `atelier_photo_url`, `rating_avg`, `completed_orders_count`, `verification_status`, `is_featured`, `featured_rank`. Il n'y a **pas** de champ repère ni de champ de visibilité du numéro : il faut les ajouter.
- **`app/api/v1/tailors.py`.**
  - `GET /tailors` : recherche par `q`, `city`, `quartier`, `lat`/`lng` + `sort=proximity` ; calcul de `distance_km` ; les tailleurs mis en avant passent en tête.
  - `GET /tailors/{id}` : profil public, sans téléphone.
  - `PATCH /tailors/me` : `shop_name`, `city`, `quartier`, `bio`.
- **`app/schemas/users.py`.** `TailorProfileOut` et `TailorProfilePublicOut` (ce dernier ajoute `distance_km`).
- **`app/api/v1/orders.py`.**
  - `POST /orders` (rôle client) : `tailor_id`, `measurement_id` (obligatoire), `garment_model_id`, `client_notes`, `reception_mode`, `desired_date`, `budget_amount`. Notifie le tailleur.
  - `accept` / `decline` / `status` / chat : existent déjà.
- **`app/models/tailor_tools.py`.**
  - `TailorJob` : `agreed_price`, `advance_received`, `status`, `delivery_date`, `finished_at`, `tailor_client_id`.
  - `TailorClient` : `full_name`, `phone`, `linked_user_id`.
- **`app/api/v1/tailor_space.py`.**
  - CRUD des travaux. `_check_job_amounts` impose avance ≤ prix et montants ≥ 0.
  - Partage de fiche : `POST /tailor/clients/{id}/share` → `/api/public/fiches/{token}`.
- **Schéma de base.** Pas d'Alembic. On passe par `create_all`, puis `scripts/sync_sqlite_columns.py --apply` ajoute les colonnes manquantes, y compris sur PostgreSQL en prod. Une colonne ajoutée doit donc être **nullable ou avoir une valeur par défaut**. Une nouvelle table est créée automatiquement.
- **Tests.** Ce sont des scripts : `./venv/Scripts/python.exe -m tests.test_xxx` depuis `backend/`. Prends `tests/test_tailor_space.py` comme modèle de style.

### Web (`web/`, Next.js 15, CSP stricte)

- **`src/lib/contact.ts`** : `whatsappHref(phone, text?)`, `openNewContact(name, phone)`, `copyText`, `digitsOnly`, `isAndroid`. Les intents Android ont un repli sur `wa.me` ou sur un `.vcf`.
- **Modèle d'interface pour le contact** : la fiche client du tailleur, `src/app/tailleur/clients/[id]/page.tsx`. Elle a les boutons Appeler (avec copie du numéro), WhatsApp et Ajouter aux contacts. Reproduis le même rendu côté client.
- **`src/lib/validation.ts`** : `phoneError`, `nameError`, `amountError`, `todayISO`… Tous les contrôles de saisie passent par ce fichier.
- **`src/lib/selection.ts`** : la sélection de modèles du client (« Mes modèles »), stockée dans localStorage. Fonctions : `getSelection()`, `isSelected(id)`.
- **`src/lib/api/endpoints.ts`** : il a déjà les appels `/tailors` (liste, détail) et `/orders` (create, list, get, chat). **Le client n'a encore aucune page qui les utilise.**
- **`src/lib/api/tailor.ts`** : l'API de l'espace tailleur (travaux, commandes, clients, patrons).
- **`src/components/Shell.tsx`** : la navigation.
  - Client : Accueil, Modèles, Mes mesures, Profil.
  - Tailleur : Accueil, Clients, Travaux, Patrons, Profil.
- **`src/components/profile.tsx`, `src/components/ui.tsx`** : les composants de profil et les composants de base (Button, PageHeader, Chip, EmptyState, ErrorBanner, Spinner).
- **`next.config.ts`**.
  - La politique `Permissions-Policy` contient **`geolocation=()`**, ce qui bloque la géolocalisation. Passe-la à `geolocation=(self)`.
  - `connect-src 'self'` : tous les appels passent par `/api` (rewrites). Ne fais aucun appel direct à un domaine tiers.
  - Les liens externes (wa.me, maps.google.com, tel:) restent possibles : ce sont des navigations, pas des fetch.

## 4. Travaux à faire

### 4.1 Backend : profil tailleur public et contact

1. **Ajouter à `TailorProfile`** :
   - `landmark` : `String(255)`, nullable (repère) ;
   - `show_phone` : `Boolean`, défaut `True`.
2. **`TailorProfilePatchIn`** : accepter `landmark`, `show_phone`, `lat`, `lng`.
   - Les coordonnées doivent être plausibles : lat entre -90 et 90, lng entre -180 et 180. Envoyer les deux à `null` efface la position.
3. **Exposer `landmark`** dans `TailorProfileOut`, et donc dans les routes publiques. Ne jamais y mettre le téléphone.
4. **Nouvelle route `GET /tailors/{id}/contact`**, réservée aux utilisateurs connectés, tous rôles confondus.
   - Elle renvoie `{ "phone": "+237…" | null, "whatsapp": bool }`.
   - Elle renvoie `null` si `show_phone` vaut faux ou si le compte n'a pas de numéro.
   - Ajoute une limite de débit simple si un mécanisme existe déjà dans le projet : cherche ce qu'utilisent `auth.py` et `security`.
5. **`GET /tailors`** :
   - ne lister que les tailleurs dont le compte est actif : vérifie les champs de `User` (`is_active`, suspension…) ;
   - ajouter un paramètre `garment` facultatif seulement si une donnée de spécialité existe déjà. Sinon, n'invente rien.

### 4.2 Web côté client : annuaire et profil d'un tailleur

1. **Nouvelle entrée de navigation client « Tailleurs »** dans `Shell.tsx`, entre Modèles et Mes mesures, avec une icône existante de `icons.tsx` (`IconTailor`).
2. **Page `src/app/(client)/tailleurs/page.tsx`** :
   - recherche texte ;
   - menu déroulant de ville, construit à partir des villes présentes dans la liste ;
   - tri « Mieux notés » ou « Plus proches ». « Plus proches » demande la position du navigateur ; en cas de refus, affiche un message clair et reviens au tri par note.
   - Chaque carte montre : photo d'atelier ou initiale, nom de l'atelier, ville · quartier, distance si connue, note. Le badge « vérifié » n'apparaît que si `verification_enabled` est vrai.
   - Les états vide, chargement et erreur reprennent les composants de `ui.tsx`.
3. **Page `src/app/(client)/tailleurs/[id]/page.tsx`** :
   - **En-tête** : photo, nom, bio.
   - **Bloc « Où le trouver »** : ville, quartier, repère. Si `lat`/`lng` existent, un bouton « Itinéraire » ouvre `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`. Sinon, un bouton « Voir sur la carte » ouvre `https://www.google.com/maps/search/?api=1&query=<repère, quartier, ville>`.
   - **Bloc « Contacter »**, quand l'utilisateur est connecté et que le numéro est disponible :
     - **Appeler** : `tel:` + copie du numéro dans le presse-papiers, avec un toast « Numéro copié », comme côté tailleur.
     - **WhatsApp** : `whatsappHref(phone, message)`, avec ce message :
       > Bonjour {nom de l'atelier}, je vous contacte depuis l'application Sur-MeZur (https://sur-me-zur.vercel.app). J'aimerais vous parler d'une commande de couture.
       Si une commande vient d'être envoyée à ce tailleur (voir 4.3), ajoute : « Je viens de vous envoyer ma commande n° {6 premiers caractères de l'id} avec mes mesures sur Sur-MeZur. »
     - **Enregistrer le contact** : `openNewContact("{nom de l'atelier} (tailleur Sur-MeZur)", phone)`.
   - **Invité** : un bandeau « Connectez-vous pour contacter ce tailleur », avec un lien vers la connexion et un retour vers ce profil après connexion. Vérifie comment `RequireRole` et `AuthProvider` gèrent la redirection.
   - **Numéro masqué** : « Ce tailleur préfère être contacté par commande Sur-MeZur ».
   - **Bouton principal « Envoyer mes mesures »** : il mène au parcours 4.3.

### 4.3 Web côté client : envoyer ses mesures (et un modèle) au tailleur

Écran ou feuille `src/app/(client)/tailleurs/[id]/commander/page.tsx`, réservé au rôle client. Il contient :

1. **Choix de la fiche de mesures** : la liste du client via MeasurementsApi, la plus récente présélectionnée.
   - Le client n'a aucune mesure : « Prenez d'abord vos mesures », avec un lien vers `/mesures/nouvelle`.
2. **Modèle (facultatif)** :
   - « Aucun modèle » par défaut ;
   - sinon, le choix parmi les modèles de `getSelection()`, avec vignette et nom, que tu récupères via l'API catalogue ;
   - si l'écran est ouvert depuis la fiche d'un modèle (`?modele=<id>`), ce modèle est présélectionné.
3. **Champs de la commande** :
   - mode de réception (valeurs de l'enum `ReceptionMode`) ;
   - date souhaitée (≥ aujourd'hui, via `todayISO`) ;
   - budget indicatif facultatif (`amountError`) ;
   - note libre (2000 caractères maximum).
4. **Envoi** : `POST /api/orders`, puis un écran de confirmation avec deux boutons :
   - « Prévenir le tailleur sur WhatsApp », avec le message enrichi du 4.2 ;
   - « Voir ma commande ».
5. **Pages « Mes commandes » du client** : `src/app/(client)/commandes/page.tsx` et `[id]`.
   - Statut, tailleur, mesures et modèle envoyés, prix convenu une fois accepté.
   - Messagerie de la commande, via le chat existant.
   - Accès depuis le Profil client, et depuis l'Accueil s'il y a des commandes en cours.
6. **Point d'entrée depuis la fiche d'un modèle** (`/modeles/[id]`) : un bouton secondaire « Faire coudre par un tailleur » ouvre l'annuaire avec `?modele=<id>`, et ce paramètre suit jusqu'au formulaire.

### 4.4 Web côté tailleur : localisation, contact et commandes reçues

1. **`/tailleur/profil`** : ajouter les champs suivants.
   - **Repère.**
   - **Position** : bouton « Utiliser ma position » (navigator.geolocation, précision affichée), bouton « Effacer » et aperçu « Itinéraire » via un lien Google Maps.
   - **Case** « Afficher mon numéro aux clients ».
   - Ville et quartier sont déjà là : garde-les.
2. **`/tailleur/commandes/[id]`** :
   - vérifie que le tailleur voit le **nom et le téléphone du client** et dispose des mêmes boutons Appeler, WhatsApp et Contacts ;
   - si la route de commande ne renvoie pas le téléphone du client au tailleur participant, ajoute-le côté API, pour ce tailleur seulement ;
   - ajoute le bouton « Ajouter à mon carnet » : il crée un `TailorClient` avec `linked_user_id` et copie la fiche de mesures envoyée. S'il existe déjà un client de carnet lié à ce compte, le bouton propose de mettre ses mesures à jour au lieu d'en créer un second.
3. **Acceptation d'une commande** :
   - aujourd'hui, l'appel web `acceptOrder` n'envoie pas `agreed_price` ; ajoute un champ « Prix convenu » facultatif (`amountError`) dans la boîte d'acceptation ;
   - quand le tailleur accepte, propose « Créer le travail correspondant » : un `TailorJob` prérempli avec le client du carnet, le modèle, la date et le prix. Ce travail alimente ensuite les finances.

### 4.5 Finances du tailleur (page simple)

**Modèle** : nouvelle table `tailor_income_entries`.

- Champs :
  - `id`, `tailor_id` (indexé), `amount` (`Numeric(12,2)`, > 0), `received_on` (`Date`) ;
  - `label` (`String(255)`) ;
  - `method` (`cash` | `mobile_money` | `virement` | `autre`, chaîne) ;
  - `job_id` (FK vers `tailor_jobs`, nullable), `created_at`.
- **Lien avec l'avance d'un travail.** Quand une entrée est liée à un travail, `advance_received` du travail **devient la somme des entrées de ce travail**, recalculée côté serveur à chaque ajout ou suppression. `_check_job_amounts` doit toujours s'appliquer : refuser une entrée qui ferait dépasser le prix convenu.
- **Reprise des avances déjà saisies.** Au premier accès aux finances d'un tailleur, pour chaque travail qui a `advance_received > 0` et aucune entrée liée, crée une entrée « Avance (reprise) » datée du `created_at` du travail. Elle doit être idempotente.
- **Saisie de l'avance dans le formulaire d'un travail.** Si l'avance est modifiée directement dans le formulaire, ajuste-la par une entrée de différence (« Ajustement de l'avance ») plutôt que de casser la cohérence. Si tu trouves plus simple et plus sûr de rendre ce champ calculé, en lecture seule, avec un bouton « Encaisser un paiement », fais-le et dis-le.

**API**, dans `tailor_space.py` ou un nouveau module `tailor_finances.py`, rôle tailleur, données du tailleur courant uniquement :

- `GET /api/tailor/finances?from=YYYY-MM-DD&to=YYYY-MM-DD` renvoie `{ total_encaisse, reste_a_encaisser, par_mois: [{mois, total}], entrees: [...] }`. `reste_a_encaisser` vaut la somme de (`agreed_price` − `advance_received`) sur les travaux non annulés qui ont un prix.
- `POST /api/tailor/finances/entries`, `DELETE /api/tailor/finances/entries/{id}`. La modification est facultative : supprimer puis recréer suffit.

**Web** : page `/tailleur/finances`, accessible depuis l'accueil tailleur avec une carte « Finances », et depuis le profil. Ne la mets pas dans la barre du bas, qui compte déjà 5 entrées.

- **En haut**, trois chiffres :
  - « Encaissé ce mois », avec le mois précédent en comparaison ;
  - « Encaissé sur la période » ;
  - « Reste à encaisser ».
- **Sélecteur de période** : ce mois, mois dernier, 3 mois, année, tout.
- **Bouton « Ajouter une entrée »** : montant, date (défaut aujourd'hui), libellé, mode, travail lié facultatif.
- **Liste chronologique des entrées**, avec suppression confirmée.
- **Sur la fiche d'un travail**, un bouton « Encaisser un paiement » qui ouvre le même formulaire, lié à ce travail.
- **Monnaie : FCFA.** Montants affichés avec séparateur d'espaces (`toLocaleString("fr-FR")`), sans décimales.
- **Graphique** : un histogramme simple par mois, en SVG fait à la main, ou pas de graphique du tout. Aucune nouvelle dépendance lourde.

## 5. Contrôles de sécurité et de données

- Un tailleur ne lit ni ne modifie que **ses** entrées, travaux et commandes. Écris un test qui le vérifie avec deux tailleurs.
- `GET /tailors` et `GET /tailors/{id}` ne renvoient jamais de téléphone ni d'e-mail.
- `GET /tailors/{id}/contact` renvoie 401 sans connexion, et `phone: null` quand `show_phone` vaut faux.
- Un client ne peut créer une commande qu'avec **sa propre** fiche de mesures : vérifie que `measurement_id` appartient bien au client. Si `create_order` ne le contrôle pas encore, ajoute le contrôle et un test.
- Montants : > 0, plafond raisonnable (10 000 000), avance ≤ prix.
- Pas de photo de personne dans les tests : utilise des images de synthèse, comme les tests existants.

## 6. Tests attendus avant d'annoncer « terminé »

1. **Backend.** Un nouveau script `backend/tests/test_client_tailleur.py` couvre :
   - annuaire et recherche ;
   - contact (401, numéro masqué, numéro visible) ;
   - commande avec une mesure d'autrui refusée ;
   - commande avec mesure + modèle reçue par le tailleur ;
   - « Ajouter à mon carnet » sans doublon ;
   - finances : entrée, recalcul de l'avance, refus si l'avance dépasse le prix, reprise idempotente, isolement entre tailleurs, totaux par mois.
   Relance aussi `test_tailor_space`, `test_patrons`, `test_admin_web`, `test_securite` et `test_catalogue` : tous doivent finir à **0 échec**.
2. **Schéma.** Lance `python scripts/sync_sqlite_columns.py` (sans `--apply`) sur une base locale ancienne : il doit annoncer `landmark` et `show_phone`.
3. **Web.** Lance `npm run build` dans `web/`, puis `next start -p 3005`. Un `next dev` ne reproduit pas la CSP.
4. **Navigateur réel** : Playwright avec Edge, viewport mobile 390×844. Parcours :
   - un invité ouvre l'annuaire et voit « Connectez-vous pour contacter » ;
   - un client se connecte, ouvre un tailleur, contrôle le lien WhatsApp et le texte pré-rempli, puis envoie une commande avec mesure + modèle ;
   - le tailleur voit la commande, l'accepte avec un prix, crée le travail, encaisse une avance ;
   - les finances montrent le bon total ;
   - aucune erreur dans la console, aucune violation de CSP ;
   - le bouton « Utiliser ma position » fonctionne : Playwright `geolocation` + `permissions`.
5. **Rapport à l'utilisateur.** Un résumé de ce qui marche, de ce qui n'a pas été fait et pourquoi, et des commandes VPS à lancer : `mettre_a_jour.sh`, pour que les nouvelles colonnes et la nouvelle table soient créées.

## 7. Ordre conseillé

1. Backend 4.1, puis les tests correspondants.
2. Web 4.2 : annuaire et profil, avec le contact.
3. Web 4.3 : commande, plus les pages « Mes commandes ».
4. 4.4 côté tailleur, avec `Permissions-Policy`.
5. 4.5 finances, backend puis web.
6. Tests complets (§6), puis demande à l'utilisateur l'accord pour commiter et pousser.

Fais un commit par grand bloc, une fois l'accord obtenu. Messages en français, au style des commits existants (`git log --oneline -15`).
