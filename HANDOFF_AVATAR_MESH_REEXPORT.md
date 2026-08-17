# Avatar 3D : fin du lot en cours — clé i18n manquante + réexport du maillage

## Contexte

Cause confirmée de l'écran avatar resté vide (voir
`HANDOFF_AVATAR_BLANK_SCREEN.md` pour l'historique du diagnostic, corrigé
mais pas suffisant) : les maillages de base
(`mobile/assets/avatar-base-{male,female}.glb`) embarquent, depuis le
dernier réexport, à la fois les positions ET les normales pour chacune des
60 cibles de morphologie, sans encodage creux — un fichier de 20 à 21 Mo
contre 4,7 Mo avant. Three.js empile toutes les cibles dans une texture de
données GPU ; sur un téléphone, l'allocation échoue silencieusement, le
callback d'erreur se déclenche, et (avant les correctifs ci-dessous) l'app
affichait quand même l'état "prêt" sur une scène vide.

Deux correctifs de code viennent d'être appliqués directement (déjà dans
l'arbre de travail, non commités) :

**`mobile/src/components/Viewer3D.tsx`** — nouveau prop `onError`, distinct
de `onReady`. Auparavant, succès ET échec appelaient tous les deux
`onReady()` (dans un bloc `finally`), donc un échec de chargement affichait
quand même les boutons "Confirmer"/"Ajouter des accessoires" sur une scène
restée vide, sans aucune indication d'erreur. Maintenant, `onReady()` n'est
appelé qu'après un ajout réussi du modèle à la scène ; toute erreur
(chargement de l'asset, parsing GLTF, exception de traitement) appelle
`onError(error)` à la place.

**`mobile/app/client/avatar.tsx`** — deux changements :
1. Sélecteur de teinte entièrement retiré (state `skinTone`, tableau
   `SKIN_TONES`, la rangée de pastilles et ses styles). Une constante fixe
   `DEFAULT_SKIN_TONE = "#C68863"` est utilisée à la place, pour la
   génération de l'avatar et pour `Viewer3D`.
2. `onError={() => setGenError(t("avatar.err.renderFailed"))}` ajouté sur
   `<Viewer3D>` — un échec de rendu affiche maintenant une vraie erreur
   (avec les boutons Fermer/Réessayer déjà en place) au lieu de l'état
   "prêt" trompeur.

## Ce qu'il reste à faire

### 1. Ajouter la clé i18n manquante

Le code appelle `t("avatar.err.renderFailed")` mais cette clé n'existe pas
encore dans `mobile/src/i18n/fr.json` ni `en.json` — actuellement `t()`
renverrait la clé brute à l'écran. Ajouter, à côté de
`avatar.err.renderTimeout` :
```json
"avatar.err.renderFailed": "Impossible d'afficher l'avatar. Réessayez."
```
(et l'équivalent anglais, ex. "Couldn't display the avatar. Please try
again.")

Supprimer aussi la clé `avatar.skinTone` (ligne 76 des deux fichiers) —
elle n'est plus référencée par aucun écran depuis le retrait du
sélecteur.

### 2. Réexporter les deux maillages de base (le plus important)

**Fichier : `backend/app/services/avatar/export_base_mesh.py`**

Revenir sur `export_morph_normal`, remis à `False` — c'était la bonne
partie du correctif précédent (le lissage) qu'il fallait garder, et la
mauvaise partie (les normales par cible) qu'il faut retirer :
```python
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_morph=True,
    export_morph_normal=False,   # remis à False — voir diagnostic ci-dessus
    export_morph_tangent=False,
)
```
**Ne pas toucher** à `bpy.ops.object.shade_smooth()` juste avant l'export
(ajouté au lot précédent) : c'est lui qui corrige réellement l'aspect
facetté/carré signalé par l'utilisateur, sans coût de poids, et il reste
nécessaire. Ne pas toucher non plus à `_apply_skin()` dans
`backend/app/services/avatar/generator.py` (filtrage `SKIN_SLOT_NAMES` sur
les emplacements matériau) — toujours utile pour éviter de teinter
yeux/dents/sourcils en couleur peau.

Commandes (Blender + MPFB2 déjà installés sur ce poste,
`C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`) :
```
blender --background --python backend/app/services/avatar/export_base_mesh.py -- male   mobile/assets/avatar-base-male.glb
blender --background --python backend/app/services/avatar/export_base_mesh.py -- female mobile/assets/avatar-base-female.glb
```
Vérifier après coup que les fichiers sont bien redescendus autour de 4-5 Mo
chacun (pas 20 Mo) avant de continuer — c'est le signal que
`export_morph_normal=False` a bien été pris en compte.

### 3. Rebuild et test

```
cd mobile && npx tsc --noEmit
```
Puis nouveau build local (cloud si le WAF O2Switch le permet à nouveau),
installation sur device, et cette fois un vrai test visuel : l'écran
devrait soit afficher l'avatar, soit — si un problème subsiste — afficher
un message d'erreur explicite grâce au nouveau `onError`, ce qui
donnerait enfin un signal exploitable au lieu d'un écran silencieusement
vide.

## Point non résolu, à ne pas tenter de corriger à l'aveugle

Le choix du sexe erroné signalé par l'utilisateur n'a toujours aucune
cause identifiée dans le code (`measurements.tsx`, la sélection
Femme/Homme jusqu'à son utilisation par `morph_weights.py`, a été relue
en entier et est correcte). Ne pas modifier ce chemin sans une
reproduction précise notant quel bouton s'allume avant validation.
