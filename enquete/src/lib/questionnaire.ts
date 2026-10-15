/**
 * Contenu du questionnaire « patrons » et forme des donnees enregistrees.
 *
 * C'est le contrat entre ce que le tailleur remplit et ce que le futur moteur
 * de patrons lira (colonne `enquete_modeles.data`, `schema_version` = 1).
 * Toute modification de forme doit incrementer SCHEMA_VERSION cote backend
 * (app/api/v1/enquete.py) pour que les anciennes fiches restent lisibles.
 *
 * Les cles de mesures reprennent celles de la chaine de mesure par photo
 * (neck, chest, waist, ...) : les fiches se comparent directement a ce que
 * l'application mesure.
 */

export type Choice = { value: string; label: string };

export interface FicheData {
  general: {
    nom?: string;
    categorie?: string;
    pour?: string;
    fois_cousu?: string;
    difficulte?: string;
    temps_heures?: number | null;
    description?: string;
  };
  personne: {
    origine?: "reelles" | "estimees";
    sexe?: string;
    taille_cm?: number | null;
    poids_kg?: number | null;
    mesures: Record<string, number | null>;
    autres_mesures: { nom: string; valeur: number | null }[];
  };
  prise: Record<string, { lieu?: string; precision?: string }>;
  pieces: { nom: string; nombre: number | null; au_pli: boolean; notes?: string }[];
  aisance: Record<string, { ajuste?: number | null; normal?: number | null; ample?: number | null }>;
  aisance_notes?: string;
  marges: { cotes?: number | null; ourlet?: number | null; encolure_emmanchure?: number | null; ceinture?: number | null; notes?: string };
  variantes: { longueurs: string[]; manches: string[]; encolures: string[]; fermetures: string[]; poches: string[]; autres?: string };
  tissus: { conseilles: string[]; metrage_m?: number | null; notes?: string };
  trace: { etapes?: string };
  retouches: { frequentes?: string; conseils?: string };
}

export function ficheVide(): FicheData {
  return {
    general: {},
    personne: { mesures: {}, autres_mesures: [] },
    prise: {},
    pieces: [],
    aisance: {},
    marges: {},
    variantes: { longueurs: [], manches: [], encolures: [], fermetures: [], poches: [] },
    tissus: { conseilles: [] },
    trace: {},
    retouches: {},
  };
}

/** Complete une fiche lue en base avec les cles manquantes (fiche ancienne ou vide). */
export function normaliser(d: Partial<FicheData> | undefined): FicheData {
  const v = ficheVide();
  const x = d ?? {};
  return {
    ...v,
    ...x,
    general: { ...v.general, ...(x.general ?? {}) },
    personne: { ...v.personne, ...(x.personne ?? {}), mesures: { ...(x.personne?.mesures ?? {}) }, autres_mesures: x.personne?.autres_mesures ?? [] },
    prise: { ...(x.prise ?? {}) },
    pieces: x.pieces ?? [],
    aisance: { ...(x.aisance ?? {}) },
    marges: { ...(x.marges ?? {}) },
    variantes: { ...v.variantes, ...(x.variantes ?? {}) },
    tissus: { ...v.tissus, ...(x.tissus ?? {}) },
    trace: { ...(x.trace ?? {}) },
    retouches: { ...(x.retouches ?? {}) },
  };
}

export const CATEGORIES: Choice[] = [
  { value: "jupe", label: "Jupe" },
  { value: "robe", label: "Robe" },
  { value: "kaba", label: "Kaba" },
  { value: "boubou", label: "Boubou" },
  { value: "chemise", label: "Chemise" },
  { value: "haut", label: "Haut / blouse" },
  { value: "pantalon", label: "Pantalon" },
  { value: "ensemble", label: "Ensemble" },
  { value: "autre", label: "Autre" },
];

export const POUR: Choice[] = [
  { value: "femme", label: "Femme" },
  { value: "homme", label: "Homme" },
  { value: "enfant", label: "Enfant" },
  { value: "mixte", label: "Les deux" },
];

/** Volontairement sans « jamais » ni « une fois » : on ne recueille que des
 *  modeles que le tailleur maitrise. */
export const FOIS_COUSU: Choice[] = [
  { value: "2-5", label: "2 à 5 fois" },
  { value: "6-20", label: "6 à 20 fois" },
  { value: "20+", label: "Plus de 20 fois" },
];

export const DIFFICULTE: Choice[] = [
  { value: "simple", label: "Simple" },
  { value: "moyen", label: "Moyen" },
];

export const SPECIALITES: string[] = [
  "Robes", "Jupes", "Kaba", "Boubou", "Chemises", "Pantalons", "Tenues traditionnelles",
  "Mariage", "Enfants", "Uniformes", "Retouches",
];

export interface Mesure {
  key: string;
  label: string;
  /** Ou la prend-on : choix proposes au tailleur (plus « autre »). */
  lieux?: Choice[];
}

export const MESURES: Mesure[] = [
  { key: "neck", label: "Tour de cou", lieux: [
    { value: "base_cou", label: "À la base du cou" },
    { value: "milieu_cou", label: "Au milieu du cou" },
  ] },
  { key: "chest", label: "Tour de poitrine", lieux: [
    { value: "plus_fort", label: "Au plus fort de la poitrine" },
    { value: "sous_bras", label: "Sous les bras, ruban horizontal" },
  ] },
  { key: "underbust", label: "Tour sous-poitrine", lieux: [
    { value: "sous_seins", label: "Juste sous la poitrine" },
  ] },
  { key: "waist", label: "Tour de taille", lieux: [
    { value: "creux", label: "Au creux de la taille (le plus fin)" },
    { value: "nombril", label: "Au niveau du nombril" },
    { value: "ceinture", label: "Là où se pose la ceinture" },
  ] },
  { key: "hips", label: "Tour de hanches", lieux: [
    { value: "plus_fort_fesses", label: "Au plus fort des fesses" },
    { value: "os_hanches", label: "Sur les os des hanches" },
  ] },
  { key: "shoulder", label: "Carrure (largeur d'épaules)", lieux: [
    { value: "pointe_pointe_dos", label: "D'une pointe d'épaule à l'autre, dans le dos" },
    { value: "pointe_pointe_devant", label: "D'une pointe d'épaule à l'autre, devant" },
    { value: "emmanchures", label: "D'une emmanchure à l'autre" },
  ] },
  { key: "back_length", label: "Longueur de dos", lieux: [
    { value: "nuque_taille", label: "De la nuque (os saillant) à la taille" },
    { value: "nuque_bas", label: "De la nuque au bas du vêtement" },
  ] },
  { key: "waist_hip_height", label: "Hauteur taille-hanches", lieux: [
    { value: "taille_plus_fort", label: "De la taille au plus fort des fesses" },
  ] },
  { key: "garment_length", label: "Longueur du vêtement", lieux: [
    { value: "epaule_bas", label: "De l'épaule au bas" },
    { value: "taille_bas", label: "De la taille au bas" },
    { value: "nuque_bas", label: "De la nuque au bas" },
  ] },
  { key: "sleeve_length", label: "Longueur de manche", lieux: [
    { value: "epaule_poignet_tendu", label: "Pointe d'épaule au poignet, bras tendu" },
    { value: "epaule_poignet_plie", label: "Pointe d'épaule au poignet, bras plié" },
  ] },
  { key: "biceps", label: "Tour de bras", lieux: [
    { value: "plus_fort", label: "Au plus fort du bras" },
  ] },
  { key: "wrist", label: "Tour de poignet" },
  { key: "thigh", label: "Tour de cuisse", lieux: [
    { value: "haut_cuisse", label: "En haut de la cuisse" },
  ] },
  { key: "inseam", label: "Entrejambe", lieux: [
    { value: "entrejambe_cheville", label: "De l'entrejambe à la cheville" },
    { value: "entrejambe_sol", label: "De l'entrejambe au sol" },
  ] },
  { key: "outseam", label: "Longueur de pantalon (côté)", lieux: [
    { value: "taille_cheville", label: "De la taille à la cheville" },
    { value: "taille_sol", label: "De la taille au sol" },
  ] },
  { key: "ankle", label: "Tour de cheville / bas de jambe" },
];

/** Mesures pour lesquelles on demande l'aisance (ce qu'on ajoute au corps). */
export const MESURES_AISANCE = ["chest", "waist", "hips", "biceps", "thigh"];

export const VARIANTES: { key: keyof FicheData["variantes"] & string; label: string; choix: string[] }[] = [
  { key: "longueurs", label: "Longueurs possibles", choix: ["Courte", "Genou", "Mi-mollet", "Longue (cheville)", "Au sol"] },
  { key: "manches", label: "Manches possibles", choix: ["Sans manche", "Courtes", "Trois-quarts", "Longues", "Bouffantes", "Évasées", "Kimono"] },
  { key: "encolures", label: "Encolures possibles", choix: ["Ronde", "En V", "Carrée", "Bateau", "Col chemise", "Col mao", "Dos nu"] },
  { key: "fermetures", label: "Fermetures possibles", choix: ["Fermeture éclair dos", "Fermeture éclair côté", "Boutons", "Élastique", "Lacets / nœud", "Sans fermeture"] },
  { key: "poches", label: "Poches possibles", choix: ["Aucune", "Poches côté", "Poches plaquées", "Poches passepoilées"] },
];

export const TISSUS: string[] = [
  "Wax / pagne", "Bazin", "Coton", "Lin", "Soie / satin", "Dentelle", "Jersey / extensible", "Velours", "Kente / tissé",
];

export const ETAPES = [
  { titre: "Le modèle", court: "Modèle" },
  { titre: "La personne et ses mesures", court: "Mesures" },
  { titre: "Comment vous prenez les mesures", court: "Prise" },
  { titre: "Les pièces du patron", court: "Pièces" },
  { titre: "Aisance et marges de couture", court: "Aisance" },
  { titre: "Variantes et tissus", court: "Variantes" },
  { titre: "Votre méthode et vos photos de patron", court: "Méthode" },
  { titre: "Vérifier et envoyer", court: "Envoi" },
] as const;

/** Meme regle que le serveur (`_missing_for_submit`), pour prevenir avant l'envoi. */
export function manquants(d: FicheData, source: string, nbPhotosVetement: number): string[] {
  const m: string[] = [];
  if ((d.general.nom ?? "").trim().length < 2) m.push("le nom du modèle");
  if (!d.general.categorie) m.push("la catégorie");
  if (!d.general.fois_cousu) m.push("le nombre de fois où vous l'avez cousu");
  const n = Object.values(d.personne.mesures).filter((v) => typeof v === "number" && v > 0).length;
  if (n < 3) m.push("au moins 3 mesures de la personne");
  if (!d.pieces.some((p) => p.nom.trim())) m.push("au moins une pièce du patron");
  if (source === "cousu" && nbPhotosVetement < 1) m.push("au moins une photo du vêtement");
  return m;
}
