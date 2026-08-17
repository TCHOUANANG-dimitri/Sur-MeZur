# Avatar 3D : ne s'affiche plus du tout sur la page dédiée

## Symptôme rapporté

Sur le dernier APK (celui qui contient déjà le correctif du blocage
indéfini — voir `HANDOFF_CATALOG_PHOTOS_AND_AVATAR_HANG.md`, section B,
déjà implémenté et vérifié dans le code), l'écran dédié à l'avatar
(`mobile/app/client/avatar.tsx`) n'affiche **rien du tout** : ni le modèle
3D, ni une erreur visible. Différent du symptôme précédent (spinner bloqué
indéfiniment) — ici, l'écran semble vide.

**Non reproduit sur appareil physique depuis cet environnement de
développement (pas d'accès device) — diagnostic par lecture de code et
inspection binaire des fichiers, à confirmer par reproduction avec logs.**

## Ce qui a été vérifié et écarté — ne pas ré-investiguer

Avant de proposer une explication, plusieurs pistes ont été activement
vérifiées et éliminées avec preuve à l'appui :

**Les fichiers `.glb` ne sont pas corrompus.** Hypothèse sérieuse au départ
— git a affiché des avertissements de conversion de fin de ligne
(`LF will be replaced by CRLF`) tout au long de cette session sur des
fichiers texte, et une conversion appliquée par erreur à un binaire le
corromprait. Vérifié : `git hash-object` sur les fichiers locaux donne
exactement le même hash que le blob stocké dans le commit HEAD, pour les
deux fichiers (`8ce6af5f...` et `4a475768...`). Aucune corruption.

**Les deux fichiers sont bien intégralement embarqués dans l'APK testé.**
Vérifié par inspection directe de l'archive : `res/E3.glb` fait
20 484 328 octets et `res/OR.glb` 21 021 284 octets — tailles identiques
aux fichiers sources. Pas de troncature ni de fichier resté sur l'ancienne
version pendant le build.

**Les noms des morph targets sont corrects.** Extrait de
`avatar-base-male.glb` : `mesh.extras.targetNames` contient bien
`measure-bust-circ-incr`, `measure-waist-circ-decr`, etc. — exactement les
noms produits côté serveur par `target_map.py` / `morph_weights.py`. Le
mécanisme de correspondance nom-de-cible fonctionne toujours.

**La couverture `try/catch/finally` du lot précédent est bien en place et
correcte** dans `Viewer3D.tsx` — `onReadyRef.current?.()` est appelé dans
tous les chemins (succès, erreur de chargement, erreur d'asset, catch).
Donc si le problème venait d'une exception dans le traitement du modèle,
elle serait maintenant loguée via `console.error` plutôt que de bloquer
silencieusement — à vérifier dans les logs (voir plus bas).

## Hypothèse principale, avec mécanisme précis

**Fichier : `mobile/app/client/avatar.tsx`, ligne 16**
```tsx
const { height: SCREEN_H } = Dimensions.get("window");
```

Cette ligne est au **niveau module**, hors du composant — elle s'exécute
donc une seule fois, au moment où le fichier est importé, et jamais
recalculée ensuite. Sa valeur est utilisée ligne 146 :
```tsx
<Viewer3D ... height={SCREEN_H} />
```

Avec Expo Router (routage par fichiers), les modules d'écran peuvent être
évalués tôt dans le cycle de vie de l'app — potentiellement avant que le
pont natif ait fini d'initialiser les dimensions de la fenêtre,
particulièrement en build **release** où l'ordre d'évaluation du bundle
JS diffère du mode dev. Si `Dimensions.get("window")` renvoie `{height: 0}`
(ou une valeur incorrecte) à cet instant précis, `SCREEN_H` reste figé à
0 pour toute la durée de vie de l'app — et `<Viewer3D height={0}>` rend un
conteneur de hauteur nulle, donc invisible, **indépendamment du bon
fonctionnement du chargement du modèle 3D à l'intérieur**. Ça expliquerait
précisément pourquoi c'est la page dédiée qui est touchée (seule à passer
une hauteur dynamique calculée ainsi) et pas les autres écrans utilisant
`Viewer3D` avec une hauteur fixe (ex. `height={300}` dans l'essayage).

**Correctif** : remplacer l'appel statique par le hook réactif, à
l'intérieur du composant :
```tsx
// Supprimer la ligne 16 (niveau module) :
// const { height: SCREEN_H } = Dimensions.get("window");

// Dans AvatarPage(), au début du corps de la fonction :
const { height: SCREEN_H } = useWindowDimensions();
```
Adapter l'import ligne 3 : remplacer `Dimensions` par `useWindowDimensions`
dans l'import depuis `react-native`. Ce hook renvoie toujours la valeur
courante et se met à jour automatiquement (utile aussi en cas de rotation
d'écran, ce que `Dimensions.get()` figé ne gérait pas).

C'est un changement sûr et strictement meilleur même si ce n'est pas la
cause exacte — `Dimensions.get()` au niveau module est un anti-pattern
documenté en React Native précisément pour cette raison.

## Hypothèse secondaire, à garder en tête si la première ne suffit pas

Les maillages font maintenant 20 à 21 Mo chacun (normales de morph
incluses depuis le dernier correctif), contre 4,7-4,8 Mo avant. Le
chargement passe par `GLTFLoader` (conçu pour un environnement navigateur)
exécuté sur le thread JS de Hermes. Sur un appareil d'entrée de gamme, un
parsing aussi lourd pourrait dépasser la mémoire disponible ou provoquer
un ANR — ce qui, selon le moment exact où ça arrive, peut se traduire par
un écran qui ne se peuple jamais sans qu'aucune erreur JS ne remonte
(crash natif plutôt qu'exception JavaScript interceptable).

## Vérification à faire absolument avant tout nouveau correctif

Corriger le point `Dimensions`/`useWindowDimensions` est peu coûteux et
recommandé dans tous les cas, mais **ne pas s'arrêter là sans confirmer** :
reproduire sur l'appareil de test avec les logs natifs actifs :
```
adb logcat *:S ReactNativeJS:V AndroidRuntime:E
```
en lançant l'écran avatar. Chercher :
- les lignes `[Viewer3D] WebGL2:` (déjà en place) et `[Viewer3D] Erreur
  post-chargement` (déjà en place) — si aucune des deux n'apparaît,
  `onContextCreate` ne s'exécute peut-être jamais, ce qui pointerait
  plutôt vers un problème de layout (hypothèse principale) que de
  chargement ;
- toute trace `AndroidRuntime: FATAL EXCEPTION` ou `OutOfMemoryError`, qui
  confirmerait l'hypothèse secondaire.

## Vérification finale

```
cd mobile && npx tsc --noEmit
```
Puis test visuel réel sur device avec logs actifs — comme toujours pour ce
module, aucune vérification statique ne remplace l'observation à l'écran.
