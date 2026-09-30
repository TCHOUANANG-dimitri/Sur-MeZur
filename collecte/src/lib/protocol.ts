/**
 * Protocole de mesure de la campagne de collecte.
 *
 * Seules les 12 mesures livrees au tailleur sont relevees.
 *
 * C'est la « convention de mesure ecrite » que reclame RAPPORT_PROJET.md §7
 * (priorite 2) : la confusion carrure / largeur biacromiale a coute trois
 * jours et 6,7 cm d'ecart parce que deux personnes ne prenaient pas la meme
 * grandeur. Tous les agents lisent ici la MEME consigne, affichee sous chaque
 * champ de saisie.
 *
 * Les CLES et les BORNES DURES doivent rester identiques a
 * backend/app/services/collecte_protocol.py. Les cles reprennent celles de la
 * chaine de mesure (`neck`, `chest`, ...) : l'export se compare directement a
 * sa sortie.
 */

export type MeasureKey =
  | "neck"
  | "chest"
  | "waist"
  | "hips"
  | "biceps"
  | "thigh"
  | "wrist"
  | "ankle"
  | "shoulder"
  | "sleeve_length"
  | "inseam"
  | "back_length";

export interface MeasureSpec {
  label: string;
  /** Ou et comment la prendre, au metre ruban. */
  how: string;
  /** Plage VRAISEMBLABLE chez l'adulte : hors plage, simple avertissement. */
  usual: [number, number];
  /** Plage DURE : hors plage, faute de saisie certaine, la valeur est refusee. */
  hard: [number, number];
}

export const MEASURES: Record<MeasureKey, MeasureSpec> = {
  chest: {
    label: "Tour de poitrine",
    how: "Mètre horizontal à l'endroit le plus fort de la poitrine, passant sous les aisselles et sur les omoplates. Bras relâchés, respiration normale, sans serrer.",
    usual: [70, 135],
    hard: [50, 180],
  },
  waist: {
    label: "Tour de taille",
    how: "À l'endroit le plus creux du buste, un peu au-dessus du nombril. Ventre relâché (ne pas le rentrer), en fin d'expiration normale.",
    usual: [55, 130],
    hard: [40, 180],
  },
  hips: {
    label: "Tour de hanches",
    how: "Pieds joints, mètre horizontal à l'endroit le plus fort des fessiers (et non sur l'os du bassin).",
    usual: [75, 145],
    hard: [50, 190],
  },
  neck: {
    label: "Tour de cou",
    how: "À la base du cou, là où se pose le col d'une chemise, mètre à plat sans serrer.",
    usual: [29, 50],
    hard: [20, 70],
  },
  shoulder: {
    label: "Carrure (dos)",
    how: "DANS LE DOS, d'un pli d'emmanchure à l'autre (là où le bras rejoint le dos), mètre à plat à mi-hauteur des omoplates, bras le long du corps. Environ 30 à 40 cm. Ce n'est PAS la distance en ligne droite d'une pointe osseuse d'épaule à l'autre (~40 cm).",
    usual: [28, 46],
    hard: [20, 65],
  },
  back_length: {
    label: "Longueur de dos",
    how: "Dans le dos, du haut de l'épaule (à la base du cou) jusqu'à la ligne de taille, en suivant le dos.",
    usual: [38, 66],
    hard: [25, 75],
  },
  biceps: {
    label: "Tour de bras",
    how: "Au plus fort du bras, entre l'épaule et le coude, le bras relâché le long du corps (muscle NON contracté).",
    usual: [20, 45],
    hard: [12, 65],
  },
  sleeve_length: {
    label: "Longueur de manche",
    how: "De la pointe de l'épaule jusqu'à l'os saillant du poignet, bras le long du corps, coude légèrement plié.",
    usual: [48, 72],
    hard: [30, 90],
  },
  wrist: {
    label: "Tour de poignet",
    how: "Autour du poignet, sur l'os saillant, là où se ferme un poignet de chemise.",
    usual: [13, 21],
    hard: [9, 30],
  },
  thigh: {
    label: "Tour de cuisse",
    how: "Debout, poids sur les deux jambes : au plus fort de la cuisse, juste sous le pli de la fesse, mètre horizontal.",
    usual: [40, 78],
    hard: [25, 100],
  },
  inseam: {
    label: "Longueur de jambe (entrejambe)",
    how: "Pieds légèrement écartés : de l'entrejambe jusqu'à l'os saillant de la cheville, le long de l'intérieur de la jambe.",
    usual: [60, 95],
    hard: [40, 115],
  },
  ankle: {
    label: "Tour de cheville",
    how: "Au plus fin, juste au-dessus des os saillants de la cheville.",
    usual: [18, 32],
    hard: [12, 45],
  },
};

/** Ordre et regroupement de saisie : l'agent suit le corps de haut en bas. */
export const MEASURE_GROUPS: { id: string; title: string; keys: MeasureKey[] }[] = [
  { id: "buste", title: "Buste et torse", keys: ["neck", "chest", "waist", "shoulder", "back_length"] },
  { id: "bras", title: "Bras", keys: ["biceps", "sleeve_length", "wrist"] },
  { id: "jambes", title: "Hanches et jambes", keys: ["hips", "thigh", "inseam", "ankle"] },
];

export const MEASURE_KEYS = MEASURE_GROUPS.flatMap((g) => g.keys);

export const BODY_BOUNDS = {
  height_cm: { usual: [145, 205], hard: [100, 230] },
  weight_kg: { usual: [40, 140], hard: [25, 250] },
  age: { usual: [16, 75], hard: [10, 100] },
} as const;

export type ViewKey = "face" | "profil" | "dos" | "trois_quarts";

export interface ViewSpec {
  label: string;
  required: boolean;
  /** Posture, affichee sur la carte photo et dans la camera. */
  pose: string;
  /** Silhouette de cadrage a superposer dans la camera. */
  silhouette: "face" | "profil";
}

/**
 * Face et profil : les deux vues de la chaine de production, OBLIGATOIRES.
 * Les postures sont celles pour lesquelles la vision est calibree (commit
 * c7d4699) : bras ecartes de face, bras colles le long du corps de profil.
 * Dos et trois-quarts : facultatives, pour la recherche (piste « 3e photo a
 * 45° », RAPPORT_PROJET.md §6bis).
 */
export const VIEWS: Record<ViewKey, ViewSpec> = {
  face: {
    label: "Face",
    required: true,
    pose: "De face, pieds écartés à la largeur des hanches, bras écartés du corps (environ 45°).",
    silhouette: "face",
  },
  profil: {
    label: "Profil",
    required: true,
    pose: "De profil strict (épaule vers l'objectif), bras collés le long du corps, regard droit devant.",
    silhouette: "profil",
  },
  dos: {
    label: "Dos",
    required: false,
    pose: "De dos, même posture que la photo de face.",
    silhouette: "face",
  },
  trois_quarts: {
    label: "Trois-quarts (45°)",
    required: false,
    pose: "Tourné à 45° entre la face et le profil, bras légèrement écartés.",
    silhouette: "face",
  },
};

export const VIEW_KEYS = Object.keys(VIEWS) as ViewKey[];
export const REQUIRED_VIEWS = VIEW_KEYS.filter((v) => VIEWS[v].required);

/** Consignes communes a toutes les prises de vue. */
export const SHOOTING_RULES = [
  "Tenue près du corps (legging, t-shirt ajusté, ou brassière) : un vêtement ample fausse les mesures de plusieurs centimètres.",
  "Fond uni et dégagé, bonne lumière, pas de contre-jour.",
  "Téléphone posé à hauteur de taille, à 2,5–3 m, personne entière de la tête aux pieds.",
  "Pieds nus ou chaussures plates, cheveux attachés s'ils couvrent le cou ou les épaules.",
];

export type Clothing = "moulant" | "ajuste" | "ample";

export const CLOTHING_LABELS: Record<Clothing, string> = {
  moulant: "Moulant",
  ajuste: "Ajusté",
  ample: "Ample",
};

export type Gender = "male" | "female";

export const GENDER_LABELS: Record<Gender, string> = { male: "Homme", female: "Femme" };

/** Lit une saisie francaise (« 84,5 ») ou anglaise (« 84.5 »). */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type Check = { level: "ok" | "warn" | "error"; message?: string };

/** Verdict sur une valeur : refusee hors bornes dures, signalee hors usage. */
export function checkValue(value: number | null, usual: readonly number[], hard: readonly number[], unit = "cm"): Check {
  if (value === null) return { level: "ok" };
  if (value < hard[0] || value > hard[1]) {
    return { level: "error", message: `Impossible : entre ${hard[0]} et ${hard[1]} ${unit}. Faute de frappe ?` };
  }
  if (value < usual[0] || value > usual[1]) {
    return { level: "warn", message: `Inhabituel (souvent ${usual[0]}–${usual[1]} ${unit}). Revérifiez, puis gardez si c'est juste.` };
  }
  return { level: "ok" };
}

/** Nombre a la francaise : 62,5 et non 62.5. */
export function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return String(value).replace(".", ",");
}

export function formatCm(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1).replace(".", ",")} cm`;
}

export function subjectCode(n: number): string {
  return `SMZ-${String(n).padStart(4, "0")}`;
}
