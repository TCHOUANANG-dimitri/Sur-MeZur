# Images à fournir pour la page d'accueil

La page est **complète sans ces images** : chaque emplacement a une
illustration de remplacement. Dès qu'un fichier est déposé au bon endroit, il
est utilisé automatiquement à la construction suivante (`npm run build` ou
redéploiement). Aucun code à modifier.

Les photos déjà en place (haut de page, trois étapes, clients, tailleurs)
restent bonnes : rien à refaire.

---

## 1. Photo d'un modèle de vêtement — section « Patron, bientôt »

| | |
|---|---|
| **Où la déposer** | `photos-src/10_pattern_garment.png` (fichier source, PNG ou JPG) |
| **Ensuite** | lancer `node scripts/optimize-photos.mjs` : il crée `public/photos/pattern-garment.webp` |
| **Format** | vertical **4:5**, au moins **1600 × 2000 px** |
| **Remplace** | la robe dessinée à gauche des pièces de patron |
| **Rôle** | montrer « la photo du modèle » à partir de laquelle le patron sera fait |

Ce qu'elle doit montrer : un vêtement **entier et bien lisible**, tel qu'une
cliente le montrerait à son tailleur. Par exemple une robe ou un kaba en wax,
porté ou sur un mannequin, sur un fond clair et uni. Les couleurs dominantes
doivent rester proches de la charte : violet profond et indigo, sans autre
couleur vive.

Si vous la générez, prompt proposé :

> Full-length photo of a fitted wax-print dress on a tailor's dress form,
> deep violet and indigo African print, plain very light lavender-grey wall,
> soft natural daylight, the whole garment visible from neckline to hem, no
> person's face, no text, no logo, editorial and realistic, 4:5 vertical.

---

## 2. Capture d'écran réelle du résultat — section « Les 12 mesures »

| | |
|---|---|
| **Où la déposer** | `public/screens/resultat.png` (créer le dossier `screens`) |
| **Format** | capture **de téléphone**, environ **760 × 1640 px** (écran de 380 px de large en ×2) |
| **Remplace** | la silhouette annotée (valeurs d'exemple) |
| **Rôle** | preuve réelle : le visiteur voit le vrai écran qu'il obtiendra |

**À ne pas générer** : ce doit être une vraie capture de l'application
(`/mesures/<id>` après une mesure, sur `sur-me-zur.vercel.app`), prise sur un
téléphone ou avec l'émulation mobile du navigateur. Une image fabriquée
montrerait un produit qui n'existe pas. Utilisez un compte de test : aucun nom
ni numéro réel ne doit apparaître.

---

## 3. Témoignages (quand vous en aurez) — section « Ils l'utilisent »

| | |
|---|---|
| **Texte** | à saisir dans `src/data/testimonials.ts` (citation FR + EN, nom, rôle et quartier) |
| **Photo (facultative)** | `public/temoignages/<prenom>.webp`, **carrée**, 400 × 400 px minimum |
| **Rôle** | preuve sociale juste avant les questions fréquentes |

La section n'apparaît que lorsqu'au moins un témoignage est saisi.
**Uniquement de vrais avis**, avec l'accord écrit de la personne pour son nom,
sa photo et sa citation.

---

## Ce qui n'a pas besoin d'image

- **Aperçu de partage** (WhatsApp, Facebook, LinkedIn) : généré
  automatiquement dans la langue de la page (`src/app/[locale]/opengraph-image.tsx`).
- **Icônes de l'application** : déjà dans `public/brand/`.
- **Pièces de patron** : dessinées en SVG et animées, pas de photo nécessaire.

## Règle commune

Personnes, peaux, tissus et ateliers crédibles pour Douala et l'Afrique
centrale. Lumière naturelle, fond clair, violet profond comme seule couleur
forte. Aucun texte ni logo dans l'image.
