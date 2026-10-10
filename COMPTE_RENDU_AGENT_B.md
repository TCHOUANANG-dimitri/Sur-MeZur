# Compte rendu — Agent B, produit web (08/10/2026)

Toutes les tâches B0 à B5 sont livrées dans l'arbre de travail, **sans commit**
(choix de l'utilisateur : travail sur `main`, travail en cours de l'Agent A
laissé intact). Contrôles passés : `npx tsc --noEmit` (0 erreur) et
`npm run build` (34 routes, OK), plus vérification HTTP des pages servies en
local (`/` statique avec le h1, manifeste JSON valide, `/telecharger`,
`/contact`, `/hors-connexion`, `/tailleur`, `/inscription`, `/connexion`).

## B0 — Mise en place

- La branche `agent-a/plateforme` n'existe pas ; le travail de l'Agent A est
  non committé sur `main`, et `CONTRAT_API_TAILLEUR.md` n'existe pas encore.
  Sur décision de l'utilisateur : **travail direct sur `main`, rien committé**.
- Convention de commit notée pour plus tard (français + `Co-Authored-By`).

## B1 — Page d'accueil `/`

- `web/src/app/page.tsx` (serveur, statique, 0 appel API) + `accueil-notes.md`
  (sources et 10 principes), `styles/accueil.css`, `HomeRedirect.tsx` (client
  connecté → `/accueil`, tailleur → `/tailleur`, admin → `/admin`).
- 7 sections : bandeau principal (CTA « Prendre mes mesures » → `/mesurer`,
  secondaire « Je suis tailleur » → `#tailleurs`, visuel SVG face+profil
  réutilisé de `Silhouettes.tsx`), confiance (4 faits vérifiables, **aucun
  chiffre inventé**), 3 étapes, deux publics, patron-aperçu en SVG, FAQ
  (5 questions), appel final + pied de page (contact, aide, conditions,
  confidentialité, `/telecharger`). Aucun prix. Métadonnées FR + Open Graph
  (`sur-me-zur.vercel.app`, image `/logo.png`).
- Acquisition : `AcquisitionTracker` dans `layout.tsx` + `lib/acquisition.ts`
  (`utm_*`, `ref`, `code`, chemin d'arrivée, 30 jours, `try/catch`).
- Bandeau/maintenance : `SiteBanner` (`/api/public/config`, tons
  info/alerte/promo, refermable, écran de maintenance sur `enabled` ou
  événement `smz:maintenance`).

## B2 — Inscription, connexion, pages de service

- `/inscription` : choix client/tailleur (aussi sur `/mesurer/resultat/[id]`,
  via `?role=`), `guest_token` converti dans les deux cas, champs tailleur
  facultatifs (atelier, ville depuis `config.cities`, quartier), question
  d'origine si `signup_source_question` + champ libre si « Autre », code
  parrainage/promo (prérempli depuis `?code=` ou le suivi), `acquisition`
  envoyée. Rôle tailleur → `/tailleur`.
- `/connexion` : écran code à 6 chiffres si `mfa_required` (`AuthApi.mfa`),
  `must_change_password` → `/changer-mot-de-passe`, tailleur → `/tailleur`.
- Nouveau `/changer-mot-de-passe` (ancien + nouveau, retour au parcours).
- `/mot-de-passe-oublie` : 503 → message « Contactez le support… » + lien
  `/contact`. Nouveau `/contact` (nom, téléphone ou e-mail si visiteur,
  catégorie, objet, message → `PublicApi.contact`, confirmation avec n°).
- Nouveau `/infos/[slug]` (faq, conditions, confidentialité, Markdown sûr
  via `lib/markdown.ts`, copie de `renderMarkdown` admin).
- `PhoneField` : `stripToLocal` — un numéro collé avec indicatif (`+237…`,
  `00237…`, `237…`) ou 0 initial ne produit plus `+237237…`.
- `password.ts` aligné sur la nouvelle règle : **6 à 64 caractères, au moins
  une lettre et un chiffre**.

## B3 — Espace tailleur `/tailleur`

- `lib/api/tailor.ts` (contrat section 5) + `lib/api/tailor.mock.ts`
  (**même signature exacte**, `NEXT_PUBLIC_TAILOR_MOCK=1` dans `.env.local`,
  persistance locale) : l'espace est utilisable de bout en bout sans backend.
  À retirer du mock au fil des livraisons de l'Agent A.
- Pages : accueil (semaine / retard / nouvelles commandes + 3 gros boutons),
  clients + fiche (recherche, ajout 3 champs, appeler, WhatsApp, notes,
  historique mesures/travaux), mesurer (photo via `MeasureFlow` branché sur
  les routes tailleur grâce au nouveau prop `sessionApi`, ou mètre ruban),
  fiche imprimable (classes `.fiche*` reprises) + partage WhatsApp
  (lien public expirant, page `/fiches/[token]`), travaux (CRUD, filtres
  semaine/retard, avance reçue et reste = simple note), commandes reçues
  (accepter/refuser + motif, statuts, chat, modèle + mesures quand
  accessibles — **ni offre, ni devis, ni paiement**), patrons (photo
  compressée, type, client ou saisie libre, attente 2 s, SVG zoomable,
  impression A4, pièces, bandeau « Aperçu »), profil (atelier, ville,
  quartier, présentation, langue, déconnexion — **aucun écran de
  vérification**). `TAILOR_NAV` dans `Shell.tsx`.
- Côté client : vérifié, **aucun montant ni paiement** dans l'envoi de
  commande web (déjà conforme, rien à retirer).
- **Non porté (demandé)** : Finances/commissions, négociation 3 offres,
  devis, Mobile Money/séquestre, vérification, **prêt-à-porter** (voir
  question 1).
- Hypothèses à confirmer dans `CONTRAT_API_TAILLEUR.md` : historique mesures
  `GET /tailor/clients/{id}/measurements`, `PATCH /tailors/me`, filtre
  `client_id` sur `GET /tailor/jobs`.

## B4 — PWA

- `manifest.ts` (standalone, `#5b21b6`, 192/512 + maskable générées depuis
  `logo-mark.png`), `public/sw.js` (prod seulement via `SwRegister`,
  navigations → `/hors-connexion`, statiques en cache, **jamais `/api/*`**).

## B5 — Android + `/telecharger`

- Choix **TWA Bubblewrap** (justifié dans `android-twa/README.md` : < 1 Mo,
  caméra via Chrome, MAJ sans republier ; Capacitor en repli documenté).
- `twa-manifest.json` (`com.surmezur.app`, `minSdkVersion: 21`, notifications
  off), `generate-keystore.ps1` (**hors dépôt**, `.gitignore` racine :
  `*.keystore`, `*.jks`, `android-twa/app/build/`), `assetlinks.json` avec
  empreinte **à remplacer après génération de la clé** (Content-Type forcé
  dans `web/vercel.json`), `/telecharger` (bouton APK via `NEXT_PUBLIC_APK_*`,
  version/taille, 3 étapes sources inconnues, alternative PWA Chrome,
  consignes iPhone).
- **APK non construit ici** (pas de SDK Android dans cet environnement) :
  taille et tests à consigner après `bubblewrap build` (caméra, connexion,
  retour arrière sur émulateur ou téléphone).

## Vérifications non faites ici (à faire sur l'aperçu Vercel)

- Captures 375 px / 1440 px de chaque écran ; Lighthouse mobile ≥ 90
  (perf/a11y/SEO, LCP < 2,5 s) et « Installable » dans Chrome ; test APK.
  Le CSS est mobile d'abord (base une colonne, paliers 560/720/1024),
  cibles ≥ 44 px, `alt`/`aria` posés.

## Dépendances ajoutées

Aucune. Fichiers créés : voir `git status` (accueil, tailleur ×12, contact,
infos, fiches, telecharger, hors-connexion, changer-mot-de-passe, api
tailleur + mock, css, manifest, sw, android-twa ×3, assetlinks, ce rapport).

## Questions pour l'utilisateur

1. **Prêt-à-porter** : confirmé hors scope v1 (fonction de vente, hors cap
   « mesure et patron ») — le réintégrer plus tard côté tailleur ?
2. Domaine à acheter : changer `host`, `assetlinks.json` et URL du manifeste.
3. `NEXT_PUBLIC_APK_URL/VERSION/SIZE` à renseigner après la release GitHub.
4. Empreinte SHA-256 réelle à inscrire dans `assetlinks.json` + § TWA du
   README après `generate-keystore.ps1`.
5. Règle mot de passe 6–64 confirmée côté Agent A ? (déjà appliquée ici).
6. Fusion vers `main`/branche `agent-b/produit-web` : quel nom, et quand ?
