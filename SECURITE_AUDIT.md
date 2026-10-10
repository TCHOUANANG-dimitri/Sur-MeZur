# Audit de sécurité — Agent A (tâche A4)

Date : 10/10/2026. Périmètre : `backend/**`, administration web
(`web/src/app/admin/**`, `web/src/components/admin/**`,
`web/src/lib/api/admin.ts`, `web/src/styles/admin*.css`), dépendances
backend + `web/`, configuration de déploiement (`deploy/contabo/`).

Méthode : relecture de chaque routeur (`grep "@router"`, inventaire
`smz_routes.txt` : ~240 routes), vérification des gardes (`require_roles`,
`require_perm`, `require_order_participant`, contrôles de propriété dans les
handlers), tests automatisés (`tests/test_securite.py`,
`tests/test_admin_web.py`, `tests/test_tailor_space.py`, tous verts),
`pip-audit` sur le venv backend, `npm audit` dans `web/`.

Conventions : les numéros entre parenthèses (M0–M14, 2.x, 13.x…) renvoient
au cahier des charges de l'administration web.

---

## 1. Constats → gravité → correction → preuve

| # | Constat (mission §3.2 + revue A4.6) | Gravité | Correction (cette branche) | Preuve |
|---|---|---|---|---|
| 1 | Mot de passe admin de production dans l'historique du dépôt public, toujours valide | Critique | Retiré du document de travail (fait en A1) ; rotation à faire côté VPS/Supabase (action utilisateur, §6) | `DEPLOIEMENT_CONTABO.md` ne contient plus le mot de passe ; `git grep -nI -E "password|secret" -- ':!*.lock'` relu |
| 2 | `POST /auth/password/reset/request` renvoyait le code OTP (`dev_code`) : réinitialisation du mot de passe de n'importe quel compte | Critique | `OTP_DEV_CODE=false` par défaut : aucun code renvoyé, réinitialisation libre-service fermée (503 + message « contactez le support ») ; secours = mot de passe provisoire admin (2.6) | `app/core/config.py` (`otp_dev_code`), `tests/test_tailor_space.py` (parcours OTP fermé) |
| 3 | `POST /payments/webhook` sans authentification (marquage « payé » arbitraire) ; `GET /payments/order/{id}` et `/split` sans contrôle de partie | Haute | Webhook : 404 tant que `features.payments=false` ; à la réactivation, signature HMAC-SHA256 exigée (`PAYMENT_WEBHOOK_SECRET`) ; `GET /order/{id}` et `/split` exigent `require_order_participant` | `app/api/v1/payments.py`, `tests/test_admin_web.py` (paiements désactivés) |
| 4 | Pièces d'identité des tailleurs + photos corporelles servies publiquement sous `/uploads/…` | Haute | Stock `protected_store/` hors montage statique ; middleware 403 sur `/uploads/{measurement_photos,verification,debug}/` ; accès uniquement par routes contrôlées (propriétaire / partie / permission admin) ; script de migration `scripts/migrer_fichiers_prives.py` (aperçu puis `--apply`) | `tests/test_securite.py` (403 statique, 401/404/200 selon le droit, octets exacts) |
| 5 | Trafic Vercel → VPS en HTTP clair (mots de passe, jetons) | Haute | Procédure HTTPS déjà rédigée (`DEPLOIEMENT_CONTABO.md`, Phase 2 : Caddy + Let's Encrypt, bascule `API_ORIGIN` en https) — exécution côté utilisateur | Phase 2 du document de déploiement |
| 6 | Aucune limitation de tentatives ; mots de passe de 6 caractères exactement | Moyenne | Rate limiting en mémoire par processus (connexion 10/15 min par numéro et IP, `/auth/mfa` 5/jeton, `/auth/guest` 30/h/IP, contact anonyme 5/h/IP, inscription 10/h/IP → 429 en français) ; mots de passe **6–64** (lettre + chiffre) partout (inscription, changement, réinitialisation, collecte) | `app/services/rate_limit.py`, `app/schemas/auth.py` (`validate_password`), tests OTP/TOTP |
| 7 | `python-jose 3.3.0` (CVE-2024-33663, CVE-2024-33664) | Moyenne | Remplacé par **PyJWT 2.15.0** (même format de jeton : `jwt.encode`/`jwt.decode`, `PyJWTError`) ; `cryptography` et `ecdsa` orphelins désinstallés | `requirements.txt`, `app/core/security.py`, `pip show python-jose` (absent), suites vertes |
| 8 | `/measurements/debug/analyze` ouvert à tout compte connecté (trace complète) | Moyenne | **Admin seulement** (`require_roles("admin")`) **et 404 si `ENV=production`** (nouveau réglage `env` + `is_production`, documenté dans `api.env.example`) | `app/api/v1/measurements.py`, `app/core/config.py` |
| 9 | Pas d'en-têtes de sécurité côté Next ; `client_max_body_size` / `server_tokens` côté proxy | Moyenne | Bloc `headers()` exact fourni à l'Agent B (§5, `web/next.config.ts` lui appartient) ; côté Caddy : `request_body max_size 30MB` déjà en place dans `deploy/contabo/Caddyfile` (équivalent `client_max_body_size`) ; Caddy n'expose pas de numéro de version (`server_tokens` sans objet) | `deploy/contabo/Caddyfile`, §5 ci-dessous |
| 10 | **IDOR (trouvé en A4.6)** : `GET /api/tryon/{id}` lisible **sans authentification** par énumération d'identifiant ; `POST /api/tryon` acceptait l'avatar d'un autre compte | Haute | `require_roles("client")` + vérification de propriété (`_owned_tryon`, `_owned_avatar` : 404 si l'avatar n'appartient pas à l'appelant) ; liste déjà cantonnée à ses propres essayages | `app/api/v1/tryon.py`, `tests/test_securite.py` (anonyme → 401, tiers → 404, propriétaire → 200) |
| 11 | Envois de fichiers : seul le `content_type` déclaré était contrôlé | Moyenne | Vérification de la **signature des premiers octets** (JPEG/PNG/WebP/HEIC/HEIF) + liste fermée de types + plafond 20 Mo ; SVG jamais accepté comme image | `app/services/storage.py` (`_magic_matches`), suites vertes (PNG de test à en-tête valide) |

Points « à vérifier » de la mission (§3.2, côté VPS, action utilisateur) :
`JWT_SECRET` ≥ 64 caractères aléatoires changé (`openssl rand -hex 48`,
déconnecte tout le monde — voulu), `chmod 600 /etc/surmezur/api.env`,
mot de passe Supabase changé. Voir §6.

---

## 2. Contrôle d'accès — route → qui → vérification (synthèse par module)

Inventaire exhaustif : ~240 routes (`smz_routes.txt`, généré par
`smz_routes.py` : décorateurs `@router.*` + `Depends`). Conventions :
`require_roles(...)` = authentifié + rôle (+ blocage des invités) ;
`require_perm(...)` = permission d'équipe (+ `require_roles("admin")` au
niveau du routeur) ; `require_order_participant` = partie à la commande
(client, tailleur, ou admin) ; `*_owned_*` = contrôle de propriété dans le
handler (404 volontaire, sans confirmer l'existence).

| Module | Qui peut appeler | Vérification faite |
|---|---|---|
| `admin*.py` (12 routeurs) | admins uniquement | `require_roles("admin")` au routeur + `require_perm("<domaine>")` par route (dashboard, users, tailors, orders, payments, reviews, measure, collecte, support, security…) |
| `auth.py` (10 routes) | public (connexion/inscription/OTP/invité), session pour le reste | rate limiting (A1.5) ; auto-inscription `client`/`tailor` uniquement (jamais `admin`) ; réinitialisation OTP fermée si `OTP_DEV_CODE=false` ; réinitialisation interdite aux comptes admin ; `guest_token` converti après validation |
| `tailor_space.py` (23 routes) | rôle `tailor` | `_tailor` + `_owned_client` / `_owned_job` / `_owned_pattern` (404 si `tailor_id` ≠ appelant) ; photos et SVG servis par routes contrôlées, jamais en statique |
| `orders.py` | client (création, annulation si `new`), parties (lecture, statut, litige, messages) | `require_order_participant` ; statuts réservés tailleur/admin ; `cancelled_by` tracé |
| `offers.py`, `quotes.py`, `modifications.py`, `chat.py`, `patterns.py` | parties à la commande | `require_order_participant` (y compris `accept`/`refuse` via `_get_modification_and_order`) |
| `payments.py` | client partie (init), parties (lecture), fournisseur (webhook) | propriété dans le handler + `require_order_participant` en lecture ; webhook HMAC ; 404 global si `features.payments=false` |
| `deliveries.py` | client | `order.client_id` = appelant dans le handler |
| `reviews.py` | client (création après livraison, signalement), tailleur (réponse à SES avis), lecture publique des visibles | `order.client_id` / `review.tailor_id` vérifiés ; signalement anti-doublon ; masqués exclus du public |
| `measurements.py` | client ou invité (parcours mesure), client (correctifs), **admin (debug)** | session cantonnée à `session.client_id` ; correctifs au propriétaire ; invités filtrés côté serveur (`GUEST_VISIBLE_KEYS`, jamais de flou purement visuel) ; debug admin + hors production |
| `avatars.py` | client | `_require_avatar_owner` sur lecture, renommage et GLB (`avatar_store` non monté) |
| `tryon.py` | client | **propriété ajoutée en A4** (ligne 10 du tableau §1) |
| `catalog.py` | public (lecture), tailleur (prêt-à-porter), client (sélection, like) | `item.tailor_id` vérifié en écriture ; lecture publique limitée aux visibles |
| `tailors.py` | public (recherche, fiche), tailleur (dépôt de vérification) | dépôt rattaché à `user.id` ; géolocalisation figée à l'inscription (RG-13) ; badge de vérification neutralisé si `tailor_verification=false` |
| `collecte.py` | `collector`/`admin` (fiches), permission `collecte` (relecture, export, agents) | `_get_visible` + `_scoped_query` (un agent ne voit que ses fiches, 404 sinon), `_ensure_editable` (validé = admin seul) ; photos via route contrôlée (`dataset_store` non monté, `_safe_path` anti-traversal) ; export/admin sous `require_perm` |
| `support.py` | public (config, pages publiées, fiches par jeton, contact — visiteurs limités à 5/h/IP), inscrits (leurs demandes), permission `support` (équipe) | `ticket.user_id` vérifié ; jetons de partage expirants (410 après expiration) |
| `users.py`, `notifications.py` | compte lui-même | `get_current_user`, requêtes filtrées par `user.id` |

Aucun autre accès par identifiant sans contrôle de propriété n'a été trouvé.

---

## 3. Fichiers privés (A4.1)

- Nouveau réglage `protected_dir` (`./protected_store`, `PROTECTED_DIR` en
  production — ajouté à `api.env.example`) ; jamais monté en statique.
- `save_upload` y écrit `measurement_photos/`, `verification/`, `debug/` et
  renvoie `protected://<dossier>/<nom>` ; `protected_path()` ne retient que
  le nom de fichier (anti `../`) et n'accepte que les dossiers privés ;
  `delete_upload` couvre les deux schémas.
- Middleware : `/uploads/{measurement_photos,verification,debug}/…` → **403**,
  y compris pour les fichiers antérieurs à la migration. Le catalogue
  (`garment-models`) et les autres dossiers publics restent servis.
- Migration : `backend/scripts/migrer_fichiers_prives.py` (aperçu par défaut,
  `--apply` pour écrire, relançable) : déplace les fichiers, réécrit
  `MeasurementSession.front/side_photo_url` et `VerificationDocument.file_url`
  vers `protected://…`, purge `uploads/debug/`.
- Accès conservés, sous contrôle : propriétaire
  (`GET /measurements/session/{id}/photos/{front,side}`),
  tailleur (`/tailor/jobs|patterns/…`, `tailor_store/` hors montage),
  équipe (`/admin/verification-documents/{id}`,
  `/admin/measurement-sessions/{id}/photos/{vue}`, permission + consentement
  photo pour la mesure), collecte (`/collecte/subjects/{id}/photos/{vue}`).
  L'interface admin charge ces images avec son jeton (`AuthImage`,
  `URL.createObjectURL`).

---

## 4. Dépendances (A4.4)

### Backend — `pip-audit` : 24 vulnérabilités restantes, 2 paquets (état vérifié le 10/10/2026)

Tout le reste est à zéro, après mises à jour : `fastapi 0.115.0 → 0.143.0`
(+ `starlette` 0.38.6 → 1.7.0, dont 14 vulnérabilités), `PyJWT → 2.15.0`,
`python-multipart 0.0.9 → 0.0.31`, `setuptools 63.2.0 → 84.0.0`,
`cryptography`/`ecdsa` supprimés (orphelins de `python-jose`), `PyJWT`
épinglé dans `requirements.txt`. Suites backend vertes après migration.

| Paquet | Vulnérabilités | Pourquoi pas corrigé ici |
|---|---|---|
| `torch 2.5.1` (CPU) | 22 (majoritairement DoS locaux / corruption mémoire via modèles malveillants ; notable : CVE-2025-32434 RCE via `torch.load(weights_only=True)`, corrigé en 2.6.0 ; CVE-2026-24747, corrigé en 2.10.0) | Chaîne ML : le code **n'appelle jamais `torch.load`/`jit.load` sur un contenu utilisateur** (vérifié par `grep` : 0 appel ; seuls les poids embarqués `ml/weights/` sont chargés par les libs). Monter torch (2.6 → 2.13 selon l'avis) impose de requalifier MediaPipe/SAM et les poids — chantier de mise à jour ML, pas un `pip install` anodin. |
| `protobuf 4.25.9` | 2 (PYSEC-2026-1805 / CVE-2026-0994 : DoS via `json_format.ParseDict` sur `Any` imbriqués) | Le code **n'appelle jamais `ParseDict`** (0 appel) ; protobuf n'est présent que comme dépendance de MediaPipe, qui l'épingle `<5` — le correctif (5.29.6/6.33.5) exige la montée majeure **avec** MediaPipe. Même chantier que torch. |

### Web — `npm audit` : 4 → 2 vulnérabilités (état vérifié le 10/10/2026)

`npm audit fix` appliqué (seul `web/package-lock.json` modifié, 160 lignes :
`package.json` inchangé) : `sharp` (librsvg CVE-2026-96889) et
`source-map-js` (DoS boucle d'événements) corrigés.

Restent 2 avis, **corrigeables uniquement par passage à Next.js 16.4.0
(changement majeur)** : `next` 15.5.x — cache poisoning SSG/ISR en
auto-hébergement (modéré) ; `postcss` embarqué par Next — XSS via
`</style>` non échappé et traversée `sourceMappingURL` (haut). La montée
Next 15 → 16 (actes de route async, proxy middleware, React 19 déjà en place)
est une migration à part entière sur le périmètre de l'Agent B : elle est
**documentée ici et non exécutée**. Atténuations en place : pas de
`sourceMappingURL` auto-chargé servi (pas de `.map` publiés), SSG/ISR non
utilisé pour du contenu sensible, Vercel devant l'applicatif.

### Collecte

Application Next.js de campagne : mêmes dépendances critiques que `web/`
(Next 15). Appliquer le même traitement (`npm audit`, `npm audit fix`)
avant toute exposition, puis suivre la décision Next 16 avec le site.

---

## 5. En-têtes — bloc exact pour l'Agent B (`web/next.config.ts`, NE PAS MODIFIER ce fichier côté Agent A)

> **Agent B — à intégrer tel quel** : ajouter la méthode `headers()` ci-dessous
> dans `nextConfig` (`web/next.config.ts`). Vérifié compatible avec le site :
> caméra autorisée pour le site lui-même (`MeasureFlow`/`CameraCapture` via
> `getUserMedia`), polices Google autorisées (Playfair Display + Inter déjà
> chargées dans `layout.tsx`), tout le trafic API en même origine (`/api/*`
> réécrit côté serveur, donc `connect-src 'self'` suffit).

```ts
async headers() {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(self), microphone=(), geolocation=()",
        },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob:",
            "media-src 'self' blob:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "base-uri 'self'",
          ].join("; "),
        },
      ],
    },
  ];
},
```

Notes : `'unsafe-inline'` en `script-src` est exigé par le runtime Next.js
(sans nonce via middleware, la page ne s'hydrate pas) ; `frame-ancestors
'none'` + `X-Frame-Options: DENY` interdisent l'intégration en iframe
(clickjacking) ; `img-src`/`media-src` incluent `blob:` car l'interface
affiche les fichiers protégés via `URL.createObjectURL` ; HSTS est déjà
envoyé par la plateforme Vercel en bordure (ne pas le dupliquer dans
l'applicatif). Côté proxy : `deploy/contabo/Caddyfile` limite déjà les corps
de requête à 30 Mo (`request_body max_size`, équivalent `client_max_body_size`) ;
Caddy n'expose pas de numéro de version (`server_tokens off` sans objet).

---

## 6. Risques résiduels et actions demandées à l'utilisateur

1. **Secrets de production (urgent, côté VPS/Supabase, jamais dans Git)** :
   changer le mot de passe admin (commande masquée dans
   `deploy/contabo/URGENCE_SECURITE.md`), régénérer `JWT_SECRET` (≥ 64
   caractères, `openssl rand -hex 48` — déconnecte tout le monde, voulu),
   `chmod 600 /etc/surmezur/api.env`, changer le mot de passe Supabase
   (visible sur une capture). Poser `ENV=production` et `OTP_DEV_CODE=false`
   (voir `api.env.example` mis à jour : `ENV`, `PROTECTED_DIR`).
2. **HTTPS de l'API** : exécuter la Phase 2 de `DEPLOIEMENT_CONTABO.md`
   (domaine → Caddy/Let's Encrypt → `API_ORIGIN` en https + *Redeploy*
   Vercel). Tant que le trafic Vercel → VPS reste en HTTP clair, mots de
   passe et jetons circulent lisibles sur ce tronçon.
3. **Montées majeures documentées** : torch/protobuf (+ MediaPipe/SAM à
   requalifier), Next.js 16 (avec l'Agent B). Aucune n'est bloquante pour
   l'usage actuel (pas de désérialisation utilisateur, pas de `.map`
   publiés, pas d'ISR sensible).
4. **Historique Git public** : le mot de passe admin y figure toujours
   (commits `4fba09c`, `f38d30d`, `8ce3ec8`, `eb925ff`). Réécriture
   (`git filter-repo` + force push) possible uniquement avec l'accord de
   l'utilisateur — elle casse les branches `agent-b/produit-web` et les
   clones existants.
5. **Jetons en `localStorage`** (client web `X-SMZ-Platform`) : acceptable
   avec CSP + pas d'intégration tierce ; la rotation auto + révocation côté
   admin (`/admin/sessions`) couvre le vol de session. Passage en cookie
   `HttpOnly` envisageable plus tard (avec CSRF), hors périmètre A4.

Preuves d'exécution : `tests/test_securite.py`, `tests/test_admin_web.py`,
`tests/test_tailor_space.py` → **« 0 echec(s) »** chacun ;
`pip-audit` (24 vulns / torch+protobuf, justifiées ci-dessus) ;
`npm audit` (2 résiduelles / Next 16, justifiées ci-dessus).
