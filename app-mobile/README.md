# Application mobile Sur-MeZur (Android)

L'application emballe le site web `sur-me-zur.vercel.app` dans une
**Trusted Web Activity** (TWA) : une coquille Android qui ouvre le site dans
Chrome, en plein écran, sans barre d'adresse.

- **Le plus léger possible** : aucun site embarqué, seulement la coquille,
  l'icône et l'écran de démarrage (moins d'1 Mo).
- **Toujours à jour** : chaque mise à jour du site arrive dans l'application
  sans republier l'APK. Il ne faut recompiler que pour changer le nom, l'icône,
  les couleurs ou l'adresse de départ.
- **Tout fonctionne** comme sur le site : caméra, WhatsApp, contacts, session.

L'application s'ouvre sur `/bienvenue` : présentation en trois écrans au
premier lancement, puis connexion (ou directement l'espace de la personne si
elle est connectée).

L'ancienne application React Native / Expo est mise de côté dans
`archive/mobile-expo/` (plus maintenue).

## Contenu

| Fichier | Rôle |
|---|---|
| `twa-manifest.json` | identité de l'application : nom, paquet `com.surmezur.app`, couleurs, icônes, adresse de départ, version |
| `scripts/generer.mjs` | génère `android/` avec la bibliothèque officielle de Google (`@bubblewrap/core`), puis l'allège |
| `scripts/creer-cle.ps1` | crée la clé de signature (une seule fois), hors du dépôt |
| `scripts/compiler.ps1` | compile, aligne et signe l'APK dans `dist/` ; `-Publier` le copie dans la landing |
| `android/` | projet Android généré (versionné : on voit ce qui change) |

## Allègements appliqués par `generer.mjs`

- R8 : code réduit et optimisé, ressources inutilisées retirées ;
- textes des bibliothèques limités au français et à l'anglais ;
- écran de démarrage en 2 densités au lieu de 5, toutes les images en
  palette (les ressources passent de 988 Ko à 228 Ko) ;
- ni notifications, ni raccourcis, ni raccourci « Paramètres du site ».

## Compiler

Prérequis : Node 18+, JDK 17+ (`JAVA_HOME`), SDK Android
(`%LOCALAPPDATA%\Android\Sdk` ou `ANDROID_HOME`).

```powershell
cd app-mobile
npm install
npm run generer                                   # projet android/
powershell -ExecutionPolicy Bypass -File scripts\creer-cle.ps1   # une seule fois
powershell -ExecutionPolicy Bypass -File scripts\compiler.ps1 -Publier
```

`-Publier` copie l'APK dans `landing/public/android/sur-mezur.apk` et écrit sa
version et sa taille dans `landing/src/data/apk.json`. La landing le propose
alors au téléchargement (section « Application Android » et page
`/telecharger`) au prochain déploiement.

Nouvelle version : augmenter `appVersion` **et** `appVersionCode` dans
`twa-manifest.json`, puis régénérer et recompiler. Android refuse une mise à
jour dont le `appVersionCode` n'est pas plus grand.

## Clé de signature : à sauvegarder

`%USERPROFILE%\.surmezur\android.keystore` et `android.properties` (son mot
de passe) ne sont **jamais** dans le dépôt. Sauvegardez-les (clé USB,
gestionnaire de mots de passe d'équipe) : sans eux, impossible de publier une
mise à jour, Android refuse d'installer une version signée par une autre clé.

Empreinte SHA-256 de la clé (publique) :

```
6F:95:83:66:BB:A7:EF:0C:FD:FC:AB:A4:68:D5:54:F1:68:45:C4:20:27:73:59:63:D8:B3:BE:33:00:45:87:BB
```

Elle figure dans `web/public/.well-known/assetlinks.json`. C'est ce fichier,
servi par le site, qui prouve à Android que l'application et le site ont le
même propriétaire : sans lui (ou avec une autre empreinte), l'application
affiche une barre d'adresse comme un simple onglet Chrome.

Changement de domaine : mettre à jour `host`, `iconUrl`, `maskableIconUrl` et
`webManifestUrl` dans `twa-manifest.json`, servir `assetlinks.json` sur le
nouveau domaine, puis régénérer et recompiler.
