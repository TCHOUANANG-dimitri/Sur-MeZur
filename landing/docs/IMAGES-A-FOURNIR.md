# Images de la landing : brief de génération

Toutes les images sortent du même « univers » : même atelier à Douala, mêmes
personnes, même lumière, même palette. Pour garder cette cohérence :

1. Collez le **bloc de style commun** (§1) au début de CHAQUE prompt.
2. Décrivez les personnes **mot pour mot** comme dans la **distribution** (§2).
3. Si votre outil le permet, réutilisez la même graine (seed) ou donnez la
   première image réussie d'une personne comme **image de référence** pour
   les suivantes.
4. Générez 3 ou 4 essais par image et gardez le plus naturel : regardez les
   mains, les doigts, le téléphone et les yeux.

Déposez chaque fichier, en pleine résolution (PNG ou JPG), dans
`landing/photos-src/` sous le nom indiqué. Ce dossier reste hors du dépôt.
La conversion en WebP léger se fait ensuite avec
`node scripts/optimize-photos.mjs`.

---

## 1. Bloc de style commun (à coller en tête de chaque prompt)

> Realistic editorial photograph, shot on a full-frame camera with a 35mm
> lens at f/2.8, soft natural daylight from a large window on the left, warm
> neutral white balance, gentle shadows, natural skin texture, subtle film
> grain, slightly muted natural colours. Setting: a clean, modern tailoring
> workshop in Douala, Cameroon — warm off-white walls, light beige floor
> tiles, a black vintage sewing machine, shelves of folded fabric rolls in
> deep violet and indigo wax prints and white bazin, a tailor's dress form,
> a few green plants. Colour palette dominated by off-white, beige, deep
> violet (#5D06CC) and dark indigo (#08044D), small touches of brass. Calm,
> confident, dignified mood.

**À ajouter à la fin de chaque prompt (négatif)** :

> No text, no letters, no logo, no watermark, no visible app interface (phone
> screens are off, black and glossy), no extra or fused fingers, no distorted
> hands, no plastic skin, no HDR look, no oversaturated colours, no red,
> orange or bright yellow dominant colours, not a cartoon, not a stock-photo
> grin.

Si votre outil a un champ « negative prompt », mettez-y cette phrase.
Sinon, ajoutez-la à la fin du prompt.

## 2. Distribution (toujours les mêmes quatre personnes)

| Rôle | Description à recopier telle quelle |
|---|---|
| **La tailleuse** | *a Cameroonian woman tailor in her early forties, dark brown skin, short natural hair partly covered by a deep violet wax-print headwrap, thin gold-rimmed glasses, a fitted indigo and violet wax-print tunic dress, a cream tape measure draped around her neck* |
| **Le tailleur** | *a Cameroonian man tailor in his early fifties, dark brown skin, shaved head, short greying beard, a dark indigo mandarin-collar shirt with sleeves rolled up, a cream tape measure draped around his neck* |
| **Le client** | *a Cameroonian man around thirty, dark brown skin, short cropped hair, clean-shaven, slim athletic build, wearing a fitted off-white crew-neck t-shirt and fitted beige chino trousers, white sneakers* |
| **La cliente** | *a Cameroonian woman around twenty-six, medium-dark brown skin, long knotless braids tied in a low bun, wearing a fitted black ribbed tank top and dark straight jeans, small gold hoop earrings* |

Le client porte des vêtements près du corps : c'est la tenue que l'application
demande pour la prise de mesure. Gardez la même tenue sur toutes ses images.

---

## 3. Les images

Format = proportions (largeur:hauteur). Taille minimale entre parenthèses.

### 01 · Haut de page : la prise de mesure en atelier
- **Fichier** : `photos-src/01_hero.png` · **3:2 paysage** (2400 × 1600)
- **Usage** : grande photo du haut de page. Une fiche de mesures animée vient
  se poser par-dessus, en bas à droite : gardez ce coin calme (mur, sol).
- **Prompt** : *[style commun]* Wide shot inside the workshop. The client
  stands upright against a plain off-white wall, arms slightly away from his
  body, facing the camera, full body visible from head to sneakers, placed in
  the left half of the frame. In the foreground on the right, the woman tailor
  is seen from behind her right shoulder, holding a smartphone vertically at
  waist height to photograph him, her face in soft profile. Lower right corner
  of the frame is calm empty wall and floor. *[client]* *[tailleuse]* *[négatif]*

### 02 · Étape 1 : photo de face
- **Fichier** : `photos-src/03_how_it_works_face.png` · **9:16 portrait** (1080 × 1920)
- **Usage** : affichée DANS l'écran d'un téléphone (l'animation « comment ça
  marche »), puis en carte. Personne entière, centrée, avec de l'air autour.
- **Prompt** : *[style commun]* Straight-on full-body photo of the client
  standing against the plain off-white wall, facing the camera, feet
  hip-width apart, arms relaxed and held about 15 centimetres away from the
  body, neutral calm expression, camera at waist height, the whole body
  centred from head to feet with generous empty wall above and below, nothing
  else in the frame. *[client]* *[négatif]*

### 03 · Étape 2 : photo de profil
- **Fichier** : `photos-src/04_how_it_works_profile.png` · **9:16 portrait** (1080 × 1920)
- **Usage** : même rôle que la 02, juste après. **Même personne, même mur,
  même cadrage, même lumière que la 02**. Seule la position change.
- **Prompt** : *[style commun]* Straight-on full-body photo of the client
  standing against the same plain off-white wall, turned 90 degrees to his
  left so we see his right side in exact profile, standing straight, arms
  relaxed along the body, looking ahead, camera at waist height, the whole
  body centred from head to feet with generous empty wall above and below,
  nothing else in the frame. *[client]* *[négatif]*

### 04 · Étape 3 : la fiche remise au tailleur
- **Fichier** : `photos-src/05_how_it_works_result_measurements.png` · **4:5 portrait** (1600 × 2000)
- **Usage** : carte de l'étape 3, « vos mesures arrivent ».
- **Prompt** : *[style commun]* Medium shot at the workshop cutting table. The
  client hands his smartphone across the table to the woman tailor, who
  receives it with a warm, focused look; the phone screen is turned away
  from the camera. Between them on the table: folded deep violet wax fabric,
  tailor's chalk and scissors. Both faces visible, natural interaction.
  *[client]* *[tailleuse]* *[négatif]*

### 05 · « Pour les tailleurs »
- **Fichier** : `photos-src/06_for_tailors.png` · **3:2 paysage** (2400 × 1600)
- **Usage** : carte « Votre carnet de clients, enfin dans votre téléphone ».
- **Prompt** : *[style commun]* The man tailor stands at his cutting table,
  checking his smartphone held in one hand, the other hand resting on a
  length of indigo wax fabric marked with tailor's chalk. The black sewing
  machine and the fabric shelves are softly blurred behind him. Confident,
  concentrated expression, three-quarter view, waist-up. *[tailleur]* *[négatif]*

### 06 · « Pour les clients »
- **Fichier** : `photos-src/07_for_clients.png` · **4:5 portrait** (1600 × 2000)
- **Usage** : carte « Faites-vous mesurer sans rendez-vous ». Contrairement
  aux autres, cette scène se passe chez elle et non à l'atelier.
- **Prompt** : *[style commun, en remplaçant le décor par : a bright, tidy
  living room in a Douala apartment, off-white walls, a wooden shelf, a green
  plant, soft daylight]* The client woman places her smartphone upright on a
  wooden shelf at waist height, propped against a small stack of books, to
  take her own photo; she smiles slightly as she steps back. Three-quarter
  view, waist-up, relaxed and at ease. *[cliente]* *[négatif]*

### 07 · Le modèle à transformer en patron
- **Fichier** : `photos-src/10_pattern_garment.png` · **4:5 portrait** (1600 × 2000)
- **Usage** : animation « du modèle en photo au patron » : la photo se
  décompose en pièces (devant, dos, manches). Il faut donc un vêtement **de
  face, droit, symétrique, entier**.
- **Prompt** : *[style commun]* A fitted women's kaba-style dress in deep
  violet and indigo wax print, with short puffed sleeves and a flared knee
  length skirt, displayed on a tailor's dress form, photographed perfectly
  straight-on and centred, the whole garment visible from neckline to hem with
  space around it, plain very light lavender-grey wall behind, no person.
  *[négatif]*

### 08 · Le patron au travail
- **Fichier** : `photos-src/11_pattern_cutting.png` · **3:2 paysage** (2400 × 1600)
- **Usage** : fond ou carte de la section « patron prêt à couper » (pour les
  tailleurs).
- **Prompt** : *[style commun]* Close-up from above at an angle: the woman
  tailor's hands pinning white paper pattern pieces (front, back and sleeve,
  printed with thin grey cutting lines and small notches) onto deep violet wax
  fabric spread on the cutting table, tailor's scissors and a cream tape
  measure beside them. Only her hands, forearms and the edge of her tunic
  visible. *[tailleuse]* *[négatif]*

### 09 · Bandeau de tissu (texture)
- **Fichier** : `photos-src/08_fabric_strip.png` · **3:1 paysage** (3000 × 1000)
- **Usage** : fond très discret des sections sombres et du bas de page.
- **Prompt** : *[style commun, sans décor]* Flat-lay macro photograph of
  neatly overlapping folded fabrics: deep violet and indigo geometric wax
  print, white bazin, a cream tape measure crossing diagonally, a brass
  thimble. Even soft light, no shadows of people, seamless and calm, suitable
  as a subtle background texture. *[négatif]*

### 10 · Appel final : l'atelier
- **Fichier** : `photos-src/12_final_cta.png` · **21:9 très large** (2520 × 1080)
- **Usage** : fond du dernier bloc « Vos mesures sont à deux photos d'ici ».
  Un texte se placera **au centre** : gardez le centre calme.
- **Prompt** : *[style commun]* Very wide shot of the workshop in late
  afternoon light. On the far left, the woman tailor at the sewing machine;
  on the far right, the man tailor adjusting a violet wax garment on the dress
  form. The centre of the frame is open space with the warm off-white wall and
  soft light, out of focus. *[tailleuse]* *[tailleur]* *[négatif]*

### 11 · L'ancienne méthode (facultative)
- **Fichier** : `photos-src/02_problem.png` · **4:5 portrait** (1600 × 2000)
- **Usage** : petite section « avant / après » si nous la gardons : se
  déplacer, attendre, se faire mesurer au mètre ruban.
- **Prompt** : *[style commun]* The man tailor measuring the client's chest
  with a cream tape measure in the workshop, the client standing with arms
  raised slightly, a small notebook with handwritten numbers on the table
  beside them, a wall clock in the background. Realistic and slightly
  tedious moment, both visible from the waist up. *[tailleur]* *[client]* *[négatif]*

---

## 4. À ne PAS générer : vraies captures de l'application

Une capture fabriquée montrerait un produit qui n'existe pas. Je les fais
moi-même sur l'application, avec un compte et des données d'exemple :

- l'écran caméra avec la silhouette guide ;
- le résultat des 12 mesures ;
- la fiche de mesures (PDF) ;
- le carnet de clients du tailleur ;
- une page de patron (PDF).

Jamais avec les photos ou les mesures d'un vrai utilisateur.

## 5. Témoignages

Uniquement de vrais avis, avec l'accord écrit de la personne pour son nom, sa
photo et sa citation. Texte à saisir dans `src/data/testimonials.ts`. Photo
facultative, carrée, 400 × 400 px minimum, dans `public/temoignages/`.

## 6. Ce qui ne demande aucune image

- les animations (silhouette et lignes de mesure, pièces de patron, mètre
  ruban, motif wax) : dessinées en code ;
- l'aperçu de partage (WhatsApp, Facebook) : généré automatiquement ;
- les icônes : déjà dans `public/brand/`.
