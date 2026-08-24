# Calibration des poids de morph targets

## Vue d'ensemble

Ce dossier contient la matrice de sensibilité pré-calibrée pour chaque sexe,
utilisée par `optimize_weights.py` pour résoudre le problème d'optimisation
par client.

## Comment ça marche

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
   ```bash
   blender --background --python calibrate_sensitivity.py -- male sensitivity/male.json
   blender --background --python calibrate_sensitivity.py -- female sensitivity/female.json
   ```

2. **Optimisation côté serveur** (à chaque requête, millisecondes) :
   - Le backend charge la matrice de sensibilité
   - Résout un petit problème d'optimisation L2 bornée
   - Renvoie les poids optimaux au client mobile

3. **Rendu côté client** (three.js, `Viewer3D.tsx::bakeMorphTargets`) :
   - Le client applique les poids UNE SEULE FOIS directement sur les
     positions du maillage (pas `mesh.morphTargetInfluences`, qui
     recombinerait les cibles à chaque frame côté GPU pour un résultat qui
     ne change plus après génération — voir le commentaire de la fonction)
   - Pas de calcul lourd, juste une addition de deltas au chargement

### Fallback

Si la matrice de sensibilité n'est pas disponible (fichier manquant,
erreur de chargement), le système revient automatiquement à l'ancien
mécanisme `poids = |z|`.

## Structure des fichiers

```
sensitivity/
├── male.json      # Matrice calibrée pour l'homme
├── female.json    # Matrice calibrée pour la femme
└── README.md      # Ce fichier
```

## Format du JSON

```json
{
  "gender": "male",
  "neutral_height_cm": 165.94,
  "neutral_measurements": {
    "chest": 92.3,
    "waist": 81.5,
    "hips": 93.2,
    ...
  },
  "weight_levels": [0.0, 0.25, 0.5, 0.75, 1.0],
  "sensitivity": {
    "chest_scale": {
      "neutral": { "chest": 92.3, "waist": 81.5, ... },
      "w0.0": { "chest": 92.3, "waist": 81.5, ... },
      "w0.25": { "chest": 94.1, "waist": 81.8, ... },
      "w0.5": { "chest": 96.0, "waist": 82.1, ... },
      "w0.75": { "chest": 97.8, "waist": 82.4, ... },
      "w1.0": { "chest": 99.7, "waist": 82.7, ... }
    },
    "waist_scale": { ... },
    ...
  }
}
```

## Notes techniques

- Le script de calibration tourne **une fois** sur un poste de développement
- Le résultat est **embarqué** avec le backend (fichier statique)
- L'optimisation côté serveur est **rapide** (~ms, algèbre linéaire sur petite matrice)
- Aucun Blender/GPU nécessaire à l'exécution

## Recalibration

Si le maillage de base change (nouvelle version de MakeHuman/MPFB2),
il faut relancer la calibration :

```bash
blender --background --python calibrate_sensitivity.py -- male sensitivity/male.json
blender --background --python calibrate_sensitivity.py -- female sensitivity/female.json
```

Les fichiers JSON sont à committer dans le dépôt.

## Limites connues de la calibration actuelle

- **Seul le sens `-incr` est mesuré.** L'effet de `-decr` est supposé être
  le miroir exact (même amplitude, signe opposé), pas mesuré séparément —
  raisonnable pour les cibles `measure-*` (conçues par paire symétrique),
  moins garanti pour les cibles de forme (torso, fessiers). Voir la
  docstring de `calibrate_sensitivity.py`.
- **Coupe à hauteur fixe (fraction constante de la hauteur totale).** Pour
  les cibles qui changent les PROPORTIONS du corps (`leg_ratio`,
  `torso_ratio`, `back_factor`), le point anatomique réel (entrejambe,
  taille) se déplace par rapport à cette fraction fixe. Cas concret trouvé
  et neutralisé : à partir d'un certain poids, `leg_ratio` fait retomber la
  coupe "hanches" sous l'entrejambe, mesurant les deux cuisses séparées
  (~53 cm) au lieu du bassin (~103 cm) — un garde-fou (`_sanitize_measurements`)
  détecte ce cas (tour mesuré < 70 % du neutre) et le neutralise (delta nul)
  plutôt que d'enregistrer un effondrement de -47 cm comme un effet réel.
  Conséquence pratique : l'axe `leg_ratio` n'apporte actuellement aucune
  correction aux hanches dans l'optimiseur, seulement à la poitrine/taille.
- **Seuls poitrine/taille/hanches/cou sont mesurés** (coupe transversale).
  Bras/cuisse/poignet/cheville ne le sont pas encore (repères anatomiques
  sur les membres à ajouter) — ces mesures continuent d'utiliser l'ancien
  mécanisme `poids = |z|` en repli, jamais l'optimisation.
