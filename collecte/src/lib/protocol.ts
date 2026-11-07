/**
 * Protocole de mesure de la campagne de collecte.
 *
 * Protocole actuel (« tailleur », depuis le 07/11/2026) : les mesures du
 * tailleur convenues le 30/10/2026, 20 pour l'homme et 26 pour la femme, cles
 * de pipeline_v4/mesures_v4/definitions.py. Les mesures sont prises par des
 * agents qui ne sont PAS tailleurs : chaque consigne dit ou poser le ruban en
 * reperes que l'on trouve en regardant ou en touchant, pas en vocabulaire de
 * couture.
 *
 * C'est la « convention de mesure ecrite » que reclame RAPPORT_PROJET.md §7 :
 * la confusion carrure / largeur biacromiale a coute trois jours et 6,7 cm
 * d'ecart parce que deux personnes ne prenaient pas la meme grandeur. Tous les
 * agents lisent ici la MEME consigne, affichee sous chaque champ de saisie.
 *
 * L'ancien protocole (12 mesures de la chaine, cles `neck`, `chest`...) reste
 * decrit plus bas pour lire et corriger les fiches deja saisies.
 *
 * Les CLES et les BORNES DURES doivent rester identiques a
 * backend/app/services/collecte_protocol.py.
 */

export type Gender = "male" | "female";

export const GENDER_LABELS: Record<Gender, string> = { male: "Homme", female: "Femme" };

export type MeasureKeyV1 =
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

export type MeasureKeyTailleur =
  | "tour_cou"
  | "longueur_epaule"
  | "carrure_devant"
  | "carrure_dos"
  | "longueur_manche"
  | "tour_biceps"
  | "tour_poignet"
  | "tour_poitrine"
  | "tour_dessus_poitrine"
  | "tour_dessous_poitrine"
  | "ecart_poitrine"
  | "hauteur_poitrine"
  | "hauteur_dessus_poitrine"
  | "hauteur_dessous_poitrine"
  | "tour_taille"
  | "taille_devant"
  | "taille_dos"
  | "tour_bassin"
  | "hauteur_bassin"
  | "hauteur_fessier"
  | "hauteur_braguette"
  | "longueur_haut"
  | "longueur_jupe"
  | "longueur_pantalon"
  | "tour_cuisse"
  | "hauteur_cuisse"
  | "hauteur_genou"
  | "tour_cheville";

export type MeasureKey = MeasureKeyV1 | MeasureKeyTailleur;

export type Protocole = "tailleur" | "v1";

export interface MeasureSpec {
  label: string;
  /** Ou se trouve la mesure, en une phrase : toujours visible sous le champ. */
  where: string;
  /** Comment la prendre, etape par etape. */
  steps: string[];
  /** Erreur frequente ou changement par rapport a l'ancien protocole. */
  attention?: string;
  /** Sexes concernes (protocole tailleur). */
  sexes: Gender[];
  /** Plage VRAISEMBLABLE chez l'adulte : hors plage, simple avertissement. */
  usual: [number, number];
  /** Plage DURE : hors plage, faute de saisie certaine, la valeur est refusee. */
  hard: [number, number];
}

const HF: Gender[] = ["male", "female"];
const H: Gender[] = ["male"];
const F: Gender[] = ["female"];

/**
 * Plages vraisemblables : 1er et 99e centiles de 2 000 corps de synthese
 * (pipeline_v4, statistiques du Cameroun), elargis d'environ 10 %.
 */
export const MEASURES_TAILLEUR: Record<MeasureKeyTailleur, MeasureSpec> = {
  // --- Cou, épaules, bras ---------------------------------------------------
  tour_cou: {
    label: "Tour de cou",
    where: "Autour du bas du cou, là où le cou rejoint les épaules.",
    steps: [
      "Devant, le ruban passe juste au-dessus du creux entre les deux clavicules.",
      "Derrière, il passe sur la petite bosse en bas de la nuque (elle ressort quand on baisse la tête).",
      "Ruban à plat, sans serrer : il doit pouvoir glisser.",
    ],
    attention: "Pas au milieu du cou (à la hauteur de la pomme d'Adam) : en bas, à la base.",
    sexes: HF,
    usual: [29, 50],
    hard: [20, 70],
  },
  longueur_epaule: {
    label: "Longueur d'épaules",
    where: "Dans le dos, d'une pointe d'épaule à l'autre.",
    steps: [
      "Trouvez la pointe d'épaule : l'os qui dépasse tout au bout de l'épaule, au-dessus du bras.",
      "Posez le bout du ruban sur une pointe d'épaule.",
      "Passez dans le dos, juste sous la bosse de la nuque, jusqu'à l'autre pointe d'épaule.",
    ],
    attention: "Bras relâchés le long du corps : épaules ni levées, ni tirées en arrière.",
    sexes: HF,
    usual: [32, 55],
    hard: [20, 70],
  },
  carrure_devant: {
    label: "Carrure devant",
    where: "Devant, d'une aisselle à l'autre, deux doigts au-dessus du creux de l'aisselle.",
    steps: [
      "Bras relâchés le long du corps.",
      "Repérez de chaque côté le pli où le bras rejoint le buste, devant.",
      "Ruban à plat sur le haut de la poitrine, d'un pli à l'autre, deux doigts au-dessus du creux de l'aisselle.",
    ],
    attention: "D'un pli de bras à l'autre, PAS d'une épaule à l'autre.",
    sexes: HF,
    usual: [26, 46],
    hard: [18, 65],
  },
  carrure_dos: {
    label: "Carrure dos",
    where: "Dans le dos, d'une aisselle à l'autre, deux doigts au-dessus du creux de l'aisselle.",
    steps: [
      "Bras relâchés le long du corps.",
      "Repérez de chaque côté le pli où le bras rejoint le dos.",
      "Ruban à plat sur les omoplates, d'un pli à l'autre, deux doigts au-dessus du creux de l'aisselle.",
    ],
    sexes: F,
    usual: [28, 48],
    hard: [18, 65],
  },
  longueur_manche: {
    label: "Longueur de manche",
    where: "De la pointe d'épaule jusqu'à l'os du poignet, bras tendu.",
    steps: [
      "Bras droit tendu le long du corps, main ouverte.",
      "Partez de la pointe d'épaule (l'os au bout de l'épaule).",
      "Descendez le long de l'extérieur du bras, en passant sur le coude.",
      "Arrêtez sur la petite bosse osseuse du poignet, côté petit doigt.",
    ],
    sexes: HF,
    usual: [44, 70],
    hard: [30, 90],
  },
  tour_biceps: {
    label: "Tour de biceps",
    where: "Autour du haut du bras, au plus gros, bras plié et muscle contracté.",
    steps: [
      "Bras droit plié à angle droit, poing serré, muscle contracté (comme pour montrer ses muscles).",
      "Ruban autour de l'endroit le plus gros, entre l'épaule et le coude.",
      "Ruban bien droit autour du bras, sans serrer.",
    ],
    attention: "Changement : le bras est maintenant PLIÉ et contracté (avant : relâché).",
    sexes: HF,
    usual: [22, 45],
    hard: [12, 65],
  },
  tour_poignet: {
    label: "Tour de poignet",
    where: "Autour du poignet, sur l'os qui dépasse.",
    steps: [
      "Main ouverte et relâchée.",
      "Ruban autour du poignet droit, en passant sur la petite bosse osseuse côté petit doigt.",
      "Juste ajusté, sans serrer.",
    ],
    sexes: HF,
    usual: [13, 21],
    hard: [9, 30],
  },

  // --- Poitrine -------------------------------------------------------------
  tour_poitrine: {
    label: "Tour de poitrine",
    where: "Autour du buste, à l'endroit le plus gros de la poitrine, bien horizontal.",
    steps: [
      "Bras relâchés, respiration normale : ni inspirer fort, ni bloquer.",
      "Ruban sous les aisselles et sur les omoplates dans le dos.",
      "Devant : sur la pointe des seins chez la femme, à la hauteur des mamelons chez l'homme.",
      "Regardez dans le dos : le ruban ne doit pas descendre, il reste horizontal tout autour.",
    ],
    sexes: HF,
    usual: [72, 135],
    hard: [50, 180],
  },
  tour_dessus_poitrine: {
    label: "Tour de dessus de poitrine",
    where: "Autour du buste, juste sous les aisselles, au-dessus des seins.",
    steps: [
      "Bras relâchés.",
      "Ruban le plus haut possible sous les aisselles.",
      "Devant, il passe au-dessus des seins ; dans le dos, il reste horizontal.",
    ],
    sexes: F,
    usual: [70, 125],
    hard: [50, 170],
  },
  tour_dessous_poitrine: {
    label: "Tour de dessous de poitrine",
    where: "Autour du buste, juste sous les seins.",
    steps: [
      "Ruban dans le pli sous les seins, là où passe la bande d'un soutien-gorge.",
      "Horizontal tout autour, bien ajusté.",
    ],
    sexes: F,
    usual: [60, 120],
    hard: [45, 170],
  },
  ecart_poitrine: {
    label: "Écart de poitrine",
    where: "Distance entre les pointes des deux seins.",
    steps: ["Ruban tendu en ligne droite, d'une pointe de sein à l'autre."],
    attention: "En ligne droite : le ruban ne suit pas le creux entre les seins.",
    sexes: F,
    usual: [12, 28],
    hard: [5, 45],
  },
  hauteur_poitrine: {
    label: "Hauteur de poitrine",
    where: "Du creux à la base du cou, devant, jusqu'à la pointe du sein.",
    steps: [
      "Départ : le creux entre les deux clavicules, à la base du cou.",
      "Ruban jusqu'à la pointe du sein droit (chez l'homme : le mamelon droit).",
      "Le ruban touche le corps, il n'est pas tendu en l'air.",
    ],
    sexes: HF,
    usual: [18, 36],
    hard: [10, 50],
  },
  hauteur_dessus_poitrine: {
    label: "Hauteur dessus de poitrine",
    where: "De la pointe du sein, en remontant tout droit, jusqu'à la ligne du dessus de poitrine.",
    steps: [
      "Départ : la pointe du sein droit.",
      "Remontez tout droit jusqu'à la hauteur où vous avez pris le tour de dessus de poitrine (sous l'aisselle).",
    ],
    sexes: F,
    usual: [4, 20],
    hard: [1, 30],
  },
  hauteur_dessous_poitrine: {
    label: "Hauteur dessous de poitrine",
    where: "De la pointe du sein, en descendant tout droit, jusqu'au pli sous le sein.",
    steps: [
      "Départ : la pointe du sein droit.",
      "Descendez en suivant le sein jusqu'au pli dessous (là où vous avez pris le tour de dessous de poitrine).",
    ],
    sexes: F,
    usual: [3, 18],
    hard: [1, 30],
  },

  // --- Taille et bassin -----------------------------------------------------
  tour_taille: {
    label: "Tour de taille",
    where: "Autour de la taille, à l'endroit le plus fin, sur la ficelle.",
    steps: [
      "Ventre relâché : ne pas le rentrer.",
      "Ruban posé sur la ficelle de taille, horizontal tout autour.",
      "Lisez à la fin d'une expiration normale.",
    ],
    sexes: HF,
    usual: [55, 130],
    hard: [40, 180],
  },
  taille_devant: {
    label: "Taille devant",
    where: "Sur la ficelle, d'un côté du corps à l'autre, en passant par le ventre.",
    steps: [
      "Les côtés du corps : sous le milieu de l'aisselle, là où passe la couture de côté d'un t-shirt.",
      "Ruban sur la ficelle, d'un côté à l'autre, par devant.",
    ],
    attention: "Taille devant + taille dos ≈ tour de taille : l'application vous prévient si ce n'est pas le cas.",
    sexes: HF,
    usual: [26, 68],
    hard: [18, 95],
  },
  taille_dos: {
    label: "Taille dos",
    where: "Sur la ficelle, d'un côté du corps à l'autre, en passant par le dos.",
    steps: [
      "Mêmes points de côté que pour la taille devant.",
      "Ruban sur la ficelle, d'un côté à l'autre, par le dos.",
    ],
    sexes: HF,
    usual: [26, 68],
    hard: [18, 95],
  },
  tour_bassin: {
    label: "Tour de bassin",
    where: "Autour des fesses, à l'endroit le plus gros, bien horizontal.",
    steps: [
      "Pieds joints.",
      "Regardez de profil : trouvez le point le plus en arrière des fesses.",
      "Ruban à cette hauteur, horizontal tout autour, devant comme sur les côtés.",
    ],
    attention: "Pas sur les os des hanches : plus bas, au plus gros des fesses.",
    sexes: HF,
    usual: [75, 145],
    hard: [50, 190],
  },
  hauteur_bassin: {
    label: "Hauteur de bassin",
    where: "Sur le côté, de la ficelle de taille jusqu'à la hauteur du tour de bassin.",
    steps: [
      "Côté droit du corps.",
      "Ruban qui part de la ficelle et descend tout droit sur la hanche.",
      "Arrêtez à la hauteur où vous avez pris le tour de bassin.",
    ],
    sexes: HF,
    usual: [12, 28],
    hard: [5, 40],
  },
  hauteur_fessier: {
    label: "Hauteur fessier",
    where: "Dans le dos, de la ficelle de taille jusqu'au pli sous la fesse.",
    steps: [
      "Ruban qui part de la ficelle, au-dessus de la fesse droite.",
      "Il descend sur la fesse, en passant sur le plus gros.",
      "Arrêtez au pli sous la fesse.",
    ],
    sexes: F,
    usual: [22, 42],
    hard: [12, 55],
  },
  hauteur_braguette: {
    label: "Hauteur de braguette",
    where: "Devant, de la ficelle de taille jusqu'à l'entrejambe.",
    steps: [
      "Départ au milieu du ventre, sur la ficelle.",
      "Le ruban descend tout droit sur le devant du corps.",
      "Le volontaire tient lui-même le bout du ruban à l'entrejambe ; lisez la valeur à cet endroit.",
    ],
    attention: "Par discrétion, laissez toujours le volontaire placer le ruban entre ses jambes.",
    sexes: HF,
    usual: [20, 45],
    hard: [12, 60],
  },

  // --- Longueurs et jambes --------------------------------------------------
  longueur_haut: {
    label: "Longueur du haut (jusqu'au genou)",
    where: "Du haut de l'épaule, tout contre le cou, jusqu'au genou, par devant.",
    steps: [
      "Départ sur le dessus de l'épaule droite, tout contre le cou (là où passe la couture d'épaule d'une chemise).",
      "Le ruban descend tout droit par le devant : sur la poitrine, le ventre, puis la cuisse.",
      "Arrêtez au genou (voir « Repères » : le pli du genou, sous la rotule).",
    ],
    attention: "On s'arrête TOUJOURS au genou, quelle que soit la longueur du vêtement voulu.",
    sexes: H,
    usual: [85, 125],
    hard: [60, 150],
  },
  longueur_jupe: {
    label: "Longueur de jupe (jusqu'au genou)",
    where: "Sur le côté, de la hauteur du tour de bassin jusqu'au genou.",
    steps: [
      "Côté droit du corps.",
      "Départ à la hauteur où vous avez pris le tour de bassin.",
      "Ruban qui descend tout droit jusqu'au genou (le pli, sous la rotule).",
    ],
    attention: "On s'arrête TOUJOURS au genou, quelle que soit la longueur du vêtement voulu.",
    sexes: F,
    usual: [25, 48],
    hard: [12, 70],
  },
  longueur_pantalon: {
    label: "Longueur de pantalon",
    where: "Sur le côté, de la ficelle de taille jusqu'à l'os de la cheville.",
    steps: [
      "Pieds nus, debout bien droit.",
      "Côté droit : ruban qui part de la ficelle, passe sur la hanche et descend le long de l'extérieur de la jambe.",
      "Arrêtez sur l'os rond qui dépasse à l'extérieur de la cheville (au milieu de cet os).",
    ],
    sexes: HF,
    usual: [80, 120],
    hard: [55, 140],
  },
  tour_cuisse: {
    label: "Tour de cuisse",
    where: "Autour de la cuisse droite, à mi-chemin entre l'entrejambe et le genou.",
    steps: [
      "Debout, poids sur les deux jambes, pieds un peu écartés.",
      "Trouvez le milieu entre l'entrejambe et le genou (mesurez la distance si besoin, et divisez par deux).",
      "Ruban horizontal autour de la cuisse à cette hauteur.",
    ],
    attention: "Changement : on ne mesure plus en haut de la cuisse, mais AU MILIEU.",
    sexes: HF,
    usual: [35, 75],
    hard: [25, 100],
  },
  hauteur_cuisse: {
    label: "Hauteur de cuisse",
    where: "Sur le côté de la cuisse, de la hauteur du tour de cuisse jusqu'au genou.",
    steps: [
      "Côté droit, à l'extérieur de la jambe.",
      "Départ à la hauteur où vous avez pris le tour de cuisse.",
      "Ruban qui descend tout droit jusqu'au genou (le pli, sous la rotule).",
    ],
    sexes: HF,
    usual: [8, 22],
    hard: [3, 35],
  },
  hauteur_genou: {
    label: "Hauteur de genou",
    where: "Sur le côté, de la ficelle de taille jusqu'au genou.",
    steps: [
      "Côté droit du corps.",
      "Ruban qui part de la ficelle, passe sur la hanche et descend jusqu'au genou (le pli, sous la rotule).",
    ],
    sexes: H,
    usual: [42, 66],
    hard: [30, 80],
  },
  tour_cheville: {
    label: "Tour de cheville (passage du pied)",
    where: "Une boucle autour du talon et du dessus du pied.",
    steps: [
      "Pied droit posé à plat, poids sur les deux pieds.",
      "Le ruban passe sous l'arrière du talon (tout en bas du talon).",
      "Il remonte devant sur le pli entre le pied et la jambe.",
      "Ruban bien ajusté : c'est la place qu'il faut pour que le pied passe dans le bas d'un pantalon.",
    ],
    attention: "Changement : ce n'est plus le tour au plus fin de la cheville.",
    sexes: HF,
    usual: [26, 42],
    hard: [18, 55],
  },
};

/** Ordre de la seance : l'agent suit le corps de haut en bas. */
export const MEASURE_GROUPS_TAILLEUR: { id: string; title: string; keys: MeasureKeyTailleur[] }[] = [
  {
    id: "haut",
    title: "Cou, épaules et bras",
    keys: ["tour_cou", "longueur_epaule", "carrure_devant", "carrure_dos", "longueur_manche", "tour_biceps", "tour_poignet"],
  },
  {
    id: "poitrine",
    title: "Poitrine",
    keys: [
      "tour_poitrine",
      "tour_dessus_poitrine",
      "tour_dessous_poitrine",
      "ecart_poitrine",
      "hauteur_poitrine",
      "hauteur_dessus_poitrine",
      "hauteur_dessous_poitrine",
    ],
  },
  {
    id: "taille",
    title: "Taille et bassin",
    keys: ["tour_taille", "taille_devant", "taille_dos", "tour_bassin", "hauteur_bassin", "hauteur_fessier", "hauteur_braguette"],
  },
  {
    id: "jambes",
    title: "Longueurs et jambes",
    keys: ["longueur_haut", "longueur_jupe", "longueur_pantalon", "tour_cuisse", "hauteur_cuisse", "hauteur_genou", "tour_cheville"],
  },
];

/** Avant la premiere mesure. Affiche en tete de l'etape « Mensurations ». */
export const PREPARATION = [
  "Le volontaire porte une tenue fine (t-shirt ajusté, legging) ou reste en sous-vêtements s'il est d'accord. Jamais sur un vêtement épais.",
  "Pieds nus, debout bien droit, poids sur les deux pieds, bras relâchés, regard droit devant.",
  "Nouez une ficelle (ou un élastique fin) autour de la taille, à l'endroit le plus fin. Pour le trouver, demandez au volontaire de se pencher sur le côté : le pli qui se forme est la taille. La ficelle doit être horizontale ; laissez-la pendant toutes les mesures.",
  "Les mesures d'un seul côté (bras, cuisse, cheville, longueurs) se prennent toujours à DROITE.",
];

/** Regles du ruban, valables pour toutes les mesures. */
export const RUBAN_RULES = [
  "Le ruban est à plat, ni tordu ni plié.",
  "Ni serré ni lâche : il touche le corps sans l'enfoncer.",
  "Un tour doit être horizontal : vérifiez dans le dos, ou dans un miroir.",
  "Lisez au demi-centimètre près, dites la valeur à voix haute et saisissez-la tout de suite.",
];

/** Reperes du corps cites dans les consignes, pour qui n'est pas tailleur. */
export const REPERES: { name: string; how: string }[] = [
  { name: "Ficelle de taille", how: "La ficelle nouée à l'endroit le plus fin du buste (voir « Avant de commencer »)." },
  { name: "Pointe d'épaule", how: "L'os qui dépasse tout au bout de l'épaule. Levez un peu le bras : un petit creux se forme juste à côté." },
  { name: "Creux du cou", how: "Le creux devant, à la base du cou, entre les deux clavicules." },
  { name: "Bosse de la nuque", how: "La vertèbre qui dépasse en bas de la nuque ; elle ressort quand on baisse la tête." },
  { name: "Pli de l'aisselle", how: "Le pli où le bras rejoint le buste (devant) ou le dos (derrière), bras le long du corps." },
  { name: "Côté du corps", how: "Sous le milieu de l'aisselle, là où passe la couture de côté d'un t-shirt." },
  { name: "Genou", how: "Le pli de l'articulation, juste sous la rotule (l'os rond devant le genou)." },
  { name: "Os de la cheville", how: "L'os rond qui dépasse à l'extérieur de la cheville." },
];

/** Ecart toléré entre taille devant + taille dos et le tour de taille. */
export const DEMI_TAILLES_TOLERANCE_CM = 4;
/** Ecart a partir duquel une mesure de controle est signalee. */
export const CONTROLE_TOLERANCE_CM = 2;

// ---------------------------------------------------------------------------
// Ancien protocole (v1) : 12 mesures de la chaine. Lecture et correction des
// fiches deja saisies seulement.
// ---------------------------------------------------------------------------

export const MEASURES_V1: Record<MeasureKeyV1, MeasureSpec> = {
  chest: { label: "Tour de poitrine", where: "Au plus fort de la poitrine, sous les aisselles.", steps: [], sexes: HF, usual: [70, 135], hard: [50, 180] },
  waist: { label: "Tour de taille", where: "Au plus creux du buste, un peu au-dessus du nombril.", steps: [], sexes: HF, usual: [55, 130], hard: [40, 180] },
  hips: { label: "Tour de hanches", where: "Au plus fort des fessiers.", steps: [], sexes: HF, usual: [75, 145], hard: [50, 190] },
  neck: { label: "Tour de cou", where: "À la base du cou.", steps: [], sexes: HF, usual: [29, 50], hard: [20, 70] },
  shoulder: { label: "Carrure (dos)", where: "Dans le dos, d'un pli d'emmanchure à l'autre.", steps: [], sexes: HF, usual: [28, 46], hard: [20, 65] },
  back_length: { label: "Longueur de dos", where: "Du haut de l'épaule à la ligne de taille, par le dos.", steps: [], sexes: HF, usual: [38, 66], hard: [25, 75] },
  biceps: { label: "Tour de bras", where: "Au plus fort du bras, relâché.", steps: [], sexes: HF, usual: [20, 45], hard: [12, 65] },
  sleeve_length: { label: "Longueur de manche", where: "De la pointe de l'épaule à l'os du poignet.", steps: [], sexes: HF, usual: [48, 72], hard: [30, 90] },
  wrist: { label: "Tour de poignet", where: "Sur l'os saillant du poignet.", steps: [], sexes: HF, usual: [13, 21], hard: [9, 30] },
  thigh: { label: "Tour de cuisse", where: "Au plus fort, juste sous le pli de la fesse.", steps: [], sexes: HF, usual: [40, 78], hard: [25, 100] },
  inseam: { label: "Longueur de jambe (entrejambe)", where: "De l'entrejambe à l'os de la cheville.", steps: [], sexes: HF, usual: [60, 95], hard: [40, 115] },
  ankle: { label: "Tour de cheville", where: "Au plus fin, au-dessus des os de la cheville.", steps: [], sexes: HF, usual: [18, 32], hard: [12, 45] },
};

const MEASURE_GROUPS_V1: { id: string; title: string; keys: MeasureKeyV1[] }[] = [
  { id: "buste", title: "Buste et torse", keys: ["neck", "chest", "waist", "shoulder", "back_length"] },
  { id: "bras", title: "Bras", keys: ["biceps", "sleeve_length", "wrist"] },
  { id: "jambes", title: "Hanches et jambes", keys: ["hips", "thigh", "inseam", "ankle"] },
];

export const MEASURES: Record<MeasureKey, MeasureSpec> = { ...MEASURES_TAILLEUR, ...MEASURES_V1 };

const V1_KEYS = new Set<string>(Object.keys(MEASURES_V1));

/** `v1` si la fiche porte une cle de l'ancien protocole, `tailleur` sinon. */
export function protocoleOf(measurements: Partial<Record<string, number>> | null | undefined): Protocole {
  return Object.keys(measurements ?? {}).some((k) => V1_KEYS.has(k)) ? "v1" : "tailleur";
}

/** Groupes de saisie d'une fiche : ceux de son protocole, filtres par sexe. */
export function measureGroups(protocole: Protocole, gender: Gender | ""): { id: string; title: string; keys: MeasureKey[] }[] {
  if (protocole === "v1") return MEASURE_GROUPS_V1;
  if (!gender) return [];
  return MEASURE_GROUPS_TAILLEUR.map((g) => ({ ...g, keys: g.keys.filter((k) => MEASURES_TAILLEUR[k].sexes.includes(gender)) }));
}

export function measureKeys(protocole: Protocole, gender: Gender | ""): MeasureKey[] {
  return measureGroups(protocole, gender).flatMap((g) => g.keys);
}

export const ALL_MEASURE_KEYS = Object.keys(MEASURES) as MeasureKey[];

export const BODY_BOUNDS = {
  height_cm: { usual: [145, 205], hard: [100, 230] },
  weight_kg: { usual: [40, 140], hard: [25, 250] },
  age: { usual: [16, 75], hard: [10, 100] },
} as const;

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export type ViewKey = "face" | "profil" | "dos";

export interface ViewSpec {
  label: string;
  /** Posture, affichee sur la carte photo et dans la camera. */
  pose: string;
  /** Silhouette de cadrage a superposer dans la camera (de dos, la meme que de face). */
  silhouette: "face" | "profil";
}

/**
 * Face et profil : les postures de la chaine de production (bras ecartes de
 * face, bras colles le long du corps de profil). Dos : demande par la chaine
 * v4 (carrure dos), meme posture que de face.
 */
export const VIEWS: Record<ViewKey, ViewSpec> = {
  face: {
    label: "Face",
    pose: "De face, pieds écartés à la largeur des hanches, bras écartés du corps (environ 45°).",
    silhouette: "face",
  },
  profil: {
    label: "Profil",
    pose: "De profil strict (épaule droite vers le téléphone), bras collés le long du corps, regard droit devant.",
    silhouette: "profil",
  },
  dos: {
    label: "Dos",
    pose: "De dos, même posture que de face : pieds écartés à la largeur des hanches, bras écartés (environ 45°).",
    silhouette: "face",
  },
};

export const VIEW_KEYS = Object.keys(VIEWS) as ViewKey[];

export function requiredViews(protocole: Protocole): ViewKey[] {
  return protocole === "v1" ? ["face", "profil"] : ["face", "profil", "dos"];
}

/** Consignes communes a toutes les prises de vue. */
export const SHOOTING_RULES = [
  "Retirez la ficelle de taille avant les photos.",
  "Même tenue que pour les mesures, près du corps : un vêtement ample fausse les mesures de plusieurs centimètres.",
  "Fond uni et dégagé, bonne lumière, pas de contre-jour.",
  "Téléphone tenu droit à hauteur de taille, à 2,5–3 m : la personne entière, de la tête aux pieds.",
  "Pieds nus, cheveux attachés s'ils couvrent le cou ou les épaules.",
];

export type Clothing = "moulant" | "ajuste" | "ample";

export const CLOTHING_LABELS: Record<Clothing, string> = {
  moulant: "Moulant",
  ajuste: "Ajusté",
  ample: "Ample",
};

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

/** Taille devant + taille dos doit retomber pres du tour de taille. */
export function checkDemiTailles(m: Partial<Record<MeasureKey, number | null>>): Check {
  const t = m.tour_taille, d = m.taille_devant, b = m.taille_dos;
  if (t == null || d == null || b == null) return { level: "ok" };
  const ecart = d + b - t;
  if (Math.abs(ecart) <= DEMI_TAILLES_TOLERANCE_CM) return { level: "ok" };
  return {
    level: "warn",
    message: `Taille devant + taille dos = ${fmtNum(Math.round((d + b) * 10) / 10)} cm, loin du tour de taille (${fmtNum(t)} cm). Vérifiez les points de côté et que le ruban suit la ficelle.`,
  };
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
