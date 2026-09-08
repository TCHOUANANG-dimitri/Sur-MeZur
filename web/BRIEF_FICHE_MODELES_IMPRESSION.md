# Brief — Mise en page d'impression de la fiche des modèles

> Document destiné à un agent qui démarre sans contexte sur ce dépôt.
> Tout ce qui est nécessaire est ici.

---

## 1. La demande, en une phrase

Sur la **fiche des modèles imprimée**, les visuels doivent être **aussi grands
que possible** pour que le tailleur voie bien le vêtement : **deux modèles par
page maximum**, occupant réellement l'espace disponible. Au-delà de deux, la
fiche continue naturellement sur les pages suivantes.

Aujourd'hui les modèles s'impriment en petites vignettes de 92 × 122 px
empilées les unes sous les autres — illisible pour juger d'une coupe.

---

## 2. Le dépôt

Racine du travail : `c:\Users\Admin\Desktop\Sur-MeZur\Sur-MeZur-App\web`

Application **Next.js 15** (App Router, TypeScript, dossier `src/`, alias
`@/*`). Dépôt git autonome, distant `korah-agency/Sur-MeZur-web-App`.

C'est la version web de Sur-MeZur, une application camerounaise de mise en
relation entre clients et tailleurs. Le client prend deux photos de lui, une
chaîne de vision en extrait ses mensurations, et il repart avec **deux
documents distincts à imprimer** :

1. **la fiche de mesures** — ses douze mensurations expliquées ;
2. **la fiche des modèles** — les vêtements qu'il veut faire coudre.

**C'est la seconde qui te concerne.** Ne touche pas à la première.

### Pourquoi deux documents et pas un

Un tailleur imprime volontiers une liste de chiffres, beaucoup moins des
photos pleine page. Les mélanger aurait forcé l'impression des visuels à
chaque fois. Cette séparation est délibérée — ne la remets pas en cause.

### Pourquoi de l'impression navigateur et pas un PDF serveur

Aucune bibliothèque PDF n'est installée côté backend, et l'hébergement
mutualisé n'a ni Cairo ni Pango (ce qui exclut WeasyPrint). La mise en page
est donc du **HTML piloté par `@media print`**, et le « Enregistrer en PDF »
natif du navigateur produit le fichier. Cela fonctionne sur Android, iOS et
ordinateur.

---

## 3. Les deux fichiers à modifier

### `src/app/(client)/mesures/[id]/modeles/page.tsx`

La page de la fiche. Le balisage actuel de la liste :

```tsx
{models.map((m) => (
  <section key={m.id} className="ficheModelBlock">
    {m.photo_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={m.photo_url} alt="" className="ficheModelImage" />
    ) : (
      <span className="ficheModelImage" style={{ background: m.thumbnail_color }} aria-hidden />
    )}
    <div className="ficheModelBody">
      <h2 className="ficheModelName">{m.name}</h2>
      {m.category?.name && <p className="ficheModelCat">{m.category.name}</p>}
      {m.description && <p className="ficheModelDesc">{m.description}</p>}
      {m.style_tags?.length > 0 && (
        <p className="ficheModelTags">{m.style_tags.join(" · ")}</p>
      )}
    </div>
  </section>
))}
```

Cette liste est précédée d'un `<header className="ficheHeader">` (marque,
titre, nom du client, date d'édition, numéro de prise de mesures) et suivie
d'un `<footer className="ficheFooter">`. Le tout est dans
`<article className="fiche">`.

Au-dessus de l'article, deux blocs portent la classe `no-print` et
**disparaissent donc à l'impression** : `.ficheSwitch` (renvoi vers l'autre
fiche) et `.ficheActions` (le bouton « Enregistrer en PDF »).

### `src/styles/mesures.css`

Section `/* --- Fiche des modeles (second document) --- */`. État actuel des
règles d'impression, **c'est ce qu'il faut remplacer** :

```css
@media print {
  .ficheModelBlock { break-inside: avoid; }
  .ficheModelImage { width: 92px; height: 122px; }
}
```

---

## 4. Ce qu'il faut obtenir

### 4.1 Deux modèles par page, pas plus

Force une rupture de page après chaque deuxième modèle.

**Piège à éviter :** `break-after: page` sur le dernier élément produit une
page blanche finale. Exclus-le, par exemple avec
`:nth-of-type(2n):not(:last-child)`.

### 4.2 Chaque modèle occupe réellement la moitié de la page

Donne à `.ficheModelBlock` une hauteur exprimée en **millimètres**, seule
unité fiable à l'impression. Repères de calcul :

| | |
|---|---|
| Format | A4, 210 × 297 mm |
| Marges (`@page` dans `globals.css`) | 14 mm haut/bas, 12 mm gauche/droite |
| Surface imprimable | **186 × 269 mm** |
| En-tête `.ficheHeader` | ~30 mm, **sur la première page uniquement** |
| Pied `.ficheFooter` | ~15 mm, sur la dernière page uniquement |

Deux modèles doivent tenir sur la première page **malgré l'en-tête**. Deux
options, à toi de trancher et de justifier ton choix en commentaire :

- une hauteur unique (~115 mm) qui laisse un peu de blanc sur les pages
  suivantes, mais reste simple et prévisible ;
- une hauteur plus grande (~132 mm) sur les pages sans en-tête, obtenue en
  ciblant les blocs à partir du troisième.

La première option est plus robuste ; la seconde exploite mieux le papier.

### 4.3 L'image doit être grande et **entière**

C'est le cœur de la demande. L'image doit remplir la hauteur du bloc.

**Utilise `object-fit: contain`, surtout pas `cover`.** Le tailleur doit voir
le vêtement en entier : un recadrage qui coupe une manche ou un ourlet rend le
document inutile. C'est le même raisonnement que sur la fiche modèle du
mobile, qui affiche déjà ses visuels en `contain`.

Répartition suggérée dans le bloc : l'image occupe environ 55 à 65 % de la
largeur, le texte le reste. Adapte si le rendu te paraît meilleur autrement.

### 4.4 Un modèle n'est jamais coupé entre deux pages

`break-inside: avoid` sur `.ficheModelBlock` — déjà présent, à conserver.

### 4.5 Le rendu à l'écran reste lisible

La page sert aussi de prévisualisation. Elle n'a pas à imiter le papier au
pixel près, mais elle doit rester agréable : sous 519 px de large, le bloc
passe déjà en colonne (`flex-direction: column`), conserve ce comportement.

**N'applique pas les hauteurs en millimètres hors `@media print`** — elles
n'ont aucun sens à l'écran.

---

## 5. Contraintes

### 5.1 Fichiers à ne pas toucher

```
src/styles/globals.css     tokens CSS et regles @page
src/styles/shell.css       coquille responsive
src/styles/ui.css          kit d'interface
src/styles/mobile.css      ajustements telephone
src/components/**          composants partages
src/lib/**                 API, mesures, selection
src/app/(client)/mesures/[id]/fiche/**    l'AUTRE fiche
src/app/admin/**           section administrateur
```

Tu ne modifies que `mesures.css` (section fiche des modèles) et
`modeles/page.tsx`. Si le balisage actuel ne se prête pas à la mise en page
visée, tu peux le restructurer — c'est même attendu.

### 5.2 Tokens et conventions

Couleurs et rayons disponibles en variables CSS : `--violet-primary`,
`--indigo-text`, `--border`, `--text-secondary`, `--bg-alt`, `--surface`,
`--radius-card`, `--font-display`, `--gutter`. **N'écris aucune couleur en
dur.**

- Interface **en français**, avec accents.
- **Commentaires de code sans accents** — convention suivie par tout le dépôt.
- Commente le **pourquoi**, jamais le **quoi**. Pas de bannière décorative.
- `"use client";` en première ligne de tout composant à hooks.

---

## 6. Vérification

```bash
cd web
npx tsc --noEmit      # doit passer
npm run dev           # puis ouvrir la page et faire Ctrl+P
```

Pour atteindre la page il faut un compte client, une prise de mesures, et au
moins **trois modèles** dans la sélection — c'est le seul moyen de voir la
rupture de page à l'œuvre. La sélection est conservée dans `localStorage`
sous la clé `sm_model_selection` (voir `src/lib/selection.ts`) : tu peux
l'alimenter à la main depuis la console du navigateur avec des identifiants
récupérés via `GET /api/models`.

**Regarde l'aperçu d'impression, ce n'est pas optionnel.** Le typecheck ne
dit rien d'une mise en page. Vérifie précisément :

1. exactement deux modèles sur la première page, en-tête compris ;
2. exactement deux sur chaque page suivante ;
3. **aucune page blanche finale** ;
4. aucun modèle coupé en deux ;
5. les images entières, non recadrées, et nettement plus grandes qu'avant ;
6. avec un seul modèle : une seule page, sans blanc absurde.

Ne lance pas `npm run build`, c'est long et inutile ici.

---

## 7. Compte rendu attendu

Court et factuel :

1. les fichiers modifiés ;
2. l'option retenue au §4.2 et pourquoi ;
3. ce que tu as **réellement vu** dans l'aperçu d'impression, cas par cas
   selon la liste du §6 ;
4. ce qui reste imparfait.

Distingue explicitement **ce que tu as vérifié** de **ce que tu supposes**. Ne
présente jamais une mise en page non regardée comme fonctionnelle.
