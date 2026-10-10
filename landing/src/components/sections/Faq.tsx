import type { Dictionary } from "@/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";
import { Check } from "@/components/ui/Icons";

/**
 * Lève les objections juste avant l'appel final : confidentialité des
 * photos, puis les six questions qui freinent l'essai.
 */
export function Faq({ dict }: { dict: Dictionary }) {
  const privacy = [dict.privacy.p1, dict.privacy.p2, dict.privacy.p3];

  return (
    <section className="section-y border-t border-violet-950/[0.08] bg-ink-900" id="questions" aria-labelledby="faq-title">
      <div className="container-smz grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <SectionHeader eyebrow={dict.faq.eyebrow} title={<span id="faq-title">{dict.faq.title}</span>} />
          <Reveal delay={120}>
            <div className="surface-card mt-8 p-6">
              <p className="font-display text-xl text-mist-50">{dict.privacy.title}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {privacy.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[0.9375rem] text-mist-300">
                    <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-violet-100 text-violet-700">
                      <Check width={12} height={12} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={80}>
          <div className="flex flex-col gap-3">
            {dict.faq.items.map((item, index) => (
              <details
                key={item.q}
                open={index === 0}
                className="group rounded-2xl border border-violet-950/12 bg-white transition-colors duration-300 hover:border-violet-600/40 open:border-violet-600/45"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[1.0625rem] font-semibold text-mist-100 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden
                    className="grid h-7 w-7 flex-none place-items-center rounded-full border border-violet-600/40 text-violet-600 transition-transform duration-300 group-open:rotate-45 group-open:bg-violet-600 group-open:text-white"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-[0.9375rem] leading-relaxed text-mist-400">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
