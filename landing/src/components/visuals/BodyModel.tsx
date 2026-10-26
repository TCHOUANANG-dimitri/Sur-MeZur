import type { CSSProperties } from "react";

import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";
import { EXAMPLE_VALUES } from "./MeasureCard";

export type MeasureKey = keyof typeof EXAMPLE_VALUES;

/**
 * Silhouette annotée : les mesures dessinées sur le corps, avec les mots du
 * métier dans la langue de la page. Valeurs d'exemple.
 *
 * Mise en page : colonne d'étiquettes à gauche (x < 118), corps au centre
 * (axe x = 220), colonne d'étiquettes à droite (x > 322). Chaque étiquette
 * est reliée à son point sur le corps par un trait qui s'arrête avant le
 * texte : rien ne se chevauche, même avec les libellés anglais.
 */

export const AXE = 220;

/** Moitié gauche du contour (de la base du cou à l'entrejambe). La moitié
 *  droite est la même, en miroir autour de l'axe. */
export const DEMI_CORPS = [
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

export function miroir(d: string): string {
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${2 * AXE - Number(x)} ${y}`);
}

type Repere = { k: MeasureKey; px: number; py: number; ly: number };

/** Une ligne par mesure, dans l'ordre où elles se dessinent. `v` : verticale. */
const LIGNES: { k: MeasureKey; d: string; v?: boolean }[] = [
  { k: "neck", d: "M209 96 Q220 101 231 96" },
  { k: "shoulder", d: "M166 112 H274" },
  { k: "chest", d: "M163 176 H277" },
  { k: "back_length", d: "M220 104 V244", v: true },
  { k: "waist", d: "M170 244 H270" },
  { k: "biceps", d: "M278 150 H294" },
  { k: "sleeve_length", d: "M276 118 L300 284", v: true },
  { k: "wrist", d: "M290 286 H306" },
  { k: "hips", d: "M160 300 H280" },
  { k: "thigh", d: "M226 350 H276" },
  { k: "inseam", d: "M212 352 L198 518", v: true },
  { k: "ankle", d: "M238 512 H262" },
];

/**
 * `active` met une mesure en avant (les autres s'estompent) ; `onSelect`
 * rend les lignes et les étiquettes cliquables (MeasureExplorer). Les lignes
 * se déroulent quand la silhouette apparaît (CSS « BODY MODEL »).
 */
export function BodyModel({
  dict,
  title,
  active = null,
  onSelect,
}: {
  dict: Dictionary;
  title: string;
  active?: MeasureKey | null;
  onSelect?: (key: MeasureKey) => void;
}) {
  const m = dict.measures;
  // px, py : point de la mesure sur le corps ; ly : hauteur de l'étiquette.
  const gauche: Repere[] = [
    { k: "chest", px: 163, py: 176, ly: 176 },
    { k: "hips", px: 160, py: 300, ly: 300 },
    { k: "inseam", px: 206, py: 440, ly: 440 },
  ];
  const droite: Repere[] = [
    { k: "neck", px: 231, py: 96, ly: 84 },
    { k: "shoulder", px: 274, py: 112, ly: 140 },
    { k: "waist", px: 270, py: 244, ly: 244 },
    { k: "thigh", px: 276, py: 350, ly: 352 },
  ];
  const etat = (k: MeasureKey) => (active ? (active === k ? "is-active" : "is-dim") : undefined);
  const select = onSelect ? (k: MeasureKey) => () => onSelect(k) : undefined;

  return (
    <svg viewBox="0 0 440 560" className={cn("body-model h-auto w-full max-w-[420px]", active && "has-active")} role="img" aria-label={title}>
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
        {LIGNES.map((l, i) => (
          <g key={l.k} className={cn("bm-mesure", etat(l.k))} onClick={select?.(l.k)}>
            <path
              d={l.d}
              className={cn("bm-line", l.v && "bm-v")}
              stroke={i % 2 ? "#7014E8" : "#5D06CC"}
              strokeWidth="1.6"
              strokeDasharray="4 5"
              style={{ "--i": i } as CSSProperties}
            />
            {/* Zone de clic plus large que le trait */}
            {onSelect ? <path d={l.d} stroke="transparent" strokeWidth="16" className="cursor-pointer" /> : null}
          </g>
        ))}
      </g>

      {/* Étiquettes */}
      <g fontFamily="var(--font-jost), Jost, sans-serif">
        {gauche.map((r) => (
          <g key={r.k} className={cn("bm-label", etat(r.k), onSelect && "cursor-pointer")} onClick={select?.(r.k)}>
            <polyline points={`${r.px},${r.py} 128,${r.ly} 120,${r.ly}`} fill="none" stroke="rgba(8,4,77,0.32)" strokeWidth="1" />
            <circle cx={r.px} cy={r.py} r="3" fill="#5D06CC" />
            <text x="4" y={r.ly - 6} fontSize="12" fill="#5D06CC">{m[r.k]}</text>
            <text x="4" y={r.ly + 11} fontSize="14" fontWeight="600" fill="#08044D">{EXAMPLE_VALUES[r.k]} cm</text>
          </g>
        ))}
        {droite.map((r) => (
          <g key={r.k} className={cn("bm-label", etat(r.k), onSelect && "cursor-pointer")} onClick={select?.(r.k)}>
            <polyline points={`${r.px},${r.py} 312,${r.ly} 320,${r.ly}`} fill="none" stroke="rgba(8,4,77,0.32)" strokeWidth="1" />
            <circle cx={r.px} cy={r.py} r="3" fill="#7014E8" />
            <text x="326" y={r.ly - 6} fontSize="12" fill="#7014E8">{m[r.k]}</text>
            <text x="326" y={r.ly + 11} fontSize="14" fontWeight="600" fill="#08044D">{EXAMPLE_VALUES[r.k]} cm</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
