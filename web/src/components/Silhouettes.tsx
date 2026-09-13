/**
 * Silhouettes de posture, reprises a l'identique de l'application mobile
 * (mobile/src/components/GuidedCapture.tsx) : memes traces, meme repere en
 * pointilles au niveau de la poitrine et de la taille. Seul le moteur change,
 * du SVG React Native vers le SVG du navigateur.
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

// De profil, face tournee vers la droite, sans bras visible : la consigne
// « mains croisees dans le dos » cache les bras derriere le torse.
const PROFIL =
  "M58 7 C66 7 71 13 71 21 C73 24 75 28 74 32" +
  " C73 36 67 41 61 44 C59 46 58 50 60 53 C61 57 67 62 74 68" +
  " C80 74 84 84 82 95 C81 105 76 114 73 122 C72 130 73 139 75 147" +
  " C77 155 74 164 71 172 C69 181 70 191 69 200 C69 209 70 219 69 227" +
  " C68 236 69 244 71 248 L84 248 C83 254 76 256 68 256 L42 256" +
  " C37 253 36 247 39 240 C41 235 43 229 42 221 C40 211 39 200 41 189" +
  " C42 179 41 169 39 159 C37 150 33 145 33 137 C33 131 31 130 31 135" +
  " C31 140 35 143 36 135 C37 128 38 120 40 113 C42 104 44 95 46 88" +
  " C49 80 51 73 52 67 C53 62 53 56 52 50 C50 40 50 30 52 22" +
  " C53 13 55 8 58 7 Z";

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
      <path d={PROFIL} stroke="currentColor" strokeWidth={2.4} fill="currentColor" fillOpacity={0.12} strokeLinejoin="round" />
      <line x1="28" y1="88" x2="86" y2="88" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
      <line x1="30" y1="122" x2="80" y2="122" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
    </svg>
  );
}
