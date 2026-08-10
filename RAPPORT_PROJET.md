# Sur-MeZur — Rapport de réalisation

*Dernière mise à jour : 8 août 2026*

> Ce document décrit l'état réel du projet : ce qui fonctionne, avec quelle
> précision, et ce qui reste à faire. Les chiffres qui y figurent sont tous
> mesurés, jamais estimés — quand une valeur est incertaine, c'est écrit.

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
| Certificat HTTPS | ❌ absent — tests en HTTP |
| Avatar 3D, essayage, patrons | ⚠️ simulés |
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

### Autres chantiers

| Sujet | État |
|---|---|
| **Certificat HTTPS** | AutoSSL n'a pas émis pour le sous-domaine ; tests en HTTP |
| **Interface sur appareil** | la capture guidée n'a jamais été utilisée en conditions réelles |
| **Vrai fournisseur Mobile Money** | actuellement simulé |
| **Avatar 3D et essayage** | actuellement simulés |
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

### 8.4 Le temps d'analyse

| Étape | Durée |
|---|---|
| Au départ | 146 s |
| Après arrêt d'un appel devenu inutile | 30,6 s |
| Après passage à MobileSAM | 14,7 s |
| Après réduction des images à 1600 px | **17 s** *(sur photos 4000 px, contre 87 s)* |

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
| 7 août | Réduction des images avant analyse : 87 s → 17 s (§8.4) |
| 8 août | **Ligne de hanches descendue** : 7,4 → 5,2 cm (§5.2) |
