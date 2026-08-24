# Sur-MeZur — Brief technique : calcul des poids de morphologie de l'avatar

## Objet de ce document

Ce document décrit un seul sous-système, précisément : **l'algorithme qui
convertit les mensurations d'un client (en cm) en poids de déformation du
maillage 3D (60 valeurs entre 0 et 1)**. Il ne traite ni du rendu graphique,
ni du problème de mémoire GPU rencontré lors du chargement du maillage sur
mobile (voir `BRIEF_MODELE_CORPOREL_AVATAR.md`, un document séparé, pour ces
sujets). Autonome : aucun contexte de conversation préalable n'est requis
pour le lire.

**État** : recalibration en cours (voir §9 pour les changements récents).

---

## 1. Où ce sous-système s'insère

```
Photos du client (face + profil)
        ↓
Pipeline de vision par ordinateur (MediaPipe + MobileSAM + modèle Ridge)
        ↓
~25 mensurations en cm (tours, largeurs, profondeurs, longueurs)
        ↓
   ┌──────────────────── CE DOCUMENT ─────────────────────────┐
   │  body_params.py      : mesure cm → score [-1, +1]        │
   │  target_map.py       : score → poids morph target [0,1]  │
   │  optimize_weights.py : (nouveau) ajustement par optim.   │
   └──────────────────────────────────────────────────────────┘
        ↓
Dictionnaire {nom_du_morph_target: poids} envoyé au mobile
        ↓
Application des poids sur le maillage 3D (hors sujet ici)
```

Quatre fichiers backend implémentent ce sous-système :
`app/services/avatar/body_params.py`, `app/services/avatar/target_map.py`,
`app/services/avatar/morph_weights.py` (point d'entrée), et
`app/services/avatar/optimize_weights.py` (nouveau — ajustement par
optimisation). Calcul Python pur, aucune dépendance à un moteur 3D,
temps d'exécution de l'ordre de la milliseconde.

---

## 2. Les mesures d'entrée — et un biais déjà mesuré ailleurs dans ce pipeline

Le calcul reçoit jusqu'à ~25 valeurs, de 5 origines différentes :

| Origine | Exemples | Nature |
|---|---|---|
| Saisie client | taille, poids, sexe | Déclaratif |
| MediaPipe (squelette 33 points) | largeurs articulaires, longueurs de membres | Géométrique, mesuré sur l'image |
| MobileSAM (silhouette) | largeurs/profondeurs réelles du torse | Géométrique, mesuré sur l'image |
| Modèle Ridge (régression) | 8 tours (poitrine, taille, hanches, bras, cuisse, cou, poignet, cheville) | **Prédit** par un modèle entraîné |
| Géométrie directe | carrure, longueur de manche, entrejambe, longueur de dos | Géométrique, mesuré sur l'image |

**Point important, déjà mesuré et documenté ailleurs dans ce même
pipeline** (`app/services/measurement_model.py`, commentaire de tête de
fichier) : la version précédente du modèle Ridge qui prédit les 8 tours
atteignait *1,38 cm* d'erreur en validation sur des données synthétiques
dérivées d'ANSUR (une base militaire américaine), mais *5,2 cm* d'erreur
mesurée sur 13 sujets camerounais réels, relevés au mètre ruban. Le
diagnostic retenu dans le code : **« l'écart vient du transfert de
population, pas d'un manque de capacité »**. La correction appliquée à ce
modèle précis a été de réduire sa dépendance à la population d'entraînement
(passer d'une prédiction empruntant à ANSUR to un socle géométrique
indépendant de toute population — périmètre d'ellipse mesuré directement
sur la silhouette — complété seulement d'un résidu appris).

Ce précédent est cité ici parce que **le sous-système décrit dans ce
document utilise la même base ANSUR, pour un usage différent** (voir §3) —
sans qu'aucune validation équivalente (comparaison à des sujets
camerounais réels) n'ait été faite à ce niveau-là spécifiquement.

---

## 3. Étage 1 — la mesure en cm devient un score normalisé [-1, +1]

Fichier : `body_params.py`, fonction `measurements_to_avatar_params`.

### Formule exacte

```python
def _z_score(value: float, mean: float, std: float) -> float:
    if std <= 0:
        return 0.0
    return _clamp((value - mean) / (2.0 * std))   # clamp dans [-1, +1]
```

Pour chaque mesure directe (tour de poitrine, de taille, de hanches, de
bras, de cuisse, de cou, de poignet, de cheville, largeur d'épaules,
longueur de manche, longueur de dos) :

```python
z = _z_score(mesure_client, moyenne_population, ecart_type_population)
```

**Pourquoi diviser par `2 × écart-type`, pas `1 ×`** : c'est un choix de
sensibilité délibéré. Diviser par 1 écart-type ferait saturer le poids à
1.0 pour un cas assez courant (environ 1 personne sur 6 dans une
distribution normale). Diviser par 2 écarts-types réserve la déformation
maximale aux cas réellement extrêmes ; quelqu'un à 1 écart-type de la
moyenne (fréquent) reçoit un poids de 0,5 seulement.

### Table de référence utilisée (ANSUR II)

```python
ANSUR_MALE = {
    "height": 175.6, "weight": 85.5,
    "chest": 105.9, "waist": 94.1, "hips": 102.0,
    "biceps": 35.8, "thigh": 62.5, "neck": 39.8,
    "wrist": 17.6, "ankle": 22.9,
    "chestbreadth": 28.9, "chestdepth": 25.4,
    "waistbreadth": 32.6, "waistdepth": 23.8,
    "hipbreadth": 34.6, "buttockdepth": 24.6,
    "biacromialbreadth": 41.6, "bideltoidbreadth": 51.0,
    "shoulder": 34.3,             # voir note carrure ci-dessous
    "sleeve_length": 59.3, "inseam": 77.6, "back_length": 56.5,
    "sittingheight": 91.8, "crotchheight": 84.6,
}
ANSUR_FEMALE = {
    "height": 162.8, "weight": 67.8,
    "chest": 94.7, "waist": 86.1, "hips": 102.1,
    "biceps": 30.6, "thigh": 61.6, "neck": 33.0,
    "wrist": 15.5, "ankle": 21.6,
    "chestbreadth": 26.9, "chestdepth": 24.7,
    "waistbreadth": 30.0, "waistdepth": 21.3,
    "hipbreadth": 35.4, "buttockdepth": 23.3,
    "biacromialbreadth": 36.5, "bideltoidbreadth": 45.0,
    "shoulder": 30.1,
    "sleeve_length": 54.4, "inseam": 71.7, "back_length": 45.4,
    "sittingheight": 85.7, "crotchheight": 78.2,
}
# + deux tables d'écarts-types (ANSUR_STD_MALE / ANSUR_STD_FEMALE),
# mêmes clés, valeurs entre 0,8 et 11,2 selon la mesure.
```

Source déclarée dans le code : CSV ANSUR II, 4082 hommes et 1986 femmes
(population militaire américaine mesurée par l'armée US). Un commentaire
dans le fichier signale qu'une table précédente, saisie à la main, avait
une erreur métrologique concrète : la « carrure » (distance entre
emmanchures, ~34 cm) y était comparée à une largeur bideltoïdienne
ANSUR (~45,6 cm, une mesure différente — d'une épaule à l'autre en
passant par l'extérieur du deltoïde), ce qui donnait un z-score de -2,5
(saturé à -1,0) **pour pratiquement tous les clients** — un bug qui
rendait chaque avatar avec les épaules les plus étroites possibles. La
table actuelle applique un facteur de conversion (`× 0,90/1,09`) pour
comparer la bonne grandeur, et a été recalculée directement depuis les
CSV plutôt que ressaisie à la main.

**Ce qui n'a en revanche pas changé** : la référence reste une population
militaire américaine adulte, pas une population camerounaise. Voir §2 pour
le précédent déjà mesuré sur ce point ailleurs dans le pipeline.

### Résultat de cet étage

Douze scores indépendants dans `[-1, +1]` (`chest_scale`, `waist_scale`,
`hip_scale`, `shoulder_width`, `back_factor`, `neck_scale`,
`biceps_scale`, `wrist_scale`, `thigh_scale`, `ankle_scale`,
`sleeve_factor`, plus les largeurs/profondeurs quand les données
MobileSAM sont disponibles), stockés dans un objet `AvatarParams`.

---

## 4. Étage 2 — le score devient un poids de morph target [0, 1] + une direction

Fichier : `target_map.py`, fonction `compute_target_weights`.

Chaque axe corporel a **deux** morph targets pré-enregistrés sur le
maillage 3D — un pour agrandir (suffixe `-incr`), un pour rétrécir
(suffixe `-decr`). Cet étage choisit lequel activer et à quel dosage :

```python
def add_signed(sous, racine, valeur):
    v = float(valeur or 0.0)
    if abs(v) < 0.02:          # seuil de bruit — voir ci-dessous
        return
    sens = "incr" if v > 0 else "decr"
    weights[f"{racine}-{sens}"] = _clamp01(abs(v))
```

- **Seuil de bruit à 0,02** : un score en dessous de cette valeur absolue
  est traité comme « pas de signal réel », le morph target correspondant
  reste totalement inactif (absent du dictionnaire, poids implicite 0)
  plutôt que de recevoir une déformation à peine perceptible.
- Le poids final est directement `|z|` — aucune transformation
  supplémentaire entre le score de l'étage 1 et le poids appliqué au
  maillage.

### Table de correspondance directe (1 mesure → 1 cible)

| Paramètre | Cible morph (racine) |
|---|---|
| `chest_scale` | `measure-bust-circ` |
| `waist_scale` | `measure-waist-circ` |
| `hip_scale` | `measure-hips-circ` |
| `shoulder_width` | `measure-shoulder-dist` |
| `back_factor` | `measure-napetowaist-dist` |
| `neck_scale` | `measure-neck-circ` |
| `biceps_scale` | `measure-upperarm-circ` |
| `wrist_scale` | `measure-wrist-circ` |
| `thigh_scale` | `measure-thigh-circ` |
| `ankle_scale` | `measure-ankle-circ` |
| `sleeve_factor` | `measure-upperarm-length` |
| `leg_ratio` | `measure-upperleg-height` |
| `buttock_scale` | `buttocks-volume` |
| `hip_breadth_scale` | `hip-scale-horiz` |
| `buttock_depth_scale` | `hip-scale-depth` |
| `torso_ratio` | `torso-scale-vert` |

### Cibles dérivées (pas de mesure directe disponible)

| Cible | Formule | Origine du signal | État |
|---|---|---|---|
| `buttock_scale` | `buttock_depth × 0,7 + hip_breadth × 0,3` (SAM) ou `hip_scale × 0,85 + 0,05` (fallback) | Profondeur/largeur SAM quand disponible, sinon tour de hanches | ✅ Amélioré |
| `breast_size` (femme uniquement) | `chest_scale × 0,7 × (1 + weight_factor × 0,3)` | Inféré de la poitrine + corpulence | ⚠️ Non calibré |
| Largeur du torse (`torso-scale-horiz`) | `(chest_breadth_scale + waist_breadth_scale) / 2` | Moyenne — MakeHuman n'a qu'une cible de largeur pour tout le torse | ✅ |
| Profondeur du torse (`torso-scale-depth`) | `(chest_depth_scale + waist_depth_scale) / 2` | Idem | ✅ |
| 5 cibles de corpulence (bras ×2, cuisses ×2, ventre) | `weight_factor × 0,6` pour chacune | Un seul signal (IMC) pilote les 5 cibles identiquement | ⚠️ Gain 0.6 à calibrer |
| 2 cibles de musculature (pectoraux, dorsaux) | **Neutralisé** (toujours 0) | Aucune mesure de musculature dans le pipeline | ✅ Neutralisé |

**Note muscle_factor** : les cibles `torso-muscle-pectoral` et `torso-muscle-dorsi`
sont désormais neutralisées (poids 0) car l'IMC ne mesure pas la composition
corporelle. Ce couplage produisait un signal systématiquement faux. Réactivation
possible quand un signal réel de musculature sera disponible.

`weight_factor` lui-même : `clamp((IMC_client − IMC_référence) / 15, -1, 1)`,
où `IMC_référence` vaut 27,7 (homme) ou 25,6 (femme) — recalculé depuis les
mêmes fichiers ANSUR que le reste de la table (une valeur précédente,
28,8/29,1, poussait presque tous les clients vers une corpulence négative).

### Cas particulier : volume mammaire

Seule cible qui n'utilise pas la convention `-incr`/`-decr` — MakeHuman la
nomme `breast-volume-vert-up` / `-down`. Même logique de seuil et de
signe, appliquée uniquement si `gender > 0.5` (femme).

### Exemple chiffré complet, de bout en bout

Client homme, tour de poitrine mesuré = 96 cm.

1. Référence ANSUR homme : moyenne 105,9 cm, écart-type 8,7 cm.
2. `z = (96 − 105,9) / (2 × 8,7) = −0,569` → `chest_scale = −0,569`
3. `|−0,569| ≥ 0,02` → signal retenu ; `v < 0` → direction `decr`
4. `weights["measure-bust-circ-decr"] = 0,569`
5. La cible opposée, `measure-bust-circ-incr`, n'apparaît pas dans le
   résultat (poids 0 implicite).

Le maillage reçoit donc une instruction unique et sans ambiguïté pour cet
axe : rétrécir la poitrine à 56,9 % de l'amplitude maximale pré-enregistrée
pour cette cible.

---

## 5. La hauteur — traitée entièrement à part

`height_cm` n'est **pas** normalisé en z-score : c'est la taille déclarée
du client, en cm, transmise telle quelle. Elle sert à calculer un facteur
d'échelle uniforme appliqué à tout le maillage côté client
(`hauteur_demandée / hauteur_de_référence`).

Complication : appliquer certains morph targets change la hauteur du
maillage (par exemple, allonger les jambes). Le calcul du **diviseur**
correct (`reference_height_cm`, fonction `estimate_reference_height_cm`)
utilise donc une table de sensibilité mesurée empiriquement une fois
(script `calibrate_height.py`, hauteur du maillage neutre = 165,943 cm) :

```python
HEIGHT_SENSITIVITY = {
    "leg_ratio":    (10.370, -7.500),   # delta en cm à poids +1.0 / -1.0
    "torso_ratio":  (10.280, -4.310),
    "back_factor":  (7.800, -4.650),
}
```

Seuls ces trois axes déplacent la hauteur globale du maillage — vérifié
par mesure directe plutôt que supposé ; les axes de circonférence (tour de
poitrine, taille, hanches, épaules) ont un effet nul sur la hauteur,
confirmé et volontairement absents de cette table.

---

## 6. Ce qui a été vérifié, et ce qui ne l'a jamais été

**Vérifié** :
- Les formules s'exécutent sans erreur et produisent des poids dans
  l'intervalle attendu (0 à 1).
- L'application de ces poids côté client (déformation du maillage) a été
  testée hors-device sur les vraies données du fichier GLB de production :
  aucune valeur `NaN`, normales de longueur correcte après recalcul — voir
  `BRIEF_MODELE_CORPOREL_AVATAR.md` pour ce test. Ça prouve que la
  **mécanique** de bout en bout fonctionne, pas que la **forme obtenue
  ressemble à la personne réelle**.
- La correction du bug de carrure (§3) a été vérifiée par recalcul direct
  depuis les CSV ANSUR.

**Jamais vérifié** :
- Aucune comparaison n'a été faite entre l'avatar 3D résultant (une fois
  ce calcul de morphologie appliqué) et une photo ou un relevé réel du
  client correspondant. La validation à 13 sujets camerounais citée en §2
  portait sur les **mensurations en cm prédites** par le modèle Ridge, pas
  sur la **forme 3D** qui en résulte après ce calcul de z-scores et de
  poids de morph targets.
- Les constantes numériques choisies dans ce document — diviseur
  `2 × écart-type`, seuil de bruit `0,02`, gain `0,6` sur les cibles de
  corpulence, coefficients `0,85`/`0,05` pour les fessiers,
  `0,7`/`0,3` pour la poitrine — sont des valeurs choisies/raisonnées, pas
  calées empiriquement contre des résultats visuels ou des mesures
  réelles.
- Aucune vérification spécifique que la référence ANSUR (population
  militaire américaine) est une base statistique appropriée pour cet
  usage précis (transformer un écart à la moyenne en dosage de
  déformation), alors qu'un biais de transfert de population a déjà été
  mesuré ailleurs dans ce même pipeline pour un usage voisin (§2).

---

## 7. Mécanisme d'optimisation (nouveau)

### Principe

L'ancien mécanisme `poids = |z|` supposait qu'un z-score de 0.5 correspond
exactement à la moitié de l'amplitude maximale du morph target. Cette
hypothèse n'a jamais été vérifiée.

Le nouveau mécanisme mesure empiriquement, pour chaque cible, l'effet sur
les mensurations virtuelles du maillage à différents niveaux de poids
(0.0, 0.25, 0.5, 0.75, 1.0). Le résultat est une matrice de sensibilité
qui permet de prédire comment chaque poids affecte chaque mesure.

### Étapes

1. **Calibration hors ligne** (une fois, avec Blender) :
   `calibrate_sensitivity.py` mesure l'effet de chaque cible sur les
   mensurations virtuelles à 5 niveaux de poids.

2. **Optimisation côté serveur** (à chaque requête, millisecondes) :
   `optimize_weights.py` résout un petit problème d'optimisation L2 bornée
   qui minimise l'écart entre les mesures virtuelles et les mesures réelles.

3. **Rendu côté client** (three.js) :
   Le client applique les poids sur `mesh.morphTargetInfluences`.

### Fallback

Si la matrice de sensibilité n'est pas disponible (fichier manquant,
erreur de chargement), le système revient automatiquement à l'ancien
mécanisme `poids = |z|`.

### Fichiers

- `calibrate_sensitivity.py` — script Blender de calibration (hors ligne)
- `optimize_weights.py` — optimisation côté serveur (Python pur)
- `sensitivity/{male,female}.json` — matrices pré-calibrées

### Avantages

- Plus besoin de deviner statistiquement le poids correct
- Le poids est mesuré directement sur le vrai maillage de production
- Compatible avec les contraintes de l'hébergement mutualisé (pas de Blender à l'exécution)

---

## 8. Questions ouvertes pour l'analyse externe

1. Le précédent déjà mesuré (§2 — 1,38 cm sur ANSUR bruité contre 5,2 cm
   sur 13 sujets camerounais réels, pour la prédiction des circonférences)
   s'applique-t-il aussi à ce calcul de z-scores contre ANSUR ? Le
   mécanisme est différent (ici, ANSUR sert de référence de *dispersion*
   pour doser une déformation, pas de base d'entraînement d'un modèle
   prédictif) — est-ce suffisant pour ne pas hériter du même biais, ou la
   distinction est-elle sans effet pratique ?
2. Le modèle de circonférences (§2) a délibérément réduit sa dépendance à
   ANSUR en passant par un socle géométrique indépendant de toute
   population (périmètre d'ellipse mesuré directement). Existe-t-il un
   équivalent géométrique direct pour piloter des morph targets, plutôt
   que de systématiquement passer par un score relatif à une population de
   référence ?
3. Le diviseur `2 × écart-type` et le seuil de bruit `0,02` sont-ils des
   choix raisonnables par défaut, ou faudrait-il les calibrer contre des
   résultats visuels réels (par exemple, en demandant à des sujets connus
   si leur avatar généré leur ressemble, puis en ajustant) ?
4. Dériver les fessiers, la poitrine et la musculature à partir d'autres
   scores plutôt que de mesures directes est-il une simplification
   suffisante, ou une source d'erreur probable qu'il vaudrait mieux
   combler en étendant le pipeline de vision (MediaPipe/MobileSAM) pour
   mesurer ces zones directement ?
5. Existe-t-il une méthode à faible coût pour construire, même petite
   (quelques dizaines de sujets, comme les 13 déjà utilisés en §2), une
   table de référence de population locale à substituer à ANSUR pour ce
   calcul spécifique ?

---

## 9. Changements récents

### Item 1 — Neutralisation de muscle_factor ✅

**Fichier** : `body_params.py`, ligne ~203

`muscle_factor` est désormais toujours à 0.0, quelle que soit la valeur
de `weight_factor`. Les cibles `torso-muscle-pectoral` et `torso-muscle-dorsi`
ne sont plus pilotées.

**Justification** : l'IMC ne mesure pas la composition corporelle (muscle vs
graisse). Rien dans le pipeline de vision ne mesure la musculature. Piloter
ces cibles depuis l'IMC produisait un signal systématiquement faux.

**Impact** : les avatars n'auront plus de variation de musculature. C'est
préférable à une musculature fausse. Réactivation possible quand un signal
réel sera disponible.

### Item 2 — Amélioration des fessiers ✅

**Fichier** : `body_params.py`, ligne ~225

Quand les largeurs/profondeurs SAM sont disponibles, `buttock_scale` est
désormais calculé comme :
```python
buttock_scale = buttock_depth × 0.7 + hip_breadth × 0.3
```

Au lieu de l'ancienne formule :
```python
buttock_scale = hip_scale × 0.85 + 0.05
```

**Justification** : la profondeur de fessiers (mesurée de profil) est le
meilleur proxy de la saillie — c'est exactement ce qu'un tailleur évalue.
Le tour de hanches seul ne distingue pas largeur osseuse vs volume de
projection.

**Fallback** : si les données SAM ne sont pas disponibles, l'ancienne
formule est conservée.

### Item 3 — Mesureur virtuel + matrice de sensibilité ✅

**Fichiers** :
- `calibrate_sensitivity.py` — script Blender de calibration (nouveau)
- `optimize_weights.py` — optimisation côté serveur (nouveau)
- `sensitivity/README.md` — documentation

**Principe** : au lieu de supposer `poids = |z|`, on mesure empiriquement
l'effet de chaque cible sur les mensurations virtuelles du maillage à
5 niveaux de poids. Le résultat est une matrice de sensibilité utilisée
ensuite pour résoudre un petit problème d'optimisation par client.

### Item 4 — Remplacement de poids=|z| par optimisation ✅

**Fichier** : `morph_weights.py`, `optimize_weights.py`

Le système tente désormais :
1. Charger la matrice de sensibilité pour le sexe du client
2. Si disponible, résoudre l'optimisation L2 bornée
3. Sinon, fallback sur l'ancien mécanisme `poids = |z|`

**Avantage** : le poids est maintenant mesuré directement sur le vrai
maillage de production, pas déduit statistiquement d'une population de
référence.

### Item 5 — Cohorte locale camerounaise ⏳

En attente. Explicitement déprioritisé tant que les items 1 à 4 ne sont
pas posés — améliorer la référence de population n'a aucune valeur tant
que le mécanisme z→poids reste lui-même non calibré.
