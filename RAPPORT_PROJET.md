# Sur-MeZur — Rapport de réalisation

*Dernière mise à jour : 8 septembre 2026*

> Ce document décrit l'état réel du projet : ce qui fonctionne, avec quelle
> précision, et ce qui reste à faire. Les chiffres qui y figurent sont tous
> mesurés, jamais estimés — quand une valeur est incertaine, c'est écrit.

> Cette mise à jour couvre la suite de la campagne de précision du 25 août
> (§6bis) : deux pistes supplémentaires testées et écartées (régression par
> processus gaussien, modèle Anny + clad-body), et surtout **le passage en
> production des corrections validées** — jusqu'ici cantonnées à un module
> de recherche séparé, elles sont désormais réellement appliquées aux
> mesures des clients (voir §6bis, "Déploiement en production"). Les
> sections 3 à 6 restaient la référence pour l'état en production avant
> cette date ; ce n'est plus le cas pour la partie précision, dont §6bis
> est maintenant la source à jour. Couvre aussi plusieurs corrections de
> cohérence trouvées en relisant le travail d'une collaboratrice (§8.16),
> un bug de promotion de rôle silencieusement ignorée sur le compte admin
> (§8.15), et un correctif d'affichage sur la fiche modèle mobile (§8.17).

> **Ajout du 29 août.** Deux nouvelles sections. §6ter documente une
> campagne d'analyse de onze expériences dont **aucune n'a été déployée** :
> le détail des raisons est plus instructif que ne l'aurait été un
> correctif, et il évite de refaire ces essais. §10 documente la
> **procédure de compilation de l'application mobile**, cloud et locale,
> après une série de neuf échecs consécutifs dont la cause a été
> identifiée et corrigée — cette section est à lire avant toute tentative
> de build.

---

## Sommaire

1. [Le projet en bref](#1-le-projet-en-bref)
2. [Où en est le projet](#2-où-en-est-le-projet)
3. [La précision, mesure par mesure](#3-la-précision-mesure-par-mesure)
4. [Comment les mensurations sont calculées](#4-comment-les-mensurations-sont-calculées)
5. [Ce que les tests sur 13 personnes ont appris](#5-ce-que-les-tests-sur-13-personnes-ont-appris)
6. [Les limites, et pourquoi elles existent](#6-les-limites-et-pourquoi-elles-existent)
   - [6bis. Nouvelle campagne de précision (25-27 août)](#6bis-nouvelle-campagne-de-précision-25-27-août-2026)
   - [6ter. Onze expériences, aucun déploiement (29 août)](#6ter-onze-expériences-aucun-déploiement-29-août-2026)
7. [Ce qui reste à faire](#7-ce-qui-reste-à-faire)
8. [Historique des corrections](#8-historique-des-corrections)
9. [Journal des versions](#9-journal-des-versions)
10. [Compiler l'application mobile (EAS et local)](#10-compiler-lapplication-mobile-eas-et-local)
11. [L'application web (septembre 2026)](#11-lapplication-web-septembre-2026)

---

## 1. Le projet en bref

Sur-MeZur met en relation des **clients** et des **tailleurs** au Cameroun.

Le principe : un client se photographie, l'application en déduit ses
mensurations, il choisit un modèle de vêtement, négocie le prix avec un
tailleur, paie par Mobile Money, et suit la confection jusqu'à la remise.

| Rôle | Ce qu'il fait |
|---|---|
| **Client** | mesures, commande, négociation, paiement, suivi |
| **Tailleur** | devis, confection, prêt-à-porter, finances, notation |
| **Admin** | vérification des tailleurs, litiges, utilisateurs, commissions |

Application bilingue (français par défaut, anglais disponible), thème clair et
sombre.

---

## 2. Où en est le projet

### 2.1 Vue d'ensemble

| Domaine | État |
|---|---|
| Application mobile (3 rôles) | ✅ fonctionnelle |
| API et règles métier | ✅ fonctionnelle |
| Comptes et sessions | ✅ fonctionnels |
| **Mesure par photo** | ✅ **fonctionnelle — 4,2 cm en base (§5), corrections statistiques actives en production depuis le 27 août (§6bis)** |
| Capture guidée (silhouette + minuteur) | ✅ en place, **jamais testée sur le terrain** |
| Hébergement | ✅ O2Switch |
| Certificat HTTPS | ❌ absent — tests en HTTP (exception ciblée sur ce seul domaine côté Android, voir §7) |
| **Avatar 3D** | ⚙️ pipeline serveur fonctionnel et vérifié en production — **rendu client toujours non confirmé visuellement sur appareil**, nouvelle architecture écrite et vérifiée hors device, pas encore buildée (voir §7) |
| Catalogue (modèles, catégories) | ✅ gestion complète côté admin, 302 photos réelles en production, **affichées dans l'app** (accueil, recherche, galerie, détail) |
| Essayage, patrons | ⚠️ simulés |
| Paiement Mobile Money | ⚠️ simulé (bac à sable) |
| SMS de vérification | ⚠️ le code s'affiche dans l'application |

### 2.2 La chaîne de mesure en chiffres

| | Valeur |
|---|---|
| Erreur moyenne sur les 12 mesures | **4,2 cm** |
| Mesures dans la cible des ±3 cm | **6 sur 12** |
| Sujets analysés avec succès | **12 sur 13** |
| Durée d'une analyse complète | **17 s** (contre 146 s au départ) |

### 2.3 Ce qui tourne où

**Application mobile** — React Native / Expo SDK 54, navigation par fichiers.
Installée en APK sur Android.

**Serveur** — FastAPI + SQLAlchemy, base SQLite, hébergé chez O2Switch
(cPanel, Passenger/WSGI). Authentification par jeton d'accès (1 h) et jeton de
renouvellement (30 jours), renouvelé de façon transparente.

Passenger exécute l'application en WSGI via `a2wsgi`, qui n'émet aucun
évènement de cycle de vie ASGI : le traitement d'une mesure (10 à 90 s)
tournait donc en `BackgroundTasks` dans le cycle de requête, bloquant tout le
site le temps du calcul — pas seulement la requête concernée. Sorti de ce
cycle depuis le 13 août : un worker dédié (`MEASUREMENT_WORKER_MODE=cron`),
invoqué par une tâche planifiée, traite les mesures en dehors de Passenger.

Sur le même hébergement, les processus voient 56 cœurs CPU mais n'en ont
réellement qu'1 à 2 en quota — torch/OpenCV lançaient un thread par cœur
*visible*, saturant le processeur au point qu'une analyse pourtant instantanée
en local (~3 s) n'aboutissait jamais en production. Corrigé le 14 août en
plafonnant explicitement les threads dès l'import du module.

**Intelligence artificielle** — MediaPipe pour le squelette, MobileSAM pour la
silhouette, modèles Ridge entraînés sur ANSUR II. Tout tourne sur le serveur,
sans carte graphique.

---

## 3. La précision, mesure par mesure

Douze mesures sont livrées au tailleur. Voici, pour chacune, **comment elle est
obtenue** et **à combien de centimètres près**.

Les chiffres viennent d'une campagne sur **13 adultes** photographiés puis
mesurés au mètre ruban.

### 3.1 Les mesures dans la cible ✅

| Mesure | Précision | Méthode |
|---|---|---|
| **Tour de poignet** | **1,1 cm** | modèle Ridge |
| **Carrure** | **1,5 cm** | lecture directe du squelette |
| **Tour de cou** | **1,8 cm** | modèle Ridge |
| **Longueur de dos** | **2,3 cm** | lecture directe du squelette |
| **Tour de biceps** | **2,8 cm** | modèle Ridge |
| **Tour de cuisse** | **3,0 cm** | modèle Ridge |

### 3.2 Les mesures à la limite 🟡

| Mesure | Précision | Méthode |
|---|---|---|
| **Entrejambe** | **3,3 cm** | lecture directe du squelette |
| **Tour de cheville** | **3,8 cm** | modèle Ridge |
| **Longueur de manche** | **3,9 cm** | lecture directe du squelette |

### 3.3 Les mesures hors cible ❌

| Mesure | Précision | Méthode |
|---|---|---|
| **Tour de hanches** | **5,2 cm** | géométrie (ellipse) |
| **Tour de poitrine** | **6,5 cm** | géométrie (ellipse) |
| **Tour de taille** | **9,3 cm** | géométrie (ellipse) |

### 3.4 Ce que cette répartition révèle

Les trois mesures hors cible sont **exactement** les trois qui dépendent d'une
**profondeur mesurée sur la photo de profil**.

Ce n'est pas un hasard. La photo de profil est le maillon le plus fragile de
toute la chaîne :

- le sujet doit être **exactement** de côté ; 10° de rotation et la profondeur
  mesurée devient une diagonale, donc trop grande
- la silhouette y est **deux fois plus étroite** que de face, donc la même
  imprécision de découpe y pèse deux fois plus lourd
- c'est la seule vue où le bras cache le torse

À l'inverse, les six mesures dans la cible sont soit **prédites** par un
modèle, soit **lues directement** sur le squelette — deux méthodes qui
n'utilisent jamais la photo de profil.

---

## 4. Comment les mensurations sont calculées

### 4.1 Le principe, en trois étapes

```
   Deux photos                Analyse                    12 mesures
   ───────────                ───────                    ──────────

   📷 de face      ──►   ① MediaPipe repère        ──►   8 tours de corps
   📷 de profil          33 points du squelette          4 longueurs

                         ② MobileSAM découpe
                         la silhouette du corps

                         ③ Calcul des mesures
```

**Étape ① — MediaPipe** place 33 points sur le corps : épaules, coudes,
poignets, hanches, genoux, chevilles. Ces points servent à deux choses :
localiser où mesurer, et convertir les pixels en centimètres.

**Étape ② — MobileSAM** sépare le corps du fond, comme un détourage. On obtient
une forme noire sur blanc, dont on peut mesurer la largeur à n'importe quelle
hauteur.

**Étape ③ — le calcul** combine les deux, selon la mesure recherchée.

### 4.2 La conversion pixels → centimètres

C'est la taille saisie par le client qui donne l'échelle. Si une personne de
175 cm occupe 800 pixels sur la photo, alors un pixel vaut 0,22 cm.

**Conséquence pratique** : la résolution de la photo n'a aucune importance pour
la justesse. C'est ce qui a permis de réduire les images avant analyse — la
chaîne est passée de 87 s à 17 s sans perdre en précision.

### 4.3 Les trois méthodes de calcul

Chaque mesure emprunte l'une des trois voies suivantes.

#### Voie A — La géométrie (poitrine, taille, hanches)

Aucun modèle, aucun apprentissage. Une section de torse ressemble à une
ellipse : si on connaît sa **largeur** et sa **profondeur**, son périmètre se
calcule directement.

```
        largeur (photo de face)
      ├──────────────────────┤
       ╭────────────────────╮        Périmètre ≈ formule de Ramanujan
      │                      │        (approximation classique du
      │       TORSE          │  ▲     périmètre d'une ellipse)
      │                      │  │ profondeur
       ╰────────────────────╯   ▼     (photo de profil)
```

**Pourquoi ne pas utiliser un modèle ici ?** Parce qu'on a mesuré qu'il fait
moins bien. Un modèle entraîné sur ANSUR prédit le tour de poitrine avec
13,0 cm d'erreur là où la géométrie seule en fait 6,5. La raison tient en un
chiffre : chez les militaires américains d'ANSUR, le tour de poitrine dépasse
le périmètre d'ellipse de **10,5 cm en moyenne**. Le modèle apprend cet écart —
réel pour cette population — et le réapplique à des sujets plus minces, chez
qui il ne vaut pas.

La géométrie, elle, ne connaît aucune population.

#### Voie B — Les modèles Ridge (cou, biceps, cuisse, poignet, cheville)

Cinq modèles indépendants, un par mesure. Chacun reçoit 16 variables
(taille, poids, largeurs, profondeurs, rapports) et prédit une circonférence.

Ce sont des **régressions Ridge** — des modèles linéaires régularisés. Ce choix
est délibéré : face à une population absente des données d'entraînement, un
modèle linéaire se trompe *progressivement*, là où un arbre de décision prédit
une valeur constante dès qu'il sort du domaine qu'il connaît.

#### Voie C — La lecture directe (carrure, manche, entrejambe, dos)

Une simple distance entre deux points du squelette, convertie en centimètres.
Aucun modèle n'intervient.

### 4.4 Un piège évité : deux facteurs d'épaules

Le même écartement d'épaules alimente **deux grandeurs différentes**, et les
confondre coûtait 6,7 cm :

| Usage | Facteur | Valeur type | Pourquoi |
|---|---|---|---|
| Entrée des modèles | **1,09** | ~40 cm | doit correspondre à la définition ANSUR, celle sur laquelle les modèles ont appris (largeur d'acromion à acromion) |
| Affichage au tailleur | **0,90** | ~33 cm | doit correspondre au mètre ruban, entre les deux emmanchures |

Recalibrer l'entrée du modèle **dégrade** les prédictions : c'est vérifié.
Les deux valeurs doivent rester distinctes.

### 4.5 Quand l'analyse échoue

Aucune mensuration n'est inventée. Si la chaîne n'aboutit pas, le client reçoit
une **consigne de reprise** détaillée, et une notification même s'il a quitté
l'écran d'attente.

C'est un choix explicite : produire des chiffres déduits de la seule taille
donnerait une fiche plausible mais fausse, indiscernable d'une vraie mesure —
et un vêtement serait taillé dessus.

---

## 5. Ce que les tests sur 13 personnes ont appris

Cette campagne a été le tournant du projet. Avant elle, la précision réelle
était **inconnue**.

### 5.1 L'écart laboratoire / terrain

| | Erreur moyenne |
|---|---|
| Modèle testé sur les données ANSUR | **1,38 cm** |
| Même modèle, mêmes photos, sujets réels | **5,2 cm** |

Un banc d'essai de sept architectures les classait toutes entre 1,09 et
1,31 cm sur ANSUR. **Le problème n'était donc pas la puissance du modèle**,
mais le passage d'une population à une autre.

Preuve décisive : en injectant des variables relevées **au mètre ruban** — donc
une extraction parfaite — le modèle surestimait encore le tour de poitrine de
**12,1 cm**. Aucune amélioration de MediaPipe ou de MobileSAM ne pouvait
corriger cela. C'est ce constat qui a mené au passage à la géométrie.

### 5.2 Trois défauts trouvés et corrigés

**La poitrine était mesurée dans l'aisselle.** La ligne de mesure tombait là où
le bras se rattache au thorax : la largeur mesurée englobait les épaules,
jusqu'à 64 cm pour 32 attendus. Corrigé en cherchant le minimum sur une bande
située plus bas — **9 sujets aboutis sur 13, contre 3**.

**Les hanches étaient mesurées trop haut.** Les points de MediaPipe sont aux
articulations, donc au bassin osseux, alors qu'un tailleur prend le tour à
l'endroit le plus fort des fessiers. Corrigé — **7,4 → 5,2 cm**.

**Un bras fantôme effaçait le torse.** Voir la section 8, c'est le défaut le
plus instructif du projet.

### 5.3 Ce qui pèse le plus lourd

| Facteur | Impact mesuré |
|---|---|
| **Vêtement ample** | jusqu'à **24 cm** |
| Ligne de mesure mal placée | jusqu'à 32 cm *(corrigé)* |
| Confusion de définition | 6,7 cm *(corrigé)* |
| Limite intrinsèque de l'ellipse | 2 à 5 cm |
| Qualité du modèle de découpe | ~0,4 cm |

**Le vêtement domine tout le reste.** C'est pour cela que la capture guidée a
été construite — et c'est pour cela qu'elle doit être testée avant tout autre
développement.

---

## 6. Les limites, et pourquoi elles existent

### 6.1 Certaines mesures ne peuvent pas être plus précises

Le R² indique quelle part d'une mesure est réellement **contenue** dans les
variables fournies. Il fixe un plafond que rien ne franchit :

| Mesure | R² | Ce que ça signifie |
|---|---|---|
| Cuisse | 0,89 | bien déterminée par le reste du corps |
| Biceps | 0,78 | correctement déterminée |
| **Cou** | **0,68** | 32 % de sa variabilité échappe aux données |
| **Cheville** | **0,56** | 44 % lui échappe |
| **Poignet** | **0,57** | 43 % lui échappe |

Deux personnes de morphologie identique peuvent avoir des tours de cou
différents. **L'information n'est pas dans les entrées**, et aucun modèle ne
peut deviner ce qu'il ne voit pas.

Conséquence : **±1 cm est hors d'atteinte** pour le cou, le biceps et la
cuisse par prédiction.

### 6.2 Pistes explorées et écartées, sur preuves

Ces options ont été testées, mesurées, et abandonnées. Elles sont listées ici
pour éviter qu'on les reprenne.

| Piste | Résultat mesuré |
|---|---|
| **Autre modèle de découpe** (human parsing, MediaPipe multiclasse) | identique à MobileSAM sur 12 sujets sur 13 |
| **Sept autres familles de modèles** (SVR, réseau de neurones, forêts…) | gain de 0,16 cm — négligeable |
| **Géométrie appliquée aux membres** | 4 à 7 cm d'erreur, contre 1 à 4 pour les modèles |
| **Profondeurs par ratio fixe** au lieu de mesure réelle | pire sur les trois zones |
| **Autres variables d'entrée** | +0,09 à +0,13 de R², sans effet réel |
| **Recalibrer l'entrée du modèle** | dégrade les prédictions |

**Pourquoi un meilleur découpage ne servirait à rien** : nos photos font
0,22 cm par pixel, et l'erreur de largeur de poitrine est de 4,3 cm — soit
**20 pixels**. Un modèle de détourage plus fin gagne 1 à 2 pixels. Et surtout,
ces 20 pixels sont du **tissu réellement présent sur l'image** : aucun
algorithme ne voit à travers un vêtement.

---

## 6bis. Nouvelle campagne de précision (25-27 août 2026)

**Statut : déployé en production depuis le 27 août.** Les corrections
décrites plus bas ont d'abord vécu dans un module de recherche séparé
(`ml/bench/pipeline_ameliore.py`) le temps d'être validées ; une fois la
validation indépendante concluante, la même logique a été portée dans
`backend/app/services/measurement_corrections.py` et câblée dans le vrai
point d'entrée de mesure (`backend/app/api/v1/measurements.py::_measure`)
— voir "Déploiement en production" plus bas. Journal de recherche complet :
`claude_code.md`. Explication détaillée du module, mesure par mesure :
`PIPELINE_AMELIORE.md`.

### D'où vient cette campagne

Trois recherches indépendantes ont eu lieu en parallèle sur ce dépôt :
la nôtre, et deux autres agents ayant chacun exploré une piste distincte
(`ml/bench/freebuff.md` — sélection de variables sur les mêmes 13 sujets ;
`opencode.md`, à la racine du poste — simulation multi-vues sur maillages
3D exacts). Chaque candidat proposé par les deux autres a été **revérifié
indépendamment** avant toute intégration — deux des candidats de
`freebuff.md` se sont effondrés à la revérification (shoulder : 1,10 cm
annoncé → 6,28 cm en réalité), deux autres ont résisté et se sont révélés
meilleurs que nos propres corrections (biceps, thigh).

### Les corrections retenues

| Mesure | Avant | Après (LOO) | Confiance |
|---|---|---|---|
| biceps | 2,33 cm | **0,63 cm** | haute |
| wrist | 1,55 cm | **0,72 cm** | haute *(retirée, voir plus bas)* |
| thigh | 1,64 cm | **0,74 cm** | haute |
| neck | 1,74 cm | 1,26 cm | moyenne |
| ankle | 4,02 cm | **1,22 cm** | haute |
| shoulder | 2,27 cm | 1,46 cm | moyenne *(retirée, voir plus bas)* |
| inseam | 3,14 cm | ~2,98 cm | moyenne — correction géométrique (moyenne des deux chevilles, pas une variable apprise), pas la sélection d'une cheville unique |
| sleeve_length | 4,50 cm | 3,08 cm | moyenne |
| chest / hips / waist (hommes) | 4,45 / 4,04 / 6,66 cm | 2,61 / 2,35 / 4,14 cm | moyenne, n=7 |
| chest / hips / waist (femmes) | — | non corrigées | échantillon insuffisant (n=5, dont 2 sujets aux mesures suspectes) |

La plupart des corrections retenues recalibrent directement sur le
**poids** plutôt que sur la sortie du modèle Ridge existant — celui-ci,
entraîné sur ANSUR II (base militaire américaine), a tendance à *tirer*
ses prédictions vers la moyenne de sa population d'entraînement
(*shrinkage*) ; le poids, mesure directe et fiable, porte l'information
que le modèle sous-exploite.

### Validation indépendante — et un vrai retour de bâton salutaire

Le 25 août, 7 nouveaux sujets (jamais vus par aucune des trois
recherches) ont été photographiés et mesurés. 6 ont pu être traités
(1 a échoué à la garde de plausibilité du pipeline). Résultat :

- **`ankle` et `hips` (hommes) confirmés très fortement** : gains réels
  de +2,98 cm et +3,32 cm sur des sujets inédits — au-delà de ce
  qu'espérait la validation interne.
- **`shoulder` s'est effondré** : 1,63 → 4,20 cm. Sur un sujet de 95 kg
  (carrure réelle 35 cm), la correction prédisait 47,2 cm. Le lien
  poids→largeur d'épaules, calibré sur 11 sujets, ne se généralise pas —
  contrairement à `ankle`/`hips`, il n'a pas de justification
  physiologique directe (l'ossature ne suit pas le poids comme le fait
  la graisse corporelle).
- **`wrist` — pourtant la correction la plus stable en validation croisée
  interne (12 sujets sur 12 donnant le même résultat) — a aussi échoué** :
  n'améliore que 2 sujets sur 6.
- Les deux ont été **retirées du pipeline** (archivées, documentées,
  jamais appliquées).

**La leçon retenue, au-delà de cette campagne précise** : une correction
peut être parfaitement stable en validation croisée sur 11-13 sujets et
quand même ne pas généraliser — la validation croisée protège contre la
fuite de données *au sein* de l'échantillon, pas contre le fait que
l'échantillon est trop petit pour couvrir la vraie diversité des
morphologies. Seul un test sur des sujets réellement neufs le révèle.

### Piste explorée et non confirmée : une 3ᵉ photo à 45°

Une proposition externe suggérait qu'ajouter une vue oblique à 45° (en
plus de face+profil) rapprocherait la précision du tronc de ~1 cm.
Testé en deux temps :

1. **Simulation sur maillages 3D exacts** (8 morphologies, aucun bruit
   de photo) : le gain géométrique pur est réel et systématique — chest
   -50 %, hip -34 %. Confirme l'intuition de départ.
2. **Premier vrai sujet, 3 photos réelles (face+45°+profil)** : la 3ᵉ vue
   **n'a pas aidé** — chest et waist légèrement pires, hip meilleur mais
   sur une mesure déjà anormalement faussée indépendamment de la
   question à 45°. Explication probable : les bandes d'exclusion des
   bras et de recherche anatomique du pipeline sont calibrées pour
   face/profil uniquement, jamais pour un angle oblique — le bruit
   d'extraction ajouté par la 3ᵉ vue, non calibrée, a probablement
   dépassé le gain géométrique théorique.

**Statut : piste ouverte, pas invalidée mais pas confirmée non plus.**
Un seul sujet réel ne tranche rien dans un sens ou dans l'autre.

### Recherche d'architecture alternative

Recherche large sur ce que d'autres acteurs (académiques et
commerciaux — Bold Metrics, 3DLook) font face aux mêmes contraintes
(2 photos, budget limité). Constats principaux :

- Même les solutions les mieux financées (GPU dédié) rapportent
  **3 à 12 cm d'erreur typique** sur les circonférences — notre pipeline
  corrigé fait déjà mieux sur plusieurs mesures, sans aucun GPU.
- Elles documentent le **même phénomène de *regression to the mean***
  qu'on a diagnostiqué et corrigé ici (shrinkage) — validation croisée
  indépendante que ce n'est pas une faiblesse propre à notre approche,
  mais structurelle au problème.
- **SMPL** (le modèle 3D paramétrique académique dominant) est écarté :
  licence non-commerciale bloquant la production, comme déjà noté pour
  l'avatar le 17 août.

### Piste testée et rejetée : régression par processus gaussien

Idée : remplacer la régression linéaire de la couche de correction par un
processus gaussien (GP), la littérature rapportant des gains de 20-30 %
sur des problèmes comparables. Testé le 26 août sur les 17 sujets réels
disponibles (mêmes features, mêmes plis de validation croisée que le
linéaire, comparaison strictement appariée) :

| Mesure | Brut | Linéaire (LOO) | GP (LOO) |
|---|---|---|---|
| neck | 1,69 | 1,36 | **1,13** |
| thigh | 1,49 | **1,37** | 1,91 |
| biceps | 2,70 | **2,06** | 2,88 |
| ankle | 3,71 | **1,18** | 1,23 |
| sleeve_length | 3,72 | **2,76** | 2,93 |
| chest (h.) | 4,54 | **2,48** | 3,41 |
| hips (h.) | 7,60 | **2,64** | 3,59 |
| waist (h.) | 5,49 | 3,49 | 3,49 |
| **moyenne** | 3,87 | **2,17** | 2,57 |

Le GP ne gagne que sur 1 mesure sur 8, et dégrade la moyenne de 18 %
(2,17 → 2,57 cm) — l'inverse du gain annoncé. Cause probable : avec 9 à
16 points d'entraînement par pli et 1 à 3 variables, un noyau RBF est trop
flexible pour distinguer signal et bruit — les journaux d'exécution
montrent d'ailleurs des avertissements de convergence répétés (les
hyperparamètres butent contre leurs bornes sur presque tous les plis).
C'est la même raison que celle qui avait fait préférer Ridge au gradient
boosting lors de l'entraînement du modèle de base (§4.3) : à si petit
échantillon, un modèle simple généralise mieux qu'un modèle flexible.
**Rejetée** — pourrait redevenir pertinente à 30-50 sujets (priorité 2
ci-dessous), pas avant. Script : `ml/bench/experiments/exp13_gp_vs_lineaire.py`.

### Piste testée et rejetée : Anny (Naver Labs) + clad-body

**Anny** (modèle 3D paramétrique, Apache 2.0, base anthropométrique
MakeHuman calibrée sur les statistiques OMS plutôt qu'ANSUR) et
**clad-body** (extraction de mesures ISO 8559-1 open-source à partir d'un
maillage Anny) ont été installés et testés le 26 août dans un
environnement isolé (pas le venv de production). Deux incompatibilités de
version entre les deux paquets ont dû être corrigées localement pour les
faire fonctionner ensemble (`clad-body` appelle une paramétrisation de
pose absente de la dernière version d'Anny publiée sur PyPI).

Test volontairement strict et honnête : Anny n'a reçu **que** ce que le
client saisit déjà (taille, poids, sexe) — aucune photo, aucune largeur ni
profondeur extraite — via une optimisation par descente de gradient sur
les seuls paramètres "taille" et "poids" du modèle (2 inconnues pour 2
contraintes, le reste de la morphologie restant à sa valeur moyenne, faute
d'information). Comparé aux 17 mêmes sujets réels :

| Mesure | Brut (prod) | Anny (taille+poids seuls) | Gagnant |
|---|---|---|---|
| neck | 1,69 | 1,70 | égalité |
| chest | 4,94 | 6,95 | prod |
| waist | 5,76 | **5,72** | Anny |
| hips | 6,34 | **4,59** | Anny |
| biceps | 2,70 | 3,45 | prod |
| thigh | 1,49 | 5,58 | prod |
| wrist | 1,45 | 2,42 | prod |
| sleeve_length | 3,72 | **3,66** | Anny |
| inseam | 3,49 | 6,09 | prod |
| shoulder | 3,16 | 8,16 | prod |
| back_length | 1,31 | 7,89 | prod |
| **moyenne** | 3,28 | 5,11 | |

Anny gagne sur 3 mesures sur 11 (waist, hips, sleeve_length — celles qui
dépendent surtout de la corpulence globale, cohérent avec son calibrage
OMS) mais perd nettement partout où la mesure dépend des proportions
individuelles (carrure, longueur de dos, cuisse, entrejambe) qu'aucune
photo ne lui a jamais montrées — 56 % d'erreur en plus en moyenne.
**Rejetée dans cette forme** (taille+poids seuls) ; resterait à tester en
le nourrissant des mêmes largeurs/profondeurs extraites par photo que le
pipeline actuel, ce qui n'a pas été fait faute de temps. Script :
`ml/bench/experiments/exp14_anny_clad_body.py`.

### Déploiement en production (27 août 2026)

Les 7 corrections encore valides après la validation indépendante
(tableau plus haut, moins shoulder/wrist) sont désormais **réellement
appliquées** aux mesures de chaque client, pas seulement documentées :

- **`backend/app/services/measurement_corrections.py`** (nouveau) : portage
  exact des coefficients et de la logique de `ml/bench/pipeline_ameliore.py`
  — revérifié coefficient par coefficient contre l'original avant
  intégration, résultats identiques sur un cas de test homme et femme.
- **`backend/app/api/v1/measurements.py`** : `_measure()`, le point d'entrée
  réel appelé par le worker de traitement des mesures, applique désormais
  ces corrections (dont la correction géométrique d'entrejambe, qui
  nécessite de rejouer l'extraction de pose) juste après le calcul brut du
  pipeline V3/V4, avant l'enregistrement. Toute erreur de correction
  dégrade silencieusement vers la valeur brute plutôt que de faire échouer
  une mesure par ailleurs réussie.
- **Vérifié bout en bout** sur un sujet réel (182 cm / 68 kg, mesures
  connues) avant la mise en production : gains de 0,4 à 5,2 cm selon la
  mesure (hanches 7,5 → 0,4 cm, biceps 5,0 → 0,4 cm, taille 11,6 → 5,2 cm,
  cheville 5,8 → 2,3 cm), poignet et carrure inchangés comme attendu
  (corrections retirées).
- Déployé sur O2Switch le 27 août suivant la procédure de `DEPLOIEMENT.txt`.
  Incident rencontré au passage : le clone git du serveur (`repo-source`)
  avait divergé de GitHub depuis plusieurs jours (4 commits locaux jamais
  poussés, dont un correctif du mesureur virtuel d'avatar) — vérifié
  fichier par fichier avant de réconcilier que leur contenu était déjà
  intégralement présent sur GitHub sous un autre historique, donc sans
  perte, puis résolu par `git reset --hard origin/main`.

---

## 6ter. Onze expériences, aucun déploiement (29 août 2026)

**Résumé : onze expériences menées, aucune retenue.** Cette section existe
parce que le détail des échecs vaut plus qu'un correctif — il documente ce
qui a été essayé, mesuré, et pourquoi ça n'a pas marché, ce qui évite de
refaire ces essais. Les scripts sont dans `ml/bench/experiments/`
(exp19 à exp29).

### Ce que la campagne a découvert sur le code existant

Ces constats n'étaient pas documentés et sont les acquis les plus durables
de la journée.

**1. La production ignore la photo pour poitrine, taille et hanches chez
l'homme.** Vérifié en passant des valeurs brutes de 70 à 130 cm à
`corriger_mesures` : la sortie ne bouge pas d'un millimètre. Les
corrections masculines de ces trois mesures sont en `mode="direct"`
(poitrine) ou de type `CorrectionBMI` (taille, hanches), et ces deux modes
**n'utilisent jamais** la valeur calculée depuis les photos. En pratique,
pour tout client masculin :

```
poitrine = 0,4055 × poids + 58,766
taille   = 2,2005 × IMC  + 31,068
hanches  = 1,1518 × IMC  + 67,785
```

Chez la femme, à l'inverse, aucune correction ne s'applique
(`NON_CORRIGEES_FEMMES`) : c'est l'ellipse brute qui sort.

**2. Et c'est un bon choix, pas un oubli.** Une expérience sur vidéo de
rotation (même personne, même session, six images de face) montre que la
valeur issue des photos porte **3 à 4 cm de bruit pur** sur le tronc, alors
que la formule taille/poids atteint 1,9 à 2,9 cm chez l'homme. Injecter la
photo ne pourrait que dégrader — ce qui a été vérifié expérimentalement
(voir plus bas).

**3. MediaPipe mesure le torse ~4 cm plus long de profil que de face.**
Mesuré sur une rotation continue, donc à torse réel constant par
construction : 56,1 cm de moyenne en vues frontales contre 60,4 cm en
vues de profil, l'écart variant régulièrement avec l'angle. Retrouvé
indépendamment sur les paires de photos des 20 sujets (biais systématique
de +3,50 cm). C'est un artefact d'estimation lié à l'angle de vue, pas un
mouvement du sujet — **déplacer la caméra au lieu de la personne ne le
corrigerait donc pas**, contrairement à ce qu'on pouvait espérer.

**4. Les cinq tours de membres n'écoutent quasiment pas la photo.** Une
analyse de sensibilité (faire varier une entrée de +3 cm, toutes choses
égales par ailleurs) donne : `biacromialbreadth`, `sittingheight` et
`crotchheight` à **zéro ou presque** sur les huit tours. Les membres sont
pilotés par le poids (biceps +1,00, cuisse +1,30 pour +3 kg) et la taille,
c'est-à-dire par des valeurs **saisies au clavier**. Leur remarquable
stabilité (0,2 à 0,9 cm de dispersion sur un même sujet) n'est donc pas
une qualité de mesure : c'est le symptôme d'une table anthropométrique
déguisée. Deux personnes de même taille et même poids obtiennent
pratiquement le même poignet, quelle que soit leur morphologie.

**5. Le déséquilibre hommes/femmes est structurel.** Sur les mêmes sujets :

| Mesure | Hommes (n=10) | Femmes (n=8) |
|---|---:|---:|
| Poitrine | 1,90 cm | 4,99 cm |
| Taille | 2,88 cm | 9,75 cm |
| Hanches | 2,23 cm | 5,19 cm |

La littérature confirme que ce n'est pas un défaut de la chaîne : une
étude sur la prédiction du tour de taille attribue les écarts plus grands
chez les femmes à *« l'hétérogénéité de l'anthropométrie féminine
(adiposité aux hanches, cuisses, tissu mammaire) »*.

### Les onze pistes testées et écartées

| # | Piste | Résultat |
|---|---|---|
| 1 | Largeur par médiane de bande au lieu de l'extrémum | −0,04 / +0,06 / −0,30 cm : dans le bruit |
| 2 | Échelle partagée entre face et profil | Dégrade partout |
| 3 | Régression enrichie (les six largeurs/profondeurs) | Dégrade partout (surapprentissage) |
| 4 | Régression séparée par sexe | Dégrade fortement (sous-échantillons trop petits) |
| 5 | Superellipse à exposant ajusté | Gain < 1 cm, battu par la régression simple |
| 6 | Superellipse adaptative (façon Montazerian) | Idem |
| 7 | Rapport largeur/profondeur comme variable | Aucun effet (3,84 → 3,84) |
| 8 | Réintégrer la photo dans le tronc | Dégrade les trois mesures (+0,59 à +1,05 cm) |
| 9 | Formule taille/poids étendue aux femmes | Dégrade les trois mesures |
| 10 | Rapports de forme (invariants d'échelle) | Dégrade, jusqu'à +20 cm chez les femmes |
| 11 | Ancrage des niveaux en distance physique (cm) | **Validé sur le vrai pipeline : dégrade** |

Deux résultats méritent un mot de plus.

**Piste 10 — le piège de la robustesse sans information.** L'idée était
solide : une erreur d'échelle est commune à toutes les largeurs d'une même
photo, donc elle s'annule dans un rapport. C'est confirmé — le rapport
poitrine/taille varie de 2,6 % contre 12,1 % pour les largeurs absolues.
Mais un rapport à 2,6 % de dispersion **ne distingue presque pas les
sujets entre eux** : il est stable parce qu'il est quasi constant chez
tout le monde. Robuste et inutile à la fois.

**Piste 11 — pourquoi elle a failli être déployée.** Elle corrigeait une
incohérence réelle et démontrée (constat 3 ci-dessus) sans introduire
aucun coefficient ajusté, et un banc d'essai la donnait gagnante
(−0,27 cm poitrine, −0,78 cm hanches). Implémentée dans le code de
production puis validée sur `pipeline.run()` avec les 12 mesures, elle
**dégrade les 6 mesures affectées, sans exception** (moyenne 2,42 → 2,53 cm).
Le gain apparent venait d'un banc d'essai reconstruit qui, lui, ne
résolvait pas l'épaisseur de vêtement et n'alimentait les corrections
qu'avec taille et poids. Le correctif a été retiré.

**Leçon de méthode retenue** : les bancs d'essai reconstruits (exp19,
exp22, exp23) restent valables pour comparer des variantes entre elles,
mais leurs chiffres absolus ne prédisent pas le comportement réel. Toute
piste candidate doit être validée directement sur `pipeline.run()`, sur
les 12 mesures, avant toute conclusion.

### Un point de prudence sur la performance masculine actuelle

Un modèle XGBoost entraîné sur **60 740 participants** pour prédire le tour
de taille depuis taille/poids/IMC/âge/sexe plafonne à **4,7 cm de RMSE**,
et en validation externe surestime de 4,65 cm au Royaume-Uni
« principalement par surprédiction chez les femmes ». Nos 2,88 cm chez
l'homme, obtenus sur 10 sujets, sont donc très probablement de la chance
d'échantillonnage plutôt qu'une performance réelle. **Cette performance ne
devrait pas être considérée comme acquise** sans validation sur des sujets
neufs.

### Conclusion opérationnelle

À 18 sujets exploitables (dont 8 femmes), presque toute idée nouvelle est
indistinguable du bruit d'échantillonnage : un écart inférieur à ~0,5 cm
sur une mesure isolée n'est pas interprétable. Le blocage n'est pas le
manque d'idées — onze ont été testées en une journée — mais **le volume de
données de calibration**, en particulier chez les femmes. C'est le même
constat que §7 priorité 1, désormais étayé par onze échecs mesurés.

---

## 7. Ce qui reste à faire

### Priorité 1 — Tester la capture guidée sur le terrain

**Coût : une séance photo. Gain attendu : le plus important de tous.**

Les 13 sujets ont été photographiés **sans** la capture guidée : vêtements
variés, distances inconnues, poses libres.

La preuve du potentiel est dans les données : **trois sujets** avaient une
largeur de poitrine extraite à moins de 1,5 cm de la vérité. Si les treize leur
ressemblaient, la poitrine passerait de 6,5 à environ 4 cm — **sans écrire une
ligne de code**.

Tout le reste en dépend : sans photos propres, une calibration se ferait sur du
bruit vestimentaire.

### Priorité 2 — Collecter 30 à 50 sujets

Seul moyen de corriger le biais de population. L'architecture actuelle réserve
déjà l'emplacement de cette correction ; il lui manque des données.

Deux exigences : relever **les tours *et* les largeurs/profondeurs**, et fixer
une **convention de mesure écrite** — la confusion carrure/biacromiale a coûté
trois jours.

### Priorité 3 — La capture vidéo multi-angles

C'est la seule piste qui **supprime** la photo de profil au lieu de
l'améliorer.

Le principe repose sur un théorème de géométrie : le périmètre d'une forme
convexe égale la moyenne de ses largeurs sur toutes les orientations,
multipliée par π. Avec assez d'angles, **on ne mesure plus que des largeurs**
— la mesure la plus fiable de la chaîne.

Vérifié par simulation : l'intégration devient exacte dès **6 images**, même si
la personne tourne à vitesse irrégulière. Un demi-tour suffit.

Le préalable : savoir lire l'angle de chaque image. La chaîne dispose déjà d'un
indicateur (le rapport écartement d'épaules / hauteur de torse, qui vaut 0,68
de face et 0,05 de profil), mais il n'est pas calibré aux angles
intermédiaires. Une séance de dix minutes suffirait.

### Priorité 4 — Confirmer visuellement le rendu de l'avatar 3D sur appareil

**Aucun avatar n'a encore été validé visuellement de bout en bout sur un
téléphone réel**, malgré plusieurs correctifs successifs — chaque test a
jusqu'ici révélé un nouveau blocage avant même de pouvoir juger de la
morphologie. Historique complet des trois blocages trouvés et corrigés :

1. **Écran totalement vide** (16-17 août) : `Dimensions.get("window")`
   appelé une seule fois au chargement du module plutôt qu'à chaque rendu —
   sur certains démarrages, la valeur capturée figeait la hauteur du
   visualiseur 3D à 0, rendant tout le composant invisible quel que soit
   l'état du modèle. Corrigé (hook `useWindowDimensions()`, réévalué à
   chaque rendu).
2. **Plantage au chargement** (17 août) : les maillages de base réexportés
   avec les normales de morphologie par cible pesaient ~20-21 Mo (contre
   4,7-4,8 Mo) — sur le téléphone testé, l'allocation mémoire GPU pour ce
   volume de données échouait silencieusement, laissant un écran sans
   erreur ni modèle. Un premier correctif s'est avéré n'avoir *rien*
   changé : les fichiers avaient été restaurés depuis un ancien commit,
   sans relancer réellement l'export Blender (vérifié par hash de contenu
   identique à l'octet près). Réexporté pour de bon depuis, retour à
   4,7-4,8 Mo. Au passage, deux hypothèses précédentes sur la cause de
   l'aspect "carré" du maillage ont été formellement invalidées par
   inspection directe de la scène Blender : le maillage est déjà lissé à
   100 % dès sa création par MPFB2, et ne porte qu'un seul matériau — ni le
   lissage manuel ni le filtrage des matériaux tentés n'avaient donc
   d'effet réel.
3. **Échec silencieux masqué en état "prêt"** : un échec de chargement
   appelait le même callback qu'un succès, affichant les boutons de
   confirmation sur une scène vide sans aucune indication d'erreur.
   Corrigé — succès et échec sont maintenant deux callbacks distincts
   (`onReady` / `onError`), avec un vrai message et un bouton "Réessayer"
   en cas d'échec.

**✅ Corrigé le 24 août** (§8.8). Les pages `ModelDetail.tsx`, `Home.tsx` et
`Gallery.tsx` affichent désormais `photo_url` avec `background: url(...) center/cover`,
en fallback sur le dégradé `thumbnail_color` si pas de photo. Le type TypeScript
`GarmentModel` a été corrigé pour inclure `photo_url`, `photos`, `like_count` et
`liked_by_me`.

**Nouvelle architecture de rendu, en cours d'intégration.** Le compromis
entre poids de fichier (sans normales, chargement correct mais éclairage
figé sur la forme neutre) et fidélité d'éclairage (avec normales, GPU
saturé) a été soumis à quatre analyses techniques externes indépendantes,
converge sur la même solution : appliquer les poids de morphologie **une
seule fois côté client**, directement sur les positions du maillage
(plutôt que de les laisser recombinés par le GPU à chaque image, alors
qu'ils ne changent jamais après génération), puis recalculer les normales
sur la forme réellement déformée et jeter les données de morphologie
devenues inutiles. Implémenté (`bakeMorphTargets()` dans `Viewer3D.tsx`) et
vérifié hors device par un test isolé rejouant le vrai fichier `.glb` et de
vrais poids : 48 ms de calcul, aucune position ni normale aberrante. **Pas
encore confirmé visuellement sur un appareil physique** — c'est la seule
chose que cette vérification ne peut pas remplacer.

Brief complet des contraintes, de l'architecture actuelle et des options
évaluées : `BRIEF_MODELE_CORPOREL_AVATAR.md`.

### Autres chantiers

| Sujet | État |
|---|---|
| **Certificat HTTPS** | AutoSSL n'a pas émis pour le sous-domaine ; tests en HTTP. Contournement ciblé côté Android : exception de trafic en clair limitée au seul domaine de l'API |
| **Pare-feu applicatif O2Switch (Tiger Protect)** | a bloqué tout le trafic API (y compris l'app mobile, incapable de résoudre le défi JavaScript exigé) le 16 août, sans réglage en libre-service trouvé dans cPanel ; résolu depuis, cause exacte non confirmée par le support |
| **Interface sur appareil** | la capture guidée n'a jamais été utilisée en conditions réelles |
| **Vrai fournisseur Mobile Money** | actuellement simulé |
| **Essayage, patrons** | actuellement simulés — **essayage 3D fonctionnel** avec sélection modèle/tissu/accessoires, création d'avatar possible depuis mesures existantes (§8.9) |
| **Migration de schéma en production** | `garment_models` (catégories genrées) reste sur l'ancien schéma sur le serveur — nécessite une suppression manuelle de la table pour que `create_all()` la recrée au bon format ; le projet n'a toujours pas de système de migration. De plus, la colonne `quartier` ajoutée à `tailor_profiles` nécessitera `sync_sqlite_columns.py --apply` en production |
| **Compte de test** | `+23760000001` (« ZZ Test Diagnostic ») et ses sessions de mesure/avatar associées restent à supprimer en production |
| **Sauvegarde du dépôt** | l'historique local n'a aucun ancêtre commun avec le dépôt distant |

---

## 8. Historique des corrections

Cette section garde la trace des défauts trouvés — surtout ceux dont le
diagnostic initial était faux.

### 8.1 Le bras fantôme — trois jours d'errance

**Le symptôme** : les profondeurs mesurées sur la photo de profil étaient
inexploitables. Poitrine et taille ressortaient **identiques au pixel près**
(71 px), ce qui n'existe sur aucun corps humain.

**Le diagnostic initial, faux** : « un bras qui pend le long du corps recouvre
la zone à mesurer ». Cette explication a tenu trois jours et a conduit à
désactiver les profondeurs.

**La vraie cause** : de profil, le bras opposé est **caché derrière le corps**.
MediaPipe ne renvoie pas « je ne sais pas » — il **invente des coordonnées**,
avec un indice de visibilité de 0,00 à 0,01, qui descendent le long du torse.
Le code effaçait une bande le long de ces coordonnées fantômes, et **effaçait
donc le torse lui-même**, en plein sur les lignes de poitrine et de taille.

**La correction** : ne plus masquer un membre dont le coude et le poignet sont
sous le seuil de visibilité. *On ne masque pas ce qu'on n'a pas vu.*

**La leçon** : un modèle qui renvoie toujours une réponse peut renvoyer une
réponse inventée. L'indice de confiance n'est pas décoratif.

### 8.2 La carrure confondue avec la largeur biacromiale

**Le symptôme** : la largeur d'épaules affichée était surestimée de 6,7 cm sur
les 12 sujets, jamais sous-estimée.

**Le diagnostic initial, faux** : « le facteur de conversion est mal calibré ».

**La vraie cause** : deux mesures différentes étaient comparées. La chaîne
produisait la **largeur biacromiale** (d'acromion à acromion, ~40 cm), là où le
tailleur mesure une **carrure** (entre les emmanchures, ~33 cm). La chaîne
tombait d'ailleurs pile dans la distribution ANSUR — elle avait raison.

**La correction** : deux facteurs distincts, un par usage.

**La leçon** : avant de corriger un écart, vérifier qu'on compare bien deux
fois la même grandeur.

### 8.3 Les mensurations inventées

Quand la chaîne échouait, des chiffres déduits de la seule taille prenaient le
relais. Ils étaient plausibles, donc **indiscernables d'une vraie mesure** — et
un vêtement pouvait être taillé dessus.

Supprimé : l'échec est désormais explicite, avec une consigne de reprise.

### 8.5 Impossible de scroller sur les pages de connexion

**Le symptôme** : sur mobile, quand le clavier virtuel apparaissait pour saisir
le mot de passe, le formulaire dépassait vers le bas mais aucun scroll n'était
possible. Le champ mot de passe était masqué par le clavier et l'utilisateur ne
pouvait pas voir ce qu'il écrivait.

**La cause** : le container racine des pages `Login.tsx` et `Register.tsx`
utilisait la classe CSS `app-shell` qui définit `min-height: 100vh` avec
`display: flex` mais **sans `overflow-y: auto`**. Le formulaire était centré
verticalement (`justifyContent: "center"`), et quand le clavier réduisait la
hauteur du viewport, le contenu débordait vers le bas sans possibilité de
scroller.

**La correction** : ajout de `overflowY: "auto"` en style inline sur le
container racine de `Login.tsx` (ligne 34) et `Register.tsx` (ligne 62). Le
`justifyContent: "center"` est conservé pour le centrage normal ; le scroll se
débloque automatiquement quand le contenu dépasse.

**Fichiers modifiés** : `frontend/src/pages/auth/Login.tsx`,
`frontend/src/pages/auth/Register.tsx`.

### 8.6 Mise en page de la fiche modèle — vide blanc disproportionné

**Le symptôme** : quand un utilisateur cliquait sur un modèle dans la galerie,
la page de détail (`ModelDetail.tsx`) affichait un bandeau gradient de 260px
fixe en haut, puis le nom, la description et les boutons en dessous. Sur les
grands écrans, cela créait un espace blanc considérable sous le bandeau.

**La cause** : le bandeau avait une hauteur fixe de `260px` quelle que soit la
taille de l'écran. Il ne s'adaptait pas à l'espace disponible.

**La correction** : passage à un layout `flex` colonne à `100vh` avec le
bandeau en `flex: 1` (il prend tout l'espace restant) et la zone d'informations
en `flexShrink: 0` (elle ne rétrécit pas). Le bandeau minimum est fixé à 200px
pour éviter qu'il ne disparaisse sur les petits écrans.

**Fichier modifié** : `frontend/src/pages/client/ModelDetail.tsx` (3 styles
inline modifiés, aucune logique changée).

### 8.7 Recherche ne fonctionnait ni par catégorie, ni par mot-clé

**Le symptôme** : la barre de recherche (`Search.tsx`) ne retournait aucun
résultat, que ce soit par nom de modèle, par catégorie ou par nom de tailleur.
Les chips de catégories sur l'écran d'accueil ne filtraient rien non plus.

**Les causes** (multiples, couche frontend et backend) :

| # | Couche | Problème |
|---|---|---|
| 1 | Backend | La recherche tailleurs ne cherchait que dans `shop_name` — pas de bio, ville ni nom complet |
| 2 | Backend | La recherche modèles ne cherchait que dans `name` — pas de description, tags ni catégorie |
| 3 | Frontend | Pas de debounce : chaque frappe déclenchait un appel API immédiat (4 requêtes pour "robe") |
| 4 | Frontend | Pas de `.catch()` : une erreur API (token expiré, 500) laissait un spinner infini sans feedback |
| 5 | Frontend | Pas d'AbortController : les réponses lentes écrasaient les résultats plus récents (race condition) |
| 6 | Frontend | Pas d'état "vide" : zéro résultat affichait… rien du tout |
| 7 | Frontend | `CatalogApi.models` envoyait `category` comme paramètre, mais l'API attend `category_id` (UUID) |
| 8 | Frontend | Les chips de catégories sur l'accueil utilisaient une liste hardcodée `["top", "bottom", ...]` au lieu des vraies catégories de l'API |

**La correction** :

- **Backend `tailors.py`** : recherche élargie avec `or_()` sur `shop_name`,
  `bio`, `city` et `User.full_name` (via relationship `TailorProfile.user`)
- **Backend `catalog.py`** : recherche élargie avec `or_()` sur `name`,
  `description`, `style_tags` (cast JSON→String pour LIKE sur SQLite) et
  `Category.name` (via relationship `GarmentModel.category`)
- **Frontend `Search.tsx`** : debounce de 300ms, AbortController pour annuler
  les requêtes précédentes, `.catch()` avec affichage d'erreur, message
  « Aucun résultat pour « … » »
- **Frontend `endpoints.ts`** : renommage `category` → `category_id`,
  ajout de `CatalogApi.categories()`
- **Frontend `types.ts`** : ajout de l'interface `Category { id, name, gender }`
- **Frontend `Home.tsx`** : catégories fetchées depuis l'API au lieu de la liste
  hardcodée, filtre par `category_id`
- **Frontend `Gallery.tsx`** : même correction que Home.tsx (fetch catégories
  réelles)

**Difficulté** : le bug le plus subtil était l'incohérence `category` vs
`category_id`. L'ancien enum figé `GarmentCategory` (`"top" | "bottom" | ...`)
était encore utilisé comme clé de filtre alors que le backend attendait un UUID
depuis la migration vers les catégories gérées par l'admin. Le filtre ne
produisait aucune erreur visible — il envoyait simplement une valeur que le
backend ignorait silencieusement.

**Fichiers modifiés** : `backend/app/api/v1/tailors.py`,
`backend/app/api/v1/catalog.py`, `frontend/src/pages/client/Search.tsx`,
`frontend/src/pages/client/Home.tsx`, `frontend/src/pages/client/Gallery.tsx`,
`frontend/src/api/endpoints.ts`, `frontend/src/api/types.ts`.

### 8.8 Fiche modèle : type `category` incohérent et images absentes

**Le symptôme** : la page de détail d'un modèle (`ModelDetail.tsx`) affichait
`[object Object]` à la place du nom de catégorie. Les images réelles du catalogue
(302 photos importées) n'étaient jamais affichées — seuls des dégradés colorés
apparaissaient. L'espace blanc sous l'image était disproportionné.

**Les causes** (multiples) :

| # | Problème | Impact |
|---|---|---|
| 1 | Le type TypeScript `GarmentModel.category` était déclaré comme `string` (`GarmentCategory`) alors que le backend renvoie un **objet** `{ id, name, gender }` | `[object Object]` affiché partout |
| 2 | Les champs `photo_url`, `photos`, `like_count`, `liked_by_me` existaient côté backend mais **absents du type frontend** | Photos réelles jamais affichées |
| 3 | Pas de gestion d'erreur sur `CatalogApi.model()` | Spinner infini si l'API échoue |
| 4 | Le layout utilisait `flex: 1` sur l'image et `flexShrink: 0` sur le contenu, sans scroll | Espace blanc sous le contenu |

**La correction** :

- **`types.ts`** : `category` remplacé par `{ id: string; name: string; gender: string }`,
  champs `photo_url`, `photos`, `like_count`, `liked_by_me` ajoutés
- **`ModelDetail.tsx`** : `model.category` → `model.category.name`, image affichée via
  `url(photo_url) center/cover` avec fallback gradient, gestion d'erreur avec message,
  contenu scrollable (`overflowY: "auto"`)
- **`Home.tsx`** : `m.category` → `m.category.name`, image carte avec `photo_url`
- **`Gallery.tsx`** : idem

**Difficulté** : le bug était invisible en l'absence de données — TypeScript ne
signalait pas l'erreur car l'ancien enum `GarmentCategory` est un alias de `string`.
La mismatch entre le type frontend (string) et la réponse backend (objet) ne
provoquait aucune erreur de compilation, seulement un rendu incorrect.

**Fichiers modifiés** : `frontend/src/api/types.ts`,
`frontend/src/pages/client/ModelDetail.tsx`, `frontend/src/pages/client/Home.tsx`,
`frontend/src/pages/client/Gallery.tsx`.

### 8.9 Essayage : réutilisation des mesures existantes

**Le symptôme** : un client qui avait déjà pris ses mesures mais n'avait pas encore
d'avatar était forcé de refaire tout le parcours photo + analyse IA pour créer un
avatar. Le bouton unique "Prendre mes mesures" redirigeait vers
`/client/measurements`, ignorant les mesures déjà enregistrées en base.

**La cause** : `TryOn.tsx` n'offrait qu'un seul chemin quand `avatarId` était absent.
Or l'API `POST /avatars` accepte directement un `measurement_id` existant — la
génération d'avatar (morph weights) est instantanée (~1 ms, calcul Python pur, pas
de Blender ni de pipeline IA). Le gros traitement (photos → mesures via MediaPipe +
SAM + ML) n'est nécessaire qu'une seule fois.

**La correction** :

- **`TryOn.tsx`** : deux boutons affichés quand pas d'avatar :
  - "Prendre mes mesures" → `/client/measurements` (parcours complet)
  - "Utiliser mes mesures existantes" → `/client/tryon/pick-measurement`
- **`UseExistingMeasurements.tsx`** (nouveau) : page qui appelle `GET /measurements`,
  affiche la liste des mesures existantes (taille, poids, source, score de confiance),
  permet de choisir le teint de peau, puis appelle `POST /avatars` (~1 ms) et
  redirige vers `/client/tryon?avatarId=xxx`
- **`App.tsx`** : route ajoutée `/client/tryon/pick-measurement`
- **`fr.json` / `en.json`** : clés i18n ajoutées (`tryon.noAvatar`,
  `tryon.takeMeasurements`, `tryon.useExisting`, `tryon.useMeasurement`,
  `measurement.pickExisting`, `measurement.pickExisting.subtitle`,
  `measurement.noExisting`, `measurement.confidence`)

**Difficulté** : aucune — le backend supportait déjà le cas d'usage. La seule
vérification nécessaire était de s'assurer que `MeasurementsApi.list()` retourne
bien toutes les mesures du client (ce qui est le cas, endpoint `GET /measurements`
trié par `created_at desc`).

**Fichiers modifiés** : `frontend/src/pages/client/TryOn.tsx`,
`frontend/src/pages/client/UseExistingMeasurements.tsx` (nouveau),
`frontend/src/App.tsx`, `frontend/src/i18n/fr.json`, `frontend/src/i18n/en.json`.

**Porté sur mobile le 25 août.** Ce correctif n'avait touché que le site
web — l'app mobile a continué de renvoyer systématiquement vers la
capture photo complète tant que ce portage n'a pas été fait. Nouveau
fichier `mobile/app/client/tryon/pick-measurement.tsx` (équivalent de
`UseExistingMeasurements.tsx`, dans les conventions déjà utilisées côté
mobile — `Screen`/`Header`/`StatusChip`), guard "pas d'avatar" de
`(tabs)/tryon.tsx` mis à jour avec le second bouton, 8 clés i18n ajoutées
(fr + en). `npx tsc --noEmit` propre sur tout le projet mobile après ce
changement.

### 8.10 Page vérification admin : informations insuffisantes

**Le symptôme** : l'administrateur devait approuver ou rejeter des tailleurs sans
pouvoir voir leurs pièces justificatives. La page n'affichait que le nom de
boutique, le type, la ville et la bio — aucune photo, aucun document, aucune
identité.

**Les causes** :

| # | Problème | Impact |
|---|---|---|
| 1 | L'endpoint `GET /admin/verifications/{tailor_id}/documents` existait côté backend mais **n'était pas câblé** côté frontend | Aucun document affiché |
| 2 | Le type `VerificationDocument` n'existait pas dans `types.ts` | Impossible de typer les documents |
| 3 | Pas de photo atelier affichée malgré `atelier_photo_url` disponible | Pas de visuel sur l'atelier |
| 4 | Pas d'identité du tailleur (nom, téléphone) | Impossible de vérifier l'identité |
| 5 | Les `StatusChip` utilisaient des couleurs de fond trop pâles | Rendu peu lisible |

**La correction** :

- **`types.ts`** : ajout du type `VerificationDocument { id, user_id, type, file_url, status }`
- **`endpoints.ts`** : ajout de `AdminApi.getVerificationDocuments(tailorId)` → `GET /admin/verifications/{id}/documents`
- **`Verifications.tsx`** : redesign complet (52 → 207 lignes) :
  - Photo atelier en haut de chaque carte
  - Badge type (Atelier/Individuel) avec couleur
  - Note moyenne et nombre de commandes
  - Bouton "Voir les documents" → affiche CNI, portfolio, photo atelier avec lien "Ouvrir"
  - Badge statut par document (en attente/approuvé/rejeté)
  - Layout scrollable (`overflowY: "auto"`)
  - Boutons Rejeter/Approuver en bas

**Difficulté** : le principal obstacle était l'absence de câblage entre le frontend
et l'endpoint backend existant. L'API retournait déjà les documents, mais aucun
appel API ni type TypeScript ne permettait de les récupérer. La difficulté était
minore car le backend était complet.

**Fichiers modifiés** : `frontend/src/api/types.ts`, `frontend/src/api/endpoints.ts`,
`frontend/src/pages/admin/Verifications.tsx`.

### 8.11 Page catalogue admin inexistante

**Le symptôme** : l'administrateur n'avait aucune interface pour gérer les
catégories et modèles du catalogue. Les 302 photos importées ne pouvaient être
ni vues ni supprimées depuis l'interface.

**La cause** : le backend disposait d'endpoints CRUD complets (`/admin/categories`,
`/admin/models`, `/admin/models/{id}/photos`) mais aucun fichier frontend, aucune
route et aucun appel API n'étaient câblés.

**La correction** :

- **`endpoints.ts`** : ajout de 8 méthodes dans `AdminApi` :
  `categories()`, `createCategory()`, `updateCategory()`, `deleteCategory()`,
  `models()`, `createModel()`, `updateModel()`, `deleteModel()`
- **`client.ts`** : ajout de `api.delete()` (manquait)
- **`AdminCatalog.tsx`** (nouveau, 136 lignes) : page avec chips de catégories
  cliquables, grid 2 colonnes des modèles avec photo réelle ou dégradé, prix,
  bouton suppression
- **`App.tsx`** : route `/admin/catalog` ajoutée
- **`Layouts.tsx`** : onglet "📁 Catalogue" ajouté à la TabBar admin
- **`fr.json` / `en.json`** : clé `admin.catalog` ajoutée

**Difficulté** : le endpoint `DELETE` n'existait pas dans le client HTTP (`api.delete()`).
Il a fallu l'ajouter. Aussi, le type `Partial<GarmentModel>` utilisé pour
`createModel`/`updateModel` est incohérent avec le backend qui attend `category_id`
(string) au lieu de `category` (objet) — ce sera à corriger si une interface de
création de modèles est ajoutée.

**Fichiers modifiés** : `frontend/src/api/client.ts`, `frontend/src/api/endpoints.ts`,
`frontend/src/pages/admin/AdminCatalog.tsx` (nouveau), `frontend/src/App.tsx`,
`frontend/src/components/Layouts.tsx`, `frontend/src/i18n/fr.json`,
`frontend/src/i18n/en.json`.

### 8.12 Le temps d'analyse

| Étape | Durée |
|---|---|
| Au départ | 146 s |
| Après arrêt d'un appel devenu inutile | 30,6 s |
| Après passage à MobileSAM | 14,7 s |
| Après réduction des images à 1600 px | **17 s** *(sur photos 4000 px, contre 87 s)* |

### 8.13 Champ ville/quartier : dropdowns et recherche filtrée

**Le symptôme** : le champ « Ville » du formulaire de vérification tailleur était
un input texte libre — aucune normalisation, aucune validation, et la plupart des
tailleurs écrivaient « Douala » par défaut. Il n'existait pas de champ quartier
pour affiner la recherche géographique. La recherche tailleurs ne filtrait que
par texte libre (nom, bio), pas par zone géographique.

**Les causes** :

| # | Problème | Impact |
|---|---|---|
| 1 | Champ ville = input texte libre, aucune validation | Données incohérentes en base (« douala », « DOUALA », « Douala City ») |
| 2 | Pas de champ quartier dans le modèle `TailorProfile` | Impossible de localiser un tailleur dans un quartier précis |
| 3 | Recherche tailleurs sans filtre géographique | Un client à « Makepe » ne trouvait que des tailleurs en « Douala » sans distinction |
| 4 | Le même problème existait côté mobile | UX incohérente entre web et mobile |

**La correction** :

- **`citiesData.ts`** (nouveau, frontend + mobile) : base de données de 23 villes
  camerounaises avec leurs quartiers respectifs (`Record<string, string[]>`), plus
  un tableau trié `CITY_NAMES`
- **Backend `models/users.py`** : colonne `quartier: String(120)` ajoutée à
  `TailorProfile`
- **Backend `schemas/users.py`** : champ `quartier` ajouté à `TailorVerificationIn`
  (input) et `TailorProfileOut` (output, hérité par `TailorProfilePublicOut`)
- **Backend `api/v1/tailors.py`** :
  - `submit_verification()` : paramètre `quartier: Form(None)` et
    `profile.quartier = quartier`
  - `search_tailors()` : paramètres query `city` et `quartier` ajoutés, filtres
    `ilike` sur les deux champs, `quartier` ajouté à la recherche texte `q`
- **Frontend `Verification.tsx`** : `<input>` remplacé par deux `<select>` (ville +
  quartier), le quartier est réinitialisé quand la ville change, bouton submit
  désactivé si pas de ville
- **Mobile `verification.tsx`** : même logique avec des chips scrollables (pas de
  `<select>` natif sur React Native), `ScrollView` ajouté pour le scroll vertical
- **Frontend + Mobile `Search.tsx`** : chips de filtres par ville et quartier,
  affichage de la ville et du quartier sur chaque carte de tailleur dans les
  résultats
- **`endpoints.ts`** (frontend + mobile) : params `city` et `quartier` ajoutés à
  `TailorsApi.search()`, paramètre `quartier` ajouté à `submitVerification()` mobile
- **`types.ts`** (frontend + mobile) : champ `quartier: string | null` ajouté à
  `TailorProfile`
- **i18n** : clés `tailor.verification.city` et `tailor.verification.quartier`
  ajoutées dans les 4 fichiers (fr/en × web/mobile)

**Vérification** : `tsc --noEmit` = 0 erreurs frontend. Vérification complète
de cohérence backend/frontend/mobile via agents parallèles : 19/19 checks passent.

**Difficulté** : leprincipal défi était la portée transversale — le même champ
devait être ajouté simultanément au modèle SQLAlchemy, aux schémas Pydantic, aux
endpoints FastAPI, aux types TypeScript, aux formulaires web et mobile, et aux
deux écrans de recherche. L'absence de migration automatisée en production
(`sync_sqlite_columns.py` pour la colonne `quartier`) est une contrainte connue
et documentée.

**Fichiers modifiés** : `backend/app/models/users.py`, `backend/app/schemas/users.py`,
`backend/app/api/v1/tailors.py`, `frontend/src/data/citiesData.ts` (nouveau),
`mobile/src/data/citiesData.ts` (nouveau), `frontend/src/api/types.ts`,
`mobile/src/api/types.ts`, `frontend/src/api/endpoints.ts`,
`mobile/src/api/endpoints.ts`, `frontend/src/pages/tailor/Verification.tsx`,
`mobile/app/tailor/verification.tsx`, `frontend/src/pages/client/Search.tsx`,
`mobile/app/client/(tabs)/search.tsx`, `frontend/src/i18n/fr.json`,
`frontend/src/i18n/en.json`, `mobile/src/i18n/fr.json`, `mobile/src/i18n/en.json`.

### 8.14 `colors.indigo` inexistant : chips actifs muets sur mobile

**Le symptôme** : sur `mobile/app/tailor/verification.tsx` (les chips
ville/quartier ajoutés en §8.13), l'état "actif" d'un chip ne s'affichait
pas avec la bonne couleur.

**La cause** : `chipActive` référençait `colors.indigo`, un token qui
n'existe pas dans le thème (seul `colors.indigoText` existe — un token de
texte, jamais destiné à un fond). `backgroundColor: undefined` en React
Native ne plante pas, il rend juste sans le style attendu — silencieux,
donc passé inaperçu, y compris par la vérification "19/19 checks
passent" faite après §8.13 (qui ne semble pas avoir inclus `tsc
--noEmit`, seul moyen mécanique de l'attraper).

**Trouvé en cherchant systématiquement d'autres écarts du même type**
(frontend modifié, mobile oublié ou cassé) après le portage §8.9 : `npx
tsc --noEmit` sur le projet mobile complet a immédiatement signalé
l'erreur de type. Corrigé en `colors.violetPrimary`, cohérent avec les
autres états "actif" de l'app (sélection de modèle, tissu, teint de
peau...). `tsc --noEmit` propre depuis.

**Fichiers modifiés** : `mobile/app/tailor/verification.tsx`.

### 8.15 Compte admin : promotion de rôle silencieusement ignorée

**Le symptôme** : connexion admin réussie (identifiants corrects) mais
avec le rôle `client` au lieu de `admin` — constaté en production le
26 août, deuxième occurrence le 28 août.

**La cause** : `seed.py::get_or_create_user()` retourne l'utilisateur tel
quel s'il existe déjà, sans jamais corriger son rôle ni son mot de passe.
Si quelqu'un s'inscrit avec le numéro réservé à l'admin avant (ou à la
place) que le script de seed ait pu tourner sur cette base, le compte
admin n'est jamais réellement créé — sans la moindre erreur.

**Corrigé** : `seed.py` détecte maintenant l'écart de rôle sur le compte
admin, l'affiche clairement, et le corrige automatiquement au lieu de
l'ignorer. Le compte de production a été promu manuellement en attendant
(rôle mis à jour directement sur le serveur).

**Fichiers modifiés** : `backend/app/seed.py`.

*Note : la réapparition du symptôme le 28 août n'a pas la même cause —
testé directement contre l'API de production, le compte est bien
`role:"admin"` cette fois. Cause encore non identifiée à la date de cette
mise à jour, investigation interrompue.*

### 8.16 Soumission de vérification tailleur cassée côté web (`portfolio` vs `self_photo`)

**Le symptôme** : un tailleur qui soumettait son dossier de vérification
depuis le site web recevait un échec silencieux — le formulaire
n'aboutissait jamais.

**La cause** : le formulaire web envoyait le fichier sous le nom de champ
`"portfolio"`, mais l'API (`backend/app/api/v1/tailors.py`) attend un
champ obligatoire nommé `self_photo` — nom retenu depuis un renommage fait
côté mobile, jamais répercuté côté web ni dans le commentaire du modèle de
données (qui listait encore l'ancien nom `portfolio`).

**Corrigé** sans supprimer la section visible : le libellé affiché reste
"Portfolio" à l'écran, seul le nom technique du champ envoyé change. La
checklist de vérification admin (§8.10) et le commentaire du modèle
suivent la même correction.

**Fichiers modifiés** : `frontend/src/pages/tailor/Verification.tsx`,
`frontend/src/pages/admin/Verifications.tsx`, `backend/app/models/users.py`.

### 8.17 Fiche modèle mobile : image rognée et bouton d'essayage non fixe

**Le symptôme** : sur `mobile/app/client/models/[id].tsx`, l'image du
modèle s'affichait recadrée (jamais visible en entier sans taper dessus
pour zoomer), et le bouton "Essayer sur mon avatar" défilait avec le
reste du contenu — invisible tant qu'on n'avait pas tout scrollé.

**Corrigé**, sur le modèle déjà utilisé côté web (`ModelDetail.tsx`) :
l'image passe en `resizeMode="contain"` (affichée entière, le tap pour
zoomer en plein écran reste disponible) dans une zone qui occupe l'espace
disponible ; le nom, la description (avec son propre petit scroll interne
si elle déborde) et le bouton d'essayage vivent maintenant dans une barre
du bas fixe, hors de toute zone de défilement — toujours visible, quel que
soit l'état du scroll. Le swipe horizontal entre les modèles de la liste
est conservé.

**Fichiers modifiés** : `mobile/app/client/models/[id].tsx`.

### 8.18 Inscription tailleur : ville/quartier en puces, et clavier masquant le mot de passe

**Deux problèmes distincts signalés sur le même écran.**

**Ville et quartier étaient des puces défilant horizontalement**, ce qui
obligeait à faire défiler une longue liste latéralement pour trouver sa
ville. Remplacé par des champs ouvrant une liste déroulante, en réutilisant
le composant `BottomSheet` déjà employé pour le sélecteur d'indicatif
téléphonique (`PhoneField`) — même mécanique, donc même comportement que
ce que l'utilisateur connaît déjà ailleurs dans l'application.

**Le clavier masquait le champ mot de passe** sans possibilité de faire
défiler. `windowSoftInputMode="adjustResize"` était pourtant correctement
déclaré dans `AndroidManifest.xml`, mais `KeyboardAvoidingView` passait
`behavior={undefined}` sur Android, comptant uniquement sur ce
redimensionnement de fenêtre. C'est peu fiable sur les versions récentes
d'Android avec affichage bord-à-bord, où le redimensionnement attendu ne
se produit plus toujours. Corrigé en donnant à Android un comportement
explicite (`behavior="height"`), qui agit au niveau du composant plutôt
que de dépendre de la fenêtre.

**Fichiers modifiés** : `mobile/app/register.tsx`,
`mobile/src/components/Screen.tsx` (commit `2457aea`).

### 8.19 Inscription tailleur bloquée après l'OTP : colonnes absentes en base

**Symptôme** : la création d'un compte tailleur échouait juste après la
saisie du code OTP.

**Cause** : les colonnes `city` et `quartier` ont été ajoutées au modèle
`TailorProfile` (commit `18457c8`) mais le projet **n'a aucun système de
migration** — c'est un choix d'origine assumé (`create_all()` + `seed.py`).
Or `create_all()` crée les tables manquantes et rien d'autre : ajouter un
attribut à une table déjà déployée ne touche pas la base. `POST /auth/register`
vérifie donc l'OTP avec succès, puis échoue à l'insertion.

**Correctif** : exécuter sur le serveur le script prévu pour ce cas, qui
n'ajoute que les colonnes manquantes (jamais de suppression, jamais de
perte de données, relançable sans risque) :

```bash
cd surmezur-backend
./venv/bin/python scripts/sync_sqlite_columns.py          # aperçu
./venv/bin/python scripts/sync_sqlite_columns.py --apply  # applique
```

**À retenir** : ce scénario s'est déjà produit le 14 août 2026 avec
`measurements.features`. Toute évolution du schéma doit s'accompagner de
ce script au déploiement, sans quoi le symptôme est trompeur — l'API
démarre, répond, et seules les routes touchant cette table échouent.

---

## 9. Journal des versions

| Date | Modification |
|---|---|
| 30 juil. | Construction initiale : API complète et application web |
| 30 juil. | Réécriture en application native React Native |
| 31 juil. | Passage à Expo SDK 54 ; refonte UX ; thème clair/sombre |
| 1er août | Taille, poids et sexe rendus obligatoires |
| 1er août | Pipeline d'apprentissage, modèles entraînés et déployés |
| 1er août | MediaPipe activé |
| 2 août | Premier test sur photo réelle : bug de calibration corrigé |
| 2 août | Import de photos depuis la galerie |
| 4 août | SAM activé : largeur de poitrine corrigée (bras inclus) |
| 4 août | Latence divisée par 5 (146 s → 30,6 s) |
| 4 août | Notification de fin d'analyse |
| 4 août | Bascule sur MobileSAM : 14,7 s |
| 5 août | **Suppression des mensurations inventées** (§8.3) |
| 5 août | Préchauffage déplacé du démarrage vers la connexion |
| 5 août | **Bras fantôme corrigé** (§8.1) |
| 6 août | Backend migré sur O2Switch, disque persistant |
| 6 août | **Validation sur 13 sujets réels** : 5,2 cm contre 1,38 en laboratoire (§5.1) |
| 6 août | Ligne de poitrine corrigée : elle tombait dans l'aisselle (§5.2) |
| 6 août | Profondeurs de profil réactivées |
| 6 août | Capture guidée : silhouette, consignes, déclenchement automatique |
| 7 août | **Modèle v3** : un estimateur par cible, géométrie pour le tronc (§4.3) |
| 7 août | **Carrure distinguée de la largeur biacromiale** (§8.2) |
| 7 août | Messages d'erreur nettoyés : plus aucun détail technique affiché |
| 7 août | Réduction des images avant analyse : 87 s → 17 s (§8.8) |
| 8 août | **Ligne de hanches descendue** : 7,4 → 5,2 cm (§5.2) |
| 10 août | Badge de vérification tailleur à trois états, mot de passe à 6 caractères minimum |
| 10 août | Détection des lignes du tronc et retrait du vêtement affiné : 3,77 → 3,12 cm |
| 11 août | Compte admin de secours, restriction du prêt-à-porter aux tailleurs vérifiés, timeout explicite sur le pipeline vision |
| 12 août | Génération d'avatar 3D corrigée : les cibles MPFB2 pilotaient un morphing inexistant |
| 13 août | **Mesure sortie du cycle de requête Passenger** : un traitement bloquait tout le site 10 à 90 s (voir §2.3) |
| 13 août | Hotfix : le `PRAGMA WAL` faisait échouer toute connexion à la base sur O2Switch |
| 13 août | Faille corrigée : l'auto-inscription acceptait `role="admin"` sans restriction |
| 13 août | Vérification tailleur complète, transparence des mesures côté client, 44 bugs audités et corrigés |
| 14 août | **Avatar 3D par morph targets** : deux maillages de base embarqués dans l'app, déformés côté client — Blender ne tournant plus en production, un GLB par client n'était plus possible |
| 14 août | Préchauffage MediaPipe/SAM déplacé à l'import du module — le `startup` FastAPI ne s'exécute jamais sous Passenger/a2wsgi |
| 14 août | **Threads torch/OpenCV plafonnés** : la mesure ne terminait plus en production (voir §2.3) |
| 14 août | Colonne manquante en base (`measurements.features`) : script de synchronisation additive créé, déployé |
| 14 août | **Gestion du catalogue par l'admin** : catégories genrées, modèles avec photos, remplace l'ancien enum figé de catégories |
| 14 août | Suppression définitive d'un compte côté admin |
| 15 août | Blocage réseau corrigé : Android bloque par défaut le trafic HTTP en clair sur les builds release, empêchant tout appel API (login compris) |
| 15 août | Premier test visuel réel de l'avatar 3D : bugs trouvés et corrigés (sélecteur de teint sans effet, chargement peu synchronisé, maillage facetté par absence de normales de morph exportées) |
| 15 août | Maillages de base régénérés (Blender + MPFB2 réinstallés) avec normales de morph et matériaux corrigés — a introduit une régression de chargement, voir §7 |
| 15 août | 302 photos de modèles importées en base (6 catégories, homme/femme) — reste à afficher côté app, voir §7 |
| 16 août | Pare-feu O2Switch (Tiger Protect) bloquant tout le trafic API découvert et diagnostiqué, résolu depuis (voir §7) |
| 16 août | Migration du schéma `garment_models` appliquée en production ; 302 photos transférées et importées en base réelle |
| 17 août | Écran avatar totalement invisible corrigé : `Dimensions.get()` figé au chargement du module remplacé par `useWindowDimensions()` |
| 17 août | Deux hypothèses sur l'aspect "carré" du maillage invalidées par inspection directe (déjà lissé à 100 %, un seul matériau dès sa création) — le vrai réexport Blender (le précédent n'avait fait que restaurer un ancien fichier) ramène le poids à 4,7-4,8 Mo |
| 17 août | Échec de chargement du modèle 3D distingué du succès (`onReady`/`onError`) — n'affiche plus les boutons "prêt" sur une scène vide |
| 17 août | **Vraies photos affichées dans l'app** : accueil, recherche, galerie et détail montrent désormais la photo réelle du modèle au lieu d'un aplat de couleur |
| 17 août | Consultation externe sur le modèle corporel de l'avatar (SMPL/STAR écarté — licence, biais de population, risque de calcul serveur ; MakeHuman conservé) — voir `BRIEF_MODELE_CORPOREL_AVATAR.md` |
| 17 août | Nouvelle architecture de rendu (« cuisson » unique des poids côté client, recalcul des normales) implémentée et vérifiée hors device (48 ms, aucune donnée aberrante) — non encore confirmée sur appareil |
| 18 août | **Scroll des pages de connexion corrigé** : `overflowY: "auto"` ajouté sur Login.tsx et Register.tsx (§8.5) |
| 18 août | **Fiche modèle redessinée** : layout flex proportionnel au lieu de bandeau fixe 260px (§8.6) |
| 18 août | **Recherche fonctionnelle** : debounce, gestion d'erreurs, état vide, recherche multi-champs backend, catégories dynamiques (§8.7) |
| 22 août | **Calcul de morphologie recalibré** (`muscle_factor` neutralisé, fessiers dérivés du profil, matrice de sensibilité/optimisation ajoutée) — bug bloquant corrigé au passage : les poids générés ne correspondaient à aucune cible réelle du maillage, rendant tout avatar sans déformation |
| 22 août | Galerie de modèles : affichage plein écran zoomable des photos (`react-native-image-viewing`), swipe entre modèles |
| 24 août | **Type `GarmentModel.category` corrigé** : objet `{ id, name, gender }` au lieu de string — corrige `[object Object]` sur toutes les pages (§8.8) |
| 24 août | **Photos réelles affichées** dans le catalogue et la fiche modèle, avec fallback gradient si pas de `photo_url` (§8.8) |
| 24 août | **Fiche modèle redessinée** : image en haut (min 260px), contenu scrollable, gestion d'erreur API (§8.8) |
| 24 août | **Essayage : mesure existante réutilisable** : nouveau parcours permettant de créer un avatar sans repasser par les photos, en sélectionnant une mesure déjà enregistrée — gain de temps significatif (§8.9) |
| 24 août | **Page vérification admin redesignée** : photo atelier, documents vérifiables (CNI, portfolio), identité du tailleur, layout scrollable (§8.10) |
| 24 août | **Page catalogue admin créée** : catégories cliquables, grid de modèles avec photos, suppression (§8.11) |
| 24 août | **API admin étendue** : endpoint documents de vérification câblé, CRUD catégories/modèles ajouté, `api.delete()` ajouté au client HTTP (§8.10, §8.11) |
| 25 août | **Champ quartier ajouté** : dropdowns ville/quartier sur vérification tailleur (web + mobile), recherche tailleurs filtrable par ville et quartier, colonne `quartier` en base (§8.13) |
| 25 août | **Essayage "mesure existante" porté sur mobile** — n'existait jusque-là que côté web (§8.9) |
| 25 août | **Bug `colors.indigo` corrigé** sur mobile (chips actifs muets, trouvé par `tsc --noEmit`) — (§8.14) |
| 25 août | **Nouvelle campagne de précision des mensurations** : 7 corrections validées et livrées dans un module séparé non déployé (`ml/bench/pipeline_ameliore.py`), `ankle`/`hips` confirmés fortement sur sujets inédits, `shoulder`/`wrist` retirés après échec en validation indépendante malgré une validation interne solide (§6bis) |
| 25 août | Piste "3ᵉ photo à 45°" testée en simulation (gain confirmé) puis sur un premier vrai sujet (gain non confirmé) — recherche ouverte, pas de conclusion définitive (§6bis) |
| 25 août | Recherche d'architecture alternative (Anny/clad-body, limites de SMPL, benchmarks du secteur) — piste identifiée, pas encore testée (§6bis) |
| 26 août | Piste régression par processus gaussien testée sur 17 sujets réels et **rejetée** — dégrade la moyenne de 18 % par rapport au linéaire (§6bis) |
| 26 août | Piste Anny + clad-body testée (taille+poids seuls) sur 17 sujets réels et **rejetée dans cette forme** — 56 % d'erreur en plus en moyenne, gagne uniquement sur les mesures dépendant de la corpulence globale (§6bis) |
| 26 août | Revue de cohérence du travail non commité d'une collaboratrice (admin vérification/catalogue) — bug `portfolio`/`self_photo` trouvé et corrigé (§8.16) |
| 26 août | Bug de promotion de rôle admin silencieusement ignorée trouvé et corrigé dans `seed.py` (§8.15) |
| 27 août | **Corrections statistiques validées passées en production** (`backend/app/services/measurement_corrections.py`, câblées dans `_measure()`) — vérifié bout en bout sur un sujet réel, déployé sur O2Switch (§6bis) |
| 27 août | Divergence git découverte et résolue sur le clone serveur (`repo-source`) — 4 commits locaux jamais poussés depuis le 22 août, vérifiés sans perte avant réconciliation (§6bis) |
| 27 août | **Fiche modèle mobile corrigée** : image affichée entière, barre du bas fixe pour le bouton d'essayage (§8.17) |
| 28 août | Inscription tailleur bloquée après l'OTP : colonnes `city`/`quartier` absentes en base de production (§8.19) |
| 28 août | Ville/quartier en liste déroulante à l'inscription tailleur ; correctif du clavier masquant le mot de passe (§8.18) |
| 28 août | **Cause des échecs de build identifiée et corrigée** — adresse de secours du backend pointant vers l'émulateur, et `ninja` 1.10.2 incompatible chemins longs (§10) |
| 29 août | **Onze expériences d'amélioration des mesures, aucune retenue** — dont la découverte que la production ignore la photo pour le tronc chez l'homme, et que c'est justifié (§6ter) |

---

## 10. Compiler l'application mobile (EAS et local)

Cette section existe parce que **neuf tentatives de build ont échoué
d'affilée** avant que les causes ne soient identifiées. Elle est à lire
avant toute tentative.

### 10.1 Build cloud EAS — la voie normale

```bash
cd mobile
npx eas-cli build --platform android --profile preview --non-interactive
```

**Le nom du paquet compte.** `npx eas build` installe `eas@0.1.0`, un
paquet réservé sans exécutable, et échoue sur
`could not determine executable to run`. C'est **`eas-cli`** qu'il faut,
pas `eas`.

**L'archive fait 466 Mo et c'est normal.** Le fichier `.easignore` exclut
déjà `node_modules`, `.expo`, `dist` et les artefacts Gradle. Ce qui reste
est volumineux surtout à cause du dossier `/android`, **volontairement
conservé** : il contient `network_security_config.xml`, sans lequel
l'APK ne peut joindre aucun backend en HTTP (voir §10.3). Ne pas
l'exclure pour accélérer l'upload.

**L'upload est le point fragile.** Sur une connexion instable, il échoue
par `ECONNRESET` ou `socket hang up`, à des points variables (255 Ko,
73 Mo, 115 Mo sur 466 Mo). Huit tentatives ont échoué ainsi avant qu'une
neuvième passe **sans aucun changement de configuration** — l'upload
complet prend alors ~23 minutes. Il n'y a pas de correctif : c'est un
problème de réseau, pas de projet. La conduite à tenir est de relancer,
et de basculer sur le build local (§10.2) si les échecs persistent.

### 10.2 Build local Gradle — le secours

**`eas build --local` ne fonctionne pas sous Windows** : il exige macOS ou
Linux (`Unsupported platform, macOS or Linux is required to build apps for
Android`). Il faut passer par Gradle directement :

```bash
cd mobile/android
# ANDROID_HOME doit pointer vers le SDK ; local.properties le contient déjà
./gradlew.bat assembleRelease --no-daemon
```

L'APK sort dans `mobile/android/app/build/outputs/apk/release/app-release.apk`.
Compter ~48 minutes à froid. **Attention** : cet APK est signé avec le
keystore de debug local, pas celui d'EAS — utilisable pour tester, à ne
pas confondre avec un build de production signé.

#### Le blocage à connaître : `ninja` et les chemins de plus de 260 caractères

Le build local échouait sur :

```
ninja: error: Stat(...safeareacontextJSI-generated.cpp.o):
Filename longer than 260 characters
```

CMake imbrique le chemin source complet **à l'intérieur** du chemin de
l'objet compilé, ce qui dépasse largement la limite historique de Windows.

**Ce qui ne marche pas** : le réglage système `LongPathsEnabled` était
**déjà à 1** — il ne suffit pas, car un binaire doit en plus être déclaré
compatible pour en bénéficier.

**Ce qui ne marche pas non plus** : mapper un lecteur court avec `subst`
pour raccourcir les chemins. Node ne remonte pas correctement
l'arborescence depuis un lecteur virtuel, et le build casse plus tôt, à
l'autolinking Expo (`Couldn't find "package.json" up from path "S:\android"`).

**La solution** : le `ninja` livré avec le SDK Android est en **1.10.2**,
or le support des chemins longs sous Windows n'est arrivé qu'en **1.12.0**.
Il faut le remplacer :

```powershell
# 1. Télécharger ninja 1.12.1 (275 Ko)
curl -sL -o ninja-win.zip https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip

# 2. Sauvegarder l'original puis le remplacer
cd "$env:LOCALAPPDATA\Android\Sdk\cmake\3.22.1\bin"
Copy-Item ninja.exe ninja-1.10.2-original.exe   # sauvegarde
# puis y copier le ninja.exe extrait de l'archive

# 3. Vérifier
./ninja.exe --version    # doit afficher 1.12.1
```

Après ce remplacement, le build passe. CMake émet encore un avertissement
sur des chemins de 250 caractères, mais il n'est plus bloquant.

**Nature du changement** : il modifie un binaire de l'outillage Android
local, pas le projet. Il est donc à refaire sur chaque poste de
développement, et la sauvegarde `ninja-1.10.2-original.exe` permet de
revenir en arrière.

### 10.3 Le piège qui a fait croire à un problème de réseau

Un symptôme distinct et trompeur : l'application affichait *« Connexion
impossible. Vérifiez votre connexion Internet. »* sur un téléphone
pourtant connecté, avec un serveur qui répondait normalement
(`POST /api/auth/login` → HTTP 401 en 0,6 à 4,9 s).

**Cause** : l'adresse de secours de `mobile/src/config.ts` pointait vers
`http://10.0.2.2:8000`, l'adresse de l'**émulateur** Android — inexistante
sur un appareil réel. Dès que `EXPO_PUBLIC_API_URL` n'était pas injecté au
bundling, chaque requête échouait instantanément. Le message affiché est
`error.offline` (« Vérifiez votre connexion »), pas `error.timeout`, ce
qui accusait à tort la connexion de l'utilisateur alors que le serveur
n'était jamais contacté.

**Corrigé** (commit `3118541`) : en build release, l'adresse de secours est
celle de production ; en développement, le comportement émulateur/LAN est
conservé — y pointer vers la production masquerait un backend local non
démarré. Un correctif complémentaire (`fc5a9ee`) ajoute des réessais
automatiques sur coupure réseau transitoire pour les lectures et
l'authentification.

**À vérifier aussi** en cas de symptôme réseau : `network_security_config.xml`
doit exister dans `android/app/src/main/res/xml/` et être référencé par
`AndroidManifest.xml` (`android:networkSecurityConfig`). Sans lui, Android
bloque tout trafic HTTP en clair sur les builds release et **toutes** les
requêtes échouent — le backend n'ayant pas encore de certificat HTTPS.

---

## 11. L'application web (septembre 2026)

Une version web est venue s'ajouter à l'application mobile. Elle ne la
duplique pas : elle en extrait **la seule fonctionnalité qui vaut d'être
ouverte au navigateur**, la prise de mesure, et laisse tout le reste —
commande, négociation, paiement, essayage 3D — à l'application mobile.

### 11.1 Ce qu'elle fait, et ce qu'elle ne fait pas

| Disponible sur le web | Réservé au mobile |
|---|---|
| Création de compte client | Compte tailleur |
| Catalogue des modèles | Essayage 3D et avatar |
| Prise de mesure par photos | Commande, devis, négociation |
| Fiches à télécharger | Paiement Mobile Money |
| Modèles proposés par la communauté | Chat, livraison, avis |
| Section administrateur complète | |

Il n'y a **aucun côté tailleur** dans la version web. C'est un choix, pas un
manque : un tailleur travaille depuis son téléphone, et dupliquer huit écrans
métier aurait coûté cher pour un usage qui n'existe pas.

### 11.2 Architecture

**Next.js 15** (App Router, TypeScript), déployé sur **Vercel**, dépôt
autonome `korah-agency/Sur-MeZur-web-App`. Le code n'est pas partagé avec le
mobile ; seul le backend l'est.

Le point d'architecture qui compte : le client web n'appelle **jamais** l'API
directement. `next.config.ts` réécrit `/api/*` et `/uploads/*` vers
`API_ORIGIN`, si bien que le code garde des chemins relatifs. Trois
conséquences, dont une inattendue :

- aucune requête cross-origin, donc **aucune configuration CORS** à maintenir
  côté backend ;
- la réécriture s'exécute **côté serveur Vercel**, pas dans le navigateur : un
  site servi en HTTPS peut donc appeler une API en HTTP sans déclencher de
  blocage pour contenu mixte. C'est ce qui rend le déploiement possible alors
  qu'AutoSSL n'a jamais émis de certificat pour l'API (§7, *Autres chantiers*) ;
- le même code fonctionne en développement contre `localhost:8000` et en
  production contre `api.gitingeniering.com`, sans condition dans le code.

### 11.3 Les mesures en langage naturel

C'est la différence de fond avec l'application mobile, qui affiche la sortie
brute du pipeline : à côté des douze mesures utiles, elle laisse apparaître
les variables intermédiaires du modèle (`chestbreadth`, `buttockdepth`,
`biacromialbreadth`, les profondeurs, les scores de confiance).

Ce sont des **grandeurs de travail**. Elles servent à calculer les tours et
n'ont aucune traduction en couture. Le web ne montre que les douze mesures
qu'un tailleur relève au mètre ruban, **groupées par partie du corps** —
buste, bras, hanches et jambes — plutôt que par nature de grandeur, et
chacune accompagnée de l'endroit où elle se prend et de son rôle dans le
vêtement :

> **Tour de bras** — 33,0 cm
> Au plus fort du bras, le bras relâché le long du corps.
> *Détermine la largeur de la manche en haut.*

Le tri est fait par construction dans `web/src/lib/measurements.ts`, pas
masqué par du style : une clé inconnue du vocabulaire est écartée
silencieusement plutôt qu'affichée brute. Aucune mention de MediaPipe, de
silhouette ou de modèle n'apparaît dans l'interface publique.

### 11.4 Deux fiches, et non une

Le téléchargement produit **deux documents distincts** : la fiche de mesures
et la fiche des modèles à coudre. Les séparer n'est pas cosmétique — un
tailleur imprime volontiers une liste de chiffres, beaucoup moins des photos
pleine page. Les réunir aurait imposé l'impression des visuels à chaque fois.

Le PDF est produit par **l'impression du navigateur** (`@media print` puis
« Enregistrer en PDF »), et non par une bibliothèque serveur. La raison est
matérielle : aucune bibliothèque PDF n'est installée côté backend, et
l'hébergement mutualisé n'a ni Cairo ni Pango, ce qui exclut WeasyPrint. Le
« Enregistrer en PDF » natif existe sur Android, iOS et ordinateur — zéro
dépendance nouvelle, zéro risque au déploiement.

### 11.5 Modèles proposés par la communauté

La colonne `garment_models.created_by` existait depuis l'origine **sans
qu'aucune route ne la renseigne** : seul un administrateur pouvait créer un
modèle. Deux routes l'ont ouverte aux clients :

| Route | Contrôle |
|---|---|
| `POST /api/models` | client authentifié ; `created_by` porte l'auteur |
| `POST /api/models/{id}/photos` | **auteur du modèle uniquement** |

Le contrôle sur les photos est le point sensible : sans lui, n'importe quel
client pourrait déposer des images sur le modèle d'un autre, ou sur le
catalogue officiel dont `created_by` est nul.

Le schéma d'entrée est volontairement plus étroit que celui de l'admin : pas
de `base_price`, un modèle étant confectionné sur mesure et son tarif négocié
avec le tailleur.

Vérifié de bout en bout : création en 201 avec `created_by` renseigné, dépôt
de photo par un autre client refusé en 403, dépôt par l'auteur accepté en 200,
modèle visible dans le catalogue commun, nom trop court refusé en 422.

### 11.6 Cohérence visuelle avec le mobile

L'interface reprend l'application mobile écran par écran : connexion, accueil
et profil sont calqués sur leurs équivalents natifs, avec les mêmes tokens de
couleur, les mêmes rayons et les mêmes polices.

Deux décisions techniques y contribuent plus que le reste.

**Les icônes sont des SVG `lucide-react`**, la version web exacte du
`lucide-react-native` employé par le mobile — le même trait, dessiné par le
même projet. Les emoji ont été entièrement retirés. Un emoji est rendu par la
police du système : il change d'aspect entre Android, iOS et Windows, ne se
colore pas avec le thème, et ne s'aligne sur aucune grille optique commune.
Les drapeaux du sélecteur d'indicatif en étaient le cas limite — sur Windows
ils s'affichent en deux lettres grises.

**Les styles vivent dans des feuilles CSS**, pas dans des objets de style en
ligne. C'est la raison technique pour laquelle l'ancien frontend Vite ne
pouvait pas être adaptable : un style en ligne ne porte pas de media query.
C'était, autant que sa colonne fixe de 420 px, ce qui l'empêchait d'être
responsive.

### 11.7 Responsive, réellement

L'ancien frontend Vite dessinait une **colonne fixe de 420 px centrée** : sur
un ordinateur on voyait un téléphone entouré de vide. La version Next est
mobile-first stricte — les règles de base décrivent le téléphone, les media
queries `min-width` n'ajoutent que ce que les grands écrans gagnent.

Trois paliers seulement : base, 720 px, 1024 px. Au-delà de 1024 px, la barre
d'onglets du bas devient une colonne latérale — **le même balisage**, sans
rendu conditionnel en JavaScript, donc rien qui puisse diverger entre « la
version mobile » et « la version bureau ».

Deux défauts réels corrigés au passage :

- la **barre d'action passait sous la barre d'onglets**, toutes deux collées
  en bas : le bouton principal était partiellement masqué sur toutes les pages
  du parcours client ;
- un seul élément trop large rendait la page entière déplaçable
  latéralement — coupé à la racine.

L'écran de connexion tient dans une fenêtre **sans défilement**, y compris sur
un téléphone court : hauteur en `100dvh` (et non `100vh`, qui ignore la barre
d'adresse mobile et déborde donc sur iOS), logo dimensionné en unités de vue,
effacé sous 460 px de haut plutôt que de repousser le bouton hors du cadre.

### 11.8 Capture des photos : pourquoi pas la caméra en direct

Le web utilise un champ de fichier avec attribut `capture`, qui ouvre
l'appareil photo natif du téléphone, et **non** `getUserMedia` avec silhouette
guide comme le mobile.

La raison est bloquante et non négociable : `getUserMedia` exige un **contexte
sécurisé HTTPS**. L'API est servie en HTTP et aucun certificat n'a été émis
pour le domaine. Tant que ce point n'est pas réglé, la caméra en direct est
inaccessible ailleurs que sur `localhost`.

Conséquence à assumer : la version web **n'a pas le guidage de capture**, or
le rapport identifie ce guidage comme le levier n°1 de précision (§5.3, le
vêtement ample pesant jusqu'à 24 cm). Les mesures prises depuis le web sont
donc, à photo équivalente, plus exposées au bruit vestimentaire que celles du
mobile. Le jour où HTTPS sera en place, cette seule étape pourra basculer sans
toucher au reste du parcours.

### 11.9 Vérification de bout en bout (8 septembre 2026)

La chaîne complète a été testée contre l'API de **production**, et non
simulée :

| Étape | Résultat |
|---|---|
| Chaîne de vision (`/measurements/capabilities`) | `vision_enabled`, MediaPipe, SAM et les deux modèles Ridge : tous disponibles |
| Ouverture de session | HTTP 200 |
| Envoi des deux photos | HTTP 200 en 1,0 s |
| Traitement complet | **7 secondes** |
| Mesures renvoyées | **12 sur 12** |

Le point le plus incertain était le worker : depuis le 13 août les mesures
sont traitées par une tâche planifiée **hors du cycle Passenger** (§2.3). Ce
test confirme qu'il tourne — 7 secondes de bout en bout, très en deçà des
trois minutes que la page web accorde avant d'abandonner.

Ce test valide la **connexion**, pas la précision : les photos employées
proviennent du jeu de test et leurs mensurations réelles sont inconnues.

Un compte de test (`+237634201648`, « ZZ Test Web Mesure ») et sa session
subsistent en production et restent à supprimer, comme le compte
`+23760000001` déjà signalé au §7.

### 11.10 Défauts trouvés et corrigés pendant le développement

**Le bouton de connexion restait grisé quelle que soit la saisie.** Pour
vérifier la longueur du numéro, les trois écrans d'authentification
retiraient l'indicatif par une expression régulière dont le quantificateur
était **gourmand** : il consommait tous les chiffres, pas seulement
l'indicatif. Pour `+237696982953` le résultat n'était donc pas `696982953`
mais une chaîne vide, et la condition « au moins six chiffres » ne pouvait
jamais être vraie. Connexion, inscription et mot de passe oublié étaient tous
les trois inutilisables. Le découpage passe désormais par `splitPhone`, qui
coupe sur les indicatifs **connus**.

**La règle de mot de passe était fausse.** Le backend exige **exactement six
caractères**, avec au moins une lettre et un chiffre
(`app/schemas/auth.py::validate_password`) — une règle inhabituelle, la
plupart des formulaires imposant un minimum. Le formulaire web en exigeait
huit : il refusait des mots de passe valides et en laissait passer que le
serveur rejetait ensuite.

**Le logo pesait 1,5 Mo.** Inenvisageable sur les connexions visées. Trois
déclinaisons produites par quantification de palette : 29 Ko pour l'écran de
connexion, 9 Ko pour la marque de navigation, 6 Ko pour le favicon — 44 Ko au
total, sans perte visible.

### 11.11 Ce qui reste ouvert côté web

| Sujet | État |
|---|---|
| **Rendu visuel** | jamais vérifié dans un navigateur ; le build et le typecheck ne disent rien d'une mise en page |
| **Thème sombre** | présent sur le mobile, non porté ; les tokens `--surface` et `--violet-tint` préparent le terrain |
| **Guidage de capture** | impossible sans HTTPS (§11.8) |
| **Sélection de modèles** | conservée dans le navigateur, donc propre à l'appareil — rien côté API ne relie un modèle à une mesure tant qu'aucune commande n'existe, et le web n'en passe pas. Les favoris, eux, sont bien enregistrés côté serveur |
| **Deux avis `postcss`** | corrigibles seulement par une montée en Next 16 ; ce sont des failles de compilation sur nos propres feuilles de style, sans surface d'attaque ici |
