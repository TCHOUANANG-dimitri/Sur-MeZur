/**
 * Contenu du questionnaire « patrons » et forme des donnees enregistrees.
 *
 * Version 2 (schema_version = 2 cote backend, app/api/v1/enquete.py) : on ne
 * demande plus ni les mesures d'une personne, ni les pieces du patron, ni la
 * photo du patron papier (le tailleur ne garde pas ses patrons, et en tracer
 * un pour nous lui couterait temps et papier). On recueille sa RECETTE pour un
 * modele qu'il coud souvent : l'aisance qu'il ajoute, ses marges, ses choix
 * de coupe. C'est exactement ce que le moteur de patrons lit (aisances et
 * reglages de chaque modele de base, backend/app/services/patrons).
 *
 * Les identifiants de type (`jupe_droite`, `kaba_simple`...) sont ceux des
 * modeles de base du moteur (catalogue.py) ; les cles de mesures sont celles
 * de la chaine de mesure par photo (chest, waist, hips...).
 */

export type Choice = { value: string; label: string };

export interface FicheData {
  general: {
    categorie?: string;
    type?: string;
    /** Libelle du type, garde pour l'affichage (liste des fiches, admin). */
    type_label?: string;
    /** Nom a l'atelier ; obligatoire seulement pour un type « autre ». */
    nom?: string;
    pour?: string;
    fois_cousu?: string;
  };
  mesures_prises: string[];
  taille_ou?: string;
  /** cm ajoutes au tour mesure, pour le modele porte normalement. */
  aisance_cm: Record<string, number | null>;
  coupe: {
    couture_cm?: number | null;
    ourlet_cm?: number | null;
    devant?: string;
    dos?: string;
    pinces_devant?: string;
    pinces_dos?: string;
    fermeture?: string;
    ceinture?: string;
    manche?: string;
    encolure?: string;
    fronces?: string;
    evasement_cm?: number | null;
    cloche?: string;
  };
  astuces?: string;
}

export function ficheVide(): FicheData {
  return { general: {}, mesures_prises: [], aisance_cm: {}, coupe: {} };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Complete une fiche lue en base. Une fiche de la version 1 est reprise :
 *  categorie, nom, aisance « normale » et marges ; ses autres reponses restent
 *  dans les donnees (rien n'est efface). */
export function normaliser(d: Partial<FicheData> | Record<string, any> | undefined): FicheData {
  const x = (d ?? {}) as Record<string, any>;
  const v1 = x.personne !== undefined || x.marges !== undefined;
  const aisanceV1: Record<string, number | null> = {};
  if (v1 && x.aisance) {
    for (const [k, a] of Object.entries(x.aisance as Record<string, any>)) {
      if (typeof a?.normal === "number") aisanceV1[k] = a.normal;
    }
  }
  return {
    ...x,
    general: { ...(x.general ?? {}) },
    mesures_prises: Array.isArray(x.mesures_prises) ? x.mesures_prises : [],
    taille_ou: x.taille_ou ?? (v1 ? x.prise?.waist?.lieu : undefined),
    aisance_cm: { ...aisanceV1, ...(x.aisance_cm ?? {}) },
    coupe: {
      ...(v1 ? { couture_cm: x.marges?.cotes ?? null, ourlet_cm: x.marges?.ourlet ?? null } : {}),
      ...(x.coupe ?? {}),
    },
    astuces: x.astuces ?? (v1 ? x.trace?.etapes : undefined),
  } as FicheData;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const CATEGORIES: Choice[] = [
  { value: "jupe", label: "Jupe" },
  { value: "robe", label: "Robe" },
  { value: "kaba", label: "Kaba" },
  { value: "haut", label: "Haut / blouse" },
  { value: "tunique", label: "Tunique homme" },
  { value: "pantalon", label: "Pantalon" },
  { value: "chemise", label: "Chemise" },
  { value: "boubou", label: "Boubou" },
  { value: "agbada", label: "Agbada" },
  { value: "autre", label: "Autre" },
];

const AUTRE: Choice = { value: "autre", label: "Un autre modèle" };

/** Types de modele par categorie : les premiers sont les modeles de base du moteur. */
export const TYPES: Record<string, Choice[]> = {
  jupe: [
    { value: "jupe_droite", label: "Droite, ajustée à pinces" },
    { value: "jupe_evasee", label: "Évasée (trapèze)" },
    { value: "jupe_cloche", label: "Cloche (coupée en rond)" },
    { value: "jupe_froncee", label: "Froncée à la taille" },
    AUTRE,
  ],
  robe: [
    { value: "robe_droite", label: "Droite, ajustée" },
    { value: "robe_evasee", label: "Haut ajusté, jupe évasée" },
    AUTRE,
  ],
  kaba: [
    { value: "kaba_simple", label: "Kaba simple (ample, sans taille)" },
    { value: "kaba_etages", label: "Kaba à étages / volants" },
    AUTRE,
  ],
  haut: [
    { value: "haut_ajuste", label: "Haut ajusté à pinces" },
    { value: "haut_ample", label: "Blouse ample" },
    AUTRE,
  ],
  tunique: [{ value: "tunique_droite", label: "Tunique droite sans col chemise" }, AUTRE],
  pantalon: [{ value: "pantalon_droit", label: "Pantalon droit" }, AUTRE],
  chemise: [{ value: "chemise_classique", label: "Chemise classique (col, boutons)" }, AUTRE],
  boubou: [{ value: "boubou_simple", label: "Boubou simple" }, AUTRE],
  agbada: [{ value: "agbada", label: "Agbada" }, AUTRE],
  autre: [AUTRE],
};

export const POUR: Choice[] = [
  { value: "femme", label: "Femme" },
  { value: "homme", label: "Homme" },
  { value: "enfant", label: "Enfant" },
];

/** Volontairement sans « jamais » ni « une fois » : on ne recueille que des
 *  modeles que le tailleur maitrise. */
export const FOIS_COUSU: Choice[] = [
  { value: "2-5", label: "2 à 5 fois" },
  { value: "6-20", label: "6 à 20 fois" },
  { value: "20+", label: "Plus de 20 fois" },
];

export const LIBELLES_MESURES: Record<string, string> = {
  chest: "Tour de poitrine",
  waist: "Tour de taille",
  hips: "Tour de hanches",
  neck: "Tour de cou",
  shoulder: "Carrure",
  back_length: "Longueur de dos",
  waist_hip_height: "Hauteur taille-hanches",
  garment_length: "Longueur du vêtement",
  sleeve_length: "Longueur de manche",
  biceps: "Tour de bras",
  wrist: "Tour de poignet",
  thigh: "Tour de cuisse",
  inseam: "Entrejambe",
  outseam: "Longueur de pantalon",
  ankle: "Bas de jambe",
};

/** Mesures proposees a cocher, par categorie (les plus probables). */
const HAUT = ["chest", "waist", "shoulder", "back_length", "garment_length", "sleeve_length", "biceps", "neck"];
export const MESURES_PAR_CATEGORIE: Record<string, string[]> = {
  jupe: ["waist", "hips", "waist_hip_height", "garment_length"],
  robe: [...HAUT, "hips", "waist_hip_height"],
  kaba: ["chest", "hips", "shoulder", "garment_length", "sleeve_length", "biceps", "neck"],
  haut: [...HAUT, "hips"],
  tunique: [...HAUT, "hips"],
  pantalon: ["waist", "hips", "thigh", "inseam", "outseam", "ankle"],
  chemise: [...HAUT, "wrist"],
  boubou: ["chest", "shoulder", "garment_length", "sleeve_length", "neck"],
  agbada: ["chest", "shoulder", "garment_length", "sleeve_length", "neck"],
  autre: Object.keys(LIBELLES_MESURES),
};

/** Tours pour lesquels on demande l'aisance, par categorie. */
export const AISANCE_PAR_CATEGORIE: Record<string, string[]> = {
  jupe: ["waist", "hips"],
  robe: ["chest", "waist", "hips"],
  kaba: ["chest", "hips"],
  haut: ["chest", "waist", "biceps"],
  tunique: ["chest", "hips", "biceps"],
  pantalon: ["waist", "hips", "thigh"],
  chemise: ["chest", "waist", "biceps"],
  boubou: ["chest"],
  agbada: ["chest"],
  autre: ["chest", "waist", "hips"],
};

export const TAILLE_OU: Choice[] = [
  { value: "creux", label: "Au creux (le plus fin)" },
  { value: "nombril", label: "Au nombril" },
  { value: "ceinture", label: "Là où se pose la ceinture" },
];

/** Questions de coupe a choix ; `pour` dit sur quelles categories (ou quels types) les poser. */
export interface QuestionCoupe {
  cle: keyof FicheData["coupe"] & string;
  label: string;
  choix: Choice[];
  categories?: string[];
  types?: string[];
}

const PINCES: Choice[] = [
  { value: "0", label: "Aucune" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3+", label: "3 ou plus" },
];
const PLI: Choice[] = [
  { value: "pli", label: "Au pli (1 pièce)" },
  { value: "deux", label: "En 2 pièces (couture au milieu)" },
];
const AJUSTES = ["jupe_droite", "jupe_evasee", "robe_droite", "robe_evasee", "haut_ajuste", "pantalon_droit", "autre"];
const AVEC_HAUT = ["robe", "kaba", "haut", "tunique", "chemise", "boubou", "agbada", "autre"];

export const QUESTIONS_COUPE: QuestionCoupe[] = [
  { cle: "devant", label: "Le devant", choix: PLI, categories: ["jupe", "robe", "kaba", "haut", "tunique", "chemise", "boubou", "agbada", "autre"] },
  { cle: "dos", label: "Le dos", choix: PLI, categories: ["jupe", "robe", "kaba", "haut", "tunique", "chemise", "boubou", "agbada", "autre"] },
  { cle: "pinces_devant", label: "Pinces devant (de chaque côté)", choix: PINCES, types: AJUSTES },
  { cle: "pinces_dos", label: "Pinces dos (de chaque côté)", choix: PINCES, types: AJUSTES },
  { cle: "fermeture", label: "Fermeture", choix: [
    { value: "eclair_dos", label: "Éclair au dos" },
    { value: "eclair_cote", label: "Éclair sur le côté" },
    { value: "eclair_devant", label: "Éclair devant (braguette)" },
    { value: "boutons", label: "Boutons" },
    { value: "elastique", label: "Élastique" },
    { value: "aucune", label: "Aucune (s'enfile)" },
  ] },
  { cle: "ceinture", label: "La taille", choix: [
    { value: "montee", label: "Ceinture montée" },
    { value: "parementure", label: "Parementure (sans ceinture)" },
    { value: "elastique", label: "Coulisse élastique" },
  ], categories: ["jupe", "pantalon"] },
  { cle: "manche", label: "La manche", choix: [
    { value: "montee", label: "Montée (cousue à l'emmanchure)" },
    { value: "kimono", label: "Kimono (coupée avec le corps)" },
    { value: "raglan", label: "Raglan" },
    { value: "sans", label: "Sans manche" },
  ], categories: AVEC_HAUT },
  { cle: "encolure", label: "Finition de l'encolure", choix: [
    { value: "parementure", label: "Parementure" },
    { value: "biais", label: "Biais" },
    { value: "col", label: "Col" },
  ], categories: AVEC_HAUT },
  { cle: "fronces", label: "Pour les fronces ou volants, vous prenez…", choix: [
    { value: "1.5", label: "1,5 fois la largeur" },
    { value: "2", label: "2 fois" },
    { value: "2.5", label: "2,5 fois" },
    { value: "3", label: "3 fois" },
  ], types: ["kaba_etages", "jupe_froncee"] },
  { cle: "cloche", label: "La cloche fait…", choix: [
    { value: "quart", label: "Un quart de cercle" },
    { value: "demi", label: "Un demi-cercle" },
    { value: "plein", label: "Un cercle complet" },
  ], types: ["jupe_cloche"] },
];

/** Question chiffree d'evasement, pour les modeles qui s'elargissent vers le bas. */
export const TYPES_EVASES = ["jupe_evasee", "robe_evasee", "kaba_simple", "boubou_simple", "agbada"];

export function questionsCoupe(categorie?: string, type?: string): QuestionCoupe[] {
  return QUESTIONS_COUPE.filter((q) => {
    if (q.types) return !!type && q.types.includes(type);
    if (q.categories) return !!categorie && q.categories.includes(categorie);
    return true;
  });
}

export const ETAPES = [
  { titre: "Le modèle", court: "Modèle" },
  { titre: "Mesures et aisance", court: "Aisance" },
  { titre: "La coupe", court: "Coupe" },
  { titre: "Vérifier et envoyer", court: "Envoi" },
] as const;

/** Meme regle que le serveur (`_missing_for_submit`), pour prevenir avant l'envoi. */
export function manquants(d: FicheData): string[] {
  const m: string[] = [];
  const g = d.general;
  if (!g.categorie) m.push("la catégorie");
  if (!g.type) m.push("le type de modèle");
  if (g.type === "autre" && (g.nom ?? "").trim().length < 2) m.push("le nom du modèle");
  if (!g.fois_cousu) m.push("le nombre de fois où vous l'avez cousu");
  if (!Object.values(d.aisance_cm).some((v) => typeof v === "number")) m.push("au moins une aisance");
  if (typeof d.coupe.couture_cm !== "number") m.push("la valeur de couture");
  return m;
}
