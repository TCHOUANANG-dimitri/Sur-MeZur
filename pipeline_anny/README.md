# Nouvelle chaîne de mesure — modèle-pivot Anny

Implémentation de la spécification *Étape de prise de mesure — Spécification
technique de développement* (`Documentation/sur-mezur_mesure_spec_developpement.pdf`,
septembre 2026), testée sur les 20 sujets pilotes du dépôt et comparée à la
chaîne actuelle. **Rien ici n'est branché sur la production.**

Résultats : [`resultats/RESULTATS.md`](resultats/RESULTATS.md).

## Ce qui est implémenté

| Brique de la spec (§2) | Ici | Fichier |
|---|---|---|
| BlazePose + masque de silhouette | **réutilisés tels quels** depuis la production (MediaPipe + MobileSAM) | `perception/extraire_observations.py` |
| Échelle (taille utilisateur) | idem production (cm/pixel ancré sur la taille) | idem |
| Modèle-pivot Anny | Anny 0.6.1 (Apache 2.0), via clad-body | `anny_pipeline/corps.py` |
| Voie B — régresseur pré-entraîné | **remplacée** par l'a priori anthropométrique d'Anny (taille + poids) — voir « Écarts » | `anny_pipeline/ajustement.py::initialiser` |
| Voie A — ajustement | taille, masse, silhouette **comme borne** (face + profil), landmarks (longueurs de segments), a priori de forme | `anny_pipeline/ajustement.py::ajuster` |
| Extraction ISO 8559 | clad-body (ISO 8559-1) + tour de cheville calculé ici | `anny_pipeline/mesures.py` |
| Calibration locale (phase 1) | a·x+b par mesure, évaluée en validation croisée | `anny_pipeline/calibration.py` |
| Comparaison | même verite terrain, mêmes photos, même métrique que `ml/bench` | `comparer.py`, `anny_pipeline/evaluation.py` |

Phases de la spec couvertes : **0** (partiellement, sans régresseur photo),
**1** et **2**. La phase 3 (vêtement ample : segmentation peau/vêtement,
auto-mesures, multi-pose) et la phase 4 (fine-tuning) ne sont pas
implémentées : elles exigent des données qui n'existent pas encore (paires
ajusté/ample, auto-mesures — Jeux 1 et 2).

## Écarts avec la spécification, et pourquoi

1. **Pas de régresseur photo pré-entraîné (voie B).** SAM 3D Body exige une
   autorisation d'accès aux poids sur Hugging Face (à demander avec votre
   compte : `facebook/sam-3d-body-vith`), detectron2 (à compiler, impossible
   sans compilateur C++ sur ce poste) et 631 à 840 M de paramètres sans
   GPU. SHAPY repose sur SMPL-X (licence non commerciale). L'initialisation
   utilise donc l'a priori d'Anny pour la taille et le poids mesurés ; la
   voie A fait le reste. Une fois les poids obtenus, la sortie MHR de SAM
   3D Body devra être convertie en paramètres Anny (`anny.AnnyInverter`,
   ou clad-body qui lit aussi les corps MHR) pour remplacer `initialiser`.
2. **Pas de rendu différentiable PyTorch3D.** Non installable ici. Son rôle
   (comparer la silhouette du corps à celle de la photo) est tenu par la
   comparaison tranche par tranche des largeurs (face) et profondeurs
   (profil) du tronc, bras exclus — l'information que la silhouette porte
   sur les tours.
3. **Landmarks comparés en longueurs de segments**, pas en positions 2D :
   pas de pose ni de caméra à estimer par photo, et une longueur ne dépend
   pas de la pose.

## Lancer

Deux environnements Python (MediaPipe ne suit pas Python 3.12, clad-body
l'exige) :

```bash
# 1. Perception + chaîne actuelle de référence (venv du backend, Python 3.10)
backend\venv\Scripts\python.exe pipeline_anny\perception\extraire_observations.py

# 2. Nouvelle chaîne Anny (venv de ce dossier, Python 3.12)
pipeline_anny\.venv\Scripts\python.exe pipeline_anny\executer.py

# 3. Calibration locale + comparaison
pipeline_anny\.venv\Scripts\python.exe pipeline_anny\comparer.py
```

Installer l'environnement de ce dossier (Python 3.12 via `uv`, tout sur F: car
C: est plein) :

```bash
uv python install 3.12
uv venv pipeline_anny\.venv --python 3.12
uv pip install --python pipeline_anny\.venv\Scripts\python.exe -r pipeline_anny\requirements.txt
```

Variables utiles : `ANNY_CACHE_DIR` (cache d'Anny, ~200 Mo, 17 min à
construire la première fois sur ce poste), `WARP_CACHE_PATH`.

Les réglages (poids des termes du coût, étapes, leviers libres) sont tous
dans `anny_pipeline/config.py`.
