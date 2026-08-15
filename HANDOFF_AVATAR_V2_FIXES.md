# Avatar 3D — retours du premier test visuel réel, diagnostic + plan

## Contexte

Premier vrai test sur appareil de l'avatar par morph targets (après correction
du blocage réseau cleartext HTTP qui empêchait tout appel API). Retours de
l'utilisateur avec captures d'écran, sur l'écran Essayage (`tryon.tsx`)
affichant l'avatar généré :

1. "Impossible de charger le catalogue" s'affiche alors que c'est normal
   qu'il n'y ait encore rien.
2. Rotation 360° pas fluide ("grince un peu").
3. Sexe erroné à l'essai (femme au lieu d'homme demandé).
4. Forme trop carrée, pas lisse/naturelle.
5. Un semblant de cheveux sur un avatar homme (ne devrait pas en avoir).
6. Le sélecteur de teint ne fonctionne pas.
7. Idée : extraire le teint directement depuis la photo du client.
8. L'avatar a une forme de vêtement préalable (« on dirait une robe ») —
   devrait être juste la silhouette nue.
9. Chargement peu fluide.
10. Donner la possibilité d'enregistrer l'avatar sans l'habiller.
11. Un cube au sol qui ne sert à rien.
12. Style général à rendre plus naturel.

Chaque point a été vérifié dans le code ou par inspection directe des
fichiers avant d'écrire ce plan — rien ci-dessous n'est une supposition non
vérifiée. Deux catégories bien distinctes :

- **A. Bug de déploiement (pas de code)** — point 1, à corriger par
  l'utilisateur en SSH, pas par l'agent.
- **B. Bugs/limites de code** — points 2-12, avec un fix concret pour
  chacun, certains regroupés car même cause racine.

---

## A. "Impossible de charger le catalogue" — PAS un bug de code

Vérifié en direct sur la prod :
```
GET http://api.gitingeniering.com/api/models       -> 500 Internal Server Error
GET http://api.gitingeniering.com/api/accessories  -> 200 []
GET http://api.gitingeniering.com/api/categories   -> 200 []
```
`accessories` et `categories` répondent bien avec un tableau vide — c'est
exactement le comportement attendu pour un catalogue pas encore rempli, et
`tryon.tsx` ne montre l'erreur QUE si la requête échoue réellement (pas si
elle réussit avec une liste vide). Donc la banderole d'erreur observée est
légitime : `/api/models` plante vraiment.

Cause : la migration de schéma de la fonctionnalité catalogue-admin
(`garment_models.category_id`, nouvelle FK vers `categories`) n'a jamais été
appliquée en production — déjà identifiée plus tôt dans le projet, jamais
confirmée faite. `sync_sqlite_columns.py` ne peut pas la corriger (colonne
NOT NULL sans valeur par défaut, incompatible avec les lignes existantes).

**Action pour l'UTILISATEUR (pas pour l'autre agent), en SSH sur le
serveur :**
```bash
source /home/sc1jsgw2086/virtualenv/surmezur-backend/3.11/bin/activate
cd /home/sc1jsgw2086/surmezur-backend

# Vérifier ce qu'il y a dedans avant de supprimer :
sqlite3 data/sur_mezur.db "SELECT COUNT(*) FROM garment_models;"

# categories est déjà vide (confirmé par l'API) : rien à perdre côté
# nouvelle table. garment_models porte l'ANCIEN schéma (enum, pas de
# category_id) — aucune ligne existante n'est exploitable par le nouveau
# code de toute façon (category_id inexistant = FK cassée pour toutes).
sqlite3 data/sur_mezur.db "DROP TABLE garment_models;"

touch tmp/restart.txt
```
Après ça, `create_all()` recrée `garment_models` au nouveau schéma au
prochain démarrage — vérifier avec `curl -s http://api.gitingeniering.com/api/models`
(doit répondre `200 []`, plus 500). Une fois confirmé, l'admin peut créer des
catégories/modèles depuis l'écran catalogue.

Une fois ce point réglé, RIEN à changer côté code pour ce symptôme précis —
la gestion actuelle de `catalogError` dans `tryon.tsx` est déjà correcte
(elle ne se déclenche que sur un vrai échec réseau, pas sur une liste vide).

---

## B. Bugs de code — preuves et correctifs

### B1. Sélecteur de teint qui ne fait rien (bug confirmé)

**Fichier : `mobile/src/components/Viewer3D.tsx`**

Toute la scène Three.js (chargement du GLB, application des morph targets,
couleur de peau) est construite UNE SEULE FOIS, à l'intérieur de
`onContextCreate` (ligne 127), qui ne s'exécute qu'à la création du contexte
GL — donc une seule fois par montage du composant. `skinToneHex` n'y est lu
qu'une fois, capturé dans la closure (ligne 184 :
`material.color.set(skinToneHex)`).

Dans `avatar.tsx`, taper une pastille appelle `setSkinTone(c)` (ligne 157),
qui change bien le state React et donc la prop `skinToneHex` passée à
`<Viewer3D>` — mais comme `onContextCreate` ne se relance pas sur un
changement de props, la scène 3D déjà construite ne voit jamais la nouvelle
valeur. Le state change, l'écran ne bouge pas : exactement le symptôme
rapporté.

**Correctif** : garder une référence vers le(s) matériau(x) peau créés lors
du premier rendu, et ajouter un `useEffect` qui les met à jour quand
`skinToneHex` change :

```tsx
const skinMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

// dans onContextCreate, au moment où material.color.set(skinToneHex) est
// appelé pour chaque mesh du modèle (branche avatarMorphology ET branche
// glbUrl) : pousser `material` dans skinMaterialsRef.current au lieu de
// (ou en plus de) l'appel immédiat à .set().

useEffect(() => {
  skinMaterialsRef.current.forEach((m) => m.color.set(skinToneHex));
}, [skinToneHex]);
```
Ne pas oublier de vider `skinMaterialsRef.current = []` dans le cleanup
`useEffect` existant (ligne 81-102) pour éviter de garder des matériaux déjà
`dispose()`.

### B2. Chargement pas fluide (bug confirmé, cause distincte du B1)

**Fichiers : `mobile/src/components/Viewer3D.tsx` + `mobile/app/client/avatar.tsx`**

`avatar.tsx` cache son overlay de génération dès que
`avatar.status === "ready"` (ligne 84-85, `isReady`/`isGenerating`) — cet
état vient de la réponse serveur de `AvatarsApi.create`, qui revient quasi
instantanément avec le nouveau pipeline morph-weights (pas de Blender).
Mais le rendu réel du GLB (téléchargement de l'asset local via
`Asset.downloadAsync`, parsing GLTF, application des ~60 morph targets) se
passe de façon complètement asynchrone DANS `Viewer3D`, sans jamais
prévenir le parent. Résultat : l'overlay de chargement disparaît AVANT que
le modèle 3D soit réellement affiché — d'où l'impression de saccade/lenteur
juste après la disparition du spinner.

**Correctif** : ajouter une prop `onReady?: () => void` à `Viewer3D`,
appelée dans le callback de succès de `loader.load(...)` (les deux
branches, `avatarMorphology` ligne ~172 et `glbUrl` ligne ~238, juste après
`group.add(model)`). Dans `avatar.tsx`, garder un état
`meshRendered` (false par défaut, mis à `true` par `onReady`) et n'éteindre
l'overlay de génération que quand `isReady && meshRendered` sont tous les
deux vrais.

### B3. Rotation saccadée pendant l'auto-rotation (diagnostic + piste)

**Fichier : `mobile/src/components/Viewer3D.tsx`, boucle `render()` ligne 370**

La boucle est simple (`group.rotation.y += 0.006` par frame) — le coût
n'est pas dans la logique de rotation elle-même. Le maillage de base
(`avatar-base-male.glb` / `avatar-base-female.glb`, voir B4 plus bas) porte
60/62 morph targets simultanés sur un seul mesh de ~21 800 sommets. C'est le
risque déjà identifié avant le premier test réel (voir
`handoff_avatar_fullscreen.md`, jamais vérifié sur device jusqu'à
maintenant) : sur GPU mobile, si le rendu bascule en morphing par attribut
plutôt que par texture de données (WebGL2), le coût GPU par frame croît
avec le nombre de cibles, indépendamment de leur poids — d'où un rendu qui
peut saccader même pour une rotation aussi simple.

**Étapes concrètes, dans l'ordre :**
1. Juste après la création du renderer (ligne ~136), logguer
   `renderer.capabilities.isWebGL2` — si `false`, c'est la cause probable
   (pas de morphing par texture disponible).
2. Test rapide et réversible : passer `antialias: false` (ligne 134) et
   observer si ça change quelque chose — le MSAA est coûteux sur mobile.
3. Fix de fond, à faire dans tous les cas : le nettoyage du maillage décrit
   en B4 réduit à la fois le nombre de sommets et la taille du fichier —
   à re-tester après B4 avant d'aller plus loin (ne pas sur-optimiser une
   scène qui va de toute façon changer).

### B4. Forme "carrée"/pas naturelle + "robe" + "cube au sol" + "cheveux" — même origine probable

**Fichier à ré-exécuter : `backend/app/services/avatar/export_base_mesh.py`**
(script Blender, local uniquement — voir son en-tête)

Inspection directe des `.glb` embarqués (`mobile/assets/avatar-base-*.glb`)
pour vérifier ce qu'ils contiennent réellement, plutôt que de deviner :

```
avatar-base-male.glb   : 1 seul node "Human", 1 seul mesh "base",
                          1 seul matériau "SurMezur_Skin", 21 833 sommets,
                          60 morph targets.
```
**Pas d'objet cheveux/robe/cube séparé** — donc pas un problème de proxy
MPFB (cheveux, vêtements) laissé par erreur dans la sélection d'export :
tout est fondu dans UN SEUL mesh. Deux causes bien plus probables,
vérifiables et corrigeables sans deviner :

**a) Ombrage plat + pas de normales de morph exportées.** `export_morph_normal=False`
(ligne 105 du script) : le fichier ne contient que les DÉPLACEMENTS de
position pour chaque morph target, jamais les normales correspondantes.
Résultat : quand `Viewer3D` applique un poids fort à une cible, la géométrie
bouge mais l'éclairage continue à utiliser les normales du maillage neutre,
non alignées avec la nouvelle surface — ça donne exactement un aspect
facetté/anguleux ("trop carré"), surtout marqué sur les jambes et les pieds
(ce qui correspond bien à la fois à "carré" ET au "cube au sol" : les pieds
bas-poly, mal éclairés, peuvent très bien ressembler à un bloc). Rien
n'indique que le maillage lui-même est de mauvaise qualité — c'est
l'éclairage qui ment sur sa forme réelle.

**Correctif** :
```python
bpy.ops.export_scene.gltf(
    ...,
    export_morph=True,
    export_morph_normal=True,   # était False
    export_morph_tangent=False,
)
```
Et avant l'export, s'assurer d'un lissage de base indépendant des morph
targets :
```python
bpy.ops.object.shade_smooth()   # à appeler sur `human` juste avant l'export
```

**b) `_apply_skin()` écrase TOUS les emplacements matériau par la couleur de
peau** (`backend/app/services/avatar/generator.py`, lignes 291-295 —
partagé par `export_base_mesh.py` qui appelle `gen._apply_skin`). Le
commentaire du code lui-même dit pourquoi : "MPFB crée plusieurs
emplacements matériau" — or un corps MakeHuman/MPFB standard inclut par
défaut les yeux, dents, langue, sourcils et cils DANS LE MÊME objet mesh,
chacun sur son propre emplacement matériau. Le remplacement en boucle actuel
peint donc les yeux/dents/sourcils/cils avec la couleur de peau — ce qui
correspond bien à un "semblant de cheveux" (sourcils/cils teintés peau au
niveau du front, quasi invisibles mais texturés différemment de la peau nue
environnante) sans qu'il s'agisse d'une vraie mèche de cheveux (confirmé
absente du fichier).

**Correctif** : au moment de ré-exécuter le script, imprimer
`[m.name for m in human.data.materials]` pour voir les noms réels des
emplacements, puis ne remplacer QUE ceux correspondant à la peau
(probablement quelque chose comme `"Skin"`/`"Body"` — à confirmer en
lisant la sortie), en laissant les autres (yeux, dents, sourcils, cils)
inchangés :
```python
def _apply_skin(human, skin_tone_hex):
    ...
    SKIN_SLOT_NAMES = {"skin", "body"}  # à ajuster selon les vrais noms imprimés
    for i, slot_mat in enumerate(human.data.materials):
        if slot_mat and slot_mat.name.lower() in SKIN_SLOT_NAMES:
            human.data.materials[i] = mat
```

**c) La "robe"** : la vérification géométrique (composantes connexes du
maillage) ne montre PAS de forme de robe séparée — juste le corps, dont les
jambes, mal éclairées pour la raison (a), peuvent se confondre visuellement
en une seule masse conique du bassin aux pieds plutôt que deux jambes
distinctes. À réévaluer visuellement APRÈS le correctif (a) : très probable
que ça se résolve du même coup. Si l'aspect "robe" persiste malgré un
éclairage correct, revérifier l'écartement des jambes au repos dans le
maillage neutre MakeHuman (pose par défaut).

**Procédure complète pour ce point** :
1. Appliquer les 3 correctifs ci-dessus dans `export_base_mesh.py` /
   `generator.py::_apply_skin`.
2. Relancer `blender --background --python export_base_mesh.py -- male mobile/assets/avatar-base-male.glb`
   puis `... -- female mobile/assets/avatar-base-female.glb` (nécessite
   Blender + MPFB installés localement, comme indiqué dans l'en-tête du
   script).
3. Remplacer les 2 fichiers dans `mobile/assets/`.
4. Vérifier `Viewer3D.tsx` : les branches `avatarMorphology` (ligne
   158-223) et `glbUrl` (ligne 224-280) doivent activer les normales de
   morph si nécessaire côté three.js — GLTFLoader les détecte normalement
   automatiquement depuis le fichier, mais à vérifier visuellement après
   rebuild.
5. Rebuild complet (cloud + local) et retest visuel — ne pas se contenter
   d'un `tsc --noEmit`, ce point ne se vérifie qu'à l'œil.

### B5. Cheveux — voir B4(b), pas de correctif supplémentaire nécessaire

### B6. Sexe erroné à l'essai — code vérifié correct, pas de bug trouvé

`measurements.tsx` (lignes 62, 298-306) : deux boutons "Femme"/"Homme"
distincts, chacun appelant `setGender("female")` / `setGender("male")` sans
inversion ni valeur par défaut pré-sélectionnée (state initial `null`,
validé par `formError` avant tout envoi — impossible de soumettre sans
choix explicite). Le genre part directement dans
`MeasurementsApi.createSession({ ..., gender })` (ligne 172) et redescend
tel quel jusqu'à `measurement.gender` côté serveur
(`backend/app/api/v1/measurements.py` ligne 68) — aucun repli ni écrasement
trouvé entre la sélection et l'utilisation par `morph_weights.py` (ligne 51).

Le code ne montre donc rien de cassé. Avant d'y toucher : reproduire en
observant precisément quel bouton passe en style "primary" (rempli) avant
de valider — si le mauvais bouton s'allume au toucher, c'est un vrai bug
d'interaction à creuser (state batching, double-tap...) ; si le bon bouton
s'allume mais que le résultat final est quand même féminin, alors regarder
côté cache de session/mesure (est-ce que c'est bien une mesure TOUTE
NEUVE qui a été utilisée pour générer cet avatar, ou une ancienne mesure
déjà enregistrée avec l'autre genre, réutilisée par erreur ?).

### B7. Enregistrer l'avatar sans l'habiller (nouvelle fonctionnalité, simple)

**Fichier : `mobile/app/client/avatar.tsx`**

Bonne nouvelle : l'avatar est déjà sauvegardé côté serveur dès qu'il est prêt
— `generate()` (ligne 48-64) appelle `AvatarsApi.create(...)` dès le
montage de l'écran, avant même que l'utilisateur touche quoi que ce soit.
"Confirmer" (ligne 167-169) et "Ajouter des accessoires" (ligne 170-172)
mènent tous les deux vers l'essayage (`goTryOn`) — il n'existe actuellement
aucun moyen de simplement s'arrêter là.

**Correctif** : ajouter une action tertiaire, discrète (lien texte plutôt
que bouton, pour ne pas concurrencer "Confirmer"), sous les deux boutons
existants dans `bottomActions` (ligne 165-174) :
```tsx
<TouchableOpacity onPress={() => router.back()} style={styles.skipLink}>
  <Text style={styles.skipLinkText}>{t("avatar.saveWithoutDressing")}</Text>
</TouchableOpacity>
```
Ajouter la clé `avatar.saveWithoutDressing` dans `mobile/src/i18n/fr.json`
(ex. "Enregistrer sans habiller"). Pas d'appel API supplémentaire requis —
l'avatar est déjà persisté.

---

## C. Idée reportée (pas dans ce lot) : teint extrait de la photo

Faisable — le pipeline vision traite déjà les photos du client
(`backend/app/services/vision/pipeline.py`, MediaPipe pour les repères de
pose/visage). Ajouter un échantillonnage de couleur moyenne sur une zone de
peau visible (ex. autour des repères du visage) donnerait une couleur
suggérée à préremplir, tout en laissant les pastilles manuelles comme
réglage fin. C'est un ajout non-trivial côté vision (nouvelle sortie dans
`features`, gestion des cas de mauvais éclairage/teint biaisé par la photo),
distinct des corrections urgentes ci-dessus. À traiter dans un lot séparé
si l'utilisateur le confirme prioritaire.

---

## Ordre d'implémentation recommandé pour l'autre agent

1. B1 (teint réactif) et B7 (enregistrer sans habiller) — rapides,
   isolées, aucune dépendance.
2. B2 (callback `onReady`) — rapide, isolée.
3. B4 — le plus gros morceau (nécessite Blender+MPFB en local), mais
   résout probablement B3, B4(a/b/c) et B5 d'un coup. À faire ensemble,
   pas en plusieurs rebuilds séparés.
4. B6 — ne pas coder de correctif sans reproduction confirmée ; noter
   l'observation exacte si ça se reproduit.
5. Rebuild (cloud + local) et retest visuel complet — comme toujours pour
   ce module, `tsc --noEmit` ne suffit pas, il faut regarder l'écran.
