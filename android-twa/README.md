# Application Android Sur-MeZur (Agent B)

Le site web est emballé en **application Android légère** via une
**Trusted Web Activity (TWA)** générée avec
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
L'APK ne contient qu'une coquille qui ouvre le site dans Chrome, en plein
écran, sans barre d'adresse : **moins de 1 Mo**, caméra fonctionnelle
(c'est Chrome), et les mises à jour du site arrivent **sans republier
l'APK**.

## Pourquoi pas Capacitor ?

Capacitor embarque un WebView et le pont natif dans l'APK (~4 Mo), et impose
de republier pour certaines mises à jour natives. La TWA délègue tout à
Chrome : pas de code à maintenir côté natif, pas de duplication du site, et
un poids divisé par quatre. Elle n'est possible que parce que le site est
déjà une PWA complète (manifeste + service worker, voir tâche B4).
Si la TWA s'avérait impossible (ex. Chrome absent), le repli serait
Capacitor avec `server.url` distant — à justifier alors dans ce README.

## Prérequis

- Node.js 18+ (`node --version`) ;
- JDK 17 (`keytool` et `jarsigner` dans le PATH — le JDK de `tools/` convient) ;
- Android SDK : Bubblewrap sait l'installer tout seul (`bubblewrap doctor`
  propose le téléchargement des Build Tools et de la plateforme).

## Commandes exactes

```powershell
# 1. Depuis android-twa/ : initialise (ou met à jour) le projet Android
#    à partir du manifeste PWA déployé. Lit twa-manifest.json s'il existe.
npx @bubblewrap/cli init --manifest=https://sur-me-zur.vercel.app/manifest.webmanifest

# 2. Vérifie l'outillage (JDK, SDK, clés) et propose d'installer ce qui manque.
npx @bubblewrap/cli doctor

# 3. Construit l'APK signé (profil `default`, sortie app/build/outputs/).
npx @bubblewrap/cli build
```

Ce que fait chaque commande :

| Commande | Effet |
|---|---|
| `init --manifest=…` | Télécharge le manifeste PWA, crée `twa-manifest.json` (versionné) et le projet Gradle `app/` (non versionné, régénérable). |
| `doctor` | Contrôle JDK, SDK, Build Tools, empreinte de clé vs `assetlinks.json`. |
| `build` | Compile, aligne (`zipalign`), signe avec la clé et sort l'APK universel. Options de taille : aucune bibliothèque en plus, `shrinkResources` et `minifyEnabled` activés (voir `app/build.gradle` généré). |

## Signature (hors dépôt)

La clé vit **hors du dépôt**, jamais dans Git (voir `.gitignore` racine :
`*.keystore`, `*.jks`) :

```powershell
# Génère la clé (une seule fois). Le mot de passe demandé n'est écrit NULLE PART dans le dépôt.
.\generate-keystore.ps1
# Affiche l'empreinte SHA-256 à recopier dans web/public/.well-known/assetlinks.json :
keytool -list -v -keystore $env:USERPROFILE\.surmezur\android.keystore -alias surmezur
```

Noter l'empreinte ici après génération :

- SHA-256 : _à compléter après génération de la clé_.

## Digital Asset Links

`sur-me-zur.vercel.app/.well-known/assetlinks.json` (dans `web/public/`)
associe le paquet `com.surmezur.app` à l'empreinte SHA-256 de la clé. Sans
lui, Chrome affiche une barre d'adresse dans l'application. Vérification :

```powershell
Invoke-WebRequest https://sur-me-zur.vercel.app/.well-known/assetlinks.json
# Content-Type attendu : application/json (forcé dans web/vercel.json).
```

Prévoir le changement d'hôte quand un domaine sera acheté : `host` dans
`twa-manifest.json` + `assetlinks.json` + URL du manifeste.

## Distribution

L'APK **n'est pas versionné**. Le publier en pièce jointe d'une *release*
GitHub (ou dans un stockage de fichiers), puis renseigner sur Vercel :

- `NEXT_PUBLIC_APK_URL` : lien direct vers l'APK ;
- `NEXT_PUBLIC_APK_VERSION` : ex. `1.0.0` ;
- `NEXT_PUBLIC_APK_SIZE` : ex. `0,8 Mo`.

La page `/telecharger` du site pointe vers ce lien.
