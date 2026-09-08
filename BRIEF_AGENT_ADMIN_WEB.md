# Brief — Portage de la section ADMIN vers l'application web Next.js

> Document destiné à un agent qui démarre sans contexte préalable sur ce dépôt.
> Tout ce qui est nécessaire pour travailler est ici ; rien n'est supposé connu.

---

## 1. Mission en une phrase

Porter **la section administrateur** de l'application mobile React Native vers la
nouvelle application web Next.js située dans `web/`, en la rendant **100 %
responsive et mobile-first**.

**Rien d'autre.** Un second agent construit en parallèle le parcours client
(catalogue, prise de mesure, téléchargement de la fiche). Le périmètre est
strictement disjoint — voir §7 pour la liste des fichiers à ne pas toucher.

---

## 2. Le dépôt

Racine : `c:\Users\Admin\Desktop\Sur-MeZur\Sur-MeZur-App`

| Dossier | Rôle |
|---|---|
| `backend/` | API FastAPI + SQLAlchemy + SQLite. C'est la source de vérité des endpoints. |
| `mobile/` | Application React Native / Expo SDK 54. **Référence fonctionnelle de ta mission.** |
| `frontend/` | Ancien front web en Vite + React. **Obsolète**, en cours de remplacement par `web/`. À consulter pour inspiration seulement. |
| `web/` | **Nouvelle application Next.js. C'est là que tu écris.** |

Environnement : Windows, PowerShell et Git Bash disponibles. Node 24, npm 11.

---

## 3. Contexte du projet

Sur-MeZur met en relation des clients et des tailleurs au Cameroun. Un client
prend deux photos de lui, une chaîne de vision par ordinateur en extrait ses
mensurations, puis il commande un vêtement sur mesure.

L'administrateur est le tiers de confiance de la plateforme : c'est lui qui
vérifie les tailleurs (ce qui rend crédible le badge « profil vérifié »),
modère le catalogue et les avis, arbitre les litiges et fixe les paliers de
commission.

**La version web est volontairement réduite** au parcours de prise de mesure
côté client — plus la section admin complète, que tu portes. Il n'y a
**aucun côté tailleur** dans la version web.

---

## 4. État de `web/` — le socle est déjà écrit

`web/` est une application **Next.js 15, App Router, TypeScript, dossier `src/`,
alias d'import `@/*`**, scaffoldée à la main (`create-next-app` bloquait sur une
invite interactive).

### 4.1 Fichiers déjà en place

```
web/
├── package.json          next 15.5.4, react 19.1.1
├── tsconfig.json         alias "@/*" -> "./src/*"
├── next.config.ts        rewrites /api/* et /uploads/* -> API_ORIGIN
├── .env.local            API_ORIGIN=http://localhost:8000
├── .env.production       API_ORIGIN=http://api.gitingeniering.com
└── src/
    ├── app/layout.tsx            layout racine (polices, viewport, AuthProvider)
    ├── components/
    │   ├── ui.tsx                kit d'interface partagé
    │   ├── Shell.tsx             coquille de navigation + ADMIN_NAV
    │   ├── AuthProvider.tsx      session courante
    │   └── RequireRole.tsx       garde de route
    ├── lib/
    │   ├── api/{client,endpoints,types}.ts
    │   ├── measurements.ts       vocabulaire des mesures (parcours client)
    │   └── i18n.{fr,en}.json
    └── styles/
        ├── globals.css           tokens CSS + base + @media print
        ├── shell.css             coquille responsive
        └── ui.css                kit d'interface
```

### 4.2 Le proxy API — important

`next.config.ts` réécrit `/api/*` et `/uploads/*` vers le backend. Le code
client garde donc des **chemins relatifs**. Conséquence : aucune requête
cross-origin, donc **aucune configuration CORS à maintenir**, et aucun problème
de contenu mixte si le site passe un jour en HTTPS avant l'API. N'écris jamais
d'URL absolue vers le backend.

### 4.3 Tokens CSS disponibles (`globals.css`)

```
--violet-primary #5b21b6   --violet-vivid #7c3aed   --violet-deep #4c1d95
--indigo-text #1f2a44      --bg #ffffff             --bg-alt #f4f2f8
--bg-page #eceaf2          --border #e5e1ee         --text-secondary #6b7280
--success #16a34a          --error #dc2626          --pending #d97706
--gradient                 --radius-card 16px       --radius-button 12px
--radius-chip 999px        --shadow-sm/--shadow/--shadow-lg
--font-display (Playfair Display)  --font-body (Inter)
--gutter clamp(16px, 4vw, 24px)    --tabbar-h 64px
--sidenav-w 244px          --header-h 56px
```

### 4.4 Classes utilitaires disponibles

**`shell.css`** — `.shell` `.shellMain` `.container` (max 1180px) `.containerNarrow`
(max 640px) `.tabbar` `.tabItem` `.tabItemActive` `.tabIcon` `.sidenav` `.brand`
`.brandMark` `.header` `.headerTitle` `.backBtn` `.grid` `.gridWide` `.rail`
`.section` `.stack`

**`ui.css`** — `.btn` + `.btnPrimary` `.btnSecondary` `.btnGhost` `.btnDanger`
`.btnBlock` · `.actionBar` · `.card` `.cardElevated` `.cardFlat` · `.field`
`.fieldLabel` `.fieldHint` `.input` `.fieldRow` · `.chipRow` `.chip` `.chipActive`
· `.badge` `.badgeSuccess` `.badgePending` `.badgeError` `.badgeNeutral` ·
`.banner` `.bannerError` `.bannerInfo` · `.muted` `.center` `.spinner` · `.steps`
`.stepDot` `.stepDotDone` · `.no-print` `.print-only` `.tap` `.visually-hidden`

**Grilles fluides** — `.grid` et `.gridWide` utilisent
`repeat(auto-fill, minmax(min(150px, 100%), 1fr))`. Le nombre de colonnes découle
de la largeur disponible, **sans aucun palier écrit à la main**. Préfère-les
systématiquement à des media queries maison.

### 4.5 Composants React disponibles (`@/components/ui`)

`Button` (`variant`: primary|secondary|ghost|danger, `block`) · `Card`
(`variant`: default|elevated|flat) · `Field` (`label`, `hint`) · `Input` ·
`Select` · `Textarea` · `Chip` (`active`) · `Badge` (`tone`) · `ErrorBanner`
(`message`) · `InfoBanner` · `Spinner` (`label`) · `EmptyState` (`icon`,
`title`, `body`, `action`) · `PageHeader` (`title`, `back`, `action`) · `Steps`
(`total`, `current`)

### 4.6 Session et garde de route

```tsx
import { useAuth } from "@/components/AuthProvider";
const { user, loading, role, refresh, logout } = useAuth();
```

```tsx
import { RequireRole } from "@/components/RequireRole";
<RequireRole role="admin">{children}</RequireRole>
```

Le jeton JWT vit dans `localStorage`, le rafraîchissement automatique est géré
dans `lib/api/client.ts`. Tu n'as rien à faire côté authentification.

---

## 5. L'API admin — déjà complète

`web/src/lib/api/endpoints.ts` expose `AdminApi`, que j'ai complété pour qu'il
couvre exactement ce dont l'admin mobile se sert :

```ts
AdminApi.stats()                                   -> AdminStats
AdminApi.users({ role?, q?, active? })             -> User[]
AdminApi.setUserActive(userId, is_active)          -> User
AdminApi.allOrders(status_filter?)                 -> Order[]
AdminApi.pendingVerifications(status?)             -> TailorProfile[]
AdminApi.getVerificationDocuments(tailorId)        -> VerificationDocument[]
AdminApi.decideVerification(tailorId, status, reason?)
AdminApi.disputes()                                -> Order[]
AdminApi.resolveDispute(orderId, resolution, note?)
AdminApi.reviews()                                 -> Review[]
AdminApi.moderateReview(reviewId, status_)
AdminApi.commissionTiers()
AdminApi.categories() / createCategory / updateCategory / deleteCategory
AdminApi.models({ category_id? }) / createModel / updateModel
AdminApi.uploadModelPhotos(modelId, files) / deleteModel
```

Le type `AdminStats` est exporté depuis le même fichier :

```ts
{ clients, tailors, tailors_pending, suspended, orders_total,
  orders_by_status: Record<string, number>, open_disputes,
  pending_reviews, gmv, commission_earned }
```

Toutes les routes `/admin/*` du backend sont protégées par
`dependencies=[Depends(require_roles("admin"))]` au niveau du routeur
(`backend/app/api/v1/admin.py:30`).

**Si un endpoint te manque**, ne l'invente pas : lis
`backend/app/api/v1/admin.py`, et signale-le dans ton compte rendu final.

---

## 6. Ce qu'il faut construire

### 6.1 Référence fonctionnelle : l'admin mobile

**Lis ces fichiers en premier.** Ils font foi pour les fonctionnalités.

| Fichier | Lignes | Contenu |
|---|---|---|
| `mobile/app/admin/(tabs)/overview.tsx` | 226 | Compteurs de la plateforme |
| `mobile/app/admin/(tabs)/verifications.tsx` | 230 | File d'attente, documents, décision |
| `mobile/app/admin/(tabs)/catalog.tsx` | 491 | Catégories et modèles, CRUD, photos |
| `mobile/app/admin/(tabs)/users.tsx` | 200 | Liste, filtres, suspension |
| `mobile/app/admin/(tabs)/commission.tsx` | 55 | Paliers de commission |
| `mobile/app/admin/(tabs)/disputes.tsx` | 67 | Litiges ouverts et arbitrage |
| `mobile/app/admin/orders.tsx` | 108 | Toutes les commandes |
| `mobile/app/admin/reviews.tsx` | 72 | Modération des avis |
| `mobile/app/admin/(tabs)/_layout.tsx` | 47 | Organisation des onglets |

`frontend/src/pages/admin/*.tsx` contient d'anciennes versions web des mêmes
écrans. Elles sont **moins complètes que le mobile** et écrites en styles
inline non responsifs. Consulte-les si tu veux, mais **le mobile fait foi**.

### 6.2 Routes à créer

```
web/src/app/admin/layout.tsx               <RequireRole role="admin"><Shell nav={ADMIN_NAV}>
web/src/app/admin/page.tsx                 redirect() -> /admin/vue-ensemble
web/src/app/admin/vue-ensemble/page.tsx    compteurs AdminApi.stats()
web/src/app/admin/verifications/page.tsx   file d'attente + documents + approuver/rejeter
web/src/app/admin/catalogue/page.tsx       catégories + modèles + upload photos
web/src/app/admin/utilisateurs/page.tsx    liste, filtres rôle/actif, recherche, suspendre
web/src/app/admin/commandes/page.tsx       toutes les commandes, filtre statut
web/src/app/admin/litiges/page.tsx         litiges ouverts + résolution
web/src/app/admin/avis/page.tsx            modération des avis
web/src/app/admin/commission/page.tsx      paliers de commission
```

Tu peux créer des sous-composants dans `web/src/components/admin/`.

### 6.3 Navigation

`ADMIN_NAV` est défini dans `web/src/components/Shell.tsx`. Il pointe
actuellement vers `/admin/verifications`, `/admin/catalogue`, `/admin/litiges`,
`/admin/avis`, `/admin/commission`.

**Tu as le droit de modifier UNIQUEMENT la constante `ADMIN_NAV`** — pas le
reste du fichier — pour y ajouter la vue d'ensemble, les utilisateurs et les
commandes. Vise **5 à 7 entrées** : la colonne latérale les affiche
verticalement, la barre du bas horizontalement.

---

## 7. Fichiers à NE PAS modifier

Ils sont partagés avec le parcours client, développé en parallèle. Les modifier
provoquerait un conflit.

```
web/src/styles/globals.css
web/src/styles/shell.css
web/src/styles/ui.css
web/src/components/ui.tsx
web/src/components/AuthProvider.tsx
web/src/components/RequireRole.tsx
web/src/components/Shell.tsx      (SAUF la constante ADMIN_NAV)
web/src/lib/api/*
web/src/lib/measurements.ts
web/src/app/layout.tsx
web/next.config.ts
```

**S'il te manque une classe CSS**, crée `web/src/styles/admin.css` et importe-la
depuis `web/src/app/admin/layout.tsx`. N'ajoute jamais dans `ui.css`.

Ne touche à rien dans `backend/`, `mobile/`, `frontend/`, `ml/`.

---

## 8. Exigences

### 8.1 Responsive — c'est le point central

L'ancien front web dessinait une colonne fixe de 420 px au milieu de l'écran
(`.app-shell { max-width: 420px }`) : sur un ordinateur on voyait un téléphone
entouré de vide. **C'est précisément ce qu'il faut ne pas reproduire.**

- **Mobile-first strict** : les règles de base décrivent le téléphone ; les
  `@media (min-width: ...)` n'ajoutent que ce que les grands écrans gagnent.
  Jamais de `max-width` en media query.
- Trois paliers seulement : base, `720px`, `1024px`.
- **Aucune largeur fixe en pixels** sur un conteneur. Aucun `max-width: 420px`.
- **Les tableaux de données deviennent des cartes empilées sous 720px.** Un
  tableau qui déborde horizontalement sur téléphone est un échec.
- Cibles tactiles ≥ 44px (`.tap` ou `min-height: 44px`).

### 8.2 Deux pièges déjà rencontrés sur ce projet

1. **Puces de filtre qui s'étirent.** Une rangée de puces en flex hérite
   d'`align-items: stretch` : les puces grandissent ou rétrécissent selon la
   hauteur du contenu voisin. Bug réel constaté sur l'admin mobile.
   `.chipRow` corrige déjà cela avec `align-items: flex-start` — utilise-la.
2. **Contenu masqué par une barre fixe.** La barre d'onglets du bas est en
   `position: fixed`. `.shellMain` réserve déjà `--tabbar-h` en bas ; ne
   l'annule pas.

### 8.3 Conventions de code

- `"use client";` en première ligne de tout composant utilisant des hooks ou l'API.
- **Interface en français**, avec accents.
- **Commentaires de code sans accents** — convention suivie par tout le dépôt.
- Commente le **pourquoi** des décisions non évidentes, jamais le **quoi**.
  Pas de commentaire décoratif, pas de bannière ASCII superflue.
- Style sobre, aligné sur les fichiers existants de `web/src/`.

### 8.4 Les trois états de chaque écran

Systématiquement : **chargement** (`<Spinner/>`), **vide** (`<EmptyState/>`),
**erreur** (`<ErrorBanner/>`). Un écran qui reste blanc pendant un chargement
ou qui avale une erreur silencieusement est à refaire — ce défaut précis a déjà
coûté plusieurs jours de débogage sur ce projet.

---

## 9. Vérification

```bash
cd web
npx tsc --noEmit      # doit passer sans erreur
```

`npm install` tourne peut-être encore au moment où tu démarres. Vérifie que
`web/node_modules/next` existe avant de lancer le typecheck ; sinon relance
`npm install` dans `web/` et attends.

Ne lance pas `npm run build` : c'est long et le typecheck suffit à valider ton
travail.

---

## 10. Compte rendu attendu

À la fin, rends un résumé **court et factuel** :

1. Fichiers créés.
2. Ce qui est fonctionnel et que tu as réellement vérifié.
3. Ce que tu n'as pas pu faire, et pourquoi.
4. Tout endpoint backend manquant que tu as dû contourner.
5. Toute hypothèse que tu as prise faute d'information.

Distingue explicitement **ce que tu as vérifié** de **ce que tu supposes**. Ne
présente jamais un écran non testé comme fonctionnel.
