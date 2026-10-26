import Image from "next/image";
import type { CSSProperties } from "react";

import { photos } from "@/data/photos";
import { appPaths } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { localizePath, type Locale } from "@/i18n/config";
import { AppLink } from "@/components/ui/AppLink";
import { ArrowRight, Check } from "@/components/ui/Icons";
import { HeroDemo } from "@/components/visuals/HeroDemo";

/**
 * Premier écran : la promesse en une phrase, l'action principale, trois
 * réassurances, et le résultat montré (la fiche) plutôt que décrit. Tout ce
 * qui compte tient dans les 7 premières secondes sur un téléphone.
 */
export function Hero({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const reassure = [dict.hero.reassure1, dict.hero.reassure2, dict.hero.reassure3];

  return (
    <section
      className="relative overflow-hidden pb-20 pt-[calc(var(--nav-h)+2rem)] sm:pb-28 lg:pt-[calc(var(--nav-h)+4rem)]"
      aria-labelledby="hero-title"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_80%_0%,#EFE6FF_0%,#F8F5FF_40%,#FFFFFF_75%)]" />
      </div>

      <div className="container-smz relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <div className="max-w-[40rem]">
          <p className="eyebrow hero-in">
            {dict.hero.eyebrow}
          </p>

          <div className="hero-in" style={{ "--d": "80ms" } as CSSProperties}>
            <h1
              id="hero-title"
              className="mt-5 font-display text-[clamp(2.4rem,7.4vw,4.9rem)] font-semibold leading-[1.02] tracking-[-0.03em]"
            >
              <span className="block text-mist-50">{dict.hero.h1a}</span>
              <span className="block text-gradient">{dict.hero.h1b}</span>
            </h1>
          </div>

          <div className="hero-in" style={{ "--d": "160ms" } as CSSProperties}>
            <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-mist-300 sm:text-lg">
              {dict.hero.sub}
            </p>
          </div>

          <div className="hero-in" style={{ "--d": "240ms" } as CSSProperties}>
            <div id="hero-cta" className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <AppLink path={appPaths.measure} cta="hero" className="btn btn-primary text-base">
                {dict.hero.ctaPrimary}
                <ArrowRight className="btn-arrow" width={18} height={18} />
              </AppLink>
              <a href={localizePath(locale, "#tailleurs")} className="btn btn-ghost">
                {dict.hero.ctaSecondary}
              </a>
            </div>
          </div>

          <div className="hero-in" style={{ "--d": "320ms" } as CSSProperties}>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-mist-400">
              {reassure.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-violet-100 text-violet-700">
                    <Check width={12} height={12} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Photo affichée tout de suite (c'est l'élément le plus grand de
            l'écran : la faire attendre retarde tout l'affichage). */}
        <div className="relative">
          <div className="relative overflow-hidden rounded-[1.75rem] shadow-2xl shadow-violet-900/15 ring-1 ring-violet-200/60">
            <Image
              src={photos.heroAtelier}
              alt={dict.hero.photoAlt}
              priority
              placeholder="blur"
              sizes="(min-width: 1024px) 52vw, 100vw"
              className="aspect-[4/5] h-auto w-full object-cover sm:aspect-[3/2]"
            />
          </div>
          <HeroDemo
            dict={dict}
            style={{ "--d": "350ms" } as CSSProperties}
            className="absolute -bottom-12 right-2 w-[11.5rem] sm:-bottom-14 sm:right-[-1.25rem] sm:w-[13.5rem] lg:w-[14.5rem]"
          />
        </div>
      </div>
    </section>
  );
}
