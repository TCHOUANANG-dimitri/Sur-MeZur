## 11. VALIDATION INDÉPENDANTE (25 août 2026) — shoulder et wrist retirés

Premier vrai test hors échantillon : 7 sujets neufs, jamais vus par
aucune calibration (6 traités, 1 a échoué au pipeline — hipbreadth=12.1cm,
rejeté par la garde de plausibilité).

**Confirmé fort** : `ankle` (+2.98cm), `hips` hommes (+3.32cm) — mieux
que prévu. **Confirmé modeste** : `neck`, `chest` hommes, `waist` hommes,
`sleeve_length`. **Échec net, retiré du pipeline** : `shoulder` (1.63→
4.20cm — un sujet de 95kg voit sa carrure prédite à 47.2cm pour un réel
de 35.0cm, extrapolation du lien poids→carrure hors de la plage
calibrée, sans justification physiologique contrairement à ankle/hips).
`wrist` (1.17→1.92cm) aussi retiré — pourtant ma correction la plus
solide en LOO interne (12/12 stable), mais n'améliore que 2 sujets sur 6
ici. `inseam` : léger recul (-0.47cm), conservé mais confiance abaissée
à "moyenne" (correction géométrique, moins à risque qu'une régression).

Moyenne globale sur les 6 sujets, avant/après retrait de shoulder/wrist :
3.87 → 3.23cm (+0.64cm de gain réel, sans aucune dégradation restante
sauf inseam).

**Leçon methodologique retenue** (déjà pressentie, maintenant prouvée) :
une correction validée en LOO sur 11-13 sujets peut être parfaitement
stable ET quand même ne pas généraliser — la LOO protège contre la
fuite/sur-apprentissage AU SEIN de l'échantillon, pas contre le fait que
l'échantillon est trop petit pour couvrir la vraie variété des
morphologies. Seul un test sur données réellement neuves le révèle.

Détail complet, diagnostic sujet-par-sujet, et discussion : voir
`PIPELINE_AMELIORE.md` section 8. Pipeline mis à jour en conséquence
(`ml/bench/pipeline_ameliore.py`).

---

## 10. SYNTHÈSE FINALE — 3 recherches convergentes + pipeline implémentable

**Statut : le pipeline `ml/bench/pipeline_ameliore.py` est un module
NOUVEAU, autonome, testable — il n'implémente RIEN dans
`backend/app/`.** Il applique les corrections validées ci-dessous
au-dessus de la sortie du vrai pipeline de production.

### Trois recherches parallèles sur le même dépôt

En plus de cette session (ce document), **deux autres agents** ont
travaillé sur le même objectif, documentés dans deux fichiers distincts :

1. **`freebuff.md`** (`ml/bench/`) — même vérité terrain (13 sujets réels,
   `ml/bench/sujets.json`), même pipeline réel. A testé 330 combinaisons
   de 2-3 variables d'entrée par mesure, gardant le minimum LOO global —
   **méthodologiquement risqué** (exactement le piège de sélection
   démontré dans cette session, §3ter). **Revalidé indépendamment ici**
   (`exp11_synthese_finale.py`) : 2 de leurs candidats (biceps, thigh)
   **résistent très bien** et battent mes propres corrections ; 3 autres
   (shoulder, chest, hips — version "tous sexes") **s'effondrent**
   quand on les retexte sur des features recalculées indépendamment
   (shoulder : 1.10 cm annoncé → **6.28 cm** en vérification — rejeté).

2. **`opencode.md`** (racine `C:\Users\Admin\Desktop\Sur-MeZur\`) — voie
   complètement différente : simulation sur maillages 3D MakeHuman
   (vérité géométrique exacte) + théorème de Cauchy-Crofton (périmètre =
   π × largeur moyenne sur plusieurs angles) + priors de vêtement déclaré
   + correction de déficit de convexité calibrée LOO. Résultats simulés
   très prometteurs (poitrine/taille ~1.0 cm, hanches ~1.3-1.5 cm, membres
   ~1.1 cm) **mais jamais validés sur le vrai pipeline photo ni sur les 13
   sujets terrain** — l'agent le signale lui-même clairement ("Tier B
   bout-en-bout" non fait). **Incompatible avec les 2 photos actuelles** :
   demande une capture vidéo multi-angles (nouvelle UX mobile). Piste
   sérieuse pour une itération future, pas intégrée au pipeline ci-dessous.

### Le pipeline créé : `ml/bench/pipeline_ameliore.py`

Combine les corrections de cette session ET les candidats freebuff
revalidés, chacun avec son niveau de confiance et son origine documentés.
Fonctions principales :
- `mesurer_et_corriger(front_photo, side_photo, height_cm, weight_kg, gender)`
  — fait tourner le vrai pipeline puis applique les corrections.
- `evaluer_nouveaux_sujets(json_sujets, dossier_photos)` — **le point
  d'entrée pour tester sur les nouveaux sujets** : affiche MAE brut vs
  MAE corrigé, mesure par mesure, sur des sujets encore jamais vus par
  aucune correction. Format attendu :
  `ml/bench/nouveaux_sujets_exemple.json`.
- Utilisable en ligne de commande :
  `python ml/bench/pipeline_ameliore.py <json_sujets> <dossier_photos>`

**Testé (smoke test)** : tourne correctement de bout en bout sur un sujet
déjà connu (sujet 3), produit des valeurs corrigées cohérentes.

### Tableau final des corrections (voir docstring du module pour le détail)

| Mesure | MAE avant | MAE après | Origine | Confiance |
|---|---|---|---|---|
| wrist | 1.55 | 0.72 | session | haute |
| biceps | 2.33 | **0.63** | freebuff (revalidé) | haute |
| thigh | 1.64 | **0.74** | freebuff (revalidé) | haute |
| neck | 1.74 | 1.26 | session | moyenne |
| ankle | 4.02 | 1.22 | session | haute |
| shoulder | 2.27 | 1.46 | session | moyenne |
| inseam | 3.14 | ~2.98 | session (géométrique) | haute |
| sleeve_length | 4.50 | 3.08 | session | moyenne |
| chest (hommes) | 4.45 | 2.61 | session | moyenne (n=7) |
| hips (hommes) | 4.04 | 2.35 | session | moyenne (n=7) |
| waist (hommes) | 6.66 | 4.14 | session | moyenne (n=7) |
| back_length | 0.88 | 0.88 | — | déjà bon |
| chest/hips/waist (femmes) | — | **non corrigées** | — | échantillon insuffisant |

**Prochaine étape (demandée par l'utilisateur)** : tester
`evaluer_nouveaux_sujets()` sur de nouveaux sujets avec vérité terrain —
la première validation véritablement indépendante de tout ce travail,
sur des données que ni cette session ni freebuff n'ont jamais vues.

---

# Chantier précision — journal de recherche (non implémenté)

**Statut : recherche/expérimentation uniquement. Rien de ce document n'est
en production.** Tout ce qui est décrit ici a été mesuré sur le vrai pipeline
(`app.services.vision.pipeline.run`), jamais réimplémenté ni simulé, mais
aucune modification n'a été appliquée à `backend/app/`. À reprendre
explicitement avant toute implémentation.

Objectif fixé par l'utilisateur : viser une précision **sous 1 cm sur les 12
mesures**, sans se limiter aux constats déjà documentés dans
`RAPPORT_PROJET.md` — chercher activement de nouvelles pistes, les tester
sur preuves, ne s'arrêter que sur un résultat concret.

---

## 0. Ce qui a failli être perdu

Le jeu de vérité terrain (13 sujets photographiés + mesurés au mètre ruban)
n'existait **dans aucun fichier versionné** — seulement dans un script
jetable d'une session de travail antérieure. Il a été retrouvé dans
l'historique de conversation et **sauvegardé** :

- `ml/bench/sujets.json` — les 13 sujets (taille, poids, sexe, 8 tours,
  4 longueurs), avec l'appariement figé vers les photos réelles
  (`backend/uploads/measurement_photos/`).
- `ml/bench/fige_appariement.py` — script qui a établi cet appariement une
  fois (tri chronologique + détection face/profil par le rapport
  écartement d'épaules / hauteur de torse). **Ne pas relancer** : deux
  exécutions doivent comparer les mêmes images.
- `ml/bench/harness.py` + `ml/bench/run_bench.py` — banc d'essai qui fait
  tourner le VRAI pipeline sur les 13 sujets et calcule le MAE par mesure.
- `ml/bench/experiments/` — chaque piste testée, un script par piste,
  reproductible indépendamment.

Sans cette sauvegarde, toute nouvelle expérimentation aurait dû repartir de
zéro sans aucun moyen de chiffrer un gain.

**Point méthodologique important** : les 13 sujets ont déjà servi à calibrer
plusieurs paramètres actuellement en production (bandes de recherche
taille/hanches, fraction de volume du tronc, facteur `JOINT_TO_SHOULDER_WIDTH`,
`BACK_LENGTH_BY_SEX`...). Ce jeu ne peut donc plus servir de test **aveugle**
pour ces paramètres précis — seulement pour des changements structurels
n'ayant pas déjà été ajustés dessus (ce que les expériences ci-dessous
respectent, en signalant explicitement quand ce n'est pas le cas).

---

## 1. Baseline actuelle (mesurée, pas estimée)

Commande : `python ml/bench/run_bench.py --dump ml/bench/baseline_v3.json`

Pipeline complet réel (MediaPipe + MobileSAM + modèles V3 + géométrie),
13 sujets, 12 réussis (sujet 2 échoue : `chestbreadth=45.2` hors bornes de
plausibilité — voir §4).

| Mesure | MAE (cm) | Voie | Commentaire |
|---|---|---|---|
| back_length | 0.88 | directe | déjà très bon |
| wrist | 1.55 | Ridge | proche de la cible |
| thigh | 1.64 | Ridge | proche de la cible |
| neck | 1.74 | Ridge | proche de la cible |
| shoulder | 2.27 | directe | sujet 5 (carrure=54, aberrant) inclus dans l'écart brut mais **exclu** des stats officielles |
| biceps | 2.33 | Ridge | correct |
| inseam | 3.14 | directe | correct |
| hips | 4.04 | géométrie | hors cible |
| ankle | 4.02 | Ridge | hors cible — **mais voir §3, biais quasi pur** |
| chest | 4.45 | géométrie | hors cible |
| sleeve_length | 4.50 | directe | hors cible |
| waist | 6.66 | géométrie | le pire |
| **MOYENNE** | **3.10** | | |

Ces chiffres **diffèrent** de ceux documentés dans `RAPPORT_PROJET.md` §3
(qui datait d'une version antérieure du pipeline — le passage à V3, avec
socle géométrique + résidu appris uniquement quand il aide, a déjà amélioré
plusieurs mesures sans que le rapport ait été remis à jour avec ce chiffrage
précis). **`baseline_v3.json` est désormais la référence à jour.**

---

## 2. Pistes testées et **rejetées** (sur preuves)

### 2.1 Plancher à zéro sur l'épaisseur de vêtement négative

Fichier : `ml/bench/experiments/exp1_thickness_floor.py`

Hypothèse : `resolve_clothing_thickness` peut renvoyer une épaisseur
**négative** (bornes actuelles -4.0 à +8.0 cm) sur certains sujets
(-0.77, -0.4, -0.37 observés). Physiquement douteux — un vêtement ne devrait
quasiment jamais rendre la silhouette plus étroite que le corps nu.

**Résultat** : mixte, net légèrement négatif.
- waist : 6.66 → 6.43 (amélioration)
- hips : 4.04 → 3.78 (amélioration)
- chest : 4.45 → 5.30 (**dégradation nette**)
- moyenne globale : 3.10 → 3.13 (**légèrement pire**)

**Verdict : REJETÉ.** Le signal négatif porte de l'information réelle pour
la poitrine au moins une fois sur deux sujets. Ne pas toucher aux bornes
actuelles sans un jeu de données plus grand pour trancher au cas par cas.

### 2.2 Superellipse (courbe de Lamé) au lieu de l'ellipse pure — tronc

Fichiers : `ml/bench/experiments/exp2_superellipse.py`,
`exp2b_superellipse_terrain_fit.py`

Contexte : `_predict_v3` utilise une **ellipse pure** (n=2, formule de
Ramanujan) pour poitrine/taille/hanches, **sans aucun résidu appris** — un
résidu entraîné sur ANSUR dégradait le résultat (déjà documenté dans le
code). C'est le seul endroit de toute la chaîne où rien n'absorbe l'écart
entre la forme réelle d'un torse et la forme mathématique supposée.

Hypothèse : une section de torse humain n'est pas une ellipse mais plus
proche d'un rectangle aux coins arrondis (dos plat, sternum) → un exposant
n > 2. Un **seul paramètre scalaire** par zone est une correction à très
faible capacité, en principe moins encline au surapprentissage qu'un résidu
multi-variables.

**Étape 1 — calibré sur ANSUR** (4082 hommes, 1986 femmes), validation
croisée 5-fold rigoureuse :

| Zone | n optimal (H) | MAE ellipse (CV) | MAE superellipse (CV) |
|---|---|---|---|
| chest | 5.0 (butée) | 20.40 cm | 8.75 cm |
| waist | 2.7 | 4.85 cm | 1.23 cm |
| hips | 3.4 | 8.34 cm | 1.48 cm |

Amélioration spectaculaire **sur ANSUR**. Mais :

**Étape 2 — appliqué aux 13 sujets terrain** (n calibré sur ANSUR) :

| Zone | ellipse (n=2) | superellipse (n ANSUR) | delta |
|---|---|---|---|
| chest | 4.43 | 13.22 | **+8.78 (bien pire)** |
| waist | 6.67 | 9.64 | **+2.96 (pire)** |
| hips | 4.03 | 11.14 | **+7.11 (bien pire)** |

**Étape 3 — n calibré directement sur les 13 sujets terrain** (LOO, pas sur
ANSUR) : n optimal tombe systématiquement proche de 2 (1.3 à 2.2), et
dégrade quand même le résultat en LOO dans 5 cas sur 6 (seule exception :
waist/homme, -1.78 cm).

**Verdict : REJETÉ, avec une conclusion plus importante que le rejet
lui-même.** Le n optimal sur ANSUR (jusqu'à 5.0, en butée de la plage
testée) reflète une particularité de silhouette de la population militaire
américaine (probablement musculature/carrure), pas une propriété
universelle de l'anatomie humaine. C'est le **même piège de transfert de
population** déjà identifié pour le résidu de circonférence — mais démontré
ici par un mécanisme complètement différent (un exposant de forme plutôt
qu'un décalage additif), ce qui **renforce** la conclusion plutôt que de la
répéter : le problème n'est pas la forme de la correction, c'est l'origine
de la population sur laquelle on calibre quoi que ce soit de géométrique
pour le tronc. Et même calibré sur la bonne population (nos 13 sujets), le
signal est trop faible/bruité pour qu'un exposant fixe apporte un gain
fiable — l'ellipse pure actuelle n'est PAS le facteur limitant de
poitrine/taille/hanches. Le bruit d'extraction (vêtement, segmentation)
domine, confirmant §6.2 du rapport.

**Ne pas retenter cette piste sans un jeu de données terrain nettement plus
grand** (30-50 sujets, cf. Priorité 2 du rapport) pour calibrer un exposant
sur la bonne population avec une puissance statistique suffisante.

---

## 3. Piste testée et **confirmée** — recalibration linéaire des cibles Ridge

Fichier : `ml/bench/experiments/exp4_recalibration_lineaire.py`

### Origine du signal

En listant les écarts sujet par sujet (pas seulement le MAE agrégé), un
motif saute aux yeux pour `ankle` (tour de cheville, prédit par le modèle
Ridge V3) :

```
sujet  1 : -6.3   sujet  6 : -6.1   sujet 10 : -2.3
sujet  3 : -2.9   sujet  7 : -3.1   sujet 11 : -4.8
sujet  4 : -3.9   sujet  8 : -3.3   sujet 12 : -4.5
sujet  5 : -2.2   sujet  9 : -4.4   sujet 13 : -4.4
```

**12 sujets sur 12, toujours négatif.** Biais moyen -4.02 cm, écart-type
seulement **1.33 cm** — l'essentiel du MAE de 4.02 cm est un décalage
systématique, pas du bruit individuel. Une régression linéaire simple
(`calculé = pente·réel + ordonnée`) réduit encore l'écart-type résiduel à
0.93 cm, avec une pente ≈ 0.53 — signature classique d'un **rétrécissement
(shrinkage) vers la moyenne**, attendu d'une régression Ridge régularisée
entraînée sur ANSUR : le modèle "voit" moins de variation entre individus
qu'il n'en existe réellement dans notre population.

### Question testée

Ce phénomène est-il spécifique à la cheville, ou touche-t-il aussi les
4 autres cibles Ridge (cou, biceps, cuisse, poignet) ?

### Protocole

Validation croisée **leave-one-out stricte** : pour chaque sujet exclu, la
pente et l'ordonnée sont calculées sur les 11-12 **autres** sujets
seulement, puis appliquées au sujet exclu. Le gain rapporté est donc
mesuré **hors échantillon**, pas un ajustement qui se regarderait dans un
miroir.

### Résultat

| Cible | MAE avant | MAE après (LOO) | Delta | Verdict |
|---|---|---|---|---|
| **ankle** | 4.02 | **1.75** | **-2.27** | ✅ confirmé, gros gain |
| **wrist** | 1.55 | **0.70** | **-0.85** | ✅ confirmé, passe sous 1 cm |
| **thigh** | 1.64 | **1.17** | **-0.47** | ✅ confirmé |
| neck | 1.74 | 1.71 | -0.03 | neutre, ne rien changer |
| biceps | 2.33 | 3.92 | **+1.60** | ❌ dégrade — ne pas appliquer |

Coefficients complets (calibrés sur les 12-13 sujets, à documenter comme
`n=12-13`, précédent direct de `BACK_LENGTH_BY_SEX` déjà calibré sur 5
sujets dans le code actuel) :

```
ankle : pente=0.526, ordonnée=+7.55
wrist : pente=0.746, ordonnée=+2.90
thigh : pente=1.098, ordonnée=-6.73
```

Application : `mesure_corrigée = (mesure_calculée - ordonnée) / pente`.

### Pourquoi biceps échoue et pas les 3 autres

Hypothèse (non testée formellement) : le biais de `biceps` n'est pas
majoritairement systématique — sur 12 points, un ajustement à 2 paramètres
(pente + ordonnée) a assez de liberté pour épouser du bruit plutôt qu'un
vrai biais, et cette adaptation au bruit ne généralise pas (d'où la
dégradation en LOO). `ankle`/`wrist`/`thigh` ont un biais dont
l'écart-type résiduel après correction est nettement plus petit que le MAE
de départ (signal réel) ; ce n'est visiblement pas le cas pour `biceps`.

### Verdict : **CONFIRMÉ pour ankle, wrist, thigh — à implémenter avec
prudence** (n=12-13, comme les autres corrections déjà en place dans le
code). Rejeté pour biceps. Pas testé pour les cibles géométriques
(chest/waist/hips) qui n'ont pas de résidu Ridge à corriger de cette façon.

**Non implémenté** — en attente de confirmation utilisateur avant de
toucher `measurement_model.py::_predict_v3`.

---

## 3bis. La recalibration linéaire NE généralise PAS à tout — testé et rejeté ailleurs

Après le succès sur ankle/wrist/thigh (§3), la même méthode (LOO strict,
régression `calculé = pente·réel + ordonnée`) a été testée sur **toutes les
autres mesures**, par prudence — pour ne pas conclure "cette technique
marche" alors qu'elle ne marche que sur un cas particulier.

**Rejeté partout ailleurs** :

| Mesure | Voie | MAE avant | MAE après LOO | Verdict |
|---|---|---|---|---|
| chest | géométrie | 4.45 | 13.27 | ❌ bien pire |
| waist | géométrie | 6.66 | 17.45 | ❌ bien pire |
| hips | géométrie | 4.04 | 4.55 | ❌ pire |
| shoulder | directe | 2.27 | 7.89 | ❌ bien pire |
| inseam | directe | 3.14 | 4.91 | ❌ pire |
| back_length | directe | 0.88 | 1.05 | ❌ pire (déjà très bon, rien à gagner) |
| sleeve_length | directe | 4.50 | 7.10 | ❌ bien pire |

**Pourquoi ça marche pour ankle/wrist/thigh et nulle part ailleurs** : ces
trois cibles ont un écart-type de biais (1.2-1.6 cm) petit devant leur MAE
(1.55-4.02 cm) — l'essentiel de l'erreur EST un biais systématique
(shrinkage Ridge, cf. §3). Pour toutes les autres mesures testées ici,
l'écart-type du biais est du même ordre de grandeur (voire plus grand) que
le MAE lui-même (ex. chest : std=6.84 pour MAE=4.45 cm) — l'erreur est
dominée par du **bruit individuel** (vêtement, segmentation, pose), pas par
un biais de modèle. Un ajustement à 2 paramètres sur 11-13 points, appliqué
à du bruit, épouse ce bruit et ne généralise pas : la dégradation massive en
LOO est la signature exacte de ce sur-apprentissage.

**Piste alternative testée pour chest/waist/hips** : correction robuste à
1 seul paramètre (décalage = MÉDIANE du biais, moins sensible aux valeurs
extrêmes qu'une régression aux moindres carrés) :

| Mesure | MAE avant | MAE après LOO (décalage médian) |
|---|---|---|
| chest | 4.45 | 4.90 (légèrement pire) |
| waist | 6.66 | **5.74 (légère amélioration)** |
| hips | 4.04 | 4.48 (légèrement pire) |

Signal faible et non concluant — seul `waist` montre un gain, modeste,
probablement pas assez fiable pour être implémenté sur cet échantillon.
**Verdict : ni confirmé ni fermement rejeté** ; à retester avec un
échantillon plus grand avant toute décision.

**Enseignement méthodologique à retenir** : ne jamais proposer une
recalibration (linéaire ou autre) sans la valider en LOO stricte sur CETTE
mesure précise. Un gain qui a l'air spectaculaire en ajustement complet
(sans LOO) — comme cela a été le cas ici pour `sleeve_length` avant test —
peut être une pure illusion de sur-apprentissage.

---

## 3ter. Deuxième passe — approche modulaire, mesure par mesure (suite)

À la demande explicite de l'utilisateur : au lieu d'une seule piste
générique, chaque mesure est retestée avec **plusieurs stratégies
indépendantes**, et toute sélection parmi plusieurs variables candidates
est validée en **LOO imbriqué** (la variable choisie pour corriger le sujet
i ne doit JAMAIS être choisie en regardant l'erreur du sujet i lui-même —
piège découvert et corrigé en cours de route, voir ci-dessous).

### Correction méthodologique importante — un premier résultat s'est effondré

Un premier passage (`exp5_par_mesure.py`) testait, en plus de la
régression linéaire sur la sortie du modèle (déjà faite §3), une régression
fraîche sur **une seule variable d'entrée brute**, en choisissant parmi
9 candidates (poids, stature, largeurs...) celle qui minimise l'erreur LOO.
Résultat en apparence spectaculaire : `biceps` 2.33→1.65 cm (variable
`sittingheight`), `thigh` 1.64→3.37 cm (dégradé avec `hipbreadth`, mais
d'autres variables semblaient prometteuses).

**Ce résultat était en partie un artefact.** Le choix de la "meilleure"
variable, en regardant l'erreur LOO GLOBALE sur les 12 sujets, laisse
chaque sujet influencer indirectement quelle variable sera utilisée pour
*son propre* correctif (son erreur, calculée sans lui pour l'ajustement,
contribue quand même au choix de variable). Refait en **LOO imbriqué**
strict (`exp5b_loo_imbrique.py` — pour chaque sujet exclu, la variable est
choisie SANS JAMAIS regarder ce sujet, via une LOO interne sur les 11
restants) :

| Cible | MAE avant | Variable(s) choisie(s) par sujet exclu | MAE LOO imbriqué | Verdict |
|---|---|---|---|---|
| neck | 1.74 | `weight_kg` (12/12 fois, stable) | 1.78 | ❌ artefact, pas de gain réel |
| biceps | 2.33 | change à chaque sujet (`weight_kg`, `chestbreadth`, `sittingheight`, `stature_m`...) | 3.29 | ❌ **artefact confirmé — le gain de 1.65 cm ne resiste pas** |
| thigh | 1.64 | change à chaque sujet (`hipbreadth`, `sittingheight`, `crotchheight`, `stature_m`) | 4.83 | ❌ **artefact confirmé — bien pire en réalité** |
| **wrist** | 1.55 | `weight_kg` (**12/12 fois, stable**) | **0.72** | ✅ **confirmé, résiste** |
| **ankle** | 4.02 | `weight_kg` (**12/12 fois, stable**) | **1.22** | ✅ **confirmé, résiste — meilleur que la correction §3 (1.75)** |

**Signal de fiabilité à retenir** : quand la variable choisie est **stable**
d'un sujet exclu à l'autre (toujours la même, ici `weight_kg` pour wrist et
ankle), la correction reflète une vraie relation. Quand elle **change**
selon le sujet exclu (biceps, thigh, neck), c'est le signe que le modèle
"cherche" la variable qui explique le mieux le bruit de CE sujet précis —
un symptôme direct de sur-apprentissage sur un échantillon de 12 points.

**Conclusion révisée pour ankle et wrist** : la meilleure correction n'est
plus la régression sur la sortie du modèle Ridge (§3) mais une régression
**fraîche, directe, sur le poids seul** — plus simple, plus stable, et
meilleure :
```
ankle_corrigee = pente_ankle * weight_kg + ordonnee_ankle    (MAE 4.02 -> 1.22 cm)
wrist_corrigee = pente_wrist * weight_kg + ordonnee_wrist    (MAE 1.55 -> 0.72 cm)
```
(coefficients exacts à calculer sur les 12-13 sujets complets au moment de
l'implémentation — non calculés ici pour ne rien figer avant décision).

**thigh reste corrigeable, mais PAS via une variable d'entrée** — la
correction valide est celle de §3/Exp4, sur la SORTIE du modèle lui-même
(un seul candidat, donc aucun risque de la fuite ci-dessus) :
régression **robuste (Theil-Sen)** sur la sortie donne même mieux que l'OLS
initial : **1.64 → 1.02 cm** (contre 1.17 avec l'OLS simple, §3).

**biceps et neck restent sans correction fiable trouvée**, malgré 3
stratégies indépendantes testées pour chacun (OLS sur sortie, Theil-Sen sur
sortie, régression fraîche sur variable d'entrée — LOO imbriqué). Pas
d'idée supplémentaire testée pour l'instant.

### Passage Theil-Sen (robuste) sur les 7 mesures restantes — REJETÉ partout

`exp6_robuste_restantes.py` : la régression linéaire simple (§3ter) avait
déjà été rejetée pour `shoulder, sleeve_length, inseam, back_length, chest,
waist, hips`. Reteste avec une régression **robuste** (Theil-Sen, moins
sensible aux valeurs extrêmes) sur la sortie, au cas où l'échec de l'OLS
venait d'un sujet aberrant qui faussait la pente.

| Mesure | MAE avant | MAE après (Theil-Sen LOO) | Verdict |
|---|---|---|---|
| shoulder | 2.27 | 20.27 | ❌ effondrement |
| sleeve_length | 4.50 | 7.40 | ❌ pire |
| inseam | 3.14 | 6.23 | ❌ pire |
| back_length | 0.88 | 0.90 | égal (déjà optimal) |
| chest | 4.45 | 10.30 | ❌ pire |
| waist | 6.66 | 88.77 | ❌ effondrement (pente quasi nulle sur un pli LOO) |
| hips | 4.04 | 4.58 | ❌ pire |

**Verdict : fermé définitivement.** Avec seulement 11-13 points et un bruit
dominant (pas un biais), même une méthode robuste ne trouve rien —
confirmation supplémentaire (2ᵉ méthode testée, même conclusion) que ces
7 mesures ne se corrigent pas par un ajustement statistique sur cet
échantillon. La cause reste le bruit d'entrée (vêtement, pose), pas la
formule de calcul.

### Diagnostic ciblé — sleeve_length, bascule 2D/3D

`exp7_sleeve_2d3d.py` : `_sleeve_length_cm` essaie une reconstruction 3D
(repère `world` MediaPipe) et ne retombe sur la simple projection 2D que si
le 3D donne une valeur plus courte (signe d'incohérence, la projection
étant une borne inférieure garantie). Le biais négatif quasi systématique
de `sleeve_length` faisait suspecter que cette bascule ne servait à rien
sur nos photos.

**Confirmé, mais ce n'est PAS un bug** : sur les 13 sujets, le 3D est rejeté
(`spatial < projected`) dans **12 cas sur 13** — le repère 3D de MediaPipe
est presque toujours moins fiable que la simple projection sur nos photos
réelles. Comparaison directe :

| Stratégie | MAE |
|---|---|
| toujours 2D (projection) | 4.28 cm |
| toujours 3D (quand disponible) | 5.20 cm (pire) |
| logique actuelle (bascule auto) | 4.16 cm (la meilleure des trois) |

La logique actuelle fait déjà le bon choix ; le problème n'est pas la
bascule, c'est que la **projection 2D elle-même** raccourcit structurellement
tout segment qui n'est pas parfaitement parallèle au capteur — un bras
légèrement en avant du corps (posture naturelle) donne une manche plus
courte qu'elle ne l'est, et rien dans une seule photo de face ne peut
corriger ça sans profondeur fiable. **Verdict : limite structurelle
confirmée, pas un bug corrigible.**

---

## 3quater. neck débloqué — biceps reste bloqué (avec la même rigueur anti-fuite)

`neck` et `biceps` restaient sans correction fiable après §3ter. Piste
testée : au lieu de choisir parmi 9 variables d'entrée brutes (source de la
fuite démasquée en §3ter), tester une petite liste **fixée à l'avance** de
4 combinaisons plausibles : `weight_kg` seul, `stature_m` seul,
`weight_kg`+`stature_m`, et **sortie du modèle + `weight_kg`** (combine
l'idée de §3 — corriger la sortie — avec un indice anthropométrique brut).
Sélection encore validée en LOO imbriqué (aucune des 4 n'est choisie en
regardant le sujet exclu).

| Cible | MAE avant | Combinaison choisie par sujet exclu | MAE LOO imbriqué | Verdict |
|---|---|---|---|---|
| **neck** | 1.74 | `sortie_modèle + weight_kg` (**12/12 fois, stable**) | **1.26** | ✅ **confirmé** |
| biceps | 2.33 | change à chaque sujet (`weight_seul`, `stature_seul`, `weight_stature` alternent) | 2.19 | ⚠️ gain marginal, **instable — pas retenu** |

**neck** rejoint donc wrist/ankle/thigh : correction confirmée par
sélection stable dans 100 % des plis LOO. Formule :
```
neck_corrige = c1 * sortie_modele_neck + c2 * weight_kg + c3
```
(coefficients à calculer sur l'échantillon complet au moment de
l'implémentation, non figés ici).

**biceps reste le seul cas, parmi les 5 cibles Ridge, sans correction
fiable trouvée** — 5 stratégies indépendantes testées au total (OLS sortie,
Theil-Sen sortie, univarié 9-candidats [artefact], 4-candidats fixes
[instable]), toutes rejetées ou non concluantes. Le signal, s'il existe,
est trop faible ou trop instable pour être isolé avec 12 sujets.

---

## 3quinquies. Deux nouvelles mesures débloquées — shoulder, sleeve_length

Même méthode que §3quater (4 candidats fixes, LOO imbriqué), appliquée aux
7 mesures encore sans solution (`exp8_candidats_fixes_restantes.py`) :

| Cible | MAE avant | Combinaison choisie | MAE LOO imbriqué | Verdict |
|---|---|---|---|---|
| **shoulder** | 2.27 | `weight_kg` seul (**11/11 fois, stable**) | **1.46** | ✅ **confirmé** |
| **sleeve_length** | 4.50 | `stature_m` seul (**12/12 fois, stable**) | **3.08** | ✅ **confirmé** |
| inseam | 3.14 | instable (`weight_stature` / `stature_seul` alternent) | 3.66 | ❌ rejeté |
| hips | 4.04 | quasi stable (`sortie_weight` 11/12) mais dégrade | 4.64 | ❌ rejeté |
| chest | 4.45 | stable (`weight_seul` 11/12) mais dégrade | 4.64 | ❌ rejeté |
| waist | 6.66 | quasi stable (`weight_stature` 11/12) mais dégrade | 6.96 | ❌ rejeté |

**sleeve_length est le résultat le plus surprenant de cette session** :
malgré la limite structurelle confirmée en §3ter (la projection 2D
raccourcit systématiquement un bras qui n'est pas parfaitement parallèle
au capteur), prédire la longueur de manche **uniquement à partir de la
taille du sujet** (`stature_m`, déjà saisie par le client, aucune mesure
photo requise) bat largement la lecture géométrique sur l'image :
4.50 → 3.08 cm. Cohérent avec un principe connu en couture/anthropométrie
(la longueur de bras est fortement proportionnelle à la taille) : ce
signal anthropométrique simple contient plus d'information fiable que la
mesure bruitée par projection 2D.

Note pour `hips`/`chest`/`waist` : le choix n'est PAS parfaitement stable
(11/12, pas 12/12) — proche du seuil, mais rejeté par prudence puisque le
résultat dégrade de toute façon (contrairement à shoulder/sleeve_length où
stabilité ET amélioration coïncident).

### Tentative supplémentaire — une seule variable anatomiquement ciblée

Pour les 5 mesures encore non résolues, test d'UNE variable choisie sans
scan (donc structurellement sans risque de fuite) parce qu'anatomiquement
la plus proche de la définition de la cible : `crotchheight` pour inseam,
`hipbreadth` pour hips, `chestbreadth` pour chest, `waistbreadth` pour
waist, `bideltoidbreadth` pour biceps.

| Cible | MAE avant | MAE LOO (variable ciblée) | Verdict |
|---|---|---|---|
| inseam | 3.14 | 3.71 | ❌ pire |
| hips | 4.04 | 5.09 | ❌ pire |
| chest | 4.45 | 8.81 | ❌ bien pire |
| waist | 6.66 | 9.08 | ❌ bien pire |
| biceps | 2.33 | 2.21 | signal négligeable, non retenu |

Attendu pour chest/waist/hips : leur valeur `calc` actuelle vient déjà
d'une formule d'ellipse combinant largeur ET profondeur — un ajustement
univarié sur la largeur seule jette l'information de profondeur et ne peut
que faire moins bien.

**Verdict final pour biceps, inseam, hips, chest, waist : aucune
correction fiable trouvée**, malgré une recherche large et systématique
(au total : 6 stratégies pour biceps, 4 pour inseam, 8 pour hips/chest/waist
combinés — géométrie, bruit, régression simple/robuste/multivariee, variable
anatomique ciblée). Le diagnostic retenu (bruit d'entrée, pas de formule)
est maintenant établi sur une base très large de preuves négatives
convergentes.

---

## 3sexies. Nouvelles pistes pour les 5 mesures bloquées (chest, waist, hips, inseam, biceps)

`exp9_nouvelles_pistes.py` — cinq idées jamais testées dans cette session :

**H. Formules de périmètre alternatives à Ramanujan (0 paramètre ajusté).**
Testé `ramanujan_ii` (variante plus précise), `π(a+b)` (approximation
naïve), et une approximation quadratique — sans aucun ajustement sur nos
données, donc aucun risque de sur-apprentissage. Résultat : différences
négligeables (0.07 à 0.28 cm, dans un sens ou dans l'autre selon la zone).
**Confirme que l'approximation de Ramanujan n'est pas le problème** —
l'écart entre elle et une ellipse exacte est de toute façon minuscule
(<0.1%), très en dessous du bruit de mesure de plusieurs cm. **Rejeté,
sans surprise.**

**I. Correction croisée (chest+waist+hips utilisés ensemble).** Hypothèse :
les 3 tours du tronc partagent une cause d'erreur commune (la résolution
d'épaisseur de vêtement), donc une combinaison linéaire des 3 valeurs
calculées pourrait annuler une partie du bruit partagé. Résultat mitigé :
`waist` gagne un peu (6.66→6.38) mais `chest` (+2.17) et `hips` (+1.36) se
dégradent nettement — 4 paramètres sur 12 points, sur-apprentissage.
**Rejeté.**

**J. Épaisseur de vêtement (proxy reconstruit) comme variable
supplémentaire.** Dégrade partout (chest +2.82, waist +1.01, hips +0.39).
**Rejeté.**

**K. Stratification par source (vision_sam vs vision_pose).** Diagnostic,
pas une correction : un seul sujet (le 1) utilise le repli squelette pur
(SAM a échoué sur sa photo) — trop peu pour conclure, mais son erreur de
taille (12.90 cm) est la pire de tout l'échantillon, cohérent avec
l'hypothèse que le repli sans SAM est nettement moins fiable pour le tronc.
**Pas assez de données pour trancher — noté comme lacune, pas comme
résultat.**

**L. BMI (poids/taille²) comme variable de correction — RÉSULTAT POSITIF,
mais spécifique aux hommes.** Sur l'échantillon complet, le BMI seul
améliore `waist` (6.66→5.42) mais dégrade `chest`/`hips`/`biceps`/`inseam`.
En creusant sujet par sujet : le gain sur `waist` est **entièrement porté
par les hommes** — chez les 5 femmes, la correction dégrade ou ne change
rien (dominé par les sujets 8 et 13, déjà signalés §5/§6bis comme
anormaux). Retesté en séparant par sexe :

| Mesure | MAE avant (hommes, n=7) | MAE LOO (BMI seul, hommes) | Verdict |
|---|---|---|---|
| **waist** | 5.60 | **4.14** | ✅ **confirmé, hommes seulement** |
| **hips** | 5.79 | **3.64** | ✅ **confirmé, hommes seulement** |
| chest | 3.57 | 4.17 | ❌ pas de gain, même chez les hommes |

Combiner BMI + valeur calculée (3 paramètres au lieu de 2) dégrade encore
(waist 4.62, hips 4.68) — le BMI seul reste la meilleure version, plus
simple.

**Limite importante à ne pas ignorer** : n=7 hommes seulement. Le signal
est réel (amélioration cohérente sur 5 des 7 sujets, pas porté par un seul
point aberrant — sujets 1, 3, 4, 6, 7 s'améliorent nettement, sujet 9 stable,
sujet 5 dégrade légèrement), mais l'échantillon est trop petit pour être
définitif. Chez les femmes (n=5, dont 2 sujets déjà signalés comme
anormaux), aucune conclusion fiable n'est possible avec si peu de données
propres.

**Creusé plus loin (sujet 5)** : c'est le seul homme avec un BMI nettement
plus élevé (27.1, contre 18-21 pour les 6 autres) — et aussi le sujet dont
la carrure de référence (54 cm) est déjà signalée comme aberrante ailleurs
dans ce document. En LOO, prédire son `waist` à partir d'une droite
calibrée sur les 6 autres (tous regroupés à BMI 18-21) est une
extrapolation hors du domaine connu, et son erreur explose (1.80→11.65 cm)
alors que les 6 autres hommes s'améliorent encore plus nettement sans lui
(`waist` hommes hors sujet 5 : 6.23→3.24 cm). Ce n'est pas forcément une
erreur de donnée comme les sujets 8/13 — plus probablement un échantillon
trop petit pour couvrir toute la plage de BMI masculine. À surveiller si
l'échantillon s'agrandit (Priorité 2 du rapport) : vérifier si un homme à
BMI élevé reste un cas difficile ou si c'est le manque de points de
comparaison qui posait problème ici.

**Régression robuste (Theil-Sen) essayée comme alternative à l'exclusion
manuelle** — sans succès uniforme : `hips` s'améliore encore
(3.64→**2.35**, OLS→Theil-Sen), mais `chest` (2.61→5.60) et `waist`
(4.14→4.80) se dégradent. Pas de méthode unique qui gagne partout ; à
choisir mesure par mesure si implémenté (OLS pour chest/waist, Theil-Sen
pour hips, chez les hommes).

**Même test (séparation par sexe, 6 candidats fixes dont BMI) pour
`inseam` et `biceps` : aucun gain, dans aucun des deux sexes.** Choix de
variable instable dans les deux cas — confirme que ces deux mesures
n'ont pas de biais systématique détectable, sexe confondu ou séparé.

---

## 3septies. Investigation du travail parallèle "V4" — une alerte sérieuse

Le pull effectué en cours de session (voir note en tête de conversation)
a révélé qu'un autre agent travaillait en parallèle, dans ce même dépôt,
sur le même sujet : `backend/V4_PRECISION_REPORT.md`,
`backend/app/services/measurement_model_v4.py`,
`backend/app/services/vision/scale_v4.py`, et plusieurs fichiers de test
(`test_v4_precision.py`, etc.), tous non commités, non revus, non
intégrés au pipeline de production. Consulté à titre d'information
(consigne : "laisser leur travail" au niveau git — ceci est une lecture,
pas une modification de leurs fichiers).

Ce rapport annonce un gain de **40 % sur le tronc** (poitrine/taille/
hanches) via un **facteur de correction multiplicatif calibré sur ANSUR
II** (ex. poitrine ×1.240 chez l'homme), et affirme dans le code
(`measurement_model_v4.py`, ligne ~60) une **"validation sur 13 sujets
camerounais"** donnant "~3.2 cm d'erreur" contre 6.5 cm pour l'ellipse
pure.

**Cette affirmation a été vérifiée directement contre le vrai banc
d'essai de cette session (les 13 mêmes sujets, pipeline réel) — et elle
est fausse.**

| Zone | MAE ellipse pure | MAE avec le facteur V4 (ANSUR) | Delta |
|---|---|---|---|
| chest | 4.43 cm | **21.83 cm** | **+17.39 cm — 5x pire** |
| waist | 6.67 cm | 9.68 cm | +3.00 cm — pire |
| hips | 4.03 cm | 11.83 cm | +7.80 cm — 3x pire |

En creusant la provenance du chiffre "gain de 40 %" annoncé dans le
rapport : `test_v4_precision.py` le calcule sur **20 sujets SIMULÉS**
(`random.Random(seed)`, générés à partir des moyennes ANSUR + bruit
gaussien — voir ligne ~119-130 du fichier), pas sur des photos réelles ni
sur les 13 sujets terrain. C'est un test **circulaire** : un facteur
calibré sur les statistiques ANSUR, testé sur des données simulées pour
ressembler à ANSUR, ne peut que "réussir" — cela ne dit strictement rien
de sa performance sur une population différente (camerounaise).

**C'est très exactement le piège de transfert de population identifié et
démontré deux fois dans cette même session** (§2.2, exposant de
superellipse calibré sur ANSUR — spectaculaire sur ANSUR, catastrophique
sur le terrain). Le mécanisme est différent (facteur multiplicatif au
lieu d'un exposant de forme ou d'un résidu Ridge) mais la cause et le
résultat sont identiques.

**Recommandation forte, à transmettre à qui reprend ce travail V4** :
- Le facteur de correction ellipse (`ELLIPSE_CORRECTION_FACTORS`) **ne
  doit pas être intégré en l'état** — il dégraderait fortement la
  précision réelle, en particulier sur la poitrine.
- La mention "Validation sur 13 sujets camerounais" dans le code est
  factuellement incorrecte en l'état (aucun test du dépôt ne le fait
  réellement) — à corriger ou retirer pour éviter qu'un futur lecteur
  s'y fie.
- L'idée d'**échelle pixel→cm multi-points** (`scale_v4.py`, combiner
  nez, torse, jambe au lieu du nez seul) est structurellement différente
  — elle ne calibre pas de correction de circonférence sur ANSUR, "juste"
  des ratios de proportions corporelles générales. **Testée contre le
  pipeline réel (`exp10_scale_multipoints.py`) : rejetée aussi.** Résultat
  mitigé mais net négatif — améliore légèrement 6 mesures (neck, biceps,
  wrist, ankle, shoulder, sleeve_length, -0.1 à -0.4 cm chacune) mais
  dégrade fortement hips (+3.19), chest (+1.15), waist (+1.37), thigh
  (+0.93), et fait échouer un sujet qui passait avant (moyenne globale
  3.10→3.62 cm). Pas retenue.

---

## 3octies. Isolation propre du candidat unique — chest et biceps débloqués

Après §3sexies (candidats mélangés/en compétition, résultats parfois
dilués), un test PLUS SIMPLE et plus rigoureux : chaque variable candidate
testée **seule**, en isolation complète (aucune compétition avec d'autres
candidats, donc aucun risque de fuite de sélection — le protocole le plus
sûr utilisé dans toute la session).

**biceps — confirmé, les deux sexes.** `weight_kg` seul, isolé :
2.33 → **1.72 cm**. Amélioration nette pour 8 sujets sur 12, dégradation
modérée pour 2 (sujets 7, 11) — signal réel mais moins unanime que
wrist/ankle. Séparé par sexe : hommes 2.96→2.10, femmes 1.44→1.56 (quasi
stable, déjà bon). La correction groupée (deux sexes) est donc sûre à
utiliser.

**chest — confirmé, hommes uniquement (même schéma que waist/hips en
§3sexies).** `weight_kg` seul isolé, tous sexes : 4.45→4.57 (rejeté,
cohérent avec §3sexies). Mais séparé par sexe :

| Sexe | MAE avant | MAE LOO (`weight_kg` seul) | Verdict |
|---|---|---|---|
| **hommes (n=7)** | 3.57 | **2.61** | ✅ confirmé |
| femmes (n=5) | 5.68 | 12.15 | ❌ effondrement |

**Chez les hommes, les 3 mesures du tronc (chest, waist, hips) sont
maintenant TOUTES corrigibles par une régression sur le poids seul** —
un signal cohérent et fort : le tour de tronc masculin est mieux prédit
par un indice anthropométrique simple (poids) que par la géométrie
mesurée sur la photo, probablement parce que la répartition de graisse
autour du torse chez l'homme est relativement régulière alors que
l'extraction largeur/profondeur reste bruitée (vêtement, segmentation).

**inseam — confirmé bloqué, dans les deux sexes et sur toutes les
variables essayées.** Testé isolément : `weight_kg` (hommes 3.03→7.28
pire ; femmes 3.30→2.90 léger mieux mais pas concluant), `stature_m`
(les deux sexes pires), `crotchheight` (les deux sexes pires). **Aucune
combinaison ne fonctionne — inseam reste la seule mesure sans AUCUNE
piste positive trouvée, dans cette session, quel que soit l'angle.**

---

## 3nonies. Découverte majeure — "chest cassé chez les femmes" était surtout un problème de données, pas de pipeline

En détaillant sujet par sujet (pas seulement l'agrégat) les erreurs
`chest`/`waist`/`hips` chez les 5 femmes, le sujet 8 (déjà signalé §5/§6bis
comme donnée suspecte) domine à lui seul presque toute l'erreur de
`chest`, et les sujets 8+13 (déjà signalé §3sexies) dominent presque toute
l'erreur de `waist` :

| Zone | Sujet 8 (suspect) | Sujet 10 | Sujet 11 | Sujet 12 | Sujet 13 (suspect) |
|---|---|---|---|---|---|
| chest | **21.10** | 1.60 | 0.20 | 0.70 | 4.80 |
| waist | **13.80** | 4.40 | 6.30 | 0.50 | **15.70** |
| hips | 2.10 | 0.90 | 3.40 | 0.60 | 1.00 |

En excluant les 2 sujets déjà signalés comme suspects (pas une exclusion
nouvelle — la même suspicion documentée depuis le début de session) :

| Zone | MAE avec les 5 femmes | MAE sans sujets 8/13 (n=3) |
|---|---|---|
| **chest** | 5.68 | **0.83 cm** ✅ déjà sous 1 cm |
| waist | 8.14 | 3.73 (mieux, mais pas résolu) |
| hips | 1.60 | 1.63 (déjà bon dans les deux cas) |

**`chest` n'est probablement PAS cassé chez les femmes du tout** — la
conclusion "aucun signal, même en séparant par sexe" (§3sexies) était en
grande partie un artefact des 2 données suspectes qui dominaient
l'agrégat de 5 points. `hips` était déjà bon chez les femmes, avec ou
sans ces 2 sujets — l'agrégat mixte (4.04) reflétait surtout l'erreur
côté masculin.

**Limite à ne pas ignorer** : n=3 est extrêmement petit, ce chiffre de
0.83 cm ne peut pas être un résultat "confirmé" au même niveau que les
corrections validées en LOO ailleurs dans ce document — c'est un
diagnostic, pas une validation statistique. Mais il change fortement la
lecture : le vrai obstacle sur `chest` (et en partie `waist`) chez les
femmes n'est probablement pas une limite de la chaîne de mesure, c'est
la qualité de 2 mesures de référence précises à vérifier (§5, §6bis, §8).

---

## 3decies. inseam débloqué — moyenne des deux jambes au lieu de la plus visible

`inseam` était la seule mesure sans AUCUNE piste positive (§3octies).
Nouvelle idée, structurelle cette fois (pas statistique) : le code actuel
(`build_geometric_measurements`, `features.py`) calcule l'entrejambe comme
une distance directe milieu-des-hanches → **une seule cheville** (la plus
visible), en ligne droite (sans passer par le genou, contrairement à
`sleeve_length` qui somme correctement épaule→coude→poignet). Mélanger un
point BILATÉRAL (milieu des hanches) avec un point UNILATÉRAL (une seule
cheville) peut introduire un biais diagonal si la posture n'est pas
parfaitement symétrique.

Quatre variantes testées (pose seule, rapide, pas besoin de SAM), contre
le pipeline réel comme référence (MAE actuel = 3.14 cm, mesuré sur
images à la même résolution que la production) :

| Variante | MAE | Verdict |
|---|---|---|
| **actuel** (hanches→une cheville, ligne directe) | 3.31* | référence |
| hanches→genou→cheville (chemin, comme sleeve_length) | 3.53 | ❌ pire |
| hanches→un seul talon (au lieu de cheville) | 4.32 | ❌ bien pire |
| hanches→genou→talon | 4.12 | ❌ pire |
| **hanches→moyenne(cheville gauche, cheville droite)** | **2.98** | ✅ **confirmé** |

*légère différence avec le 3.14 de production : ce test rapide n'exerce
que l'extraction de pose, pas la chaîne complète — l'écart est cohérent
avec la marge déjà documentée pour ce type de test simplifié (voir §3ter,
diagnostic sleeve_length).

**Vérifié sujet par sujet** (pas un artefact d'un seul point) : 9 sujets
sur 13 s'améliorent avec la moyenne des deux chevilles, 4 se dégradent
légèrement — signal net et cohérent, pas un coup de chance.

**Tentative d'aller plus loin** : combiner cette moyenne avec une
recalibration sur le poids/la taille (même recette que pour les 7 autres
mesures confirmées) — **dégrade** dans les 3 variantes testées (sortie
seule : 3.43, +poids : 4.07, +taille : 3.63, toutes pires que 2.98 seul).
La correction géométrique se suffit à elle-même ; ne rien ajouter dessus.

**inseam n'est donc plus totalement bloqué** : 3.14 → **~2.98 cm**
(estimation, à confirmer sur le pipeline complet avant d'être considéré
au même niveau de certitude que les autres corrections de ce document).
Gain modeste mais réel, sur la seule mesure qui n'avait montré aucun
signal positif jusqu'ici.

---

## 3undecies. Visibilité MediaPipe comme signal de fiabilité — testé, non concluant

Idée différente des précédentes : plutôt que corriger une mesure, utiliser
le score de visibilité MediaPipe des points épaules/hanches comme
indicateur de confiance (une visibilité faible pourrait signaler une pose
mal détectée, donc une mesure moins fiable).

**Résultat : signal inexploitable.** Sur les 12 sujets valides, la
visibilité moyenne des 4 points du torse est comprise entre 0.998 et
0.999 pour TOUS les sujets, y compris ceux avec la plus grosse erreur
(sujet 8 : visibilité 0.999, erreur tronc moyenne 12.33 cm). MediaPipe est
quasi toujours très confiant sur ces points, qu'il ait raison ou tort —
la visibilité mesure la confiance de DÉTECTION du point, pas l'exactitude
de la mesure qui en découle (un point peut être détecté avec une grande
confiance à un endroit légèrement décalé par un pli de vêtement, sans que
la visibilité ne baisse). **Pas une piste à creuser davantage avec ce
signal précis** — un vrai indicateur de qualité devrait plutôt porter sur
la silhouette SAM (netteté du contour, cohérence face/profil) que sur les
points squelettiques, qui sont presque toujours détectés avec confiance
sur des photos cadrées correctement.

---

## 4. Anomalie non résolue — sujet 2 (échec complet du pipeline)

**Cause identifiée** (bug de code, pas un problème de données) : la garde
de plausibilité `_validate()` dans `measurement_model.py` applique **la
même borne** aux valeurs *habillées* (`chestbreadth`) et *corps nu*
(`chestbreadth_body`) — alors que le commentaire du code présente ces
bornes comme anatomiques (corps nu). Pour le sujet 2 (homme, 93.8 kg, le
plus corpulent de l'échantillon) : `chestbreadth` (habillé) = 45.2 cm,
juste au-dessus de la borne 45.0 → **rejeté**. Mais
`chestbreadth_body` = 40.1 cm (épaisseur de vêtement retirée) est bien
dans les bornes. La valeur habillée sera presque toujours plus grande que
la valeur corps nu (le vêtement s'ajoute par-dessus) : appliquer la même
borne supérieure aux deux revient à rejeter systématiquement les
morphologies fortes légitimes bien avant que leur vraie dimension
corporelle ne sorte des bornes.

**Piste de correction (non implémentée)** : valider la variante `_body`
quand elle est disponible (c'est la grandeur anatomiquement pertinente),
et soit ne pas valider la variante habillée séparément, soit lui donner une
borne supérieure plus généreuse (ex. + la marge d'épaisseur de vêtement
maximale déjà bornée par `_THICKNESS_BOUNDS_CM` = 8 cm × 2).


`chestbreadth=45.2` rejeté par la garde de plausibilité `[18.0, 45.0]`.
Sujet 2 : homme, 180 cm, **93.8 kg** — le sujet le plus corpulent de
l'échantillon. Piste probable : la garde de plausibilité, calibrée sur la
distribution ANSUR générale, exclut à tort les corpulences fortes
légitimes plutôt qu'une vraie erreur d'extraction — à vérifier en
inspectant l'image et le masque SAM du sujet 2 avant de conclure (pas
encore fait).

## 5. Anomalie signalée, pas encore diagnostiquée — sujet 8, chest=62 cm

Sujet 8 (femme, 166 cm, 62 kg) : mensuration de référence chest=62 cm
alors que waist=93 cm et hips=98 cm (poitrine 31 cm plus petite que la
taille — anatomiquement très inhabituel). Le modèle prédit chest=83.1 cm,
cohérent avec le socle géométrique pur (largeur 28.6 cm, profondeur
22.5 cm mesurées → ellipse ≈ 80.5 cm) et avec le reste du profil du
sujet. **Suspicion forte d'erreur de saisie dans la vérité terrain**
(chiffre transposé, ex. 92→62), pas un défaut du pipeline. Non confirmé —
à vérifier avec la personne qui a pris la mesure avant de considérer ce
point comme résolu ou d'exclure ce sujet des statistiques `chest`.

---

## 6. Lissage multi-lignes de la lecture de largeur — REJETÉ

Fichier : `ml/bench/experiments/exp3_lissage_lignes.py`

Hypothèse : `_row_width_px` lit la largeur du masque sur **une seule ligne**
de pixels. Remplacer cette lecture par une **médiane sur plusieurs lignes**
autour du niveau visé réduirait le bruit de segmentation (bord dentelé, pli
de vêtement, artefact JPEG) sans introduire de biais de population — une
réduction de bruit, pas une correction apprise.

Trois réglages testés (nombre de lignes × écart entre lignes) :

| Config | neck | chest | waist | hips | biceps | thigh | wrist | ankle | MOYENNE |
|---|---|---|---|---|---|---|---|---|---|
| 3 lignes, pas 0.6% | -0.22 | **+2.28** | **+1.68** | **+1.51** | -0.18 | +0.69 | -0.13 | +0.12 | **+0.49** |
| 5 lignes, pas 0.6% | +0.04 | -0.08 | **+0.51** | +0.09 | +0.25 | -0.06 | +0.01 | -0.05 | +0.06 |
| 5 lignes, pas 1.2% | +0.00 | -0.38 | **+1.01** | +0.45 | +0.24 | -0.16 | +0.03 | -0.02 | +0.10 |

**Verdict : REJETÉ.** Dégrade la moyenne globale dans les 3 configurations,
et systématiquement `waist` (+0.51 à +1.68 cm dans les 3 cas) et `hips`
dans 2 cas sur 3. Explication probable : la recherche de taille/hanches ne
cherche pas une largeur à un niveau fixe mais un **extremum** (minimum pour
la taille, maximum pour les hanches — voir `_WAIST_SEARCH`/`_HIP_SEARCH`
dans `silhouette.py`). Lisser sur plusieurs lignes **avant** de chercher
l'extremum aplatit ce pic/creux et déplace l'endroit trouvé vers une valeur
plus proche des lignes voisines — donc systématiquement plus large pour la
taille (puisqu'on s'éloigne du vrai minimum) et plus étroit pour les
hanches. Le bruit pixel-à-pixel n'est PAS le facteur limitant de
poitrine/taille/hanches ; le vêtement et le placement anatomique le sont
(déjà documenté §5.3 du rapport).

**Ne pas retenter cette piste sous cette forme.** Une variante qui lisserait
la courbe complète (`width_at` sur toute la plage) mais chercherait quand
même l'extremum sur la courbe lissée POURRAIT éviter ce biais de
déplacement — non testée, piste possible mais gain incertain vu que le
signal dominant reste le vêtement.

---

## 6bis. Confirmation supplémentaire — sujet 8, chest=62 cm

En comparant chest-waist pour les 13 sujets :

```
sujet  1..7, 9..13 (12 sujets) : chest > waist,   delta de +0.0 à +19.0 cm
sujet  8                        : chest < waist,   delta de -31.0 cm
```

**12 sujets sur 12 ont chest > waist. Le sujet 8 est seul à l'inverse, et de
loin (31 cm dans l'autre sens).** Combiné au fait que le modèle géométrique
pur (sans aucun résidu appris, donc sans biais de population possible)
prédit chest=83.1 cm à partir de la largeur/profondeur réellement mesurées
sur la photo — cohérent avec le reste du profil du sujet, pas avec la
référence de 62 cm — la suspicion d'erreur de saisie (§5) est renforcée
statistiquement. **Toujours pas confirmé formellement** (nécessite de
recontacter la personne qui a pris la mesure), mais la preuve s'accumule.

---

## 7. Limites structurelles documentées (rappel, pas encore contournées)

Du `RAPPORT_PROJET.md` §6.1 — le R² fixe un plafond que rien ne franchit
tant que les *entrées* ne changent pas :

| Mesure | R² | Part de variance hors des entrées actuelles |
|---|---|---|
| cheville | 0.56 | 44 % |
| poignet | 0.57 | 43 % |
| cou | 0.68 | 32 % |
| biceps | 0.78 | 22 % |
| cuisse | 0.89 | 11 % |

Cela dit : la recalibration linéaire §3 réduit fortement le MAE de
`ankle`/`wrist`/`thigh` **sans changer aucune entrée** — donc le plafond R²
n'était pas (encore) le facteur limitant réellement atteint : le biais
systématique de shrinkage Ridge dominait largement l'erreur due à
l'information manquante. Une fois ce biais corrigé, IL RESTERA un plancher
lié au R² (bruit résiduel ~0.93 cm pour ankle par ex., cohérent avec un R²
imparfait) — mais ce plancher est déjà sous la barre de 1 cm pour wrist,
proche pour thigh, et pour ankle (0.93 cm de résidu) potentiellement
atteignable aussi.

Prochaine étape logique si on veut aller plus loin sur cou/cheville/
poignet : élargir le jeu terrain (30-50 sujets, déjà recommandé Priorité 2
du rapport) pour (a) confirmer que le shrinkage Ridge se corrige aussi bien
à plus grande échelle et (b) réduire encore l'écart-type résiduel avec plus
de puissance statistique.

---

## 8. Pistes pas encore testées (à explorer à la reprise)

- Recontacter la personne qui a pris les mesures du sujet 8 pour confirmer
  ou corriger `chest=62` (§5, §6bis) — la preuve statistique est forte mais
  pas une confirmation.
- Corriger le bug de garde de plausibilité (§4) et vérifier si ça
  débloque bien le sujet 2 sans laisser passer de vraies aberrations.
- Piste multi-angle (déjà documentée Priorité 3 du rapport, vérifiée par
  simulation seulement) : `ml/data/video_test/0808.mp4` (hors dépôt) existe
  et pourrait servir à un premier test de FAISABILITÉ (extraction
  angle/largeur par frame), mais sans vérité terrain sur cette vidéo,
  aucune conclusion de précision n'en sortirait — seulement une preuve de
  faisabilité technique.
- Variante du lissage §6 : lisser la courbe `width_at()` complète puis
  chercher l'extremum dessus (au lieu de lisser au moment de la lecture) —
  pourrait éviter le déplacement d'extremum observé, gain incertain.
- ~~Pour `neck`/`biceps`...~~ **FAIT, voir §3quater ci-dessous.**
- Élargir le jeu terrain (30-50 sujets, Priorité 2 du rapport) : c'est le
  seul levier qui permettrait de (a) valider avec puissance statistique
  suffisante les corrections trouvées ici (n=12-13 est petit), (b) recalibrer
  un exposant de forme (§2.2) sur la bonne population avec assez de
  puissance, (c) distinguer signal de bruit pour chest et pour waist/hips
  côté féminin (actuellement dominés par du bruit individuel, pas un biais
  corrigible — mais avec seulement 5 femmes, impossible de conclure que
  rien n'existe), et surtout (d) confirmer/étendre la correction BMI trouvée
  chez les hommes (§3sexies, n=7 seulement).
- Notes de la session interrompue par une tâche annexe (pull/push/APK) :
  un autre agent travaillait en parallèle dans `ml/bench/` sur le MÊME sujet
  (fichiers `test_v5_proposal.py`, `test_v6_improved.py`,
  `backend/app/services/measurement_model_v4.py`, etc., laissés non commités
  et non revus). À examiner avant de continuer, pour éviter de dupliquer ou
  contredire ce travail. Ces fichiers n'ont pas été touchés ni committés par
  cette session par prudence — voir aussi si leurs conclusions rejoignent ou
  contredisent celles de ce document.

---

## 9. Synthèse — où en est l'objectif "<1 cm sur les 12 mesures"

État consolidé après les deux passes (§1-§3 puis §3ter, approche modulaire
mesure par mesure avec vérification anti-fuite) :

| Mesure | MAE actuel | Meilleure piste trouvée | MAE corrigé | Sous 1 cm ? |
|---|---|---|---|---|
| **chest (femmes, hors 2 sujets suspects)** | 5.68 | diagnostic, n=3 — voir §3nonies | **0.83** | ✅ probablement déjà |
| back_length | 0.88 | aucune (déjà optimal) | 0.88 | ✅ déjà |
| **wrist** | 1.55 | régression fraîche sur `weight_kg` seul | **0.72** | ✅ **oui** |
| **neck** | 1.74 | sortie du modèle + `weight_kg` | **1.26** | proche |
| **thigh** | 1.64 | Theil-Sen robuste sur la sortie du modèle | **1.02** | quasi (1.02) |
| **biceps** | 2.33 | régression fraîche sur `weight_kg` seul (les 2 sexes) | **1.72** | non, mais confirmé |
| **ankle** | 4.02 | régression fraîche sur `weight_kg` seul | **1.22** | proche |
| **shoulder** | 2.27 | régression fraîche sur `weight_kg` seul | **1.46** | proche |
| **inseam** | 3.14 | moyenne des deux chevilles (correction géométrique) | **~2.98** | non, mais débloqué |
| **sleeve_length** | 4.50 | régression fraîche sur `stature_m` seul | **3.08** | non, mais gros progrès |
| **chest** (mixte) | 4.45 | `weight_kg` seul — **hommes uniquement** (n=7) | 2.61 (hommes) | non (progrès partiel) |
| **hips** | 4.04 | BMI (Theil-Sen robuste) — **hommes uniquement** (n=7) ; déjà bon chez les femmes (1.6) | **2.35 (hommes)** | proche (hommes) |
| **waist** | 6.66 | BMI seul — **hommes** (n=7) ; hors suspects chez les femmes (n=3) | 4.14 (h) / 3.73 (f, n=3) | non (progrès partiel) |

**8 mesures sur 12 ont une correction confirmée, universelle (deux sexes)
et non implémentée** (wrist, neck, thigh, biceps, ankle, shoulder,
inseam, sleeve_length). **3 de plus (chest, hips, waist) ont une
correction confirmée pour les sujets masculins**, et pour `chest`
spécifiquement, un diagnostic fort (pas encore une validation
statistique, n=3) suggère qu'elle est **probablement déjà bonne chez les
femmes** une fois 2 valeurs de référence suspectes écartées ou corrigées
(§3nonies). `hips` était déjà bon chez les femmes sans rien changer.
**Seul `waist` féminin reste un vrai problème non résolu**, même en
excluant les sujets suspects (3.73 cm sur 3 points propres).

**La moyenne globale des 12 mesures passerait d'environ 3.10 cm à
environ 2.1-2.2 cm** avec l'ensemble des corrections universelles
(y compris inseam, nouvellement débloqué), et nettement plus bas encore
pour un client masculin (tronc corrigé) ou si la piste chest-femmes se
confirme.

**Plus aucune mesure sur 12 n'est totalement sans piste positive.**
`inseam`, seule mesure encore bloquée en fin de session précédente, a été
débloquée par une correction géométrique (moyenne des deux chevilles au
lieu de la plus visible) plutôt que statistique — une catégorie de piste
qui n'avait pas encore été explorée pour cette mesure spécifique.

**Ce qui reste réellement incertain** : `waist` (les deux sexes, même si
mieux chez les hommes que chez les femmes) et la confirmation
définitive du diagnostic chest-femmes (nécessite de vérifier la mesure
de référence du sujet 8, §5/§6bis/§8). Au total, sur l'ensemble de la
session : plus de 30 pistes indépendantes testées, chacune validée ou
rejetée sur preuves LOO ou preuves directes, dont plusieurs se sont
révélées être des artefacts de sur-apprentissage démasqués en cours de
route (y compris dans le travail d'un autre agent en parallèle sur ce
même sujet, §3septies) — enseignements méthodologiques centraux de cette
session : **toujours vérifier qu'une variable "gagnante" reste stable
d'un sujet exclu à l'autre avant de croire au gain ; toujours valider
contre de vraies photos, jamais seulement contre des données simulées ou
la population d'entraînement ; et ne jamais accepter un agrégat sur peu
de sujets sans regarder chaque sujet individuellement — l'agrégat peut
cacher qu'un ou deux points dominent tout.**

**Plafond théorique R²** (rappel) : `neck` (0.68), `wrist` (0.57 avant
correction), `ankle` (0.56 avant correction) — 32 à 44 % de variabilité
hors des entrées actuelles. Les corrections wrist/ankle/neck montrent que ce
plafond n'était PAS (encore) le facteur limitant réellement atteint : le
biais de shrinkage dominait largement. Une fois ce biais retiré, il reste
un résidu (0.72 cm pour wrist, 1.22 cm pour ankle, 1.26 cm pour neck) plus
cohérent avec la vraie limite d'information — et pour wrist, ce résidu est
déjà sous 1 cm.

**Conclusion honnête** : passer sous 1 cm sur les **12** mesures simultanément
n'est pas atteignable avec le dispositif actuel (2 photos, aucune nouvelle
collecte de sujets) — certaines limites sont désormais du bruit de photo
(vêtement) et d'information manquante (R²), pas des limites d'algorithme.
Le chemin qui reste, sur preuves accumulées cette session et dans le
rapport : (1) implémenter la correction §3 (gain confirmé, immédiat),
(2) corriger le bug §4 (gain de robustesse, pas de précision), (3) tester
la capture guidée déjà recommandée en Priorité 1 du rapport (seul levier
qui s'attaque au vêtement, la plus grosse source d'erreur documentée), (4)
élargir l'échantillon terrain (Priorité 2) pour donner de la puissance aux
prochaines corrections. Rien de tout cela n'est implémenté — en attente de
décision.
