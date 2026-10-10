import Link from "next/link";

import { appPaths } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { localizedPath, type Locale } from "@/i18n/config";
import { AppLink } from "@/components/ui/AppLink";
import { Reveal } from "@/components/ui/Reveal";
import { ArrowRight } from "@/components/ui/Icons";

export function FinalCta({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <section
      className="section-y relative overflow-hidden bg-[radial-gradient(90%_120%_at_50%_100%,#EFE6FF_0%,#FBF9FF_55%,#FFFFFF_100%)]"
      id="final-cta"
      aria-labelledby="final-title"
    >
      <div className="container-smz relative flex flex-col items-center text-center">
        <Reveal>
          <h2 id="final-title" className="text-gradient-mist max-w-3xl text-[clamp(2.1rem,5.2vw,3.9rem)] leading-[1.05]">
            {dict.final.title}
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-mist-400 sm:text-lg">{dict.final.body}</p>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
            <AppLink path={appPaths.measure} cta="final" className="btn btn-primary text-base">
              {dict.final.ctaPrimary}
              <ArrowRight className="btn-arrow" width={18} height={18} />
            </AppLink>
            <AppLink path={appPaths.tailorSignup} cta="final-tailor" className="btn btn-ghost">
              {dict.final.ctaSecondary}
            </AppLink>
          </div>
        </Reveal>

        <Reveal delay={260} className="mt-12 w-full max-w-md">
          <Link
            href={localizedPath(locale, "/telecharger")}
            className="surface-card flex items-center gap-4 p-4 text-left transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-violet-500/40"
          >
            <span aria-hidden className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-violet-100 text-violet-700">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="2" width="12" height="20" rx="2.5" />
                <path d="M12 7v7M9 11l3 3 3-3" />
              </svg>
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-mist-50">{dict.final.appTitle}</span>
              <span className="block text-sm text-mist-400">{dict.final.appBody}</span>
            </span>
            <span className="text-sm font-semibold text-violet-700">{dict.final.appCta}</span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
