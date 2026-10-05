# Sur-MeZur Collecte

Application web (Next.js 15) de **collecte de la vérité terrain** : des
volontaires mesurés au mètre ruban et photographiés selon un protocole fixe.
Ces données servent à évaluer et recalibrer la chaîne de mesure par photo, dont
le rapport identifie le **volume de données** comme le vrai frein
(`RAPPORT_PROJET.md` §6ter et §7, priorité 2 : « collecter 30 à 50 sujets »).

Même branding que l'application web et le mobile : tokens de couleur, polices
Playfair Display et Inter, icônes Lucide, logo. Les feuilles `globals.css`,
`ui.css`, `shell.css`, `auth.css` et `camera.css` sont reprises telles quelles
de `web/`.

## Ce qu'on y fait

| Écran | Rôle | Contenu |
|---|---|---|
| Accueil | agent, admin | statistiques, fiches en attente d'envoi, dernières fiches |
| Nouvelle fiche | agent, admin | 4 étapes : volontaire et consentement → 12 mensurations → photos → vérification |
| Fiches | agent, admin | liste, recherche (code, ville, lieu), filtres ; détail, **modification**, **suppression** |
| Protocole | agent, admin | où et comment prendre chaque mesure, postures photo — consultable hors réseau |
| Export | admin | ZIP (données + photos), CSV Excel, CSV standard, `sujets.json` |
| Équipe | admin | création et désactivation des comptes d'agent |

**Les 12 mesures** sont exactement celles que livre l'application :
tour de cou, poitrine, taille, hanches, bras, cuisse, poignet, cheville,
carrure, longueur de manche, entrejambe, longueur de dos — avec les mêmes clés
que la chaîne (`neck`, `chest`, …), pour que l'export se compare directement à
sa sortie. Taille et poids sont obligatoires (ils servent d'échelle à la
chaîne).

**Photos** : face et profil, toutes deux obligatoires (postures de la
production : bras écartés de face, bras collés le long du corps de profil).
Caméra dans la page avec silhouette de cadrage et
retardateur (3 s / 10 s), ou import depuis la galerie. Réduites à 2048 px /
JPEG 0,90 (~0,5 Mo) avant stockage.

## Hors ligne

La saisie **ne dépend jamais du réseau** :

- le formulaire en cours est enregistré en continu sur le téléphone
  (brouillon IndexedDB) et repris s'il est fermé ;
- « Enregistrer » place la fiche **et ses photos** dans une file locale, qui
  part dès que le serveur répond (au retour du réseau, toutes les minutes, ou
  sur « Envoyer maintenant ») ;
- chaque fiche porte un identifiant généré sur l'appareil : un renvoi après
  coupure ne crée jamais de doublon côté serveur ;
- une fiche n'est effacée du téléphone qu'une fois tout reçu par le serveur.

⚠️ Ne pas vider les données du navigateur tant que l'accueil affiche des
fiches « À envoyer ».

## Où sont les données

Sur le backend existant (O2Switch), pas dans cette application :

| Quoi | Où |
|---|---|
| Fiches | tables `dataset_subjects` et `dataset_photos` (même base SQLite) |
| Photos | `DATASET_DIR` (défaut `backend/dataset_store/SMZ-0001/SMZ-0001_face.jpg`) — hors de `/uploads`, jamais servi en statique |
| API | `backend/app/api/v1/collecte.py`, préfixe `/api/collecte` |
| Protocole (bornes, clés) | `backend/app/services/collecte_protocol.py` et `src/lib/protocol.ts` — à garder alignés |

Chaque volontaire n'est identifié que par un code `SMZ-0001`. Son nom (preuve
du consentement) reste dans la base et **n'est jamais exporté**.

## Récupérer les données pour le modèle

Depuis le poste de travail, synchronisation incrémentale (compte admin) :

```bash
python ml/scripts/telecharger_collecte.py
# -> ml/data/collecte/sujets.json, sujets.csv, photos/
python ml/bench/pipeline_ameliore.py ml/data/collecte/sujets.json ml/data/collecte/photos/
```

`sujets.json` suit exactement le format de
`ml/bench/nouveaux_sujets_exemple.json` et ne contient que les fiches
**complètes** (le banc plante sur une mesure manquante). `sujets.csv` contient
toutes les fiches. `ml/data/collecte/` est exclu de git.

## Lancer en local

```bash
# backend (depuis backend/)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# collecte (depuis collecte/)
npm install
npm run dev          # http://localhost:3001, /api relayé vers localhost:8000
```

La caméra dans la page exige HTTPS (ou `localhost`) ; ailleurs, l'application
retombe sur l'appareil photo natif du téléphone.

## Déployer (Vercel)

Même montage que `web/` (voir `web/DEPLOIEMENT_VERCEL.md`) : un **second
projet Vercel** sur le même dépôt, avec **Root Directory : `collecte`** et la
variable `API_ORIGIN=http://api.gitingeniering.com`. Les appels passent par la
réécriture serveur de `next.config.ts` : pas de CORS, et pas de blocage
« contenu mixte » malgré l'API en HTTP.

Côté serveur, voir la section « CAMPAGNE DE COLLECTE » de `DEPLOIEMENT.txt`
(variable `DATASET_DIR`, sauvegarde du dossier photos). Aucune migration
manuelle : les tables sont créées au démarrage.

Premier accès : se connecter avec le compte administrateur, puis onglet
**Équipe** pour créer les comptes des agents.
