import Image from "next/image";

import { appPaths } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { publicFile } from "@/lib/assets";
import { AppLink } from "@/components/ui/AppLink";
import { ArrowRight } from "@/components/ui/Icons";
import { Reveal } from "@/components/ui/Reveal";
import { PatternPieces } from "@/components/visuals/PatternPieces";

/** Robe stylisée, en attendant la vraie photo de modèle (pattern-garment.webp). */
function GarmentSketch({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 200 260" className="h-full w-full" role="img" aria-label={label}>
      <rect width="200" height="260" fill="#F3EEFF" />
      <g fill="#5D06CC">
        <path d="M78 30c6 10 16 14 22 14s16-4 22-14l18 10-6 40c-4 10-8 14-8 24l40 118H34l40-118c0-10-4-14-8-24l-6-40Z" opacity=".9" />
      </g>
      <g fill="#F3EEFF" opacity=".55">
        <circle cx="86" cy="140" r="7" />
        <circle cx="114" cy="168" r="9" />
        <circle cx="74" cy="196" r="8" />
        <circle cx="126" cy="214" r="7" />
        <circle cx="100" cy="112" r="5" />
        <path d="M60 230c20-8 60-8 80 0" stroke="#F3EEFF" strokeWidth="3" fill="none" />
      </g>
    </svg>
  );
}

/**
 * La génération de patron, présentée comme ce qu'elle est : une fonction à
 * venir, réservée aux tailleurs, avec un appel à créer un compte pour
 * l'essayer en premier. Fond indigo pour rompre le rythme de la page.
 */
export function PatternTeaser({ dict }: { dict: Dictionary }) {
  const p = dict.pattern;
  const garment = publicFile("photos/pattern-garment.webp");
  const steps = [
    { n: "1", t: p.s1t, b: p.s1b },
    { n: "2", t: p.s2t, b: p.s2b },
    { n: "3", t: p.s3t, b: p.s3b },
  ];

  return (
    <section
      id="patron"
      aria-labelledby="pattern-title"
      className="section-y relative overflow-hidden bg-[radial-gradient(120%_90%_at_10%_0%,#2A0A7A_0%,#120856_45%,#08044D_100%)] text-white"
    >
      <div className="container-smz relative grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <Reveal className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#A537FC] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
              {p.badge}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">{p.eyebrow}</span>
          </Reveal>
          <Reveal delay={80}>
            <h2 id="pattern-title" className="mt-5 text-4xl leading-[1.06] text-white sm:text-5xl">
              {p.title}
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-violet-100/85 sm:text-lg">{p.sub}</p>
          </Reveal>

          <ol className="mt-8 flex flex-col gap-4">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.n} delay={200 + i * 80} className="flex gap-4">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full border border-violet-300/40 font-display text-violet-100">
                  {s.n}
                </span>
                <span>
                  <span className="block font-semibold text-white">{s.t}</span>
                  <span className="block text-sm text-violet-100/75">{s.b}</span>
                </span>
              </Reveal>
            ))}
          </ol>

          <Reveal delay={420} className="mt-9">
            <AppLink path={appPaths.tailorSignup} cta="pattern" className="btn bg-white text-violet-800 hover:-translate-y-0.5">
              {p.cta}
              <ArrowRight className="btn-arrow" width={16} height={16} />
            </AppLink>
            <p className="mt-3 max-w-md text-sm text-violet-100/70">{p.ctaNote}</p>
          </Reveal>
        </div>

        <Reveal from="scale" delay={120}>
          <div className="grid grid-cols-[minmax(0,0.62fr)_auto_minmax(0,1.38fr)] items-center gap-3 sm:gap-5">
            <figure className="m-0">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl ring-1 ring-white/15">
                {garment ? (
                  <Image src={garment} alt={p.garmentAlt} fill sizes="(min-width: 1024px) 18vw, 32vw" className="object-cover" />
                ) : (
                  <GarmentSketch label={p.garmentAlt} />
                )}
              </div>
              <figcaption className="mt-2 text-center text-xs text-violet-100/70">{p.photoLabel}</figcaption>
            </figure>
            <ArrowRight className="text-violet-200" width={26} height={26} />
            <figure className="m-0">
              <div className="rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/15">
                <PatternPieces labels={{ front: p.front, back: p.back, sleeve: p.sleeve }} title={p.piecesLabel} />
              </div>
              <figcaption className="mt-2 text-center text-xs text-violet-100/70">{p.piecesLabel}</figcaption>
            </figure>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
