# Le pipeline de mesure amélioré — ce qui a été fait, et pourquoi

> Ce document explique `ml/bench/pipeline_ameliore.py` : ce qu'il fait, d'où
> vient chaque correction qu'il applique, comment chacune a été vérifiée, et
> pourquoi certaines mesures n'ont volontairement **aucune** correction.
> Pour le détail brut de toutes les expériences (y compris les pistes
> rejetées), voir `claude_code.md`. Ce document-ci est la version "pour
> comprendre", pas le journal de recherche complet.

---

## 1. Le problème de départ

Le pipeline de production (`backend/app/services/vision/`) mesure 12
grandeurs corporelles à partir de 2 photos (face + profil) : 8 tours de
corps (cou, poitrine, taille, hanches, biceps, cuisse, poignet, cheville)
et 4 longueurs (carrure, manche, entrejambe, longueur de dos).

Sur les 13 seuls sujets réels dont on dispose (photographiés puis mesurés
au mètre ruban), l'erreur moyenne était de **3.10 cm**, avec de gros
écarts entre mesures : 0.88 cm pour la longueur de dos (déjà excellent),
jusqu'à 6.66 cm pour le tour de taille (très mauvais). L'objectif fixé
était de descendre sous 1 cm sur toutes les mesures.

**Idée centrale du pipeline amélioré** : ne pas toucher au pipeline de
production existant (MediaPipe + MobileSAM + modèles Ridge), mais ajouter
une **couche de correction statistique par-dessus sa sortie**. Si le
pipeline actuel se trompe de façon *systématique* pour une mesure donnée
(toujours dans le même sens, avec une amplitude prévisible), on peut
apprendre cette erreur et la soustraire. Si l'erreur est plutôt du
*bruit* (imprévisible, change de sens d'un sujet à l'autre), aucune
formule ne peut la corriger — il faut alors s'attaquer à la source du
bruit (photo, vêtement), pas à la formule.

Tout le travail décrit ici consiste à trier, mesure par mesure, laquelle
des deux situations s'applique — et à ne corriger que ce qui est
réellement corrigeable.

---

## 2. D'où viennent les données de vérité

Le seul jeu de données avec de vraies mesures au mètre ruban comporte
**13 sujets** (8 hommes, 5 femmes, tailles 159-193 cm, poids 49-93.8 kg),
photographiés et mesurés lors d'une campagne terrain. Ces données étaient
dispersées dans un script jetable d'une session précédente et ont été
sauvegardées dans `ml/bench/sujets.json` pour ne plus jamais être perdues.

**Point capital, à garder en tête pour tout ce qui suit** : 13 sujets,
c'est très peu pour calibrer quoi que ce soit statistiquement. Chaque
correction décrite plus bas a été **validée avec le plus haut niveau de
rigueur possible avec un échantillon aussi petit** (voir section 4), mais
aucune ne doit être considérée comme définitive. Le tableau final indique
pour chacune un niveau de confiance et la taille de l'échantillon qui l'a
validée.

---

## 3. Trois recherches, pas une seule

Ce dépôt a vu **trois agents travailler en parallèle** sur le même
objectif de précision, sans coordination directe entre eux. Le pipeline
amélioré est une synthèse des trois, pas le travail d'une seule
recherche.

### 3.1 Cette session (la mienne)

Approche : tester une piste à la fois, mesure par mesure, en variant les
angles (régression sur la sortie du modèle, régression sur des variables
brutes, séparation par sexe, corrections géométriques). Plus de 30 pistes
testées au total sur la session, chacune acceptée ou rejetée sur preuve
chiffrée.

**Deux erreurs de méthode démasquées en cours de route**, importantes à
comprendre parce qu'elles ont façonné toute la suite :

- Une première tentative de corriger `biceps` et `thigh` en choisissant,
  parmi 9 variables candidates, celle qui donnait la meilleure erreur en
  validation croisée, semblait donner des gains énormes. Repassée dans un
  test plus strict (voir section 4), ce gain s'est **effondré** — c'était
  un artefact. Le problème : la variable "gagnante" était choisie en
  regardant l'erreur de TOUS les sujets, y compris celui qu'on est censé
  ne pas avoir vu. Le sujet "votait" indirectement sur son propre
  traitement.
- Un agrégat sur peu de sujets peut cacher qu'un seul point domine tout.
  Exemple concret : l'erreur de `chest` chez les femmes semblait
  incorrigible (5.68 cm de moyenne). En détaillant sujet par sujet, un
  seul sujet portait une erreur de 21 cm, contre 0.2 à 4.8 cm pour les 4
  autres. Sans ce sujet, l'erreur tombe à 0.83 cm — la mesure n'était
  probablement pas cassée, une seule donnée de référence l'était
  (probablement une erreur de saisie, jamais confirmée avec la personne
  qui a pris la mesure).

### 3.2 `freebuff.md` (un autre agent, même dépôt)

A travaillé sur exactement les mêmes 13 sujets et le même pipeline réel,
mais avec une approche différente : tester systématiquement des
combinaisons de 2-3 variables d'entrée brutes (poids, taille, largeurs et
profondeurs mesurées...) et garder, pour chaque mesure, la combinaison
donnant la meilleure erreur — **330 combinaisons testées par mesure**.

C'est exactement le type de procédure qui a produit l'artefact
biceps/thigh décrit ci-dessus (choisir le meilleur candidat parmi
beaucoup, sans protéger le sujet testé). Leurs résultats affichés étaient
donc a priori suspects, malgré des chiffres parfois spectaculaires
(`biceps` annoncé à 0.39 cm, contre 2.56 cm de base).

**Plutôt que rejeter ce travail en bloc ou lui faire confiance
aveuglément, chaque candidat proposé a été revérifié indépendamment**
(section 4.3) : certains résistent très bien à la vérification et sont
meilleurs que tout ce que j'avais trouvé ; d'autres s'effondrent
complètement. Le tri s'est fait sur preuve, pas sur la source.

### 3.3 `opencode.md` (un troisième agent, hors de ce dépôt)

A exploré une voie complètement différente et n'a **pas** été intégrée au
pipeline. Au lieu de corriger les 2 photos actuelles, cette recherche a
simulé une **capture vidéo multi-angles** (6 à 12 vues autour du sujet)
combinée au théorème géométrique de Cauchy-Crofton (le périmètre d'une
section convexe est égal à π fois la largeur moyenne vue sous tous les
angles — un résultat mathématique exact, pas une approximation comme
l'ellipse actuelle).

Les résultats simulés sont impressionnants (poitrine et taille ~1.0 cm,
hanches ~1.3-1.5 cm) mais reposent sur une simulation utilisant des
maillages 3D exacts, **jamais confrontée aux vraies photos ni au vrai
pipeline MediaPipe/SAM** — l'agent le signale lui-même explicitement dans
son propre document. Cette approche demanderait en plus une nouvelle
façon de prendre les mesures (vidéo plutôt que 2 photos), donc un
changement d'interface mobile bien plus lourd qu'une simple correction de
calcul.

**Décision** : ne pas intégrer cette piste maintenant. Elle reste
documentée comme option sérieuse pour une future itération si les
corrections actuelles ne suffisent pas, mais mélanger une piste jamais
testée en conditions réelles avec des corrections déjà vérifiées aurait
rendu tout le pipeline moins fiable.

---

## 4. Comment chaque correction a été vérifiée

C'est la partie la plus importante à comprendre, parce que c'est elle qui
distingue une vraie amélioration d'un chiffre qui a l'air bon sur le
papier mais ne généralise à rien.

### 4.1 Validation croisée "leave-one-out" (LOO)

Avec seulement 13 sujets, on ne peut pas se permettre de mettre de côté
un vrai jeu de test (il ne resterait presque rien pour calibrer). La
méthode standard dans ce cas : pour chaque sujet, on calibre la
correction sur les 12 *autres*, puis on l'applique à celui qu'on a
exclu, et on regarde si elle tombe juste. On répète pour chacun des 13
sujets et on moyenne l'erreur. Chaque sujet sert donc une fois de test
"à l'aveugle", sans jamais avoir influencé sa propre correction.

C'est le niveau de rigueur minimum utilisé pour toute correction
mentionnée dans ce document.

### 4.2 LOO "imbriqué" — quand plusieurs variables sont en compétition

Le LOO simple protège la calibration, mais pas toujours la **sélection**.
Si on doit choisir, parmi plusieurs variables candidates, laquelle
utiliser, et qu'on fait ce choix en regardant l'erreur LOO globale (tous
sujets confondus), le sujet exclu influence quand même indirectement quel
candidat est retenu pour LE corriger LUI. C'est le mécanisme exact de
l'artefact biceps/thigh décrit en 3.1.

La correction : pour chaque sujet exclu, la variable à utiliser est
elle-même choisie *sans jamais regarder ce sujet* (une LOO à l'intérieur
de la LOO). Une variable n'est retenue comme "confirmée" que si ce choix
est **stable** — la même variable gagne quel que soit le sujet exclu. Si
le choix change d'un sujet à l'autre, c'est le signe que la procédure
capte du bruit, pas un vrai signal — rejeté.

### 4.3 Revérification indépendante des candidats de `freebuff.md`

Pour chaque correction proposée par `freebuff.md`, la même formule a été
recalculée à partir de mes propres données extraites du pipeline
(légèrement différentes des leurs, même sujets mais features recalculées
séparément), puis testée en LOO simple. Le raisonnement : si une formule
généralise vraiment, elle doit rester bonne même sur des données
recalculées indépendamment. Si elle s'effondre, c'est le signe qu'elle
avait été choisie sur mesure pour leurs 13 points précis, pas parce
qu'elle capte une vraie relation.

Résultat de cette vérification (voir tableau complet section 5) : 2
candidats sur 5 revérifiés se sont effondrés (`shoulder` : 1.10 cm annoncé
→ 6.28 cm en vérification indépendante), 2 ont bien résisté et se sont
même révélés meilleurs que mes propres corrections (`biceps`, `thigh`).

---

## 5. Mesure par mesure : ce qui a été retenu, et pourquoi

| Mesure | Erreur avant | Erreur après | D'où ça vient | Confiance | Validation indép. |
|---|---|---|---|---|---|
| back_length | 0.88 cm | 0.88 cm (inchangé) | — | déjà bon | inchangé (attendu) |
| **biceps** | 2.33 cm | **0.63 cm** | freebuff, revérifié | haute | quasi neutre |
| **thigh** | 1.64 cm | **0.74 cm** | freebuff, revérifié | haute | quasi neutre |
| **neck** | 1.74 cm | **1.26 cm** | cette session | moyenne | amélioré |
| **ankle** | 4.02 cm | **1.22 cm** | cette session | haute | **confirmé fort** |
| **inseam** | 3.14 cm | **~2.98 cm** | cette session (géométrique) | moyenne¹ | léger recul |
| **sleeve_length** | 4.50 cm | **3.08 cm** | cette session | moyenne | amélioré |
| **chest** (hommes) | 4.45 cm | **2.61 cm** | cette session | moyenne, n=7 | amélioré |
| **hips** (hommes) | 4.04 cm | **2.35 cm** | cette session | moyenne, n=7 | **confirmé fort** |
| **waist** (hommes) | 6.66 cm | **4.14 cm** | cette session | moyenne, n=7 | amélioré |
| chest/hips/waist (femmes) | — | non corrigées | — | échantillon trop petit | pas encore testable |
| ~~wrist~~ | 1.55 cm | ~~0.72 cm~~ | cette session | **retirée** | dégrade, voir §8 |
| ~~shoulder~~ | 2.27 cm | ~~1.46 cm~~ | cette session | **retirée** | échec net, voir §8 |

¹ descendue de "haute" à "moyenne" après la validation indépendante (§8).

**`wrist` et `shoulder` ont été retirées du pipeline le 25 août 2026**,
après avoir échoué la première validation indépendante — voir section 8
pour le détail complet de ce qui s'est passé et pourquoi.

### Pourquoi ces variables-là, précisément

La grande majorité des corrections retenues utilisent le **poids** comme
variable principale (`wrist`, `ankle`, `shoulder`, `chest` hommes), ou le
poids combiné à une ou deux mesures de silhouette déjà extraites
(`biceps`, `thigh`, `neck`). Ce n'est pas un choix arbitraire : le
pipeline actuel utilise un modèle Ridge (une régression linéaire
régularisée) entraîné sur une base militaire américaine (ANSUR II). Ce
type de modèle a tendance à "tirer" ses prédictions vers la moyenne de sa
population d'entraînement dès qu'il rencontre un profil différent — un
phénomène connu, appelé *shrinkage*. Le poids du sujet, lui, est une
mesure directe et fiable (saisie par le client, pas déduite d'une photo)
qui porte une grande partie de l'information que le modèle Ridge a
tendance à sous-exploiter. Recalibrer directement sur le poids corrige
ce biais de "tirage vers la moyenne" sans dépendre d'aucune photo
supplémentaire.

Pour `chest`, `hips`, `waist` (les tours du tronc, calculés par
géométrie — pas par le modèle Ridge), le mécanisme est différent : ces
mesures dépendent d'une largeur et d'une profondeur mesurées sur la
silhouette, très sensibles au vêtement porté et à l'angle de la photo de
profil. Chez les hommes, un lien fort avec le poids (voire l'IMC) a été
mis en évidence malgré ce bruit — probablement parce que la répartition
de graisse autour du torse suit un schéma plus régulier chez l'homme.
Chez les femmes, ce même lien n'apparaît pas de façon fiable sur les 5
sujets disponibles (voir 5.1).

`inseam` (entrejambe) est un cas à part : ce n'est pas une correction
statistique mais une **correction de la formule géométrique
elle-même**. Le code actuel mesure la distance entre le milieu des
hanches et la cheville la plus visible sur la photo — un mélange entre un
point symétrique (milieu de 2 points) et un point asymétrique (une seule
cheville), qui peut introduire un biais si la posture n'est pas
parfaitement droite. Remplacer "la cheville la plus visible" par "la
moyenne des deux chevilles" réduit l'erreur (vérifié sujet par sujet :
9 sujets sur 13 s'améliorent). Ce n'est pas une variable statistique
apprise, donc pas de risque de sur-apprentissage sur ce point précis.

### 5.1 Pourquoi rien n'est corrigé pour chest/hips/waist chez les femmes

Deux raisons distinctes, pas la même limite :

- **`hips`** est déjà bon chez les femmes sans aucune correction
  (1.6 cm de moyenne sur les 5 sujets) — il n'y a simplement rien à
  corriger.
- **`chest`** et **`waist`** montrent un signal encourageant une fois les
  2 sujets suspects mis de côté (chest tombe à 0.83 cm sur les 3 sujets
  restants), mais **3 points, ce n'est pas assez pour figer un
  coefficient de correction avec un minimum de confiance**. Le diagnostic
  pointe vers un problème de qualité de deux mesures de référence
  précises (probablement une erreur de saisie pour l'une, un vêtement
  très ample pour l'autre), pas vers une limite du pipeline lui-même —
  mais tant que ce n'est pas confirmé avec la personne qui a pris ces
  mesures, aucune correction n'est appliquée.

---

## 6. Ce que le pipeline NE fait PAS

- **Il ne modifie rien dans `backend/app/`.** C'est un module
  entièrement séparé (`ml/bench/pipeline_ameliore.py`) qui prend la
  sortie du pipeline de production et la corrige *après coup*. Le
  pipeline de production continue de tourner exactement comme avant.
- **Il n'invente aucune mesure.** Si le pipeline de production échoue
  (photo illisible, pose non détectée), le pipeline amélioré échoue
  aussi — il ne masque jamais un échec par une estimation de repli.
- **Il ne corrige pas les mesures où aucun signal fiable n'a été trouvé**
  (`chest`/`hips`/`waist` chez les femmes) plutôt que d'appliquer une
  correction inventée qui risquerait de dégrader silencieusement ces
  mesures.

---

## 7. Comment le tester

```bash
python ml/bench/pipeline_ameliore.py <fichier_nouveaux_sujets.json> <dossier_photos/>
```

Le fichier JSON doit suivre le format documenté dans
`ml/bench/nouveaux_sujets_exemple.json` : pour chaque sujet, sa taille,
son poids, son sexe, ses 12 mesures réelles (mètre ruban), et les noms
des 2 photos. Le script affiche, mesure par mesure, l'erreur du pipeline
brut et l'erreur après correction — la première validation réellement
indépendante de tout ce travail, sur des sujets qu'aucune des trois
recherches n'a jamais vus.

C'est l'étape suivante : tant que ce test n'a pas été fait sur de
nouveaux sujets, tout ce qui précède reste une validation interne, aussi
rigoureuse soit-elle.

---

## 8. Validation indépendante du 25 août 2026 — ce qu'elle a changé

Ce test a été fait : 7 nouveaux sujets photographiés et mesurés
séparément, jamais vus par aucune des trois recherches. 6 ont pu être
traités (1 a échoué au pipeline lui-même — largeur de hanches mesurée à
12.1 cm, rejetée par la garde de plausibilité, probablement un problème
d'extraction sur cette photo précise).

### Ce qui s'est confirmé

`ankle` et `hips` (hommes) sont sortis de ce test **encore meilleurs
qu'attendu** : gains réels de +2.98 cm et +3.32 cm sur des sujets
totalement inédits. `neck`, `chest` (hommes), `waist` (hommes) et
`sleeve_length` se sont aussi améliorés, plus modestement. C'est la
preuve que ces corrections captent un vrai signal, pas un artefact de
l'échantillon de calibration.

### Ce qui a échoué — et pourquoi c'est important

Deux corrections qui semblaient solides en validation croisée interne se
sont effondrées :

**`shoulder`** (largeur d'épaules, corrigée à partir du poids seul) :
1.63 → **4.20 cm**, une nette dégradation. En regardant sujet par sujet,
la cause est claire : sur un sujet de 95 kg (carrure réelle 35 cm), la
formule prédit **47.2 cm** — une erreur de 12 cm alors que la mesure
brute du pipeline (35.0 cm) était quasiment parfaite. Le lien "poids →
largeur d'épaules" appris sur 11 sujets (poids max ~94 kg) ne se
généralise tout simplement pas : la largeur d'épaules dépend de
l'ossature, pas de la masse corporelle, et une relation linéaire
poids-carrure n'a pas de sens physique au-delà d'une certaine plage.

**`wrist`** (tour de poignet) : 1.17 → 1.92 cm. C'était pourtant la
correction la plus solide en interne (0.72 cm en validation croisée,
douze sujets sur douze donnant le même résultat stable). Sur les 6
nouveaux sujets, elle améliore 2 cas et en dégrade 4 — le signal ne tient
pas.

**Les deux ont été retirées du pipeline** (`ml/bench/pipeline_ameliore.py`,
déplacées dans `CORRECTIONS_REJETEES_VALIDATION`, conservées pour mémoire
mais jamais appliquées).

### La leçon générale

Une correction validée par LOO sur 11-13 sujets peut sembler
irréprochable — stable, cohérente, jamais démasquée comme un artefact de
sélection — et **quand même ne pas généraliser**, simplement parce que
11-13 points ne couvrent jamais toute la variété réelle des morphologies.
La validation croisée protège contre le sur-apprentissage AU SEIN de
l'échantillon ; elle ne protège pas contre le fait que l'échantillon
lui-même est petit et peut ne pas représenter la population cible. Seul
un test sur des sujets réellement nouveaux peut révéler ça — ce qui vient
d'arriver ici.

**Conséquence pratique** : plus une correction s'appuie sur une seule
variable simple (poids, taille) sans aucun ancrage physique direct
(comme la largeur d'épaules, qui dépend de l'ossature plutôt que du
poids), plus elle risque de mal s'extrapoler. `ankle` et `hips`
(hommes) ont résisté parce que le lien poids/IMC ↔ tour de ces zones a
une vraie justification physiologique (répartition de graisse). `shoulder`
n'avait pas cette justification — le lien observé sur 11 sujets était
probablement une coïncidence d'échantillon, pas une vraie relation
causale.

### Bilan chiffré, après retrait de shoulder/wrist

| | Avant correction | Après correction |
|---|---|---|
| Moyenne des 12 mesures (n=6, sujets inédits) | 3.87 cm | **3.23 cm** |

Gain moyen réel de +0.64 cm sur des sujets jamais vus — plus modeste que
les gains internes (qui allaient jusqu'à -3 cm sur certaines mesures),
mais réel, mesuré indépendamment, et sans aucune dégradation restante
excepté `inseam` (léger recul, confiance abaissée mais conservée pour
l'instant — la correction géométrique est structurellement moins à
risque d'extrapolation qu'une régression apprise).
