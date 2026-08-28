# Implémentation SMPL / SMPL-X pour l'avatar — piste de comparaison

## 1. Objectif de ce document

Détailler concrètement comment implémenter un générateur d'avatar basé sur
SMPL ou SMPL-X, pour pouvoir plus tard le comparer chiffres à l'appui au
pipeline MakeHuman/MPFB2 actuellement en production. Ce n'est **pas une
recommandation de migration** : c'est le développement de la "Proposition A"
déjà esquissée et déjà critiquée en interne (voir
[BRIEF_MODELE_CORPOREL_AVATAR.md](BRIEF_MODELE_CORPOREL_AVATAR.md), §7-A),
poussé jusqu'au niveau de détail nécessaire pour être codé et testé sans
nouvelles questions de conception en cours de route.

Le test visé est volontairement limité : **mensurations déjà connues → maillage**,
exactement ce que fait `backend/app/services/avatar/morph_weights.py`
aujourd'hui. Le fitting SMPL directement depuis une photo (SMPLify, HMR,
CLIFF...) est un problème différent — celui de la *prise de mesure*, pas de
la *génération d'avatar* — et a déjà été jugé peu prometteur pour ce projet
(voir la discussion sur SMPL comme méthode de mesure, et le rejet empirique
d'Anny+clad-body sur ce même principe, dans `RAPPORT_PROJET.md` §6bis).

---

## 2. Rappel : ce que fait le pipeline actuel (baseline de comparaison)

- Maillage de base MakeHuman/MPFB2 exporté une fois hors ligne (Blender),
  21 833 sommets, ~60 morph targets nommées sémantiquement
  (`measure-bust-circ`, `measure-waist-circ`, `torso-scale-horiz`, etc. —
  voir `backend/app/services/avatar/target_map.py`).
- À chaque requête : `morph_weights.py::compute_avatar_morphology()`
  convertit les mensurations en poids `[-1, 1]` par cible, via deux
  mécanismes qui coexistent :
  1. `compute_target_weights()` — correspondance directe déterministe
     mensuration → cible (fallback, toujours calculé).
  2. `optimize_weights()` — un petit solveur qui affine un sous-ensemble
     de ces poids à partir d'une **matrice de sensibilité pré-calibrée**
     (`calibrate_sensitivity.py`, hors ligne) reliant poids de cible et
     mesure résultante du maillage. C'est déjà, en miniature, une forme de
     boucle fermée "mesure du maillage → ajustement des paramètres" —
     important à noter : SMPL n'apporterait pas ce concept en soi, il
     existe déjà.
- Poids envoyés tels quels au client (`weights: {nom_cible: poids}`),
  appliqués via `mesh.morphTargetInfluences` en three.js.
- Coût par requête : quelques millisecondes, pur CPU, aucune itération
  lourde.
- Problème non résolu actuellement : compromis poids de fichier
  (4,7 Mo sans normales de morph / ~20,5 Mo avec) vs qualité d'éclairage
  sous déformation (voir brief, §5.4).

Toute proposition SMPL doit être comparée à **ces deux dimensions**, pas
seulement à la précision anthropométrique : coût par requête et poids de
fichier mobile sont des contraintes dures de ce projet (hébergement
mutualisé sans GPU, APK déjà volumineux).

---

## 3. SMPL vs SMPL-X vs STAR — quel modèle choisir pour ce test

| Modèle | Sommets | Ce qu'il ajoute vs SMPL | Pertinence pour Sur-MeZur |
|---|---:|---|---|
| **SMPL** | 6 890 | — | Suffisant : seule la forme du corps compte pour l'essayage, pas les doigts ni le visage. |
| **SMPL-X** | 10 475 | Mains articulées, visage/expression | Non pertinent ici — coût de calcul et de fichier plus élevé pour une capacité (mains/visage) que l'app n'utilise pas. |
| **STAR** | 6 890 | Même topologie que SMPL, moins d'artefacts de déformation aux articulations (genou/coude), modèle plus récent (même laboratoire, MPI) | Alternative valable à tester en second si SMPL est retenu — mêmes contraintes de licence. |

**Recommandation pour ce test : SMPL** (modèle "neutral" ou les variantes
"male"/"female" séparées selon le sexe déclaré, comme le fait déjà le
pipeline actuel avec deux maillages de base). SMPL-X n'apporte rien pour ce
cas d'usage et coûte plus cher (sommets, poids fichier, temps de calcul) —
ne pas le tester en premier malgré le nom du document de départ.

---

## 4. Licences — à vérifier avant tout usage au-delà du test interne

- **SMPL** : licence du Max Planck Institute / Meshcapade, gratuite pour la
  recherche, **usage commercial soumis à accord séparé** (non négocié à ce
  jour pour Sur-MeZur — déjà signalé dans le brief existant, §7-A-1).
- **STAR** : même laboratoire, mêmes conditions par défaut.
- **SMPL-X** : idem (non pertinent ici de toute façon, voir §3).

Ce test peut être mené en interne à des fins de comparaison technique sans
enfreindre la licence (usage non commercial, non distribué), mais **aucun
résultat de ce test ne doit être déployé en production sans clarifier la
licence au préalable**. Ce point doit être vérifié avec le texte de licence
exact au moment de la décision, pas supposé réglé par ce document.

---

## 5. Architecture proposée

Même séparation hors-ligne / temps réel que le pipeline actuel, pour rester
compatible avec les contraintes serveur déjà documentées (pas de calcul
lourd par requête, pas de tâche de fond fiable — voir brief, §2).

```
Hors ligne (poste de dev, une fois) :
  1. Récupérer les fichiers modèle SMPL (male/female/neutral, .pkl ou .npz)
  2. Générer un jeu d'échantillons synthétiques (β aléatoires plausibles)
  3. Mesurer chaque maillage généré (bibliothèque de mesure sur maillage SMPL)
  4. Entraîner un régresseur mensurations → β (Ridge, comme le reste du projet)
  5. Exporter le maillage neutre (β=0) en glTF + les composantes de forme
     nécessaires au client (voir §6.7)

À chaque requête (temps réel, CPU pur, pas d'itération lourde) :
  mensurations client → régresseur → β corrigé → poids/coefficients
  → renvoyé au client (même contrat qu'aujourd'hui : un dict de poids)

Côté client mobile (Viewer3D.tsx, three.js + expo-gl) :
  → charge le maillage de base SMPL local (par sexe)
  → applique les coefficients reçus (morph targets ou blend shape, §6.7)
  → rendu WebGL, inchangé par ailleurs
```

Le contrat avec le mobile (`{gender, height_cm, reference_height_cm, weights}`)
peut rester identique à celui de `compute_avatar_morphology()` — c'est un
avantage pratique : `Viewer3D.tsx` n'a en principe pas besoin d'être
retouché si le format de sortie est conservé.

---

## 6. Détail d'implémentation, étape par étape

### 6.1 Récupérer les fichiers modèle

Inscription et acceptation de licence sur https://smpl.is.tue.mpg.de/,
téléchargement de `SMPL_MALE.pkl`, `SMPL_FEMALE.pkl` (et éventuellement
`SMPL_NEUTRAL.pkl`). Ne pas committer ces fichiers dans le dépôt (licence
non redistribuable) — les garder hors dépôt comme les autres poids de
modèle du projet (MobileSAM, etc., déjà exclus de Git).

### 6.2 Environnement Python

Package `smplx` (pip, par Vassilis Choutas — supporte SMPL/SMPL-H/SMPL-X
avec la même API). `torch` et `numpy` sont déjà présents dans
`backend/venv` (chargés par MobileSAM/MediaPipe) — pas de nouvelle
dépendance lourde à ajouter pour l'inférence forward de SMPL. Utiliser un
venv jetable pour ce test (même pattern que pour Anny/clad-body — ne pas
polluer `backend/venv` avant qu'une décision soit prise).

**Point à ne pas oublier** : le brief existant documente deux incidents de
saturation CPU dus à des bibliothèques (torch, BLAS) qui lancent un thread
par cœur *visible* plutôt que par cœur *réellement alloué* sur cet
hébergement. Si ce code est un jour porté vers le serveur de production,
plafonner explicitement les threads torch/numpy **avant tout import**,
comme déjà fait ailleurs dans ce projet pour MobileSAM/MediaPipe. Pour ce
test de comparaison en local, non bloquant.

### 6.3 Générer et mesurer le maillage neutre

```python
import smplx
model = smplx.create(model_path, model_type="smpl", gender="male", num_betas=10)
output = model(betas=torch.zeros(1, 10))
vertices = output.vertices[0]  # (6890, 3)
```

Exporter ce maillage en glTF pour vérification visuelle (topologie SMPL
correcte, échelle correcte).

### 6.4 Bibliothèque de mesure du maillage

Ne pas réécrire les chemins de mesure à la main : le dépôt
[SMPL-Anthropometry](https://github.com/DavidBoja/SMPL-Anthropometry)
(déjà référencé dans le document de proposition externe) fournit des
fonctions de mesure (tour de poitrine, taille, hanches, longueurs...)
directement calibrées sur les landmarks/vertex de la topologie SMPL — c'est
l'avantage principal de SMPL par rapport à MakeHuman sur ce point précis :
la bibliothèque de mesure existe déjà et n'a pas besoin d'être construite
mesure par mesure comme il aurait fallu le faire pour MPFB2 (voir la
proposition d'amélioration externe, §5.2, qui recommandait de construire
cette bibliothèque à la main pour MakeHuman — travail non nécessaire ici).

Vérifier que les mesures produites correspondent aux définitions ISO 8559-1
déjà utilisées par le pipeline de capture (mêmes noms, mêmes niveaux
anatomiques) avant toute comparaison — un décalage de définition fausserait
la comparaison sans que ce soit un problème du modèle 3D lui-même.

### 6.5 Calibration mensurations → β

Deux approches, à tester dans cet ordre :

**A. Régression directe (à privilégier — coût nul par requête)**

```
pour i in 1..N (N ~ 2000-5000) :
    tirer β_i ~ N(0, I) tronqué à ±2.5σ (espace de forme SMPL plausible)
    générer le maillage, le mesurer (§6.4)
mesures[i] -> β_i : entraîner un Ridge multi-sortie (mesures -> β)
```

Cohérent méthodologiquement avec le reste du projet (Ridge déjà utilisé
pour cou/biceps/cuisse/poignet/cheville). Coût d'inférence par requête :
une multiplication matricielle, largement compatible avec la contrainte
CPU serveur.

**Réserve déjà actée dans le brief existant, à ne pas re-découvrir** : ce
régresseur n'apprend qu'à inverser l'espace de forme SMPL lui-même. Si la
morphologie camerounaise est sous-représentée dans les données
d'entraînement de SMPL (CAESAR, population majoritairement nord-américaine/
européenne), rien ne garantit que l'espace β couvre correctement cette
population — c'est structurellement le même risque de biais que celui
mesuré pour ANSUR II (1,38 cm en population interne contre 5,2 cm sur
sujets réels camerounais). **Ce point doit être vérifié en comparant les
mesures obtenues sur le jeu de test réel (13-17 sujets existants), pas
supposé résolu par construction.**

**B. Raffinement itératif optionnel (hors ligne uniquement, jamais par requête)**

Descente de gradient (Adam, 5-20 itérations) sur β pour minimiser
`Σ Huber(mesure_maillage(β) - mesure_cible) + λ‖β‖²`, en partant du β
obtenu par la régression A. SMPL étant un simple skinning linéaire (pas un
réseau profond), chaque itération est bon marché (probablement quelques
dizaines de ms en CPU pur pour 10 paramètres) — moins coûteux que ce que la
réserve #2 du brief existant laisse craindre, mais **cette estimation n'est
pas mesurée sur l'infrastructure réelle (quota CPU 1-2 cœurs) et ne doit
pas être supposée acquise** compte tenu des deux échecs déjà vécus sur cet
hébergement. Pour ce test de comparaison : à exécuter hors ligne seulement,
jamais dans le chemin d'une requête tant que ce n'est pas mesuré en
conditions réelles.

### 6.6 Mise à l'échelle par la taille

Même piège déjà rencontré et corrigé pour MakeHuman (brief, §5.3) : utiliser
la hauteur du maillage *après* application de β comme diviseur d'échelle,
jamais la hauteur du maillage neutre — sinon plusieurs centimètres d'erreur
silencieuse.

### 6.7 Format de sortie pour le mobile — deux options

**Option 1 — morph targets nommées (compatible telle quelle avec l'architecture actuelle)**

Pré-exporter, comme pour MakeHuman, une cible glTF par composante de forme
retenue (par ex. les 10 premières composantes SMPL, dans les deux sens),
à poids 0. Le client applique les coefficients reçus via
`morphTargetInfluences`, exactement comme aujourd'hui. Changement minimal
côté mobile, mais les composantes SMPL n'ont pas de nom sémantique
("shape-component-0", pas "tour de poitrine") — la correspondance
mensuration → coefficient reste entièrement portée par le régresseur du
§6.5, jamais par une correspondance directe comme `target_map.py` le fait
pour MakeHuman.

**Option 2 — blend shape natif, calculé côté client (plus proche de ce qu'est SMPL, potentiellement plus léger)**

Embarquer une seule fois dans l'app la matrice de composantes de forme
(`shapedirs`, ~6890×3×10 valeurs, ≈ 827 Ko en float32 pour 10 composantes)
et le maillage moyen. Le serveur renvoie uniquement le vecteur β (10
nombres). Le client calcule `v = v_mean + shapedirs · β` une seule fois à
la réception (pas par frame de rendu), puis `computeVertexNormals()`. Cette
option évite complètement le compromis poids-fichier / éclairage documenté
au §5.4 du brief (pas de morph targets à charger en mémoire GPU pour un
morphing dynamique — la déformation est calculée une fois, en JS, avant le
premier rendu), mais demande d'écrire ce calcul côté mobile (three.js/expo-gl)
et de valider que `computeVertexNormals()` est suffisant sans lissage manuel
supplémentaire. À tester en second, après avoir validé l'option 1 plus
simple.

### 6.8 Pose et squelette

SMPL sépare forme (β) et pose (θ, 24 joints). Pour Sur-MeZur, aucune
animation n'est nécessaire (l'avatar actuel ne bouge pas non plus) : fixer
θ à une pose neutre standard (A-pose ou pose définie par le modèle) et
exporter un maillage statique déjà posé, sans exposer le squelette au
client — cohérent avec l'absence totale d'animation dans le pipeline
mobile actuel.

### 6.9 Texture et matériau

SMPL est nu, sans texture ni matériau. Réutiliser l'approche déjà en place
pour MakeHuman : un seul matériau ajouté après export pour la teinte de
peau (le pipeline actuel le fait déjà, cf. brief §5.3 — "un seul [matériau]
est ajouté ensuite pour la teinte de peau").

---

## 7. Comparaison structurelle attendue avec MakeHuman/MPFB2

| Critère | MakeHuman/MPFB2 (actuel) | SMPL (à tester) |
|---|---|---|
| Sommets | 21 833 | 6 890 |
| Morph targets / composantes | ~60, nommées sémantiquement | 10 (typique), non nommées, PCA |
| Bibliothèque de mesure du maillage | À construire (n'existe pas encore) | Existe déjà (SMPL-Anthropometry) |
| Poids fichier de base | 4,7-20,5 Mo (compromis non résolu) | Probablement plus léger (moins de sommets, moins de composantes) — à mesurer |
| Coût par requête | ms, déterministe + petite optimisation | ms (régression) à quelques dizaines de ms (si raffinement itératif) — à mesurer sur l'infra réelle |
| Licence | MakeHuman : libre | Non-commerciale par défaut, accord séparé requis pour la prod |
| Risque de biais de population | Déjà mesuré et documenté (ANSUR) | Probable, même nature, pas encore mesuré pour SMPL spécifiquement |
| Détail géométrique zones fines (pieds/mains) | Suspecté insuffisant (18 486 polygones au total, non confirmé comme cause du problème §5.4) | Probablement inférieur (moins de sommets au total) — à vérifier avant de conclure que SMPL règle quoi que ce soit sur ce point |

Le seul avantage structurel *certain* de SMPL sur ce tableau est
l'existence d'une bibliothèque de mesure de maillage déjà écrite — tout le
reste doit être mesuré, pas supposé.

---

## 8. Protocole de test minimal pour la comparaison

1. Prendre les 13-17 sujets réels déjà utilisés comme référence dans
   `ml/bench/` (mêmes mensurations, mêmes valeurs de vérité terrain que pour
   toutes les comparaisons précédentes du projet — GP, Anny+clad-body).
2. Générer, pour chaque sujet, un maillage SMPL via le régresseur du §6.5-A
   et un maillage MakeHuman via le pipeline actuel.
3. Mesurer les deux maillages avec leurs bibliothèques de mesure
   respectives, comparer aux mensurations cibles (MAE, biais signé, par
   mesure) — même méthodologie que les comparaisons GP/Anny déjà menées
   (validation par sujet, jamais par image/échantillon).
4. Mesurer, séparément de la précision : poids de fichier de base, taille
   des morph targets ou de la matrice de composantes, temps de génération
   par requête (les deux options du §6.7 si le temps le permet).
5. Décision : ne retenir SMPL que si le gain de précision est net sur des
   sujets non utilisés pour calibrer le régresseur, **et** que la question
   de licence commerciale est résolue — un gain de précision ne suffit pas
   seul, comme déjà établi pour toutes les autres pistes de ce projet.

Ne pas inclure de fitting photo → β dans ce test : ça répond à une question
différente (la prise de mesure, pas la génération d'avatar) et brouillerait
la comparaison.

---

## 9. Risques déjà identifiés — ne pas les redécouvrir

Rappel des réserves déjà actées dans
[BRIEF_MODELE_CORPOREL_AVATAR.md](BRIEF_MODELE_CORPOREL_AVATAR.md) §7-A,
qui restent valables et ne sont pas levées par ce document :

1. Licence non-commerciale par défaut, accord séparé non entamé.
2. Toute optimisation itérative par requête réintroduit du calcul CPU
   serveur — à mesurer sur l'infrastructure réelle avant toute conclusion,
   compte tenu des deux échecs déjà vécus sur cet hébergement.
3. Un régresseur entraîné sur des échantillons synthétiques générés par
   SMPL lui-même n'apprend qu'à inverser l'espace de forme SMPL — aucune
   garantie de fidélité à une morphologie camerounaise absente des données
   d'entraînement de SMPL.

---

## 10. Livrables minimaux pour que la comparaison soit reproductible

- Un script hors-ligne unique générant : maillage neutre + N échantillons
  synthétiques mesurés + régresseur entraîné (même esprit que
  `ml/bench/experiments/exp14_anny_clad_body.py`, à créer sous un nom
  équivalent, par exemple `exp15_smpl_avatar.py`).
- Un tableau de résultats par sujet et par mesure, MAE + biais, comparé
  côte à côte avec les résultats déjà obtenus pour le pipeline MakeHuman
  actuel sur les mêmes sujets.
- Les mesures de poids de fichier et de temps de génération, consignées
  séparément de la précision (les deux critères ne doivent jamais être
  fusionnés dans une seule conclusion).
