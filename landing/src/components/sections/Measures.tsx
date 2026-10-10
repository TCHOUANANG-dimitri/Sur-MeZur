import Image from "next/image";

import type { Dictionary } from "@/i18n";
import { publicFile } from "@/lib/assets";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";
import { BodyModel } from "@/components/visuals/BodyModel";
import { EXAMPLE_VALUES } from "@/components/visuals/MeasureCard";

type Key = keyof typeof EXAMPLE_VALUES;

/**
 * Les 12 mesures, rangées comme dans l'application. Si une vraie capture
 * d'écran du résultat est déposée (`public/screens/resultat.png`), elle
 * remplace la silhouette : une preuve réelle vaut mieux qu'une illustration.
 */
export function Measures({ dict }: { dict: Dictionary }) {
  const m = dict.measures;
  const groups: { title: string; keys: Key[] }[] = [
    { title: m.groupTop, keys: ["chest", "waist", "neck", "shoulder", "back_length"] },
    { title: m.groupArms, keys: ["biceps", "sleeve_length", "wrist"] },
    { title: m.groupLegs, keys: ["hips", "thigh", "inseam", "ankle"] },
  ];
  const screenshot = publicFile("screens/resultat.png");

  return (
    <section className="section-y" id="mesures" aria-labelledby="measures-title">
      <div className="container-smz grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Reveal from="left" className="order-2 grid place-items-center lg:order-1">
          {screenshot ? (
            <div className="relative w-[17rem] overflow-hidden rounded-[2.25rem] border-[10px] border-mist-50 bg-white shadow-[var(--shadow-lift)] sm:w-[19rem]">
              <Image src={screenshot} alt={m.screenAlt} width={760} height={1640} sizes="19rem" className="h-auto w-full" />
            </div>
          ) : (
            <div className="surface-tint grid w-full place-items-center p-6 sm:p-10">
              <BodyModel dict={dict} title={m.title} />
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-mist-500">{m.example}</p>
            </div>
          )}
        </Reveal>

        <div className="order-1 lg:order-2">
          <SectionHeader
            eyebrow={m.eyebrow}
            title={<span id="measures-title">{m.title}</span>}
            subtitle={m.sub}
          />
          <div className="mt-8 grid gap-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {groups.map((g, gi) => (
              <Reveal key={g.title} delay={gi * 90}>
                <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">{g.title}</h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {g.keys.map((key) => (
                    <li key={key} className="border-b border-violet-950/[0.08] pb-2 text-[0.9375rem] text-mist-200">
                      {m[key]}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-mist-500">{m.honest}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
