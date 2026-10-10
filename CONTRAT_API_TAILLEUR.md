# Contrat d'interface Agent A (API) ↔ Agent B (web tailleur)

> Figé par l'Agent A le 08/10/2026, branche `agent-a/plateforme`.
> Base : `https://sur-me-zur.vercel.app/api` (proxy Vercel → VPS, en-tête
> `X-SMZ-Platform: web` déjà géré côté client).
> Authentification : `Authorization: Bearer <access_token>`, rôle `tailor`
> (sauf routes marquées « public »).
> Dates : ISO 8601. Montants : nombres (FCFA). Erreurs : `{detail: "..."}` en
> français. Si ce contrat doit changer, l'Agent A met à jour ce fichier et
> prévient l'Agent B — jamais l'inverse.

## 0. Fonctionnalités (lues par le front au chargement)

`GET /api/public/config` (public) → contient désormais :

```json
{
  "banner": {...}, "maintenance": {...}, "cities": [...],
  "signup_source_question": true,
  "features": {
    "tailor_verification": false,
    "payments": false,
    "negotiation": false,
    "pattern_generation": "preview"
  }
}
```

- `tailor_verification=false` : ne pas afficher les badges « vérifié » comme
  une garantie. Les réponses tailleurs portent `verification_enabled: false`.
- `payments=false` : aucune transaction ; `agreed_price` et
  `advance_received` sont de simples informations saisies par le tailleur.
- `negotiation=false` : pas de négociation de prix (voir §4).
- `pattern_generation="preview"` : `"off"` cache l'écran Patrons ;
  `"preview"` affiche l'écran avec la mention « Aperçu » ; `"on"` = futur
  vrai moteur (même contrat).

## 1. Inscription / connexion tailleur

`POST /api/auth/register` — `role` vaut `client` ou `tailor`.

```json
{
  "role": "tailor", "phone": "+2376XXXXXXXX", "full_name": "Awa Ndi",
  "password": "xxxxx1", "city": "Douala", "quartier": "Akwa",
  "shop_name": "Atelier Awa", "guest_token": "<jwt d'invité, optionnel>",
  "acquisition": {"source": "facebook", "utm": {"utm_source": "..."}}
}
```

- `shop_name`, `city`, `quartier` : facultatifs.
- Avec `guest_token` valide : le compte invité est converti (profil client
  conservé, profil tailleur créé) et sa mesure d'essai devient l'entrée
  « Moi (mesure d'essai) » du carnet.
- Réponse `TokenOut` :
  `{access_token, refresh_token, token_type: "bearer", user_id, role,
  must_change_password, mfa_required, mfa_token}`.
- Mot de passe : **6 à 64 caractères** (au moins une lettre et un chiffre
  obligatoires), appliqué à l'inscription, au changement et à la
  réinitialisation (Agent B : aligner `web/src/lib/password.ts` dessus).

`POST /api/auth/password/reset/request` → **503** tant que la
réinitialisation en libre-service est fermée :

```json
{"detail": "Contactez le support : un mot de passe provisoire vous sera communiqué."}
```

→ L'écran « mot de passe oublié » (Agent B) affiche ce message + un lien
vers `/contact`. Le secours est le mot de passe provisoire créé par un admin.

## 2. Tableau de bord

`GET /api/tailor/dashboard` →

```json
{
  "orders_by_status": {"new": 3, "in_progress": 2, "ready_for_pickup": 1},
  "jobs_due_week": [<job>, ...],
  "jobs_late": [<job>, ...],
  "clients_count": 12
}
```

`orders_by_status` ne contient que les statuts présents (zéro absent = 0).

## 3. Carnet de clients

### `GET /api/tailor/clients?q=`

`q` : recherche nom ou numéro (facultatif). Réponse : liste de

```json
{
  "id": "uuid", "full_name": "Awa Ndi", "phone": "+2376XXXXXXXX",
  "gender": "female", "notes": "...", "linked_user_id": "uuid ou null",
  "created_at": "2026-10-08T...", "last_measurement_at": "... ou null",
  "last_measurement_source": "manual|photo ou null", "open_jobs": 2
}
```

### `POST /api/tailor/clients` → 201, même objet

Corps : `{full_name*, phone?, gender?, notes?, linked_user_id?}`.
`linked_user_id` : id d'un compte **client** existant (vérifié, 400 sinon).
Le numéro est normalisé côté serveur (`00237…`, `237…`, `0…`, espaces).

### `GET /api/tailor/clients/{id}`

Objet client + `"measurements": [<measurement>, ...]` (50 dernières,
récentes d'abord) + `"jobs": [<job>, ...]`.

`<measurement>` :

```json
{
  "id": "uuid", "data": {"chest": 94.0, "waist": 78.0, ...},
  "source": "manual|photo", "height_cm": 168.0, "weight_kg": 65.0,
  "note": "...", "measurement_id": "uuid ou null", "created_at": "..."
}
```

`data` : les 12 clés de couture
(`neck chest waist hips biceps thigh wrist ankle shoulder sleeve_length
inseam back_length`), valeurs en cm, clés absentes = non mesurées.

### `PATCH /api/tailor/clients/{id}` → objet client

Champs partiels (`full_name phone gender notes linked_user_id` ;
`linked_user_id: ""` ou `null` pour délier).

### `DELETE /api/tailor/clients/{id}` → 204

Retire la fiche du carnet, **sans** effacer mesures ni travaux.

## 4. Mesures d'un client du carnet

### Saisie manuelle

`POST /api/tailor/clients/{id}/measurements` → 201, `<measurement>`

```json
{"data": {"chest": 94, "waist": 78}, "height_cm": 168, "weight_kg": 65, "note": "..."}
```

- `data*` : au moins une des 12 clés, nombres entre 5 et 300, clés
  inconnues refusées (400).
- `height_cm / weight_kg / note` : facultatifs.

### Mesure par photo (chaîne de vision, asynchrone)

1. `POST /api/tailor/clients/{id}/measure-session` → 201
   Corps JSON : `{"height_cm": 168, "weight_kg": 65, "gender": "female|male"}`
   Réponse : `{"id": "<session>", "status": "processing", "tailor_client_id": "..."}`
2. `POST /api/tailor/measure-session/{sid}/photos` — `multipart/form-data`,
   `front*` (requis), `side` (facultatif), 10 Mo max, JPEG/PNG/WEBP/GIF.
   Réponse : `{"id": "<session>", "status": "processing"}`
3. `GET /api/tailor/measure-session/{sid}` — sondage :
   `{"id", "status": "processing|ready|failed", "measurement_id" ou null,
   "error_message" ou null, "tailor_client_id", "measurement": <measurement>
   ou null}` (présent quand `ready`).

En cas d'échec : `status: "failed"`, `error_message` en français à afficher
tel quel (ex. reprendre les photos).

## 5. Partage WhatsApp (lecture publique)

- `POST /api/tailor/clients/{id}/share` → 201 :
  `{"url": "/api/public/fiches/<token>", "token": "<token>",
  "expires_at": "...+30 jours"}`. Préfixer par l'origine du site pour le
  lien WhatsApp. Chaque appel crée un nouveau lien (l'ancien reste valable
  jusqu'à expiration).
- `GET /api/public/fiches/{token}` (**public, sans compte**) → 200 :
  `{full_name, gender, shop_name, measurements: [{data, source, height_cm,
  weight_kg, note, created_at}] (10 dernières), expires_at}`.
  `404` lien inconnu, `410` lien expiré (« demandez-en un nouveau »).

## 6. Travaux (hors plateforme)

`<job>` :

```json
{
  "id": "uuid", "tailor_client_id": "uuid ou null",
  "description": "Robe kaba...", "garment_model_id": "uuid ou null",
  "garment_type": "robe|jupe|chemise|pantalon|boubou|kaba ou null",
  "status": "todo|in_progress|ready|delivered",
  "status_label": "À faire|En cours|Prêt|Livré",
  "delivery_date": "2026-10-20 ou null",
  "agreed_price": 15000 ou null, "advance_received": 5000 ou null,
  "reference_photo_url": "/api/tailor/jobs/<id>/photo ou null",
  "finished_at": "... ou null", "created_at": "..."
}
```

- `GET /api/tailor/jobs?status=&due=week|late` — `due=week` : à livrer sous
  7 jours (non livrés) ; `due=late` : en retard (non livrés).
- `POST /api/tailor/jobs` → 201 — corps :
  `{tailor_client_id?, description?, garment_model_id?, garment_type?,
  status? ("todo" par défaut), delivery_date? ("AAAA-MM-JJ"),
  agreed_price?, advance_received?}`.
- `PATCH /api/tailor/jobs/{id}` → `<job>` (champs partiels ; passer à
  `"delivered"` renseigne `finished_at`).
- `DELETE /api/tailor/jobs/{id}` → 204 (suppression définitive).
- `POST /api/tailor/jobs/{id}/photo` — multipart `photo*` (10 Mo max,
  image réelle) → `<job>`. Lecture : `GET /api/tailor/jobs/{id}/photo`
  (authentifié, même rôle).
- `advance_received` : montant remis en main propre, pure information.

## 7. Commandes reçues via la plateforme (sans argent)

`GET /api/orders?status=` → commandes reçues (existant, rôle tailor).
`<order>` :

```json
{
  "id": "uuid", "client_id": "...", "tailor_id": "...", "type": "custom",
  "garment_model_id": "... ou null", "measurement_id": "...",
  "client_notes": "...", "status": "new|in_progress|ready_for_pickup|
  finished_delivered|finished_not_delivered|cancelled|declined",
  "desired_date": "2026-... ou null", "agreed_price": 15000 ou null,
  "delivery_fee": 2000 ou null, "budget_amount": 12000 ou null,
  "decline_reason": "... ou null", "cancel_reason": "... ou null",
  ...
}
```

- `budget_amount` : budget **indicatif** du client (facultatif, pas un prix).
- `POST /api/orders/{id}/accept` — corps
  `{"agreed_price": 15000, "delivery_fee": 2000}` (les deux facultatifs) →
  `new` devient `in_progress`, client notifié. 403 si non tailleur, 400 si
  plus en attente.
- `POST /api/orders/{id}/decline` — corps `{"reason": "..." (requis)}` →
  `new` devient `declined`, client notifié.
- `POST /api/orders/{id}/status` — corps `{"status": "ready_for_pickup"}`
  (existant) : transitions autorisées
  `new→in_progress→ready_for_pickup→finished_delivered`
  (`finished_not_delivered` depuis `ready_for_pickup`). Le client est notifié
  à chaque étape. Hors de ce chemin : 400.
- Le client peut annuler tant que c'est `new` (`cancelled`) ; passés à
  `declined`/`cancelled`/`finished_*`, les statuts sont définitifs.
- `GET /api/orders/{id}` (détail, existant),
  `GET/POST /api/orders/{id}/chat` (messagerie, existant).
- Offres/devis (`/offers`, `/quotes`) : conservés mais inactifs tant que
  `negotiation=false` — ne pas les afficher.

## 8. Patrons à partir d'une image (aperçu)

- `POST /api/tailor/patterns` → 201 — `multipart/form-data` :
  `image*` (10 Mo max, image réelle), `garment_type*`
  (`robe|jupe|chemise|pantalon|boubou|kaba`),
  `tailor_client_id?` **ou** `measurements?` (chaîne JSON,
  ex. `'{"chest": 94, "waist": 78}'`, clés des §4). L'un des deux est requis.
  Réponse `<pattern>` (ci-dessous), `status: "processing"`, traitement en
  tâche de fond. Si `pattern_generation="off"` : 404.
- `<pattern>` :

```json
{
  "id": "uuid", "garment_type": "robe", "tailor_client_id": "uuid ou null",
  "status": "processing|ready|failed", "engine": "preview-v0",
  "result": {
    "engine": "preview-v0", "garment_type": "robe", "scale": "1:1 mm",
    "seam_allowance_mm": 10, "ease_mm": 20, "estimated_values": false,
    "note": "Aperçu — la génération à partir de l'image arrive bientôt.",
    "pieces": [{"label": "Devant", "w_mm": 490, "h_mm": 1020, "keys": ["chest"]}],
    "pages": [{"page": 1, "label": "Devant, Dos"}]
  } ou null,
  "error_message": null,
  "image_url": "/api/tailor/patterns/<id>/image",
  "svg_url": "/api/tailor/patterns/<id>/svg ou null (si ready)",
  "created_at": "..."
}
```

- `GET /api/tailor/patterns` → liste (100 dernières).
- `GET /api/tailor/patterns/{id}` → `<pattern>` (sonder jusqu'à `ready`).
- `GET /api/tailor/patterns/{id}/svg` → fichier SVG 1:1 (mm), tuiles A4
  avec repères d'assemblage, mention « Aperçu ». 404 tant que pas prêt.
- `GET /api/tailor/patterns/{id}/image` → l'image de référence envoyée.
- `DELETE /api/tailor/patterns/{id}` → 204.

L'image sert pour l'instant de référence visuelle uniquement ; le SVG est un
patron de base calculé depuis les mesures (marges de couture 1 cm,
imprimable A4 page par page à 100 %).

## 9. Divers

- Tous les numéros saisis sont normalisés serveur (`00237…`, `237…`, `0…`,
  espaces/tirets) — le front peut envoyer la saisie brute, sans la retoucher.
- Limitation de tentatives : 429 `{detail: "Trop de tentatives. Attendez
  quelques minutes avant de réessayer."}` (connexion, MFA, invités,
  inscription, contact anonyme).
- Le badge « vérifié » des tailleurs n'est plus une garantie :
  `verification_enabled: false` dans `GET /api/tailors` et
  `GET /api/tailors/{id}` — masquer le badge (Agent B).
