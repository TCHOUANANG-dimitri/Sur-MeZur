# Entraînement des modèles de mensurations

`scripts/train_v3.py` produit les artefacts `.joblib` déployés dans
`backend/app/ml/models/`.

Les données brutes (ANSUR II) ne sont pas versionnées ici : elles se placent
dans `data/raw/ANSUR_II_MALE.csv` et `data/raw/ANSUR_II_FEMALE.csv`.
ANSUR II est publié par l'US Army et relève du domaine public.

    python -m scripts.train_v3
