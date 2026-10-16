# GarmentCode (copie partielle)

Source : https://github.com/maria-korosteleva/GarmentCode
Commit : `d449629979028123a5c4dc9e732a2ec19b7fce31` (29 juin 2025)
Licence : MIT, voir `LICENSE` (Copyright (c) 2024 Maria Korosteleva). La
licence autorise l'usage commercial, la copie et la modification à condition
de garder ce fichier LICENSE.

## Ce qui est copié

- `pygarment/__init__.py`, `pygarment/garmentcode/` : le langage de patrons
  (bords, panneaux, interfaces, coutures).
- `pygarment/pattern/{core,rotation,utils,wrappers}.py` : le format JSON du
  patron et sa sérialisation.
- `assets/garment_programs/` : les programmes de vêtements (jupes, corsage,
  manches, pantalon, ceintures, cols). `stats_utils.py` n'est pas copié.
- `assets/bodies/body_params.py`, `mean_female.yaml`, `mean_male.yaml` : la
  définition des mesures du corps et les deux corps moyens (gabarits).
- `assets/design_params/default.yaml` : tous les paramètres de style et leurs
  plages.

## Ce qui n'est pas copié

La simulation 3D (NVIDIA Warp, licence non commerciale), l'interface
graphique, `mayaqltools`, `meshgen`, `data_config.py`, les DLL cairo pour
Windows, les jeux de données.

## Modifications

Une seule, dans `pygarment/pattern/wrappers.py`, marquée `[Sur-MeZur]` :
CairoSVG, matplotlib et `data_config` (psutil) sont importés seulement dans les
fonctions de rendu PNG/PDF/3D qui s'en servent. Sur-MeZur n'appelle pas ces
fonctions (export maison : `app/services/patrons/export.py`) ; il n'a donc
besoin ni de la bibliothèque C cairo ni de matplotlib sur le serveur.

## Mettre à jour

Recopier les mêmes fichiers depuis un nouveau commit, réappliquer la
modification ci-dessus, puis lancer `python -m tests.test_patrons`.
