# Sur-MeZur — Brief technique pour analyse externe : modèle corporel de l'avatar 3D

## Objet de ce document

Ce document rassemble, sans filtre ni parti pris, l'ensemble des contraintes
réelles du projet et l'état exact de ce qui a déjà été construit, pour
soumettre le choix d'architecture du **modèle corporel de l'avatar 3D** à
une analyse externe. Deux propositions ont déjà été reçues et évaluées en
interne (résumées en fin de document) — l'objectif ici n'est pas de les
invalider par avance, mais de donner à quiconque les examine (ou en propose
une troisième) une image complète et honnête du terrain sur lequel elles
doivent s'appliquer.

---

## 1. Le projet, en une phrase

Sur-MeZur met en relation des clients et des tailleurs au Cameroun : un
client se photographie (deux photos, face et profil), l'application en
déduit ses mensurations, génère un avatar 3D à sa morphologie, il choisit un
modèle de vêtement, négocie le prix avec un tailleur, et suit la confection.
L'avatar 3D sert de support visuel pour l'essayage virtuel avant commande.

---

## 2. Contraintes d'infrastructure serveur — les plus dures, à respecter en premier

**Hébergement mutualisé (O2Switch, cPanel/Passenger), pas de VPS, pas de
budget serveur pour l'instant.** Ce point conditionne tout le reste :

- **Aucun GPU.** Tout calcul serveur tourne sur CPU partagé.
- **Quota CPU trompeur.** Les processus voient 56 cœurs (`nproc`), mais le
  quota réel alloué (CloudLinux) est de 1 à 2 cœurs. Les bibliothèques de
  calcul (torch, OpenCV, BLAS) lancent par défaut un thread par cœur
  *visible*, pas par cœur *réel* — un calcul qui prend 3 secondes en local
  peut ne jamais aboutir en production par sursouscription de threads.
  Incident réel déjà vécu : deux tentatives d'analyse ont saturé le
  processeur plus de 300 secondes chacune sans jamais terminer, avant
  correctif (plafonnement explicite des threads au démarrage du module,
  avant tout import de torch/numpy/cv2).
- **Pas de vrai cycle de vie ASGI.** Passenger exécute l'application en
  WSGI via `a2wsgi`, qui n'émet aucun évènement de démarrage/arrêt — tout
  ce qui doit s'exécuter au lancement du processus doit être déclenché à
  l'*import* du module, pas via les hooks FastAPI standards (qui ne
  s'exécutent jamais ici).
- **Aucune tâche de fond fiable dans le cycle de requête.** `BackgroundTasks`
  de FastAPI ne rend pas la main tant que la tâche n'est pas terminée sous
  a2wsgi — un traitement de 10 à 90 secondes bloquait donc **tout le site**,
  pas seulement la requête concernée. Contourné en sortant le traitement
  lourd (calcul de mensurations) du cycle de requête HTTP via un worker
  déclenché par tâche planifiée (cron), pas par la requête elle-même.
- **RAM mesurée** : le pipeline de vision (MediaPipe + MobileSAM chargés en
  mémoire, avant toute requête) consomme **393 Mo** au repos. Le pic pendant
  une analyse réelle n'a pas été mesuré précisément mais est nécessairement
  supérieur.
- **Pas de HTTPS.** AutoSSL n'a jamais émis de certificat pour le
  sous-domaine API ; l'application communique en HTTP simple, avec une
  exception de trafic en clair configurée côté Android pour ce seul
  domaine.
- **Pare-feu applicatif géré par l'hébergeur, hors de contrôle direct.** Un
  filtre anti-robot (défi JavaScript) a récemment bloqué la totalité du
  trafic API — y compris les appels légitimes de l'application mobile, qui
  n'a pas de moteur JavaScript pour le résoudre — sans avertissement ni
  réglage en libre-service trouvé dans l'espace client. Résolu depuis, mais
  révèle une fragilité opérationnelle propre à cet hébergement, hors du
  contrôle du projet.
- **Base de données SQLite sur disque persistant** (pas de système de
  fichiers éphémère) — c'est l'un des rares points stables de cette
  configuration.
- **Aucun système de migration de schéma.** `Base.metadata.create_all()`
  crée les tables manquantes mais n'ajoute jamais une colonne à une table
  existante — toute évolution de schéma nécessite une intervention manuelle
  documentée séparément.

**Conséquence directe pour le choix du modèle corporel** : toute approche
qui nécessite un calcul CPU non trivial *par requête utilisateur* côté
serveur (génération de mesh, optimisation itérative, fitting) est risquée
sur cette infrastructure telle qu'elle existe aujourd'hui, indépendamment
de sa légèreté théorique — ce projet a déjà été mis en échec deux fois par
des calculs pourtant qualifiés de "rapides" ailleurs.

---

## 3. Contraintes client (application mobile)

- **React Native / Expo (SDK 54), Android** — pas d'app native Kotlin/Swift
  distincte, tout passe par le pont JavaScript/Hermes.
- **Rendu 3D via `expo-gl`** (contexte WebGL sur `TextureView` Android) +
  **three.js** (version 0.185.1) pour le chargement/rendu du glTF.
- **Marché cible camerounais** — appareils Android d'entrée à moyenne
  gamme probables, connexions réseau variables (retry avec backoff déjà
  implémenté sur les uploads pour compenser des coupures transitoires).
- **Taille de l'application** : préoccupation déjà exprimée explicitement
  côté produit ("rendre l'app légère") — l'APK actuel avoisine 130 Mo,
  dont une part significative vient déjà des deux maillages d'avatar
  embarqués.
- **Aucun calcul lourd souhaité côté client** au-delà du rendu 3D
  lui-même — pas d'entraînement, pas d'inférence ML sur device.

---

## 4. Le pipeline de mesure existant (en amont de l'avatar, déjà validé)

Contexte nécessaire car le modèle corporel doit consommer exactement ce que
ce pipeline produit.

**Entrée** : deux photos (face, profil), taille et poids déclarés, sexe.

**Traitement** : MediaPipe (33 points de squelette) + MobileSAM (silhouette
détourée). Douze mensurations calculées par l'une de trois méthodes selon
la mesure : régression Ridge (cou, biceps, cuisse, poignet, cheville),
lecture directe sur le squelette (carrure, longueur de manche, entrejambe,
longueur de dos), ou géométrie d'ellipse (poitrine, taille, hanches).

**Précision mesurée sur 13 sujets réels** (métrique de référence du
projet, jamais estimée) :

| Groupe | Mesures | Erreur moyenne |
|---|---|---|
| Dans la cible | poignet, carrure, cou, dos, biceps, cuisse | 1,1 à 3,0 cm |
| À la limite | entrejambe, cheville, manche | 3,3 à 3,9 cm |
| Hors cible | hanches, poitrine, taille | 5,2 à 9,3 cm |

**Enseignement central du projet, directement pertinent pour le choix du
modèle corporel** : un modèle de régression entraîné sur la base
anthropométrique américaine ANSUR II donnait 1,38 cm d'erreur *sur ANSUR*
mais 5,2 cm sur les 13 sujets réels camerounais mesurés — la même
architecture, les mêmes photos, seule la population change. C'est ce
constat qui a fait abandonner l'apprentissage statistique au profit de la
géométrie pure pour les trois mesures les plus délicates (aucune
hypothèse de population). **Tout modèle corporel entraîné ou calibré sur
une population non-camerounaise hérite du même risque**, et ce risque a
déjà coûté cher une fois dans ce projet.

---

## 5. Le pipeline avatar existant, en détail

### 5.1 Historique : pourquoi Blender ne tourne plus en production

La toute première version générait un fichier GLB unique par client via un
subprocess Blender (MakeHuman/MPFB2) déclenché à la demande côté serveur.
Abandonné : Blender ne peut pas tourner de façon fiable sur cet
hébergement (voir §2 — blocage a2wsgi/BackgroundTasks, coût CPU par
requête). Le pipeline actuel a été conçu spécifiquement pour éliminer tout
calcul Blender du chemin de requête.

### 5.2 Architecture actuelle

```
Une seule fois, hors ligne (poste de développement, Blender + MPFB2) :
  export_base_mesh.py
      → corps MakeHuman neutre (bpy.ops.mpfb.create_human())
      → charge ~50-60 cibles MakeHuman comme morph targets glTF
        (measure-*, shape, largeur/profondeur, proportion, graisse,
        muscle, volume mammaire), aux deux sens (-incr/-decr), à poids 0
      → exporte 2 fichiers : avatar-base-male.glb, avatar-base-female.glb
      → ces fichiers sont embarqués tels quels dans l'app mobile
        (mobile/assets/), aucune génération par client

À chaque requête (temps réel, ~millisecondes, CPU pur, aucun Blender) :
  morph_weights.py + target_map.py
      → mensurations du client → poids [0,1] par nom de cible
        (signe = -incr ou -decr, magnitude = z-score borné)
      → renvoyé au client sous forme de dictionnaire {nom_cible: poids}

Côté client mobile (Viewer3D.tsx, three.js + expo-gl) :
  → charge le maillage de base local correspondant au sexe
  → applique les poids reçus sur mesh.morphTargetInfluences
  → rendu WebGL dans un GLView
```

### 5.3 Caractéristiques mesurées du maillage de base actuel

- 21 833 sommets, 18 486 polygones (36 972 triangles), **un seul mesh, un
  seul matériau** (vérifié par inspection directe — MPFB2 ne crée aucun
  matériau à l'initialisation ; un seul est ajouté ensuite pour la teinte
  de peau).
- **Intégralement lissé dès sa création** (`use_smooth = True` sur 100 %
  des polygones, avant toute intervention) — un lissage d'ombrage manuel
  s'est avéré n'avoir strictement aucun effet mesurable (fichiers exportés
  identiques au bit près, avec ou sans).
- 60 cibles de morphologie côté homme, 62 côté femme (volume mammaire en
  plus).
- Mise à l'échelle par la taille réelle du client, avec un diviseur
  spécifiquement calculé (`reference_height_cm`, estimation serveur de la
  hauteur du maillage *après* application des cibles — utiliser la hauteur
  du maillage neutre comme diviseur produisait plusieurs centimètres
  d'erreur, déjà mesuré et corrigé).

### 5.4 Le problème concret actif au moment de ce document

Compromis mesuré, sans solution gratuite trouvée à ce jour avec
l'architecture actuelle :

| Export | Poids fichier | Comportement mobile mesuré |
|---|---|---|
| Sans normales de morph par cible | ~4,7-4,8 Mo | Charge et s'affiche correctement, mais l'éclairage utilise les normales du maillage neutre pendant que la géométrie se déforme — désynchronisation visible aux poids de cible élevés, rapportée comme "aspect carré/anguleux" |
| Avec normales de morph par cible | ~20,5-21 Mo | Éclairage correct pendant la déformation, mais le volume de données (60 cibles × 21 833 sommets × position+normale, sans encodage creux) dépasse ce que le GPU du téléphone testé peut allouer pour la texture de morphing — échec de chargement, écran vide |

Deux hypothèses initiales sur la cause de l'aspect "carré" (ombrage plat
non lissé, matériau de peau débordant sur des emplacements yeux/dents non
filtrés) ont été **formellement écartées** par inspection directe du
maillage (voir §5.3) — ce ne sont pas les causes réelles. Les causes
probables restantes, non encore résolues : la résolution géométrique
elle-même (18 486 polygones pour l'ensemble du corps, potentiellement
faible sur les zones à faible rayon comme pieds/chevilles/articulations),
et le compromis décrit ci-dessus.

**Piste non testée, proposée mais pas encore implémentée** : au lieu de
transmettre les cibles de morphing au GPU pour un morphing en temps réel,
appliquer les poids reçus **une seule fois côté client en JavaScript**
directement sur les positions (les poids ne changent plus après génération
d'un avatar donné), jeter les données de cible, puis recalculer les
normales sur le résultat figé (`computeVertexNormals()`). Élimine le
compromis en supprimant le besoin de charger les cibles en mémoire GPU,
au prix d'un calcul CPU ponctuel au premier affichage plutôt que d'un
rendu GPU dynamique — non vérifié en pratique.

### 5.5 Bugs déjà rencontrés et corrigés sur ce pipeline (pour référence)

- Mise à l'échelle utilisant la mauvaise hauteur de référence (corrigé).
- Teinte de peau non réactive à un changement après le premier rendu
  (corrigé — la scène three.js n'était construite qu'une fois).
- Écran restant bloqué indéfiniment sur un échec de chargement silencieux
  (corrigé — distinction explicite succès/échec ajoutée).
- Hauteur du visualiseur figée à une valeur incorrecte au chargement du
  module (`Dimensions.get()` statique plutôt que réactif — corrigé).

---

## 6. Ce qui n'a jamais pu être vérifié

- **Aucun avatar n'a encore été visuellement validé bout en bout sur un
  appareil physique** dans des conditions représentatives — chaque test
  réel a jusqu'ici révélé un nouveau blocage technique (réseau, chargement,
  mise en page) avant même de pouvoir juger de la qualité morphologique.
- Le choix du sexe erroné signalé lors d'un test n'a aucune cause
  identifiée dans le code (chemin de sélection → envoi → utilisation
  serveur relu en entier, correct) — possible erreur de manipulation lors
  du test, ou bug d'interaction non reproduit.
- La fluidité de rotation sur device réel, avec le compromis de poids
  finalement retenu, n'est pas encore mesurée.

---

## 7. Deux architectures déjà proposées et évaluées en interne

Fournies ici pour éviter de rouvrir des pistes déjà écartées avec
argumentation, ou pour qu'une analyse externe les contredise si l'un des
arguments s'avère faible.

### Proposition A — SMPL/STAR + régressseur appris + optimisation CPU

Remplacer MakeHuman par un modèle paramétrique SMPL ou STAR, avec un
régressseur mensurations→β entraîné sur un dataset synthétique généré par
le modèle lui-même, affiné par une optimisation itérative légère (5 à 20
itérations) comparant les mesures du mesh généré aux mesures cibles.

**Réserves soulevées** :
1. Licence SMPL/STAR non-commerciale par défaut (Max Planck/Meshcapade) —
   un usage commercial nécessite une négociation de licence séparée,
   non chiffrée, non entamée.
2. Toute optimisation itérative par requête réintroduit du calcul CPU
   serveur substantiel — le risque déjà matérialisé deux fois sur cet
   hébergement (voir §2).
3. Un régressseur entraîné sur des données synthétiques *générées par le
   modèle SMPL lui-même* n'apprend qu'à inverser l'espace de forme SMPL —
   ça ne garantit rien sur la fidélité à une morphologie camerounaise que
   SMPL n'a probablement pas vue en quantité dans ses propres données
   d'entraînement (CAESAR, population majoritairement nord-américaine/
   européenne). C'est structurellement le même risque de biais de
   population déjà mesuré et documenté en §4.

### Proposition B — MakeHuman/MPFB2 comme backend derrière une couche
d'abstraction ("Sur-MeZur Body Model"), avec option d'évolution future vers
un modèle statistique (PCA) calibré sur des données camerounaises réelles

Garder MakeHuman comme moteur de forme actuel, mais formaliser une
interface stable (mensurations → paramètres → mesh) découplée de
l'implémentation, pour pouvoir la remplacer plus tard sans réécrire le
reste de l'application. Options intermédiaires : cibles de morphing
"couture" personnalisées, paramètres globaux + corrections locales, PCA
sur des meshes réels à topologie cohérente.

**Réserves soulevées** :
1. Une bonne part de l'option "cibles personnalisées" existe déjà dans le
   pipeline actuel (`target_map.py` mappe déjà une vingtaine de cibles
   `measure-*` directement depuis les mensurations) — moins de travail
   neuf que la proposition ne le laisse penser, mais la présenter comme
   un chantier à construire est trompeur.
2. **Aucune des architectures proposées (A ou B) ne traite le problème
   concret décrit en §5.4** — le compromis poids-fichier/qualité
   d'éclairage sous déformation est indépendant du modèle de forme choisi
   ; c'est une contrainte du rendu GPU mobile, pas du modèle mathématique
   sous-jacent.
3. L'option PCA sur données réelles, bien que la plus rigoureuse à terme,
   suppose l'existence de meshes à topologie cohérente de vraies
   personnes — ce qui suppose soit un scan 3D (équipement dont le projet
   ne dispose pas, et que le pipeline photo existe précisément pour
   éviter), soit un fitting du modèle actuel sur des photos réelles pour
   produire ces meshes de référence (ce qui redevient un chantier de
   recherche à part entière). Le coût d'acquisition de cette donnée n'est
   pas chiffré dans la proposition.
4. Toute étape de "solveur" avec itération doit rester strictement hors
   ligne (calibration, génération de dataset) — jamais dans le chemin
   d'une requête utilisateur, pour les raisons du §2.

---

## 8. Questions ouvertes à soumettre

1. Le compromis décrit en §5.4 (poids du fichier vs correction de
   l'éclairage sous déformation) a-t-il une solution architecturale
   générale, au-delà de l'idée non testée du §5.4 (recalcul unique des
   normales côté client) ?
2. Existe-t-il une approche pour augmenter la résolution géométrique
   ciblée (pieds, articulations) sans alourdir uniformément tout le
   maillage ?
3. Le choix du modèle de forme (MakeHuman actuel, PCA maison, autre)
   devrait-il être découplé de la résolution du problème de rendu — ou
   les deux sont-ils en réalité liés d'une façon qui n'a pas été identifiée
   ici ?
4. Quelle est la plus petite quantité de données camerounaises réelles
   (mensurations + éventuellement photos) qui permettrait de commencer à
   corriger le biais de population sur les cibles déjà existantes, sans
   attendre un dataset de scans 3D ?
5. Y a-t-il une architecture de compression de morph targets (quantification,
   encodage creux, Draco/meshopt) suffisamment simple à intégrer dans une
   chaîne Blender → glTF → three.js/expo-gl mobile pour lever le compromis
   du §5.4 sans recalcul côté client ?
