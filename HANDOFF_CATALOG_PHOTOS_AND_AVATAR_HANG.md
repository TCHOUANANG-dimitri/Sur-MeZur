# Deux sujets pour l'autre agent : photos réelles du catalogue + blocage génération avatar

## A. Afficher les vraies photos des modèles (les catégories, elles, sont déjà en place)

### Ce qui est DÉJÀ fait — ne pas refaire

Vérifié dans le code : les catégories dynamiques sont déjà entièrement câblées
(`CatalogApi.categories()` appelé et utilisé dans `mobile/app/client/(tabs)/home.tsx`
ligne 32, `mobile/app/client/(tabs)/search.tsx` ligne 32, et
`mobile/app/client/models/index.tsx` ligne 27), avec une section horizontale
par catégorie sur l'accueil, des chips de filtre sur la recherche et la
galerie, et un lien "Voir plus" qui transmet bien `category_id`. Ce travail
avait déjà été livré avec la fonctionnalité catalogue-admin — rien à changer
ici. 302 modèles répartis sur 6 catégories (homme : Haut, Vêtement
Traditionnel ; femme : Bas, Haut, Kaba, Robe De Soiree) viennent d'être
importés en base via `backend/scripts/import_gallery_images.py`, chacun avec
un `photo_url` renseigné.

### Le vrai problème : aucun écran n'affiche la photo réelle

Vérifié par grep sur les 4 écrans qui affichent une carte de modèle — ils
utilisent TOUS un simple dégradé de couleur (`thumbnail_color`), jamais
`photo_url` :

```
mobile/app/client/(tabs)/home.tsx:64      <LinearGradient colors={[m.thumbnail_color, ...]} style={styles.modelThumb} />
mobile/app/client/(tabs)/search.tsx:107   <LinearGradient colors={[m.thumbnail_color, ...]} style={styles.gridThumb} />
mobile/app/client/models/index.tsx:70     <LinearGradient colors={[m.thumbnail_color, ...]} style={styles.thumb} />
mobile/app/client/models/[id].tsx:49      <LinearGradient colors={[model.thumbnail_color, ...]} style={styles.hero} />
```

Résultat concret : malgré les 302 vraies photos maintenant en base, l'app
continuera d'afficher des blocs de couleur unis partout tant que ces 4
endroits ne sont pas corrigés. `thumbnail_color` reste utile comme repli
(un modèle créé par l'admin avant l'ajout d'une photo n'a pas de
`photo_url`), mais ne doit plus être le cas par défaut.

### Le helper à réutiliser existe déjà — ne pas en recréer un

`mobile/src/api/client.ts` exporte déjà `fileUrl(path)` (ligne 263), qui
transforme un chemin relatif du type `/uploads/homme/haut/xxx.jpg` en URL
absolue vers le backend. Déjà utilisé exactement pour ce cas de figure dans
`mobile/app/tailor/(tabs)/ready-to-wear.tsx` ligne 172 :
```tsx
<Image source={{ uri: fileUrl(cover) }} style={styles.thumb} resizeMode="cover" />
```
C'est ce même pattern à reproduire dans les 4 fichiers.

### Correctif, fichier par fichier

Partout, le principe est : si `photo_url` (ou `photos[0]`) existe, afficher
une `<Image>` avec `fileUrl(...)` ; sinon garder le `<LinearGradient>`
actuel en repli. Importer `Image` depuis `react-native` et `fileUrl` depuis
`../../../src/api/client` (adapter la profondeur du chemin relatif par
fichier) partout où ce n'est pas déjà fait.

**`mobile/app/client/(tabs)/home.tsx`** (dans `ModelSection`, ligne 62-68) :
```tsx
{m.photo_url ? (
  <Image source={{ uri: fileUrl(m.photo_url) }} style={styles.modelThumb} resizeMode="cover" />
) : (
  <LinearGradient colors={[m.thumbnail_color, colors.indigoText]} style={styles.modelThumb} />
)}
```

**`mobile/app/client/(tabs)/search.tsx`** ligne 107 : même bascule avec
`styles.gridThumb`.

**`mobile/app/client/models/index.tsx`** ligne 70 : même bascule avec
`styles.thumb`.

**`mobile/app/client/models/[id].tsx`** ligne 49 (le hero, plus grand) :
même bascule avec `styles.hero`. Bonus optionnel si le temps le permet (pas
bloquant) : `model.photos` est un tableau — un petit carrousel horizontal
plutôt qu'une seule image fixe serait plus fidèle au contenu réel, mais le
principal est d'abord de sortir du dégradé pour l'unique `photo_url`.

### Vérification

```
cd mobile && npx tsc --noEmit
```
Puis test visuel réel (catalogue rempli maintenant en base de dev locale
suite au test d'import) : les cartes doivent montrer les vraies photos de
vêtements, plus des blocs de couleur.

---

## B. Génération d'avatar qui tourne indéfiniment sur le dernier APK (build local, maillages agrandis)

### Contexte

Dernier APK local (celui construit juste après le remplacement des
maillages de base par les versions avec normales de morph — voir
`HANDOFF_AVATAR_V2_FIXES.md`, section B4). Les fichiers embarqués sont
passés de ~4,7 Mo à ~20,5-21 Mo chacun. Sur cet APK, l'écran de génération
d'avatar reste bloqué sur le spinner de chargement indéfiniment, sans
jamais afficher le modèle ni une erreur.

**Ce nouveau symptôme n'a pas pu être testé/reproduit sur device depuis cet
environnement (pas d'accès physique à l'appareil) — diagnostic basé sur
lecture de code, à confirmer par reproduction avec logs.**

### Hypothèse principale, avec preuve à l'appui

Le correctif B2 du lot précédent (`mobile/src/components/Viewer3D.tsx` +
`mobile/app/client/avatar.tsx`) a changé la condition d'affichage :
```tsx
const isReady = avatar?.status === "ready" && meshRendered;
```
`meshRendered` ne passe à `true` QUE si `onReadyRef.current?.()` est appelé
— placé en toute fin du callback de succès de `loader.load(...)`, APRÈS
tout le traitement du modèle (application des morph targets, coloration,
ajout du vêtement éventuel). **Rien n'entoure ce bloc d'un `try/catch`.** Si
la moindre ligne y lève une exception — et le maillage a changé de forme
(normales de morph désormais présentes, fichier ~4x plus lourd, jamais
testé à cette taille) — l'exception part non interceptée, `onReady` n'est
jamais appelé, et l'overlay de chargement reste affiché pour toujours. Avant
le correctif B2, ce même échec silencieux aurait laissé un écran vide ou
mal formé mais VISIBLE (le spinner disparaissait dès la réponse serveur) —
B2 a donc, par effet de bord, transformé un échec silencieux en blocage
infini au lieu de le rendre visible.

Hypothèse secondaire, moins probable mais à ne pas exclure : le fichier
~20 Mo met simplement un temps FI long à être parsé par `GLTFLoader` sur le
thread JS (pas un blocage à proprement parler, juste une attente bien plus
longue que ce à quoi l'utilisateur s'attend, perçue comme infinie faute de
retour visuel). Les deux hypothèses appellent le même correctif de fond :
rendre l'attente observable et bornée dans le temps.

Trois.js `0.185.1` (voir `mobile/package.json`) gère l'activation des
morph normals automatiquement depuis la géométrie, sans réglage manuel côté
matériau nécessaire sur cette version — piste à ne PAS suivre en premier,
peu susceptible d'être la cause.

### Correctifs à apporter

**1. Encadrer le traitement du modèle chargé d'un `try/catch`, dans les
deux branches de `Viewer3D.tsx`** (`avatarMorphology` et `glbUrl`,
respectivement autour des lignes 172-241 et 238-310 après les modifs du
lot précédent) :
```tsx
loader.load(
  asset.localUri,
  (gltf) => {
    try {
      // ... tout le traitement existant (morph targets, couleur, échelle, vêtement) ...
    } catch (error) {
      console.error("[Viewer3D] Erreur post-chargement:", error);
    } finally {
      onReadyRef.current?.();
    }
  },
  undefined,
  (error) => {
    console.error("Base mesh load error:", error);
    onReadyRef.current?.();  // débloquer l'UI même en cas d'échec de chargement
  }
);
```
Le `finally` garantit que `onReady` est TOUJOURS appelé, qu'il y ait eu une
erreur ou non — c'est le changement le plus important : plus jamais de
spinner infini silencieux, quelle qu'en soit la cause exacte.

**2. Filet de sécurité côté `avatar.tsx`** : ajouter un timeout (ex. 20
secondes) après lequel, si `onReady` n'a toujours pas été appelé, afficher
un message d'erreur explicite avec bouton "Réessayer" plutôt que de rester
bloqué sur le spinner :
```tsx
useEffect(() => {
  if (!avatar || avatar.status !== "ready" || meshRendered) return;
  const timer = setTimeout(() => {
    if (!meshRendered) setGenError(t("avatar.err.renderTimeout"));
  }, 20000);
  return () => clearTimeout(timer);
}, [avatar?.status, meshRendered]);
```
Ajouter la clé `avatar.err.renderTimeout` dans `fr.json`/`en.json` (ex.
"L'affichage prend trop de temps. Réessayez.").

**3. Avant de conclure, reproduire avec les logs natifs pour confirmer la
cause exacte** (le `try/catch` ci-dessus la révélera au premier
déclenchement, via `console.error`) :
```
adb logcat *:S ReactNativeJS:V
```
en lançant l'écran avatar sur l'appareil connecté en USB (debug bridge),
et chercher la ligne `[Viewer3D] Erreur post-chargement:` ou tout stack
trace autour du moment où le spinner se bloque.

### Vérification

`tsc --noEmit`, puis nouveau build (le correctif B4 des maillages reste
inchangé, seul `Viewer3D.tsx`/`avatar.tsx` sont retouchés — pas besoin de
relancer Blender). Installer sur device réel et vérifier que l'avatar
s'affiche dans un délai raisonnable, ou qu'un message d'erreur clair
apparaît sinon — jamais un spinner qui ne se résout jamais.
