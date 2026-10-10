import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";

/** Valeurs d'exemple, affichées comme telles (jamais présentées comme réelles). */
export const EXAMPLE_VALUES = {
  chest: 96,
  waist: 82,
  hips: 98,
  neck: 39,
  shoulder: 46,
  back_length: 44,
  biceps: 31,
  wrist: 17,
  sleeve_length: 61,
  thigh: 56,
  inseam: 79,
  ankle: 23,
} as const;

type Key = keyof typeof EXAMPLE_VALUES;

/**
 * Fiche de mesures façon application, en HTML (pas une capture) : elle
 * illustre le résultat et porte la mention « Exemple ».
 */
export function MeasureCard({
  dict,
  keys = ["chest", "waist", "hips", "shoulder", "sleeve_length", "inseam"],
  className,
}: {
  dict: Dictionary;
  keys?: Key[];
  className?: string;
}) {
  return (
    <div className={cn("w-[17rem] rounded-2xl bg-white p-4 shadow-[var(--shadow-lift)] ring-1 ring-violet-950/10", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-base text-mist-50">{dict.hero.cardTitle}</p>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-violet-700">
          {dict.hero.cardExample}
        </span>
      </div>
      <dl className="mt-3 divide-y divide-violet-950/[0.07]">
        {keys.map((key) => (
          <div key={key} className="flex items-baseline justify-between py-1.5 text-sm">
            <dt className="text-mist-400">{dict.measures[key]}</dt>
            <dd className="font-semibold tabular-nums text-mist-50">{EXAMPLE_VALUES[key]} cm</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[0.6875rem] text-mist-500">{dict.hero.cardFooter}</p>
    </div>
  );
}
