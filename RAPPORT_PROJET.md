# Sur-MeZur — Rapport de réalisation

*Dernière mise à jour : 4 août 2026*

> Ce rapport suit l'avancement du projet. Il est mis à jour à chaque
> modification majeure.

---

## 1. Le projet en bref

Sur-MeZur met en relation des **clients** et des **tailleurs** au Cameroun.
Le principe : un client se photographie, l'application en déduit ses
mensurations, il choisit un modèle de vêtement, l'essaie sur un avatar 3D,
négocie le prix avec un tailleur, paie par Mobile Money, et suit la
confection jusqu'à la remise.

Trois rôles, trois expériences distinctes :

| Rôle | Ce qu'il fait |
|---|---|
| **Client** | mesures, essayage 3D, commande, négociation, paiement, suivi |
| **Tailleur** | devis, confection, prêt-à-porter, finances, notation |
| **Admin** | vérification des tailleurs, litiges, utilisateurs, commissions |

L'application est bilingue (français par défaut, anglais disponible) et
propose un thème clair et un thème sombre.

---

## 2. Ce qui a été construit

### 2.1 Application mobile

Application native **React Native / Expo SDK 54**, navigation par fichiers
(Expo Router). Aucun emoji dans l'interface : toutes les icônes viennent de
la bibliothèque Lucide.

**Parcours client**
- Inscription par téléphone avec code de vérification
- Prise de mesures guidée (taille, poids et sexe **obligatoires**), photos prises sur place ou importées depuis la galerie
- Avatar 3D et essayage virtuel avec choix du tissu et des accessoires
- Catalogue de modèles, favoris, recherche et filtres
- Commande avec précisions libres, négociation du prix, paiement Mobile Money
- Suivi de commande étape par étape, discussion avec le tailleur, notation

**Parcours tailleur**
- Vérification du compte avec pièces justificatives
- Tableau de bord : nouvelles commandes, en cours, chiffre d'affaires, notes
- Gestion des commandes avec dates de commande et de livraison
- Prêt-à-porter avec plusieurs photos par article
- Finances détaillées : gains par commande livrée, étoiles du client, séquestre
- Signalement « commande prête » qui notifie automatiquement le client

**Parcours administrateur**
- Vue d'ensemble : compteurs, volume d'affaires, commission de la plateforme
- Gestion des utilisateurs : recherche, suspension et réactivation de comptes
- Vérification des tailleurs, arbitrage des litiges, modération des avis
- Supervision de toutes les commandes de la plateforme

### 2.2 Serveur (API)

**FastAPI + SQLAlchemy**, base SQLite. L'API couvre l'intégralité des règles
métier du cahier des charges : commissions par paliers, séquestre 70/30,
plafond de trois offres en négociation, notifications à chaque étape.

L'authentification utilise deux jetons : un jeton d'accès (1 heure) et un
jeton de renouvellement (30 jours), renouvelé de façon transparente pour que
l'utilisateur ne soit jamais déconnecté en cours d'usage.

---

## 3. La partie intelligence artificielle

C'est le cœur technique du projet : **estimer les mensurations d'une personne
à partir de deux photos**.

### 3.1 Le principe, simplement

Trois étapes s'enchaînent.

**Étape 1 — Repérer le corps.** Un outil appelé *MediaPipe* analyse la photo
et place **33 points** sur le corps : épaules, coudes, poignets, hanches,
genoux, chevilles. On obtient un squelette en deux dimensions.

**Étape 2 — Convertir les pixels en centimètres.** Les points sont exprimés en
pixels ; il faut une référence réelle. On utilise la **taille saisie par le
client** : connaissant la distance en pixels entre son nez et le sol, et
sachant que le nez se situe à environ 93 % de la stature, on en déduit
combien de centimètres représente un pixel.

> C'est l'étape la plus sensible de toute la chaîne : une erreur ici décale
> proportionnellement **toutes** les mesures.

**Étape 3 — Prédire les tours de corps.** Un squelette donne des distances
entre articulations, pas des circonférences. Un modèle d'apprentissage
automatique fait ce saut : à partir de 12 mesures d'entrée, il prédit
**8 tours de corps**.

À cela s'ajoutent **4 mesures géométriques** lues directement sur l'image
(largeur d'épaules, longueur de manche, entrejambe, longueur de dos), qui ne
nécessitent aucun modèle.

**Total livré au client : 12 mesures.**

### 3.2 Les données d'entraînement

Le modèle apprend sur **ANSUR II**, une étude anthropométrique de l'armée
américaine : 4 082 hommes et 1 986 femmes, plus de 90 mesures chacun, prises
au mètre ruban par des professionnels.

> **Un problème sérieux a été trouvé dans ces fichiers.** Ils avaient été
> exportés avec une colonne d'index sans nom : l'en-tête comptait 99 champs
> et chaque ligne 100. Lus normalement, **toutes les colonnes se décalaient
> d'un cran** — la colonne « taille » renvoyait en réalité le poids, la
> colonne « tour de poitrine » renvoyait la largeur de poitrine.
>
> Aucune erreur n'était signalée. Un modèle entraîné ainsi aurait appris des
> correspondances entièrement fausses, avec des indicateurs de qualité
> d'apparence normale.
>
> Détecté en comparant les moyennes obtenues aux valeurs ANSUR publiées.
> Corrigé, et un script de contrôle qualité vérifie désormais ce point à
> chaque exécution.

### 3.3 Deux modèles séparés

Un modèle **homme** et un modèle **femme**, entraînés indépendamment. Le sexe
n'est pas une variable d'entrée : il choisit quel modèle appeler.

Ce choix se justifie par les données : les distributions masculines et
féminines se chevauchent mais restent nettement décalées, et deux modèles
spécialisés font mieux qu'un modèle unique.

### 3.4 Résultats obtenus

Algorithme retenu : **gradient boosting multi-sortie** (un modèle par mesure).

Erreur moyenne : **1,18 cm** pour les hommes, **1,12 cm** pour les femmes.

Le détail est plus instructif que la moyenne :

| Mesure | Erreur (H) | Qualité (R²) | Lecture |
|---|---|---|---|
| Tour de taille | 1,30 cm | 0,98 | excellent |
| Tour de hanches | 1,25 cm | 0,96 | excellent |
| Tour de poitrine | 1,67 cm | 0,94 | excellent |
| Tour de cuisse | 1,48 cm | 0,89 | bon |
| Tour de biceps | 1,35 cm | 0,78 | correct |
| Tour de cou | 1,16 cm | 0,68 | faible |
| Tour de poignet | 0,49 cm | 0,57 | faible |
| Tour de cheville | 0,77 cm | 0,55 | faible |

**Comment interpréter les mesures « faibles ».** Le poignet et la cheville
dépendent de l'ossature, pas de la corpulence — et aucune des entrées
disponibles ne porte cette information. Ce n'est pas un défaut du modèle mais
une limite des données. À noter que l'erreur **absolue** y reste très basse
(0,4 à 0,8 cm), largement suffisante pour tailler une manche.

### 3.5 Comparaison d'algorithmes

Sept algorithmes ont été comparés sur les mêmes données :

| Algorithme | Erreur moyenne | Temps |
|---|---|---|
| **Régression linéaire (Ridge)** | **1,09 cm** | 0,4 s |
| Réseau de neurones | 1,11 cm | 61 s |
| Empilement de modèles | 1,14 cm | 132 s |
| Gradient boosting (en production) | 1,16 cm | 24 s |
| Gradient boosting chaîné | 1,17 cm | 26 s |
| Arbres extrêmes | 1,28 cm | 3 s |
| Forêt aléatoire | 1,31 cm | 7 s |

**Enseignement principal :** une simple régression linéaire fait aussi bien
que des algorithmes bien plus complexes, en 55 fois moins de temps. Les
proportions du corps humain sont essentiellement linéaires sur une population
adulte.

Le chaînage des sorties, qui devait exploiter la corrélation entre mesures,
n'a **rien apporté** — cette corrélation est déjà expliquée par les entrées
communes.

### 3.6 Premier test sur photo réelle — un bug majeur découvert

Le 2 août, la chaîne a été exécutée pour la première fois sur de vraies photos
(un homme, vue de face et de profil, fond uni, corps entier).

**La détection est excellente** : 33 points placés, visibilité moyenne 0,99,
aucun point douteux. Le squelette se superpose parfaitement au corps.

**Mais les mensurations produites étaient fausses.** Quatre variables
affichaient un écart de **−37 % exactement** — une régularité trop nette pour
être fortuite.

*Cause :* MediaPipe place ses points sur les **centres articulaires**, pas sur
la surface du corps. La distance entre les deux points de hanche mesure
l'écartement des têtes fémorales (21,8 cm), alors que la mesure attendue est la
largeur du bassin (34,6 cm). Le code confondait les deux, et trois autres
variables dérivées héritaient de l'erreur.

*Conséquence :*

| Mesure | Avant correction | Après correction |
|---|---|---|
| Tour de taille | **72,0 cm** | 93,7 cm |
| Tour de poitrine | 97,6 cm | 105,2 cm |
| Tour de hanches | 92,7 cm | 101,4 cm |

Un tour de taille de 72 cm pour un homme de 85 kg est manifestement absurde.
Des facteurs de calibration ont été ajoutés pour ramener les distances
squelettiques vers les définitions anthropométriques.

> **Ce que ce test prouve — et ce qu'il ne prouve pas.**
> Il prouve que le défaut était réel et grave, que la chaîne fonctionne de bout
> en bout, et que la qualité de détection est excellente.
> Il **ne prouve pas** que les mensurations obtenues sont justes : les facteurs
> de calibration ont été calculés pour faire correspondre ce sujet aux moyennes
> de la population, ce qui rend le résultat cohérent par construction. Sans les
> vraies mesures au mètre ruban de cette personne, l'exactitude reste inconnue.

Cet épisode illustre pourquoi le test sur photo réelle était indispensable : le
modèle affichait 1,18 cm d'erreur en laboratoire tout en produisant des
mensurations absurdes en conditions réelles.

### 3.7 Vérification de bout en bout — un second défaut trouvé et corrigé

Après la correction de calibration, la chaîne complète a été testée en passant
par les **vrais points d'entrée de l'application** (création de session, envoi
des photos, tâche de fond, lecture du résultat) plutôt que par un script
d'inspection isolé — pour s'assurer que ce que l'utilisateur final vivrait
correspond bien à ce qui a été validé techniquement.

**Un second défaut est apparu**, de nature différente : un problème de délai,
pas de calcul. La première fois que le serveur traite une mesure après son
démarrage, l'initialisation du moteur de vision (MediaPipe) prend entre 10 et
plus de 90 secondes selon la charge de la machine — contre environ 2 à 3
secondes une fois « chauffé ». L'application mobile n'attendait que 12
secondes avant d'afficher un message d'échec. Concrètement, le tout premier
client à mesurer ses mensurations après chaque redémarrage du serveur aurait
vu « Échec de l'analyse », alors que le calcul aboutissait quelques instants
plus tard, sans que personne ne le sache.

*Correction apportée à deux niveaux :*
- **Le serveur préchauffe le moteur de vision à son démarrage**, dans une
  tâche discrète qui ne retarde pas l'ouverture du service. Ce coût est ainsi
  payé une fois, au déploiement, plutôt que sur la requête d'un client.
- **L'application mobile attend plus longtemps** avant de conclure à un échec
  (jusqu'à 90 secondes au lieu de 12), avec un message qui prévient
  l'utilisateur que la première analyse peut prendre un peu de temps, pour que
  l'attente ne donne pas l'impression d'un blocage.

Mesuré après cette double correction : le parcours complet (envoi des photos
jusqu'au résultat) prend désormais **5 à 9 secondes**, y compris juste après un
redémarrage du serveur.

### 3.8 Le vrai enjeu : l'écart entre laboratoire et terrain

Les chiffres ci-dessus sont mesurés sur des données ANSUR **exactes**. En
production, le modèle recevra des estimations issues de photos, forcément
bruitées.

Une simulation de ce bruit (2 à 3,5 % sur les mesures d'image, 1,5 % sur
l'échelle) montre que l'erreur passe de **1,18 à 1,56 cm**, soit **+32 %**.

Un ré-entraînement incluant ce bruit récupère une bonne part de cet écart :

| Configuration | Erreur en conditions réelles |
|---|---|
| Modèle actuel | 1,56 cm |
| Modèle robuste (bruit + variables enrichies) | 1,38 cm (**−11 %**) |
| Ridge robuste | 1,35 cm (**−14 %**) |

> **Réserve importante.** Ces niveaux de bruit sont des **hypothèses**, pas
> des mesures. Il faut les valider sur de vraies photos avant de considérer
> ces gains comme acquis.

### 3.9 SAM activé — la largeur au point, la profondeur reste un chantier ouvert

> ⚠️ **Le diagnostic posé dans cette section sur la profondeur de profil est
> faux.** La cause n'était pas un bras pendant le long du corps, mais un bras
> *fantôme* inventé par MediaPipe. Voir §3.13. La section est conservée telle
> quelle : elle documente le raisonnement qui a mené à trois jours d'errance,
> et ce qui a permis d'en sortir.

Le 4 août, SAM a été réellement mis en service (fichier de poids téléchargé,
chargé au démarrage). Premier test réel avec SAM actif sur les deux photos :
la largeur de poitrine mesurée en face passait de 28,9 cm (bonne valeur) à
**58,9 cm** — les bras légèrement écartés (consigne de prise de vue, pour que
les points squelettiques soient bien visibles) étaient inclus dans la mesure
du torse.

*Corrigé* en effaçant une bande autour de chaque bras avant de mesurer la
largeur. Résultat : 28,8 cm — quasiment parfait.

**La photo de profil a résisté à la même approche.** Les profondeurs
(poitrine, taille, fessier), mesurées la même façon, sont ressorties
sous-estimées de 26 à 48 %. Réduire la bande d'exclusion n'a presque rien
changé. En examinant la photo : un bras qui pend naturellement le long du
corps couvre, vu de profil, **exactement la même hauteur** que la poitrine, la
taille et les hanches réunies — ce n'est pas un réglage à affiner, c'est la
zone à effacer qui recouvre presque entièrement la zone à mesurer.

> Décision prise : la profondeur retombe, pour l'instant, sur l'estimation
> par ratio déjà utilisée quand SAM est absent (validée à ±0,1 cm sur ce
> même sujet) plutôt que de garder une mesure SAM dont on sait qu'elle est
> fausse dans ce cas de figure. Un seul sujet ne suffit pas non plus à
> valider un correctif sans risquer de le sur-ajuster à cette pose précise.
> Deux pistes pour la suite : une consigne de prise de vue différente (bras
> écarté du buste aussi de profil), ou un algorithme plus fin — à valider
> sur plusieurs sujets avant de trancher.

Conséquence pratique : la photo de profil n'est plus envoyée à SAM du tout
pour l'instant (son résultat n'était de toute façon pas utilisé) — ce qui
réduit aussi le temps de calcul de moitié, voir ci-dessous.

### 3.10 Latence divisée par cinq, et l'utilisateur n'a plus à attendre

Deux problèmes traités ensemble.

**Le calcul lui-même.** Avec SAM sur les deux photos, une analyse complète
prenait **146 secondes** sur cette machine (sans carte graphique) — largement
au-delà de ce qu'un utilisateur mobile tolère. En arrêtant d'appeler SAM sur
la photo de profil (inutile depuis la décision ci-dessus), le parcours réel
mesuré tombe à **30,6 secondes** — une réduction de 79 %.

**L'attente côté utilisateur.** Même à 30 secondes, forcer un écran de
chargement immobile est une mauvaise expérience. L'application prévient
désormais l'utilisateur (notification) dès que ses mensurations sont prêtes,
et un bouton « Continuer sans attendre » permet de quitter l'écran d'analyse
sans rien perdre — le calcul se poursuit côté serveur de toute façon, et
l'utilisateur retrouve son résultat plus tard, dans « Mes mesures » ou via la
notification.

**Une piste testée pour aller plus loin : MobileSAM.** Une version allégée de
SAM, conçue pour les appareils sans carte graphique, a été installée et
essayée. Résultat frappant sur le seul point mesuré jusqu'ici : le
**chargement** du modèle prend 1 seconde au lieu de 60 à 90 secondes. Sa
précision sur une vraie photo n'a pas encore été testée (volontairement
reporté) — c'est la prochaine étape avant d'envisager de la mettre en
production.

### 3.11 Piste de déploiement identifiée : Render

Un guide de déploiement a été préparé pour héberger le backend sur Render
(hébergeur cloud). Point notable pour le projet : Render fournit le HTTPS
**automatiquement et gratuitement**, ce qui règle d'un coup un problème
identifié en parallèle — Android bloque par défaut les connexions non
chiffrées (HTTP) dans une application autonome (un APK généré pour
distribution), donc sans HTTPS l'application ne pourrait tout simplement pas
se connecter au serveur une fois installée sur un vrai téléphone en dehors du
cadre de développement. Le déploiement n'a pas encore été fait — c'est un
guide prêt à suivre, pas une action réalisée.

**Point de vigilance sur l'offre gratuite.** Elle tourne avec une mémoire très
limitée (de l'ordre de 512 Mo, à reconfirmer sur la page tarifs actuelle de
Render — non revérifié en direct ici), probablement insuffisante pour charger
SAM classique (375 Mo de poids, plus PyTorch) sans risquer un plantage par
manque de mémoire. C'est ce qui a motivé la bascule décrite au §3.12.

### 3.12 Bascule vers MobileSAM — latence encore réduite, la profondeur reste un problème distinct

> ⚠️ La conclusion de cette section sur la profondeur de profil (« le problème
> vient de la photo et de la méthode de mesure ») **reprend le diagnostic
> erroné du §3.9**. Il était juste sur un point — le problème ne venait pas du
> modèle de segmentation — et faux sur la cause. Voir §3.13.

En anticipation du risque mémoire ci-dessus, le backend est passé de SAM
classique à MobileSAM, et les deux photos (face et profil) sont de nouveau
envoyées à SAM — ce qui avait été arrêté pour la photo de profil uniquement
pour gagner du temps de calcul, plus la raison d'être avec un modèle aussi
léger.

Résultat mesuré sur les mêmes photos réelles : le parcours complet passe de
**30,6 s à 14,7 s** — encore une réduction de moitié, et une réduction de
**90 %** par rapport au point de départ (146 s). La largeur de poitrine reste
aussi précise qu'avec SAM classique (28,8 cm contre 28,9 cm ANSUR) : la
qualité de segmentation de MobileSAM suffit pour cet usage.

> **Ce qui n'a PAS changé.** Le passage à MobileSAM ne règle pas le problème
> de profondeur de profil identifié au §3.9. Les pixels bruts mesurés sur la
> photo de profil avec MobileSAM sont quasiment identiques à ceux mesurés
> avec SAM classique — preuve que le problème vient de la photo et de la
> méthode de mesure (le bras occupe la même zone que ce qu'on cherche à
> mesurer), pas de la qualité du modèle de segmentation. Les profondeurs
> livrées au client continuent donc, sciemment, à passer par l'estimation
> par ratio déjà validée, et non par cette mesure de silhouette encore
> faussée. Changer de modèle a résolu la question de la mémoire et de la
> vitesse ; la question de la précision de profil reste ouverte, telle que
> décrite au §3.9.

### 3.13 Le bras fantôme — le diagnostic du §3.9 était faux

Le §3.9 attribuait l'échec des profondeurs de profil à « un bras qui pend le
long du corps et recouvre la zone à mesurer ». **Ce diagnostic était erroné**,
et l'a été pendant trois jours.

La vraie cause, trouvée en lisant les points MediaPipe de la photo de profil :
le bras opposé est **caché derrière le corps**. MediaPipe ne renvoie alors pas
« je ne sais pas » — il **invente des coordonnées**, avec un indice de
visibilité de 0,00 à 0,01, qui descendent le long du torse. La bande
d'exclusion des bras était tracée sur ces coordonnées fantômes, et **effaçait
donc le torse lui-même**, en plein sur les lignes de poitrine et de taille.

La signature était pourtant visible dans les mesures : profondeur de poitrine
et profondeur de taille **identiques au pixel près** (71 px), ce qui n'existe
sur aucun corps humain.

Correction : ne plus masquer un membre dont le coude et le poignet sont sous
le seuil de visibilité. *On ne masque pas ce qu'on n'a pas vu.* Les
profondeurs de profil sont depuis exploitables et alimentent le modèle.

### 3.14 Validation sur 13 sujets réels — l'écart laboratoire/terrain, chiffré

Treize adultes photographiés puis mesurés au mètre ruban, ce qui répond à la
priorité absolue fixée au §4. Le verdict est sans appel :

| | Erreur moyenne |
|---|---|
| Modèle sur données ANSUR bruitées | **1,38 cm** |
| Même modèle, mêmes photos, sujets réels | **5,2 cm** |

L'écart ne vient pas d'un manque de capacité : un banc d'essai de sept
architectures les classait toutes entre 1,09 et 1,31 cm sur ANSUR. Il vient du
**transfert de population** — ANSUR est une cohorte militaire américaine, les
sujets testés sont sensiblement plus minces à taille égale.

Preuve décisive : en injectant des variables relevées **au mètre ruban** — donc
une extraction parfaite — le modèle surestimait encore le tour de poitrine de
**12,1 cm**. Aucune amélioration de MediaPipe ou de SAM ne pouvait corriger
cela.

### 3.15 La ligne de poitrine était mesurée dans l'aisselle

Le balayage des hauteurs de mesure sur les 13 sujets a révélé un défaut de
conception : la poitrine était mesurée à 0,22 de la hauteur du torse, soit
**en pleine aisselle**, là où le deltoïde et le haut du bras se rattachent au
thorax. Le segment mesuré englobait les épaules — jusqu'à 64 cm de largeur
pour 32 attendus.

La mesure prend désormais le **minimum sur une bande** située sous l'aisselle
(0,26 à 0,34 du torse), ce qui trouve le creux du thorax et encaisse un pli de
vêtement. Effet mesuré : **9 sujets sur 13 aboutissent, contre 3**.

### 3.16 Modèle v3 — la géométrie bat l'apprentissage sur le tronc

Constat contre-intuitif mais reproductible : le **périmètre d'ellipse** calculé
sur la largeur et la profondeur mesurées bat un modèle entraîné sur 6 000
personnes.

| Approche pour le tour de poitrine | Erreur |
|---|---|
| Résidu additif appris sur ANSUR | 13,0 cm |
| Résidu relatif sur variables sans dimension | 22,4 cm |
| **Géométrie seule** | **6,5 cm** |

L'explication tient en un chiffre : chez ANSUR, le tour de poitrine dépasse le
périmètre d'ellipse de **+10,5 cm en moyenne**. Le modèle apprend cet écart —
réel pour cette population — et le réinjecte tel quel sur des sujets plus
minces, où il ne vaut pas. La géométrie, elle, ne dépend d'aucune population.

Le modèle v3 en tire trois changements :

1. **Un estimateur par cible** plutôt qu'un multi-sorties unique
2. **Ridge** plutôt que gradient boosting — un modèle linéaire extrapole hors
   de son domaine, un arbre prédit une constante
3. **Géométrie pure** pour poitrine, taille et hanches ; l'emplacement du
   résidu reste réservé à une future calibration sur population locale

Résultat sur les 13 sujets : **6,1 → 4,5 cm**, tour de poitrine **18,5 →
6,5 cm**, et 54 % des mesures dans la cible des ±3 cm contre 43 %.

### 3.17 Ce que la précision peut atteindre — et ce qu'elle ne peut pas

Le R² du rapport d'entraînement mesure la part de chaque circonférence
réellement déterminée par les variables d'entrée. Il fixe un **plancher
théorique** infranchissable :

| Cible | R² | Plancher (MAE ANSUR) |
|---|---|---|
| Taille, hanches, poitrine | 0,94 – 0,98 | très prévisibles |
| Cou | **0,68** | **1,16 cm** |
| Poignet | **0,57** | 0,49 cm |
| Cheville | **0,56** | 0,77 cm |

Ces valeurs sont obtenues sur ANSUR même, avec des mesures au millimètre et la
population d'entraînement. Deux personnes de morphologie identique peuvent
avoir des tours de cou différents : **l'information n'est pas dans les
entrées**.

Conséquence assumée : **±1 cm est hors d'atteinte** pour le cou, le biceps et
la cuisse par prédiction. Descendre plus bas exigerait de *mesurer* au lieu de
*prédire*.

Une tentative dans ce sens a été faite et **a échoué** : appliquer la géométrie
aux membres (circonférence ≈ π × largeur) donne 4,3 à 7,2 cm d'erreur, contre
1,2 à 3,8 cm pour le modèle. La raison est dimensionnelle — un tronc fait
30-40 cm de large, un membre 8-12 cm : la même imprécision de segmentation y
pèse trois à quatre fois plus lourd, et les vêtements flottants s'y ajoutent.

**La répartition actuelle est donc vérifiée, non supposée** : géométrie pour le
tronc, modèle appris pour les membres.

---

## 4. État actuel

| Composant | État |
|---|---|
| Application mobile (3 rôles) | fonctionnelle |
| API et règles métier | fonctionnelle |
| Authentification et sessions | fonctionnelle |
| Modèle de mensurations | **v3 déployé** — géométrie pour le tronc, ridge par cible pour les membres (§3.16) |
| MediaPipe (33 points) | **installé et actif** |
| Backend de silhouette | **MobileSAM** |
| Silhouette, largeur de face | **activée et corrigée** — mesure sur bande sous l'aisselle (§3.15) |
| Silhouette, profondeur de profil | **activée** — le bras fantôme qui la faussait est corrigé (§3.13) |
| Précision mesurée sur 13 sujets réels | **4,5 cm** en moyenne ; 54 % des mesures sous 3 cm |
| Capture guidée (silhouette + minuteur) | **en place** dans l'application |
| Hébergement | **O2Switch** (Passenger/WSGI) ; Render conservé en secours |
| Certificat HTTPS de l'API | **absent** — AutoSSL n'a pas émis pour le sous-domaine ; tests en HTTP |
| Paiement Mobile Money | simulé (bac à sable) |
| Avatar 3D, essayage, patrons | simulés |

### Précision par mesure, sur les 13 sujets réels

| Mesure | Erreur | Cible ±3 cm |
|---|---|---|
| Poignet | 1,2 cm | ✅ |
| Cou | 2,0 cm | ✅ |
| Biceps | 2,8 cm | ✅ |
| Cuisse | 3,0 cm | ✅ |
| Cheville | 3,8 cm | 🟡 |
| Poitrine | 6,5 cm | ❌ |
| Hanches | 7,4 cm | ❌ |
| Taille | 9,3 cm | ❌ |

### Ce qui reste à faire

1. **Collecter 30 à 50 sujets** avec mesures au mètre ruban. C'est désormais le
   seul levier pour les trois mesures de tronc : la géométrie est déjà optimale
   sans données locales, et le résidu ne peut s'apprendre que sur la population
   cible (§3.16).
2. **Améliorer la segmentation.** SAM ne sait pas ce qu'est un corps : sur 4
   sujets sur 13, le masque ne couvrait que le vêtement. Un modèle de *human
   parsing*, qui nomme torse, bras et jambes, supprimerait la cause racine et
   rendrait inutile la bande d'exclusion des bras.
3. **Obtenir le certificat HTTPS** sur l'API. Le trafic en clair est acceptable
   pour des tests, pas pour des mots de passe et des photos de clients.
4. **Tester l'interface sur appareil.** La capture guidée compile mais n'a
   jamais été utilisée en conditions réelles ; le cadrage de la silhouette
   demande un réglage de terrain.
5. **Brancher un vrai fournisseur Mobile Money.**
6. **Sauvegarder le dépôt de travail.** L'historique local n'a aucun ancêtre
   commun avec le dépôt distant : chaque déploiement passe par une branche
   reconstruite à la main.

---

## 5. Choix techniques notables

**Dégradation progressive.** La chaîne de mesure fonctionne par paliers : avec
MediaPipe et SAM, précision maximale ; avec MediaPipe seul, précision
moindre ; sans rien, estimation approximative par ratios. Un composant absent
ne bloque jamais le client.

**Contrat de modèle.** Chaque modèle entraîné embarque la liste ordonnée de ses
variables. Le serveur lit cet ordre depuis le fichier plutôt que de le coder
en dur — un ré-entraînement aux colonnes réordonnées ne peut donc pas produire
de résultats faux en silence.

**Garde-fous de vraisemblance.** Une taille de 400 cm ou une variable manquante
sont refusées, avec repli sur l'estimation approximative plutôt qu'une
mensuration fantaisiste.

---

## 6. Journal des versions

| Date | Modification |
|---|---|
| 30 juil. | Construction initiale : API complète et application web |
| 30 juil. | Réécriture en application native React Native |
| 31 juil. | Passage à Expo SDK 54 |
| 31 juil. | Correction connexion, français par défaut |
| 31 juil. | Refonte UX : favoris, suivi, profils, notifications |
| 31 juil. | Thème clair/sombre, dashboard tailleur, prêt-à-porter multi-photos |
| 31 juil. | Renouvellement de session, étape « commande prête » |
| 31 juil. | Refonte de l'espace administrateur |
| 1er août | Taille, poids et sexe rendus obligatoires |
| 1er août | Pipeline d'apprentissage automatique, modèles entraînés et déployés |
| 1er août | MediaPipe activé, outil d'inspection des photos |
| 2 août | Correction définitive du démarrage serveur (script `start.ps1`) |
| 2 août | Premier test sur photo réelle : bug de calibration découvert et corrigé |
| 2 août | Vérification bout-en-bout via les vrais points d'entrée : délai de démarrage à froid découvert et corrigé (préchauffage serveur + budget d'attente mobile) |
| 2 août | Import de photos depuis la galerie pour la prise de mesures (en plus de l'appareil photo) |
| 4 août | SAM activé : bug de largeur (bras inclus) trouvé et corrigé, largeur validée à ~0 % d'écart |
| 4 août | Profondeur de profil : cause identifiée (bras et zone à mesurer se recouvrent), repli sur ratio en attendant une vraie solution |
| 4 août | Latence divisée par 5 (146 s → 30,6 s) en arrêtant un appel SAM devenu inutile |
| 4 août | Notification de fin d'analyse + option « continuer sans attendre » |
| 4 août | MobileSAM installé, chargement en 1 s au lieu de 60-90 s (précision non testée) |
| 4 août | Guide de déploiement backend sur Render (HTTPS automatique, prérequis pour un APK utilisable hors développement) |
| 4 août | Bascule production sur MobileSAM (risque mémoire sur l'offre gratuite Render) : latence 14,7 s, largeur toujours précise, profondeur de profil toujours en attente d'une vraie solution |
| 5 août | Suppression du repli inventé : une analyse ratée renvoie désormais une consigne de reprise au lieu de mensurations plausibles mais fausses, indiscernables d'une vraie mesure |
| 5 août | Préchauffage des modèles déplacé du démarrage vers la connexion : le serveur répond immédiatement, le chargement se fait pendant que l'utilisateur navigue |
| 5 août | Modèle v2 déployé (entraîné avec bruit) ; bras fantôme corrigé — le diagnostic du §3.9 était faux (§3.13) |
| 6 août | Backend migré sur O2Switch (Passenger/WSGI), disque persistant ; Render conservé en secours |
| 6 août | **Validation sur 13 sujets réels** : 5,2 cm d'erreur contre 1,38 cm en laboratoire — l'écart laboratoire/terrain enfin chiffré (§3.14) |
| 6 août | Ligne de poitrine corrigée : elle était mesurée dans l'aisselle. Mesure sur bande, 9 sujets aboutis sur 13 contre 3 (§3.15) |
| 6 août | Profondeurs de profil réactivées, avec l'échelle propre à la photo de profil |
| 6 août | Capture guidée : silhouette à suivre à l'écran, consignes de pose, déclenchement automatique après décompte |
| 7 août | **Modèle v3** : un estimateur par cible, ridge, et géométrie pure pour le tronc. 6,1 → 4,5 cm ; tour de poitrine 18,5 → 6,5 cm (§3.16) |
| 7 août | Plancher de précision établi : ±1 cm hors d'atteinte par prédiction pour cou, biceps et cuisse ; géométrie testée sur les membres et écartée (§3.17) |
