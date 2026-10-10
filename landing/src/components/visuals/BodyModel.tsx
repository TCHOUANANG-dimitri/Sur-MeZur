import type { Dictionary } from "@/i18n";
import { EXAMPLE_VALUES } from "./MeasureCard";

/**
 * Silhouette annotée : les mesures dessinées sur le corps, avec les mots du
 * métier dans la langue de la page. Valeurs d'exemple.
 */
export function BodyModel({ dict, title }: { dict: Dictionary; title: string }) {
  const m = dict.measures;
  // Le corps s'arrête à x = 264 : les étiquettes de droite partent de 280.
  const right = [
    { y: 184, label: m.neck, v: EXAMPLE_VALUES.neck, x1: 206 },
    { y: 228, label: m.shoulder, v: EXAMPLE_VALUES.shoulder, x1: 206 },
    { y: 334, label: m.waist, v: EXAMPLE_VALUES.waist, x1: 206 },
    { y: 442, label: m.thigh, v: EXAMPLE_VALUES.thigh, x1: 206 },
  ];
  const left = [
    { y: 272, label: m.chest, v: EXAMPLE_VALUES.chest, x2: 126, ly: 268 },
    { y: 396, label: m.hips, v: EXAMPLE_VALUES.hips, x2: 126, ly: 392 },
    { y: 478, label: m.inseam, v: EXAMPLE_VALUES.inseam, x2: 166, ly: 470 },
  ];

  return (
    <svg viewBox="0 0 400 560" className="h-auto w-full max-w-[380px]" role="img" aria-label={title}>
      <defs>
        <linearGradient id="bm-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4502AD" />
          <stop offset="100%" stopColor="#7014E8" />
        </linearGradient>
      </defs>

      <g stroke="url(#bm-stroke)" strokeWidth="2" fill="none">
        <circle cx="170" cy="84" r="32" />
        <path d="M104 150c14-10 38-15 66-15s52 5 66 15c20 14 28 40 28 66v44h-24l-9 122h-122l-9-122h-24v-44c0-26 8-52 28-66Z" />
        <path d="M126 268h88" stroke="#7014E8" strokeWidth="1.4" strokeDasharray="4 5" />
        <path d="M122 330h96" stroke="#5D06CC" strokeWidth="1.4" strokeDasharray="4 5" />
        <path d="M126 392h88" stroke="#5D06CC" strokeWidth="1.4" strokeDasharray="4 5" />
        <path d="M170 396v74" strokeDasharray="2 7" />
        <path d="M170 470c-24 0-40 9-48 24M170 470c24 0 40 9 48 24" strokeLinecap="round" />
      </g>

      <g fontFamily="var(--font-jost), Jost, sans-serif" fontSize="12">
        {right.map((r) => (
          <g key={r.label}>
            <line x1={r.x1} y1={r.y - 4} x2={276} y2={r.y - 4} stroke="rgba(8,4,77,0.38)" />
            <text x="280" y={r.y - 8} fill="#7014E8">
              {r.label}
            </text>
            <text x="280" y={r.y + 8} fill="#08044D" fontWeight="600">
              {r.v} cm
            </text>
          </g>
        ))}
        {left.map((l) => (
          <g key={l.label}>
            <line x1={100} y1={l.ly} x2={l.x2} y2={l.ly} stroke="rgba(8,4,77,0.38)" />
            <text x="4" y={l.y - 4} fill="#5D06CC">
              {l.label}
            </text>
            <text x="4" y={l.y + 12} fill="#08044D" fontWeight="600">
              {l.v} cm
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
