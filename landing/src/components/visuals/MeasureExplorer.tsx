"use client";

import { useState } from "react";

import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";
import { BodyModel, type MeasureKey } from "./BodyModel";
import { EXAMPLE_VALUES } from "./MeasureCard";

/**
 * Les 12 mesures et la silhouette, reliées : toucher une mesure dans la
 * liste (ou sur le corps) l'allume sur la silhouette et l'affiche en grand.
 * Survol à la souris, toucher au téléphone, clavier (boutons). Valeurs
 * d'exemple.
 */
export function MeasureExplorer({
  dict,
  groups,
  header,
  footer,
}: {
  dict: Dictionary;
  groups: { title: string; keys: MeasureKey[] }[];
  header: React.ReactNode;
  footer: React.ReactNode;
}) {
  const m = dict.measures;
  const [active, setActive] = useState<MeasureKey | null>(null);

  return (
    // Téléphone : titre, silhouette, puis pastilles (la silhouette reste à
    // l'écran pendant qu'on touche une mesure). Écran large : silhouette à
    // gauche, titre et pastilles à droite.
    <div className="container-smz grid items-center gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto]">
      <div className="lg:col-start-2 lg:row-start-1 lg:self-end">{header}</div>

      <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <div className="surface-tint grid w-full place-items-center p-4 sm:p-10 [&_svg]:max-w-[300px] sm:[&_svg]:max-w-[420px]">
          <BodyModel dict={dict} title={m.title} active={active} onSelect={(k) => setActive((cur) => (cur === k ? null : k))} />
          {/* Lecture de la mesure choisie */}
          <p aria-live="polite" className="mt-3 min-h-[2.75rem] text-center">
            {active ? (
              <>
                <span className="block text-sm text-violet-700">{m[active]}</span>
                <span className="font-display text-2xl text-mist-50">{EXAMPLE_VALUES[active]} cm</span>
              </>
            ) : (
              <span className="text-xs uppercase tracking-[0.14em] text-mist-500">{m.hint}</span>
            )}
          </p>
        </div>
      </div>

      <div className="lg:col-start-2 lg:row-start-2 lg:self-start">
        <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">{g.title}</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {g.keys.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      aria-pressed={active === key}
                      onMouseEnter={() => setActive(key)}
                      onFocus={() => setActive(key)}
                      onClick={() => setActive(key)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm ring-1 transition-colors duration-300",
                        active === key
                          ? "bg-violet-600 text-white ring-violet-600"
                          : "bg-violet-50 text-mist-200 ring-violet-950/[0.06] hover:bg-violet-100",
                      )}
                    >
                      {m[key]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {footer}
      </div>
    </div>
  );
}
