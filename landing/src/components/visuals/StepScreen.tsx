import Image from "next/image";

import { photos } from "@/data/photos";
import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";
import { EXAMPLE_VALUES } from "./MeasureCard";

type Key = keyof typeof EXAMPLE_VALUES;

const ALL: Key[] = [
  "chest", "waist", "hips", "neck", "shoulder", "back_length",
  "biceps", "sleeve_length", "wrist", "thigh", "inseam", "ankle",
];

/**
 * L'écran de l'application à chaque étape de « Comment ça marche » :
 * 1 · le formulaire (taille, poids, sexe), 2 · la prise de vue (face puis
 * profil, en boucle), 3 · la fiche de mesures. Illustration en HTML aux
 * valeurs d'exemple : le texte de l'étape porte l'information, l'écran est
 * donc masqué aux lecteurs d'écran. Tailles en unités `cqw` : l'écran garde
 * ses proportions dans le grand téléphone comme dans une carte.
 */
export function StepScreen({
  step,
  dict,
  compact = false,
  className,
}: {
  step: 1 | 2 | 3;
  dict: Dictionary;
  /** Carte de téléphone (moins haute) : moins de lignes dans la fiche. */
  compact?: boolean;
  className?: string;
}) {
  const s = dict.how.screen;

  return (
    <div aria-hidden className={cn("absolute inset-0 overflow-hidden bg-[#F6F2FC] [container-type:inline-size]", className)}>
      {step === 1 ? (
        <div className="flex h-full flex-col px-[8cqw] pb-[8cqw] pt-[16cqw]">
          <p className="font-display text-[8.5cqw] leading-tight text-mist-50">{s.infoTitle}</p>
          <div className="mt-[6cqw] flex flex-col gap-[4cqw]">
            {[
              [s.height, "178 cm"],
              [s.weight, "72 kg"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[4.4cqw] font-semibold uppercase tracking-[0.12em] text-violet-700">{label}</p>
                <p className="mt-[1.5cqw] rounded-[3.5cqw] bg-white px-[4.5cqw] py-[3.2cqw] text-[5.6cqw] font-semibold text-mist-50 ring-1 ring-violet-950/10">
                  {value}
                </p>
              </div>
            ))}
            <div>
              <p className="text-[4.4cqw] font-semibold uppercase tracking-[0.12em] text-violet-700">{s.sex}</p>
              <div className="mt-[1.5cqw] grid grid-cols-2 gap-[2.5cqw] text-[5.2cqw] font-semibold">
                <span className="rounded-full bg-violet-600 py-[2.8cqw] text-center text-white">{s.man}</span>
                <span className="rounded-full bg-white py-[2.8cqw] text-center text-mist-400 ring-1 ring-violet-950/10">{s.woman}</span>
              </div>
            </div>
          </div>
          <span className="mt-auto rounded-full bg-violet-600 py-[3.6cqw] text-center text-[5.4cqw] font-semibold text-white">
            {s.next}
          </span>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="ss-shoot h-full">
          <Image src={photos.stepFront} alt="" fill sizes="(min-width: 768px) 18rem, 80vw" className="ss-front object-cover object-[50%_40%]" />
          <Image src={photos.stepProfile} alt="" fill sizes="(min-width: 768px) 18rem, 80vw" className="ss-profile object-cover object-[50%_40%]" />
          {/* Viseur */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-[7%] h-[86%] w-[86%]" fill="none" stroke="#FFFFFF" strokeWidth="1.6" vectorEffect="non-scaling-stroke">
            <path d="M0 8 V0 H10" vectorEffect="non-scaling-stroke" />
            <path d="M90 0 H100 V8" vectorEffect="non-scaling-stroke" />
            <path d="M0 92 V100 H10" vectorEffect="non-scaling-stroke" />
            <path d="M90 100 H100 V92" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="absolute inset-x-0 top-[13cqw] grid place-items-center text-[4.8cqw] font-semibold">
            <span className="ss-label-front col-start-1 row-start-1 rounded-full bg-white/95 px-[5cqw] py-[1.6cqw] text-violet-700">1 · {s.front}</span>
            <span className="ss-label-profile col-start-1 row-start-1 rounded-full bg-white/95 px-[5cqw] py-[1.6cqw] text-violet-700">2 · {s.profile}</span>
          </div>
          <span className="absolute bottom-[7cqw] left-1/2 grid h-[15cqw] w-[15cqw] -translate-x-1/2 place-items-center rounded-full border-[1.2cqw] border-white">
            <span className="h-[10cqw] w-[10cqw] rounded-full bg-white" />
          </span>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex h-full flex-col px-[6cqw] pb-[6cqw] pt-[15cqw]">
          <div className="flex items-center justify-between gap-[2cqw]">
            <p className="font-display text-[8cqw] leading-tight text-mist-50">{s.result}</p>
            <span className="rounded-full bg-violet-100 px-[2.6cqw] py-[0.8cqw] text-[3.8cqw] font-semibold uppercase tracking-[0.1em] text-violet-700">
              {dict.hero.cardExample}
            </span>
          </div>
          <dl className="mt-[3cqw] divide-y divide-violet-950/[0.07] rounded-[4cqw] bg-white px-[4cqw] ring-1 ring-violet-950/10">
            {(compact ? ALL.slice(0, 6) : ALL).map((key) => (
              <div key={key} className="flex items-baseline justify-between gap-[2cqw] py-[1.9cqw] text-[4.9cqw]">
                <dt className="min-w-0 truncate text-mist-400">{dict.measures[key]}</dt>
                <dd className="whitespace-nowrap font-semibold tabular-nums text-mist-50">{EXAMPLE_VALUES[key]} cm</dd>
              </div>
            ))}
          </dl>
          {compact ? <p className="mt-[2cqw] text-[4.2cqw] text-mist-500">{s.more}</p> : null}
          <span className="mt-auto rounded-full bg-violet-600 py-[3.4cqw] text-center text-[5.2cqw] font-semibold text-white">
            {s.send}
          </span>
        </div>
      ) : null}
    </div>
  );
}
