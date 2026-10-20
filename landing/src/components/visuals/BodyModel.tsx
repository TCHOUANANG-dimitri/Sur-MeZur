import type { Dictionary } from "@/i18n";
import { EXAMPLE_VALUES } from "./MeasureCard";

/**
 * Silhouette annotée : les mesures dessinées sur le corps, avec les mots du
 * métier dans la langue de la page. Valeurs d'exemple.
 *
 * Mise en page : colonne d'étiquettes à gauche (x < 118), corps au centre
 * (axe x = 220), colonne d'étiquettes à droite (x > 322). Chaque étiquette
 * est reliée à son point sur le corps par un trait qui s'arrête avant le
 * texte : rien ne se chevauche, même avec les libellés anglais.
 */

const AXE = 220;

/** Moitié gauche du contour (de la base du cou à l'entrejambe). La moitié
 *  droite est la même, en miroir autour de l'axe. */
const DEMI_CORPS = [
  "M210 88", "L210 100",
  "C200 106 178 108 166 112", // épaule
  "C154 116 150 128 149 142",
  "L141 214", "L135 286", // bras, avant-bras
  "C134 296 136 304 142 304", "C147 304 149 296 149 288", // main
  "L156 218", "L162 160", // intérieur du bras jusqu'à l'aisselle
  "C164 190 170 222 170 244", // flanc jusqu'à la taille
  "C170 262 160 280 160 300", // taille -> hanche
  "C160 330 166 380 172 430", // cuisse -> genou
  "L178 510", // mollet
  "C178 520 168 526 168 532", "L200 532", "L202 510", // pied
  "C204 470 210 400 214 360", "L220 342", // intérieur de la jambe -> entrejambe
].join(" ");

function miroir(d: string): string {
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${2 * AXE - Number(x)} ${y}`);
}

type Repere = { label: string; v: number; px: number; py: number; ly: number };

export function BodyModel({ dict, title }: { dict: Dictionary; title: string }) {
  const m = dict.measures;
  // px, py : point de la mesure sur le corps ; ly : hauteur de l'étiquette.
  const gauche: Repere[] = [
    { label: m.chest, v: EXAMPLE_VALUES.chest, px: 163, py: 176, ly: 176 },
    { label: m.hips, v: EXAMPLE_VALUES.hips, px: 160, py: 300, ly: 300 },
    { label: m.inseam, v: EXAMPLE_VALUES.inseam, px: 206, py: 440, ly: 440 },
  ];
  const droite: Repere[] = [
    { label: m.neck, v: EXAMPLE_VALUES.neck, px: 231, py: 96, ly: 84 },
    { label: m.shoulder, v: EXAMPLE_VALUES.shoulder, px: 274, py: 112, ly: 140 },
    { label: m.waist, v: EXAMPLE_VALUES.waist, px: 270, py: 244, ly: 244 },
    { label: m.thigh, v: EXAMPLE_VALUES.thigh, px: 276, py: 350, ly: 352 },
  ];

  return (
    <svg viewBox="0 0 440 560" className="h-auto w-full max-w-[420px]" role="img" aria-label={title}>
      <defs>
        <linearGradient id="bm-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4502AD" />
          <stop offset="100%" stopColor="#7014E8" />
        </linearGradient>
        <linearGradient id="bm-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F1E8FF" />
          <stop offset="100%" stopColor="#FBF8FF" />
        </linearGradient>
      </defs>

      {/* Corps */}
      <g stroke="url(#bm-stroke)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="url(#bm-fill)">
        <path d={`${DEMI_CORPS} L${AXE} 88 Z`} stroke="none" />
        <path d={`${miroir(DEMI_CORPS)} L${AXE} 88 Z`} stroke="none" />
        <path d={DEMI_CORPS} fill="none" />
        <path d={miroir(DEMI_CORPS)} fill="none" />
        <circle cx={AXE} cy="62" r="26" />
      </g>

      {/* Lignes de mesure sur le corps */}
      <g fill="none" strokeLinecap="round">
        <path d="M209 96 Q220 101 231 96" stroke="#7014E8" strokeWidth="1.6" strokeDasharray="3 4" />
        <path d="M166 112 H274" stroke="#7014E8" strokeWidth="1.6" strokeDasharray="3 4" />
        <path d="M163 176 H277" stroke="#5D06CC" strokeWidth="1.6" strokeDasharray="4 5" />
        <path d="M170 244 H270" stroke="#5D06CC" strokeWidth="1.6" strokeDasharray="4 5" />
        <path d="M160 300 H280" stroke="#5D06CC" strokeWidth="1.6" strokeDasharray="4 5" />
        <path d="M226 350 H276" stroke="#7014E8" strokeWidth="1.6" strokeDasharray="3 4" />
        <path d="M212 352 L198 518" stroke="#7014E8" strokeWidth="1.6" strokeDasharray="3 5" />
      </g>

      {/* Étiquettes */}
      <g fontFamily="var(--font-jost), Jost, sans-serif">
        {gauche.map((r) => (
          <g key={r.label}>
            <polyline points={`${r.px},${r.py} 128,${r.ly} 120,${r.ly}`} fill="none" stroke="rgba(8,4,77,0.32)" strokeWidth="1" />
            <circle cx={r.px} cy={r.py} r="3" fill="#5D06CC" />
            <text x="4" y={r.ly - 6} fontSize="12" fill="#5D06CC">{r.label}</text>
            <text x="4" y={r.ly + 11} fontSize="14" fontWeight="600" fill="#08044D">{r.v} cm</text>
          </g>
        ))}
        {droite.map((r) => (
          <g key={r.label}>
            <polyline points={`${r.px},${r.py} 312,${r.ly} 320,${r.ly}`} fill="none" stroke="rgba(8,4,77,0.32)" strokeWidth="1" />
            <circle cx={r.px} cy={r.py} r="3" fill="#7014E8" />
            <text x="326" y={r.ly - 6} fontSize="12" fill="#7014E8">{r.label}</text>
            <text x="326" y={r.ly + 11} fontSize="14" fontWeight="600" fill="#08044D">{r.v} cm</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
