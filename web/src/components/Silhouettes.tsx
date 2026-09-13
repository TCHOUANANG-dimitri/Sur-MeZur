/**
 * Silhouettes de posture affichees dans les consignes de prise de vue.
 *
 * FACE : trace repris a l'identique de l'application mobile
 * (mobile/src/components/GuidedCapture.tsx), bras ecartes a environ 45°.
 *
 * PROFIL : redessine pour la consigne « bras colles le long du corps ». C'est
 * la posture pour laquelle la chaine de vision est calibree : la bande qui
 * efface le bras de la silhouette de profil (_ARM_EXCLUSION_RATIO["side"] dans
 * backend/app/services/vision/silhouette.py) suppose un bras qui pend colle au
 * torse. Le bras est trace a part, par-dessus le corps, pour que la consigne
 * se lise d'un coup d'oeil au lieu de se fondre dans le contour.
 *
 * Les reperes en pointilles marquent la poitrine et la taille, ou se prennent
 * les profondeurs mesurees sur cette photo.
 *
 * La couleur suit `currentColor`, pour que le parent la pilote par CSS.
 */

const FACE =
  "M50 8 C57 8 62 14 62 22 C62 28 60 32 57 35 L57 41" +
  " C68 44 76 49 80 57 L96 108 L86 113 L72 78 L70 96" +
  " C70 112 71 124 72 136 L70 158 C70 176 68 196 66 214" +
  " L64 248 L52 248 L52 214 L50 168 L48 214 L48 248 L36 248" +
  " L34 214 C32 196 30 176 30 158 L28 136 C29 124 30 112 30 96" +
  " L28 78 L14 113 L4 108 L20 57 C24 49 32 44 43 41 L43 35" +
  " C40 32 38 28 38 22 C38 14 43 8 50 8 Z";

// Profil tourne vers la droite : l'avant du corps est a droite, le dos a
// gauche. Proportions reprises des reperes anthropometriques usuels —
// epaules vers 18 % de la hauteur, entrejambe vers 50 %, genou vers 75 % —
// pour que la silhouette reste credible a cote de la vue de face.
const PROFIL_CORPS =
  // tete, nez, menton, avant du cou
  "M55 8 C62 8 67 13 67 20 C67 22 69 23 68.5 25 C68 27 66 27.5 66 29" +
  " C65.5 32 62.5 34.5 59 35.5 L59 40" +
  // clavicule, poitrine galbee, sous la poitrine, ventre, bas-ventre
  " C63 42 70 50 72.5 60 C74.5 69 73.5 79 70.5 88 C68.5 95 68.5 102 69.5 109" +
  " C70.5 117 70.5 125 69 132" +
  // avant de la cuisse, genou, tibia
  " C67.5 145 67 158 66 170 C65 182 63.5 191 63 198 C62.5 210 62.5 224 62 236" +
  // dessus du pied, orteils, semelle
  " C62.5 243 70 244.5 77 246.5 C79.5 247.5 79.5 252 76.5 253 L47 253" +
  // talon, mollet, arriere de la cuisse
  " C43 252.5 42.5 247 44.5 241 C46 230 47 216 46.5 204 C46 196 44.5 188 43.5 180" +
  " C42 168 41.5 158 40.5 150" +
  // fessier, cambrure, omoplate, nuque, arriere de la tete
  " C36 143 34 134 35 125 C36 117 39.5 110 41.5 102 C43 93 42 83 39.5 72" +
  " C37.5 62 40 50 46 44 C48 42 50.5 41 51 40 L51 35.5" +
  " C47 32.5 43.5 27.5 43.5 20 C43.5 13 48.5 8 55 8 Z";

// Bras pendant le long du flanc : de l'epaule jusqu'au bout des doigts, qui
// arrivent a mi-cuisse. Legerement vers l'avant du tronc, comme au repos.
const PROFIL_BRAS =
  // epaule arrondie, avant du bras jusqu'au coude, avant-bras jusqu'au poignet
  "M56 43 C62 43 64.5 48 64 54 C63.5 66 62.5 80 62 94" +
  " C61.5 106 62 120 61.5 134" +
  // main detendue, bout des doigts a mi-cuisse
  " C62.5 139 63.5 146 62 152 C60.5 158 55.5 159 54 154 C53 149 53.5 142 53.5 136" +
  // arriere de l'avant-bras, du bras, retour a l'epaule
  " C53 122 52.5 108 51.5 96 C50 83 48.5 69 48.5 56 C48.5 48 51 43 56 43 Z";

export function SilhouetteFace({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 260" className={className} aria-hidden>
      <path d={FACE} stroke="currentColor" strokeWidth={2.4} fill="currentColor" fillOpacity={0.12} strokeLinejoin="round" />
      <line x1="26" y1="88" x2="74" y2="88" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
      <line x1="27" y1="122" x2="73" y2="122" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
    </svg>
  );
}

export function SilhouetteProfil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 260" className={className} aria-hidden>
      <path
        d={PROFIL_CORPS}
        stroke="currentColor"
        strokeWidth={2.4}
        fill="currentColor"
        fillOpacity={0.12}
        strokeLinejoin="round"
      />
      <line x1="30" y1="66" x2="82" y2="66" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
      <line x1="32" y1="104" x2="80" y2="104" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
      {/* Bras trace APRES les reperes : il passe devant, comme sur la photo. */}
      <path
        d={PROFIL_BRAS}
        stroke="currentColor"
        strokeWidth={2}
        fill="currentColor"
        fillOpacity={0.28}
        strokeLinejoin="round"
      />
    </svg>
  );
}
