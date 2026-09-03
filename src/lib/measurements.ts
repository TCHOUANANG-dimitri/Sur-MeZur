/**
 * Vocabulaire des mesures, en langage de tous les jours.
 *
 * POURQUOI CE FICHIER EXISTE
 * L'application mobile affiche la sortie brute du pipeline : a cote des douze
 * mesures utiles, elle laisse apparaitre les variables intermediaires du
 * modele (`chestbreadth`, `buttockdepth`, `biacromialbreadth`, les scores de
 * confiance...). Ce sont des grandeurs de travail : des largeurs et des
 * profondeurs relevees sur la photo, qui servent a CALCULER les tours mais
 * qui ne veulent rien dire pour la personne mesuree, et qui n'ont aucune
 * traduction en couture.
 *
 * La version web ne montre QUE les douze mesures qu'un tailleur releve
 * reellement au metre ruban, chacune accompagnee de l'endroit du corps ou
 * elle se prend et de ce a quoi elle sert. Aucune mention de MediaPipe, de
 * silhouette, de modele ou de profondeur : ces notions n'apparaissent nulle
 * part dans l'interface publique.
 *
 * Ce module est la source unique : l'ecran de resultats ET la fiche a
 * imprimer le consomment tous les deux, pour qu'un libelle corrige a un
 * endroit le soit partout.
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

export interface MeasureInfo {
  /** Nom courant, celui qu'emploierait un tailleur devant son client. */
  label: string;
  /** Ou la mesure se prend sur le corps. Une phrase, sans jargon. */
  where: string;
  /** A quoi elle sert concretement dans le vetement. */
  purpose: string;
}

export const MEASURES: Record<MeasureKey, MeasureInfo> = {
  chest: {
    label: "Tour de poitrine",
    where: "Tout autour du buste, a l'endroit le plus fort de la poitrine, le metre bien horizontal.",
    purpose: "Determine l'ampleur du haut du vetement.",
  },
  waist: {
    label: "Tour de taille",
    where: "A l'endroit le plus creux du buste, un peu au-dessus du nombril.",
    purpose: "Sert au cintrage d'une chemise et a la ceinture d'un pantalon ou d'une jupe.",
  },
  hips: {
    label: "Tour de hanches",
    where: "Tout autour du bassin, a l'endroit le plus fort.",
    purpose: "Donne l'aisance necessaire pour s'asseoir et marcher.",
  },
  neck: {
    label: "Tour de cou",
    where: "A la base du cou, la ou se pose le col d'une chemise.",
    purpose: "Fixe la taille du col.",
  },
  shoulder: {
    label: "Carrure",
    where: "D'une pointe d'epaule a l'autre, en passant par le haut du dos.",
    purpose: "Positionne les coutures d'epaules et l'emmanchure.",
  },
  back_length: {
    label: "Longueur du dos",
    where: "Du haut des epaules jusqu'a la taille, dans le dos.",
    purpose: "Fixe la hauteur du buste du vetement.",
  },
  biceps: {
    label: "Tour de bras",
    where: "Au plus fort du bras, le bras relache le long du corps.",
    purpose: "Determine la largeur de la manche en haut.",
  },
  wrist: {
    label: "Tour de poignet",
    where: "Juste au-dessus de la main, la ou se ferme un poignet de chemise.",
    purpose: "Fixe la taille de la manchette.",
  },
  sleeve_length: {
    label: "Longueur de manche",
    where: "De l'epaule jusqu'au poignet, le bras legerement plie.",
    purpose: "Determine ou la manche s'arrete sur la main.",
  },
  thigh: {
    label: "Tour de cuisse",
    where: "En haut de la cuisse, a l'endroit le plus fort.",
    purpose: "Donne la largeur du pantalon en haut de jambe.",
  },
  inseam: {
    label: "Longueur de jambe",
    where: "De l'entrejambe jusqu'a la cheville, le long de l'interieur de la jambe.",
    purpose: "Determine ou le pantalon tombe sur la chaussure.",
  },
  ankle: {
    label: "Tour de cheville",
    where: "Juste au-dessus du pied.",
    purpose: "Fixe l'ouverture du bas du pantalon.",
  },
};

/**
 * Regroupement par partie du corps plutot que par nature de mesure.
 * Un client se repere sur son corps, pas sur la distinction
 * « circonference / longueur » qui n'a de sens que pour l'outil.
 */
export interface MeasureGroup {
  id: string;
  title: string;
  keys: MeasureKey[];
}

export const MEASURE_GROUPS: MeasureGroup[] = [
  { id: "buste", title: "Buste et torse", keys: ["chest", "waist", "neck", "shoulder", "back_length"] },
  { id: "bras", title: "Bras", keys: ["biceps", "sleeve_length", "wrist"] },
  { id: "jambes", title: "Hanches et jambes", keys: ["hips", "thigh", "inseam", "ankle"] },
];

/** Ordre canonique, a plat — utile pour un export ou un total. */
export const MEASURE_ORDER: MeasureKey[] = MEASURE_GROUPS.flatMap((g) => g.keys);

export function isMeasureKey(key: string): key is MeasureKey {
  return key in MEASURES;
}

/**
 * Ne conserve d'un objet de mesures que les douze cles presentables, dans
 * l'ordre canonique. Tout le reste — variables intermediaires du modele,
 * scores, cles inconnues d'une version future du backend — est ecarte
 * silencieusement plutot qu'affiche brut.
 */
export function presentableMeasures(
  data: Record<string, number> | null | undefined
): Array<{ key: MeasureKey; info: MeasureInfo; value: number }> {
  if (!data) return [];
  return MEASURE_ORDER.filter((k) => typeof data[k] === "number" && isFinite(data[k])).map((k) => ({
    key: k,
    info: MEASURES[k],
    value: data[k],
  }));
}

/** Idem, mais groupe par partie du corps ; les groupes vides disparaissent. */
export function presentableGroups(data: Record<string, number> | null | undefined) {
  if (!data) return [];
  return MEASURE_GROUPS.map((group) => ({
    ...group,
    items: group.keys
      .filter((k) => typeof data[k] === "number" && isFinite(data[k]))
      .map((k) => ({ key: k, info: MEASURES[k], value: data[k] })),
  })).filter((g) => g.items.length > 0);
}

/** Un chiffre apres la virgule : le demi-centimetre est la precision utile
 *  en couture, et afficher plus de decimales donnerait une fausse impression
 *  d'exactitude. */
export function formatCm(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} cm`;
}
