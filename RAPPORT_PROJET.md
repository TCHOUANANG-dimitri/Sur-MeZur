# Sur-MeZur — Rapport de réalisation

*Dernière mise à jour : 25 août 2026*

> Ce document décrit l'état réel du projet : ce qui fonctionne, avec quelle
> précision, et ce qui reste à faire. Les chiffres qui y figurent sont tous
> mesurés, jamais estimés — quand une valeur est incertaine, c'est écrit.

> Cette mise à jour porte sur l'infrastructure, l'avatar 3D, le catalogue
> et le système de géolocalisation des tailleurs (voir §2, §7, §8.13, §9).
> Aucune nouvelle campagne de mesure n'a eu lieu depuis le 8 août : les
> sections 3 à 6, entièrement dédiées à la précision des mensurations, sont
> inchangées et restent la référence.

---

## Sommaire

1. [Le projet en bref](#1-le-projet-en-bref)
2. [Où en est le projet](#2-où-en-est-le-projet)
3. [La précision, mesure par mesure](#3-la-précision-mesure-par-mesure)
4. [Comment les mensurations sont calculées](#4-comment-les-mensurations-sont-calculées)
5. [Ce que les tests sur 13 personnes ont appris](#5-ce-que-les-tests-sur-13-personnes-ont-appris)
6. [Les limites, et pourquoi elles existent](#6-les-limites-et-pourquoi-elles-existent)
7. [Ce qui reste à faire](#7-ce-qui-reste-à-faire)
8. [Historique des corrections](#8-historique-des-corrections)
9. [Journal des versions](#9-journal-des-versions)

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
| **Mesure par photo** | ✅ **fonctionnelle — précision 4,2 cm** |
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
