import type { CSSProperties } from "react";

import { CONTOUR_CORPS, LIGNES_CORPS } from "@/data/bodyGeometry";
import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";
import { EXAMPLE_VALUES } from "./MeasureCard";

export type MeasureKey = keyof typeof EXAMPLE_VALUES;

/**
 * Silhouette annotée : le contour réel d'une personne (data/bodyGeometry,
 * tracé sur une photo générée) et les 12 mesures placées sur son corps, avec
 * les mots du métier dans la langue de la page. Valeurs d'exemple.
 *
 * Mise en page : colonne d'étiquettes à gauche (x < 118), corps au centre
 * (axe x = 220), colonne d'étiquettes à droite (x > 322). Chaque étiquette
 * est reliée à son point sur le corps par un trait qui s'arrête avant le
 * texte : rien ne se chevauche, même avec les libellés anglais.
 *
 * `active` met une mesure en avant (les autres s'estompent) ; `onSelect`
 * rend les lignes et les étiquettes cliquables (MeasureExplorer). Les lignes
 * se déroulent quand la silhouette apparaît (CSS « BODY MODEL »).
 */

type Repere = { k: MeasureKey; ly: number };

// Hauteur de chaque étiquette ; le point d'accroche vient de bodyGeometry.
const GAUCHE: Repere[] = [
  { k: "chest", ly: 178 },
  { k: "hips", ly: 276 },
  { k: "inseam", ly: 392 },
];
const DROITE: Repere[] = [
  { k: "neck", ly: 92 },
  { k: "shoulder", ly: 146 },
  { k: "waist", ly: 236 },
  { k: "thigh", ly: 318 },
];
const ANCRE = Object.fromEntries(LIGNES_CORPS.map((l) => [l.k, l])) as Record<MeasureKey, (typeof LIGNES_CORPS)[number]>;

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
      <path d={CONTOUR_CORPS} fill="url(#bm-fill)" stroke="url(#bm-stroke)" strokeWidth="2" strokeLinejoin="round" />

      {/* Lignes de mesure sur le corps */}
      <g fill="none" strokeLinecap="round">
        {LIGNES_CORPS.map((l, i) => (
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
        {GAUCHE.map((r) => {
          const a = ANCRE[r.k];
          return (
            <g key={r.k} className={cn("bm-label", etat(r.k), onSelect && "cursor-pointer")} onClick={select?.(r.k)}>
              <polyline points={`${a.px},${a.py} 128,${r.ly} 120,${r.ly}`} fill="none" stroke="rgba(8,4,77,0.32)" strokeWidth="1" />
              <circle cx={a.px} cy={a.py} r="3" fill="#5D06CC" />
              <text x="4" y={r.ly - 6} fontSize="12" fill="#5D06CC">{m[r.k]}</text>
              <text x="4" y={r.ly + 11} fontSize="14" fontWeight="600" fill="#08044D">{EXAMPLE_VALUES[r.k]} cm</text>
            </g>
          );
        })}
        {DROITE.map((r) => {
          const a = ANCRE[r.k];
          return (
            <g key={r.k} className={cn("bm-label", etat(r.k), onSelect && "cursor-pointer")} onClick={select?.(r.k)}>
              <polyline points={`${a.px},${a.py} 312,${r.ly} 320,${r.ly}`} fill="none" stroke="rgba(8,4,77,0.32)" strokeWidth="1" />
              <circle cx={a.px} cy={a.py} r="3" fill="#7014E8" />
              <text x="326" y={r.ly - 6} fontSize="12" fill="#7014E8">{m[r.k]}</text>
              <text x="326" y={r.ly + 11} fontSize="14" fontWeight="600" fill="#08044D">{EXAMPLE_VALUES[r.k]} cm</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
