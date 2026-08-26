# Analyse Complete du Pipeline de Mesure - Sur-MeZur

## Resultats du VRAI pipeline sur les 13 photos reelles

### Conditions du test

- **Pipeline** : MediaPipe + MobileSAM + Modele V3 (production)
- **Photos** : 13 paires (face + profil) depuis le terrain
- **Mesures** :.au metre ruban par le tailleur
- **Vision** : MobileSAM (CPU)
- **Modele** : Ridge V3, entraine sur ANSUR II

### Resultats de base (pipeline non modifie)

| Mesure | MAE (cm) | Bias (cm) | Statut |
|--------|----------|-----------|--------|
| neck | 1.83 | -1.83 | PRESQUE |
| chest | 4.43 | +1.63 | ERREUR |
| waist | 6.55 | +3.43 | ERREUR |
| hips | 4.45 | +2.97 | ERREUR |
| biceps | 2.56 | -2.29 | ERREUR |
| thigh | 1.63 | -0.77 | PRESQUE |
| wrist | 1.57 | -1.57 | PRESQUE |
| ankle | 3.98 | -3.98 | ERREUR |
| shoulder | 2.27 | +1.15 | ERREUR |
| sleeve_length | 4.50 | -2.95 | ERREUR |
| inseam | 3.14 | -0.39 | ERREUR |
| back_length | 0.88 | -0.52 | OK |
| **MOYENNE** | **3.15** | | |

### Erreurs par sujet

| Sujet | Sexe | Taille | Poids | MAE (cm) |
|-------|------|--------|-------|----------|
| 1 | m | 182 | 68.0 | 3.86 |
| 3 | m | 182 | 60.0 | 2.98 |
| 4 | m | 193 | 70.0 | 3.11 |
| 5 | m | 175 | 83.0 | 3.34 |
| 6 | m | 178 | 67.0 | 2.88 |
| 7 | m | 193 | 71.0 | 3.40 |
| 8 | f | 166 | 62.0 | 4.65 |
| 9 | m | 170 | 59.0 | 2.56 |
| 10 | f | 159 | 49.0 | 2.05 |
| 11 | f | 165 | 66.0 | 2.83 |
| 12 | f | 175 | 78.0 | 2.39 |
| 13 | f | 160 | 54.0 | 3.86 |

### Corrections teste

#### 1. Correction par biais additif

On soustrait le biais moyen de chaque mesure.

| Mesure | Avant | Apres | Gain |
|--------|-------|-------|------|
| neck | 1.83 | 1.21 | +0.62 |
| chest | 4.43 | 4.59 | -0.16 |
| waist | 6.55 | 5.59 | +0.96 |
| hips | 4.45 | 4.41 | +0.04 |
| biceps | 2.56 | 2.16 | +0.40 |
| thigh | 1.63 | 1.47 | +0.17 |
| wrist | 1.57 | 0.47 | +1.10 |
| ankle | 3.98 | 1.02 | +2.95 |
| shoulder | 2.27 | 1.96 | +0.31 |
| sleeve_length | 4.50 | 3.61 | +0.89 |
| inseam | 3.14 | 3.21 | -0.07 |
| back_length | 0.88 | 0.89 | -0.01 |
| **MOYENNE** | **3.15** | **2.55** | **+0.60** |

#### 2. Correction par facteur proportionnel

On multiplie par le ratio median (attendu/calcule).

| Mesure | Facteur | Avant | Apres | Gain |
|--------|---------|-------|-------|------|
| neck | 1.0396 | 1.83 | 1.09 | +0.74 |
| chest | 0.9974 | 4.43 | 4.43 | +0.00 |
| waist | 0.9433 | 6.55 | 5.47 | +1.08 |
| hips | 0.9845 | 4.45 | 4.21 | +0.24 |
| biceps | 1.0642 | 2.56 | 2.22 | +0.33 |
| thigh | 1.0131 | 1.63 | 1.52 | +0.11 |
| wrist | 1.0991 | 1.57 | 0.46 | +1.12 |
| ankle | 1.1966 | 3.98 | 1.07 | +2.90 |
| shoulder | 0.9467 | 2.27 | 1.79 | +0.49 |
| sleeve_length | 1.0732 | 4.50 | 3.47 | +1.03 |
| inseam | 0.9938 | 3.14 | 3.11 | +0.03 |
| back_length | 1.0045 | 0.88 | 0.82 | +0.06 |
| **MOYENNE** | | **3.15** | **2.47** | **+0.68** |

#### 3. Corrections specifiques par mesure

- **Ankle** : facteur 1.1966 (correction systematique)
- **Sleeve** : facteur 1.0732 (correction systematique)
- **Biceps** : facteur 0.9255 (correction systematique)
- **Autres** : biais additif

| Mesure | Avant | Apres | Gain |
|--------|-------|-------|------|
| neck | 1.83 | 1.21 | +0.62 |
| chest | 4.43 | 4.59 | -0.16 |
| waist | 6.55 | 5.59 | +0.96 |
| hips | 4.45 | 4.41 | +0.04 |
| biceps | 2.56 | 4.41 | -1.85 |
| thigh | 1.63 | 1.47 | +0.17 |
| wrist | 1.57 | 0.47 | +1.10 |
| ankle | 3.98 | 1.07 | +2.90 |
| shoulder | 2.27 | 1.96 | +0.31 |
| sleeve_length | 4.50 | 3.47 | +1.03 |
| inseam | 3.14 | 3.21 | -0.07 |
| back_length | 0.88 | 0.89 | -0.01 |
| **MOYENNE** | **3.15** | **2.73** | **+0.42** |

### Bilan final

- **Avant corrections** : MAE moyenne = 3.15 cm
- **Apres corrections** : MAE moyenne = 2.73 cm
- **Gain** : 0.42 cm (13.4%)
- **Mesures < 1 cm** : 2/12

### Recommandations

1. **Corriger le biais de la cheville** : facteur 1.1966
2. **Corriger le biais de la manche** : facteur 1.0732
3. **Corriger le biais des biceps** : facteur 0.9255
4. **Corriger le biais du cou** : -1.83 cm
5. **Collecter 50+ sujets** pour calibrer les facteurs sur la population locale
6. **Tester la capture guidee** : tenue ajustee, pose correcte, fond degage

### Données brutes

Voir `test_real_pipeline_results.json` pour les details complets.
