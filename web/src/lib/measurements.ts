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

import { langue, tr } from "./i18n";

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

// Libelles dans la langue du telephone (lib/i18n) : lus au moment de
// l'affichage, d'ou les accesseurs.
function info(label: [string, string], where: [string, string], purpose: [string, string]): MeasureInfo {
  return {
    get label() { return tr(...label); },
    get where() { return tr(...where); },
    get purpose() { return tr(...purpose); },
  };
}

export const MEASURES: Record<MeasureKey, MeasureInfo> = {
  chest: info(['Tour de poitrine', 'Chest'], ['Autour du buste, au plus fort de la poitrine.', 'Around the fullest part of the chest.'], ['Ampleur du haut.', 'Width of the top.']),
  waist: info(['Tour de taille', 'Waist'], ['Au plus creux du buste, au-dessus du nombril.', 'At the narrowest point, above the navel.'], ['Cintrage et ceinture.', 'Shaping and waistband.']),
  hips: info(['Tour de hanches', 'Hips'], ['Autour du bassin, au plus fort.', 'Around the fullest part of the hips.'], ["Aisance pour s'asseoir et marcher.", 'Room to sit and walk.']),
  neck: info(['Tour de cou', 'Neck'], ['À la base du cou, là où se pose le col.', 'At the base of the neck, where a collar sits.'], ['Taille du col.', 'Collar size.']),
  shoulder: info(['Carrure', 'Shoulder width'], ["D'une pointe d'épaule à l'autre, par le dos.", 'From one shoulder tip to the other, across the back.'], ["Coutures d'épaule et emmanchure.", 'Shoulder seams and armholes.']),
  back_length: info(['Longueur du dos', 'Back length'], ['Du haut des épaules à la taille, dans le dos.', 'From the top of the shoulders to the waist, at the back.'], ['Hauteur du buste.', 'Bodice length.']),
  biceps: info(['Tour de bras', 'Upper arm'], ['Au plus fort du bras, bras relâché.', 'Around the fullest part of the relaxed arm.'], ['Largeur du haut de manche.', 'Sleeve width at the top.']),
  wrist: info(['Tour de poignet', 'Wrist'], ['Juste au-dessus de la main.', 'Just above the hand.'], ['Taille du poignet de manche.', 'Cuff size.']),
  sleeve_length: info(['Longueur de manche', 'Sleeve length'], ["De l'épaule au poignet, bras un peu plié.", 'From shoulder to wrist, arm slightly bent.'], ["Où s'arrête la manche.", 'Where the sleeve ends.']),
  thigh: info(['Tour de cuisse', 'Thigh'], ['En haut de la cuisse, au plus fort.', 'Around the top of the thigh.'], ['Largeur du haut de jambe.', 'Width at the top of the leg.']),
  inseam: info(['Longueur de jambe', 'Inside leg'], ["De l'entrejambe à la cheville, côté intérieur.", 'From the crotch to the ankle, inside the leg.'], ['Où tombe le pantalon.', 'Where the trousers fall.']),
  ankle: info(['Tour de cheville', 'Ankle'], ['Juste au-dessus du pied.', 'Just above the foot.'], ['Ouverture du bas de pantalon.', 'Trouser hem opening.']),
};

/**
 * Regroupement par partie du corps plutot que par nature de mesure.
 * Un client se repere sur son corps, pas sur la distinction
 * « circonference / longueur » qui n'a de sens que pour l'outil.
 */
export interface MeasureGroup {
  id: string;
  readonly title: string;
  keys: MeasureKey[];
}

export const MEASURE_GROUPS: MeasureGroup[] = [
  { id: "buste", get title() { return tr("Buste", "Upper body"); }, keys: ["chest", "waist", "neck", "shoulder", "back_length"] },
  { id: "bras", get title() { return tr("Bras", "Arms"); }, keys: ["biceps", "sleeve_length", "wrist"] },
  { id: "jambes", get title() { return tr("Hanches et jambes", "Hips and legs"); }, keys: ["hips", "thigh", "inseam", "ankle"] },
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
  const v = value.toFixed(1);
  return `${langue() === "en" ? v : v.replace(".", ",")} cm`;
}

/**
 * Comme `presentableGroups`, mais en conservant les mesures RETENUES par le
 * serveur pour un compte invite. Leur valeur est `null` : elle n'a jamais ete
 * envoyee, l'interface affiche a la place un chiffre factice floute.
 */
export function presentableGroupsWithLocked(
  data: Record<string, number> | null | undefined,
  lockedKeys: string[] = []
) {
  const locked = new Set(lockedKeys);
  const values = data ?? {};
  return MEASURE_GROUPS.map((group) => ({
    ...group,
    items: group.keys
      .filter((k) => locked.has(k) || (typeof values[k] === "number" && isFinite(values[k])))
      .map((k) => ({
        key: k,
        info: MEASURES[k],
        value: locked.has(k) ? null : values[k],
        locked: locked.has(k),
      })),
  })).filter((g) => g.items.length > 0);
}
