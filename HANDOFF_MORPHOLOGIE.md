# Handoff — Recalibration du calcul de morphologie de l'avatar

## 0. Comment lire ce document

Diagnostic terminé, plan d'action **convenu et priorisé**, mais **rien
n'est encore implémenté**. C'est prêt à démarrer.

Ce document est autonome : aucun contexte de conversation n'est nécessaire
pour reprendre le travail, mais il pointe vers des documents déjà
existants au même endroit dans le dépôt (§3) qui contiennent le détail
complet des formules/algorithmes — ne pas les reparaphraser à côté, les
lire/éditer directement.

---

## 1. Déjà fait — ne pas retoucher, ne pas revalider

Pour situer le terrain sans dupliquer un travail déjà terminé et vérifié :

- Blocage du pare-feu O2Switch (Tiger Protect) sur l'API : diagnostiqué,
  résolu (résolution externe/inconnue, confirmée par test réel).
- Écran avatar resté vide : deux causes distinctes trouvées et corrigées
  (`Dimensions.get()` statique dans `avatar.tsx`, puis maillage trop lourd
  en mémoire GPU côté mobile) — voir `BRIEF_MODELE_CORPOREL_AVATAR.md` §5
  pour l'historique complet.
- Nouvelle architecture de rendu : déformation des morph targets appliquée
  **une seule fois côté client** (« cuisson »/bake) plutôt qu'en continu
  côté GPU — implémentée dans `Viewer3D.tsx::bakeMorphTargets()`, vérifiée
  hors-device sur les vraies données de production (0 NaN, normales
  correctes, ~48 ms), committée et buildée.
- Galerie de modèles : affichage plein écran zoomable au tap sur une
  photo, swipe entre modèles — implémenté, buildé, APK généré.
- URL de l'API mal embarquée dans un précédent APK : corrigé et re-buildé.

Aucun de ces points n'est concerné par ce handoff.

---

## 2. Recalibration du calcul de morphologie

### 2.1 Contexte

Le calcul actuel (`backend/app/services/avatar/body_params.py` +
`target_map.py`) transforme les mensurations du client en poids de morph
target via : mesure → z-score contre des moyennes/écarts-types ANSUR II →
`poids = |z|`. Description complète, formules exactes, tables de
référence : voir **`BRIEF_CALCUL_MORPHOLOGIE.md`** (déjà rédigé, à jour,
ne pas le reproduire ici).

Ce document a été soumis à 3 analyses externes indépendantes. Les trois
convergent sur le même diagnostic.

### 2.2 Diagnostic retenu (convergence des 3 analyses + validation)

**Le problème central n'est pas ANSUR en tant que tel — c'est
l'équivalence `poids = |z|`.** Un z-score répond à « à combien
d'écarts-types cette personne est-elle de la moyenne d'une population de
référence ? ». Un poids de morph target répond à « quelle fraction de
l'amplitude géométrique maximale dois-je appliquer ? ». Rien n'a jamais
démontré que ces deux échelles coïncident — c'est une hypothèse codée sans
jamais être vérifiée contre le maillage réel.

**Le biais de population ANSUR reste un risque réel, mais secondaire à
celui ci-dessus.** Un précédent déjà mesuré existe dans ce même pipeline :
le modèle Ridge qui prédit les circonférences atteint 1,38 cm d'erreur sur
données synthétiques dérivées d'ANSUR mais 5,2 cm sur 13 sujets
camerounais réels (voir `backend/app/services/measurement_model.py`,
commentaire de tête de fichier). Le mécanisme est différent ici (ANSUR
sert de référence de dispersion, pas de base d'entraînement d'un modèle
prédictif), mais les 3 analyses externes s'accordent : ça ne supprime pas
le risque, ça le réduit seulement partiellement.

**La solution retenue** : arrêter de deviner statistiquement le poids
correct, et le mesurer directement sur le vrai maillage de production.
Construire une matrice de sensibilité (quelle mesure change de combien
pour quelle cible), puis résoudre un petit problème d'optimisation par
client (quels poids font correspondre les mesures *virtuelles* de
l'avatar aux mesures *réelles* du client), avec ANSUR rétrogradé en simple
repli/prior pour les mesures manquantes.

**Point important pour la faisabilité sur cet hébergement** : ce n'est
**pas** un calcul lourd. De l'algèbre linéaire sur une petite matrice
(~25 mesures × 60 cibles), résoluble en millisecondes, sans Blender, sans
GPU — ça respecte la contrainte qui a fait sortir Blender du chemin de
requête à l'origine (voir `BRIEF_MODELE_CORPOREL_AVATAR.md` §5.1). Ne pas
percevoir ce chantier comme un risque de réintroduire ce problème.

### 2.3 Plan d'action — ordre convenu

#### Item 1 — Neutraliser `muscle_factor` (prêt, minutes, risque nul)

- **Où** : `body_params.py`, `muscle_factor = weight_factor × 0.6`,
  consommé par `MUSCLE_TARGETS` dans `target_map.py`
  (`torso-muscle-pectoral`, `torso-muscle-dorsi`).
- **Changement** : arrêter de piloter ces deux cibles depuis l'IMC. Les
  3 analyses externes s'accordent : c'est l'heuristique la plus fragile du
  système — l'IMC décrit un rapport masse/taille², pas une composition
  musculaire, et rien dans le pipeline de vision ne mesure la musculature.
- **Recommandation** : mettre ce facteur à 0 (cibles neutres, jamais
  activées) jusqu'à ce qu'un signal réel existe, plutôt que de continuer à
  affirmer un signal faux. Pas de remplacement à construire dans
  l'immédiat — juste retirer le couplage.

#### Item 2 — Cibles dérivées fessiers/poitrine (petit, risque faible)

- **État actuel** :
  `buttock_scale = hip_scale × 0.85 + 0.05`
  `breast_size = chest_scale × 0.7 × (1 + weight_factor × 0.3)`
- **Déjà disponible mais sous-exploité** : `hip_breadth_scale` (→
  `hip-scale-horiz`) et `buttock_depth_scale` (→ `hip-scale-depth`) dans
  `BREADTH_DEPTH_TARGETS`, alimentés par les largeurs/profondeurs
  MobileSAM quand elles sont disponibles — un signal de profil réel que le
  seul tour de hanches ne peut pas fournir (deux personnes au même tour de
  hanches peuvent avoir des profils très différents : largeur osseuse vs
  volume/projection).
- **Changement** : pour l'axe fessiers (`buttocks-volume`), privilégier
  (ou mélanger) le signal direct de profondeur/largeur du bassin quand il
  est disponible, plutôt que de dériver uniquement du tour de hanches.
- **Poitrine/`breast_size`** : pas d'équivalent direct disponible
  aujourd'hui — nécessiterait une mesure sous-poitrine que le pipeline de
  vision ne produit pas encore. À traiter comme un chantier vision séparé,
  pas comme une simple retouche de formule ici. Priorité plus basse que
  les fessiers dans cet item.

#### Item 3 — Mesureur virtuel + matrice de sensibilité (le chantier principal)

- **Objectif** : pour chacune des 60 cibles, mesurer empiriquement (sur le
  vrai maillage GLB de production) l'effet sur ~12-16 mesures pertinentes
  (tours de poitrine/taille/hanches/bras/cuisse/cou, largeurs/profondeurs,
  longueurs) à des poids 0 / 0,25 / 0,5 / 0,75 / 1,0.
- **Outil à construire** : un « mesureur virtuel » — étant donné un
  maillage déformé, calculer un tour de poitrine/taille/etc. en coupant le
  maillage par un plan à une hauteur anatomique donnée et en mesurant le
  périmètre de la boucle résultante (intersection maillage-plan +
  périmètre d'une boucle fermée) ; largeur/profondeur = étendue de la
  boîte englobante de cette coupe. **Ceci n'existe pas encore** — c'est un
  vrai morceau de géométrie computationnelle à écrire, pas une
  reformulation de code existant.
- **Où ça tourne** : hors ligne, une fois, sur un poste de développement
  avec Blender — même catégorie que `export_base_mesh.py` et
  `calibrate_height.py`, jamais en production. Le résultat (la matrice)
  est sauvegardé en fichier statique (JSON par ex.) embarqué avec le
  backend ; le calcul à l'exécution ne fait que lire ce fichier et
  résoudre un petit système linéaire — aucun Blender/découpe de maillage
  au moment de la requête.
- **Décision de conception à trancher explicitement, pas à improviser en
  cours de route** : où exactement se situe la hauteur anatomique de
  chaque mesure sur le maillage (ex. à quelle hauteur Y couper pour « tour
  de poitrine ») ? Réutiliser/faire correspondre les définitions déjà
  implicites dans la table ANSUR de `body_params.py`, ou définir de
  nouveaux repères ancrés sur les proportions du maillage — documenter le
  choix fait.

#### Item 4 — Remplacer `poids = |z|` par un ajustement par optimisation (dépend de l'item 3)

- Pour un client donné, résoudre pour `w` (borné [0,1] par cible, le choix
  de signe -incr/-decr restant déterminé comme aujourd'hui) le `w` qui
  minimise l'écart pondéré entre les mesures virtuelles du maillage à `w`
  et les mesures réelles du client, plus un terme de régularisation pour
  éviter d'activer inutilement de nombreuses cibles.
- ANSUR redescend au rang de : (a) repli pour une mesure que le pipeline
  de vision n'a pas produite pour ce client, (b) garde-fou contre une
  entrée aberrante, (c) éventuellement un prior de régularisation — plus
  le mécanisme principal de mise à l'échelle de la déformation.
- Résoluble en millisecondes côté serveur, cohérent avec les contraintes
  de performance déjà en place pour `morph_weights.py`.

#### Item 5 — Cohorte locale camerounaise (plus tard, hors scope immédiat)

- 30 à 60 sujets si possible, protocole de mesure standardisé (un seul
  mesureur ou très peu, double mesure avec tolérance, hommes/femmes
  séparés).
- Valider non seulement la précision des cm prédits en amont (déjà fait
  sur les 13 sujets existants), mais la précision des mesures *virtuelles*
  de l'avatar *après* application des poids — jamais fait à ce jour.
- Si une référence locale est construite, la combiner à ANSUR par
  shrinkage (`μ_utilisée = α·μ_locale + (1-α)·μ_ANSUR`) plutôt que de
  remplacer entièrement, en étant plus prudent encore sur les
  écarts-types (une petite cohorte sous-estime la variabilité réelle).
- **Explicitement déprioritisé tant que les items 1 à 4 ne sont pas
  posés** — améliorer la référence de population n'a aucune valeur tant
  que le mécanisme z→poids reste lui-même non calibré.

### 2.4 État d'implémentation

**Items 1 à 4 implémentés, vérifiés, actifs en base de code** (pas encore
déployés sur O2Switch au moment de la rédaction — voir DEPLOIEMENT.txt).
L'item 5 reste délibérément en attente.

- **Items 1-2** : `muscle_factor` neutralisé, fessiers dérivés de la
  profondeur/largeur du bassin (SAM) quand disponible.
- **Item 3** : mesureur virtuel construit (`calibrate_sensitivity.py`,
  découpe du maillage par `bmesh.ops.bisect_plane` + regroupement des
  arêtes de coupe en composantes connexes pour isoler le bon anneau —
  l'approche initiale, un tri par angle autour d'un centre unique,
  produisait des périmètres de plusieurs centaines de cm dès que la coupe
  croisait aussi un bras ou une main). Matrices calibrées et committées
  (`sensitivity/{male,female}.json`). Limites documentées dans
  `sensitivity/README.md` (sens `-decr` non mesuré séparément, coupe à
  hauteur fixe fragile pour les cibles de proportion — un garde-fou
  détecte et neutralise le cas trouvé sur `leg_ratio`, bras/cuisse/
  poignet/cheville pas encore mesurés).
- **Item 4** : `optimize_weights()` actif dès que la matrice est présente
  (vérifié : `compute_avatar_morphology()` renvoie
  `method="sensitivity_optimization"` sur un cas réaliste). Un bug de
  traduction de noms de cibles trouvé et corrigé au passage — voir
  `PARAM_TO_TARGET` dans `target_map.py` et `_target_name()` dans
  `optimize_weights.py`.

70 tests automatisés (`test_morphology.py`, `test_robustesse.py`) passent.

---

## 3. Fichiers de référence (ne pas dupliquer leur contenu, les lire/éditer directement)

- `BRIEF_MODELE_CORPOREL_AVATAR.md` — pipeline de rendu complet, problème
  mémoire GPU (résolu), historique des bugs, propositions d'architecture
  évaluées et écartées (SMPL/STAR).
- `BRIEF_CALCUL_MORPHOLOGIE.md` — description complète et à jour de
  l'algorithme mensuration → poids (ce chantier s'appuie entièrement
  dessus ; formules exactes, tables ANSUR complètes, questions ouvertes
  déjà posées à l'analyse externe).
- `RAPPORT_PROJET.md` — journal daté du projet dans son ensemble, §7 pour
  l'état de l'avatar 3D.
- Code concerné : `backend/app/services/avatar/{body_params.py,
  target_map.py, generator.py, export_base_mesh.py, service.py}`.
