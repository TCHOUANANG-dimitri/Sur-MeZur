import Image from "next/image";

import { testimonials } from "@/data/testimonials";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";

/** Preuve sociale : affichée seulement quand de vrais avis existent. */
export function Testimonials({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  if (testimonials.length === 0) return null;

  return (
    <section className="section-y" aria-labelledby="testimonials-title">
      <div className="container-smz">
        <SectionHeader
          align="center"
          eyebrow={dict.testimonials.eyebrow}
          title={<span id="testimonials-title">{dict.testimonials.title}</span>}
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.slice(0, 6).map((t, i) => (
            <Reveal key={t.name} delay={i * 80}>
              <figure className="surface-card m-0 flex h-full flex-col gap-5 p-6">
                <blockquote className="m-0 font-display text-lg leading-snug text-mist-100">
                  « {t.quote[locale]} »
                </blockquote>
                <figcaption className="mt-auto flex items-center gap-3">
                  {t.photo ? (
                    <Image src={t.photo} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
                  ) : null}
                  <span>
                    <span className="block font-semibold text-mist-50">{t.name}</span>
                    <span className="block text-sm text-mist-400">{t.role[locale]}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
