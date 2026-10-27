import Image from "next/image";
import type { CSSProperties } from "react";

import { photos } from "@/data/photos";
import { CONTOUR_FACE, CONTOUR_PROFIL, LIGNES_FACE, PHOTO } from "@/data/heroGeometry";
import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";
import { EXAMPLE_VALUES } from "./MeasureCard";

/**
 * Démonstration du premier écran, en boucle (10 s), sur de vraies photos
 * (personne fictive, images générées) : le téléphone cadre le client de face
 * (contour en pointillé sur la photo), déclenche, le cadre de profil,
 * déclenche, calcule, trace les mesures sur la photo de face, puis affiche la
 * fiche dont les chiffres défilent. Contours et lignes : data/heroGeometry.
 * Animation en CSS (globals.css, « HERO DEMO ») ; sans animation (préférence
 * du téléphone), la scène finale est affichée fixe. Valeurs d'exemple.
 */

const ROWS = ["chest", "waist", "hips", "shoulder"] as const;

export function HeroDemo({ dict, className, style }: { dict: Dictionary; className?: string; style?: CSSProperties }) {
  const d = dict.hero.demo;
  const vue = `0 0 ${PHOTO.largeur} ${PHOTO.hauteur}`;

  return (
    <div
      role="img"
      aria-label={d.alt}
      style={style}
      className={cn(
        "hero-in hero-demo aspect-[9/18.5] [container-type:inline-size] overflow-hidden rounded-[2rem] border-[7px] border-mist-50 bg-[#E9E4DC] shadow-[var(--shadow-lift)] ring-1 ring-violet-950/10",
        className,
      )}
    >
      {/* Les deux prises de vue, recadrées comme l'écran d'un téléphone */}
      <Image src={photos.stepFront} alt="" fill sizes="15rem" className="hd-ph-front object-cover" />
      <Image src={photos.stepProfile} alt="" fill sizes="15rem" className="hd-ph-profile object-cover" />

      {/* Contours et mesures, dans le repère des photos (même recadrage) */}
      <svg aria-hidden viewBox={vue} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <path className="hd-face-guide" d={CONTOUR_FACE} />
        <path className="hd-face" d={CONTOUR_FACE} />
        <path className="hd-profile-guide" d={CONTOUR_PROFIL} />
        <path className="hd-profile" d={CONTOUR_PROFIL} />
        <g className="hd-lines" fill="none" stroke="#8C29FB" strokeWidth="14" strokeLinecap="round">
          {LIGNES_FACE.map((l, i) => (
            <path key={l.y} d={`M${l.x0} ${l.y} H${l.x1}`} pathLength={1} style={{ "--i": i } as CSSProperties} />
          ))}
        </g>
        <g className="hd-dots" fill="#FFFFFF" stroke="#8C29FB" strokeWidth="8">
          {LIGNES_FACE.flatMap((l, i) =>
            [l.x0, l.x1].map((x) => <circle key={`${x}-${l.y}`} cx={x} cy={l.y} r="16" style={{ "--i": i } as CSSProperties} />),
          )}
        </g>
      </svg>

      {/* Interface du téléphone : encoche, viseur, balayage, déclencheur, éclairs */}
      <span aria-hidden className="absolute left-1/2 top-[2.5cqw] z-20 h-[6cqw] w-[28cqw] -translate-x-1/2 rounded-full bg-mist-50" />
      <svg aria-hidden viewBox="0 0 200 410" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hd-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8C29FB" stopOpacity="0" />
            <stop offset="85%" stopColor="#8C29FB" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#C9A8FF" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <g className="hd-viewfinder" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round">
          <path d="M18 60 V44 H34" />
          <path d="M166 44 H182 V60" />
          <path d="M18 336 V352 H34" />
          <path d="M166 352 H182 V336" />
        </g>
        <rect className="hd-scan" x="10" y="0" width="180" height="60" fill="url(#hd-scan)" />
        <g className="hd-shutter">
          <circle cx="100" cy="382" r="15" fill="none" stroke="#FFFFFF" strokeWidth="3" />
          <circle cx="100" cy="382" r="10.5" fill="#FFFFFF" />
        </g>
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
