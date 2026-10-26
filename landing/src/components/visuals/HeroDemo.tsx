import type { CSSProperties } from "react";

import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";
import { AXE, DEMI_CORPS, miroir } from "./BodyModel";
import { EXAMPLE_VALUES } from "./MeasureCard";

/**
 * Démonstration du premier écran, en boucle (10 s) : le téléphone cadre la
 * personne de face, déclenche, la cadre de profil, déclenche, calcule, trace
 * les mesures sur la silhouette, puis affiche la fiche dont les chiffres
 * défilent. Tout en SVG et en CSS (globals.css, « HERO DEMO ») : aucun
 * script, quelques Ko. Les valeurs sont celles d'exemple, signalées comme
 * telles. Sans animation (préférence du téléphone), la scène finale est
 * affichée fixe.
 */

const FACE = `${DEMI_CORPS} L${AXE} 88 Z`;
const FACE_MIROIR = `${miroir(DEMI_CORPS)} L${AXE} 88 Z`;

/** Profil (tourné vers la droite), dans le même repère que la face. */
const PROFIL = [
  "M212 86", "L210 100",
  "C204 120 200 150 202 190", // dos
  "C204 222 198 246 196 262", // creux des reins
  "C192 286 194 310 200 330", // fesses
  "C206 360 206 400 208 430", // arrière de la cuisse
  "L206 510", "C206 520 200 528 202 532", "L246 532", // talon -> pointe du pied
  "C246 524 236 520 232 512", "L234 430", // cheville -> tibia
  "C238 400 240 360 238 330", // avant de la cuisse
  "C236 300 238 280 236 262", // hanche
  "C238 240 246 214 244 190", // ventre -> poitrine
  "C244 160 246 134 236 110", // poitrine -> cou
  "L232 100", "L232 86", "Z",
].join(" ");
const BRAS_PROFIL = "M214 114 C212 160 214 210 218 268 C219 280 227 284 229 276 C227 230 229 170 233 122 Z";

/** Élargit un tracé autour de l'axe (x = AXE), sans toucher aux hauteurs. */
function elargir(d: string, k: number): string {
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${Math.round((AXE + (Number(x) - AXE) * k) * 10) / 10} ${y}`);
}
const PROFIL_LARGE = elargir(PROFIL, 1.6);
const BRAS_LARGE = elargir(BRAS_PROFIL, 1.6);

/** Lignes de mesure tracées sur la face (repère du corps). */
const LIGNES = [
  "M166 112 H274", // carrure
  "M163 176 H277", // poitrine
  "M170 244 H270", // taille
  "M160 300 H280", // hanches
  "M212 352 L198 518", // jambe
];

const ROWS = ["chest", "waist", "hips", "shoulder"] as const;

/** Remplissage d'un seul tenant, contour sans le trait de l'axe central. */
function Silhouette({ className, guide }: { className: string; guide?: boolean }) {
  return (
    <g className={className}>
      {guide ? null : (
        <g stroke="none">
          <path d={FACE} />
          <path d={FACE_MIROIR} />
        </g>
      )}
      <g fill="none">
        <path d={DEMI_CORPS} />
        <path d={miroir(DEMI_CORPS)} />
      </g>
      <circle cx={AXE} cy="62" r="26" />
    </g>
  );
}

export function HeroDemo({ dict, className }: { dict: Dictionary; className?: string }) {
  const d = dict.hero.demo;

  return (
    <div
      role="img"
      aria-label={d.alt}
      className={cn(
        "hero-demo aspect-[9/18.5] [container-type:inline-size] overflow-hidden rounded-[2rem] border-[7px] border-mist-50 bg-[#F6F2FC] shadow-[var(--shadow-lift)] ring-1 ring-violet-950/10",
        className,
      )}
    >
      {/* Encoche */}
      <span aria-hidden className="absolute left-1/2 top-[2.5cqw] z-20 h-[6cqw] w-[28cqw] -translate-x-1/2 rounded-full bg-mist-50" />

      <svg aria-hidden viewBox="0 0 200 410" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hd-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8C29FB" stopOpacity="0" />
            <stop offset="85%" stopColor="#8C29FB" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8C29FB" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Mur clair du cadrage */}
        <rect width="200" height="410" fill="#F6F2FC" />
        <rect y="330" width="200" height="80" fill="#EEE7F8" />

        {/* Viseur : coins du cadre */}
        <g className="hd-viewfinder" fill="none" stroke="#5D06CC" strokeWidth="2.2" strokeLinecap="round">
          <path d="M22 58 V44 H36" />
          <path d="M164 44 H178 V58" />
          <path d="M22 338 V352 H36" />
          <path d="M164 352 H178 V338" />
        </g>

        <g transform="translate(-32 26) scale(0.6)">
          {/* Face : guide pointillé, puis silhouette « prise » */}
          <Silhouette className="hd-face-guide" guide />
          <Silhouette className="hd-face" />

          {/* Profil : guide puis silhouette */}
          <g className="hd-profile-guide">
            <path d={PROFIL_LARGE} />
            <path d={BRAS_LARGE} />
            <circle cx="224" cy="62" r="25" />
          </g>
          <g className="hd-profile">
            <path d={PROFIL_LARGE} />
            <path d={BRAS_LARGE} />
            <circle cx="224" cy="62" r="25" />
          </g>

          {/* Mesures tracées */}
          <g className="hd-lines" fill="none" stroke="#5D06CC" strokeWidth="3.2" strokeLinecap="round">
            {LIGNES.map((line, i) => (
              <path key={line} d={line} pathLength={1} style={{ "--i": i } as CSSProperties} />
            ))}
          </g>
          <g className="hd-dots" fill="#5D06CC">
            {[
              [166, 112], [274, 112], [163, 176], [277, 176],
              [170, 244], [270, 244], [160, 300], [280, 300],
            ].map(([x, y], i) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="5" style={{ "--i": Math.floor(i / 2) } as CSSProperties} />
            ))}
          </g>
        </g>

        {/* Balayage du calcul */}
        <rect className="hd-scan" x="14" y="0" width="172" height="60" fill="url(#hd-scan)" />

        {/* Déclencheur */}
        <g className="hd-shutter">
          <circle cx="100" cy="382" r="15" fill="#FFFFFF" stroke="#5D06CC" strokeWidth="2.5" />
          <circle cx="100" cy="382" r="10" fill="#5D06CC" />
        </g>

        {/* Éclairs des deux prises */}
        <rect className="hd-flash hd-flash-1" width="200" height="410" fill="#FFFFFF" />
        <rect className="hd-flash hd-flash-2" width="200" height="410" fill="#FFFFFF" />
      </svg>

      {/* Étiquette de l'étape */}
      <div aria-hidden className="absolute inset-x-0 top-[12cqw] z-10 grid place-items-center text-[4.8cqw] font-semibold">
        <span className="hd-step hd-step-1 col-start-1 row-start-1 rounded-full bg-white px-[5cqw] py-[1.6cqw] text-violet-700 shadow-sm">
          1 · {d.front}
        </span>
        <span className="hd-step hd-step-2 col-start-1 row-start-1 rounded-full bg-white px-[5cqw] py-[1.6cqw] text-violet-700 shadow-sm">
          2 · {d.profile}
        </span>
        <span className="hd-step hd-step-3 col-start-1 row-start-1 rounded-full bg-violet-600 px-[5cqw] py-[1.6cqw] text-white shadow-sm">
          {d.analysing}
        </span>
      </div>

      {/* Fiche de résultat */}
      <div aria-hidden className="hd-sheet absolute inset-x-[3.5cqw] bottom-[3.5cqw] z-10 rounded-[8cqw] bg-white p-[5.5cqw] shadow-[0_-8px_30px_rgba(8,4,77,0.12)]">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-[6.6cqw] leading-tight text-mist-50">{d.result}</p>
          <span className="rounded-full bg-violet-100 px-[2.6cqw] py-[0.8cqw] text-[3.8cqw] font-semibold uppercase tracking-[0.1em] text-violet-700">
            {dict.hero.cardExample}
          </span>
        </div>
        <dl className="mt-[2.5cqw] divide-y divide-violet-950/[0.07]">
          {ROWS.map((key, i) => (
            <div key={key} className="hd-row flex items-baseline justify-between gap-[2cqw] py-[1.8cqw] text-[5.4cqw]" style={{ "--i": i } as CSSProperties}>
              <dt className="min-w-0 truncate text-mist-400">{dict.measures[key]}</dt>
              <dd className="whitespace-nowrap font-semibold tabular-nums text-mist-50">
                <span className="hd-count" style={{ "--to": EXAMPLE_VALUES[key] } as CSSProperties} />
                {" cm"}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-[1.8cqw] text-[4.2cqw] leading-snug text-mist-500">{d.more}</p>
      </div>
    </div>
  );
}
