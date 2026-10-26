import Image from "next/image";
import Link from "next/link";

import { photos } from "@/data/photos";
import { siteConfig } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { localizedPath, type Locale } from "@/i18n/config";
import { ArrowRight, Check } from "@/components/ui/Icons";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Application Android : ce qu'elle apporte, le téléchargement direct de
 * l'APK et le lien vers la page d'installation pas à pas. À droite, un
 * téléphone montre le premier écran de l'application (la présentation).
 * Tant qu'aucun APK n'est publié, le bouton mène à la page /telecharger.
 */
export function AppDownload({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const a = dict.app;
  const { url, version } = siteConfig.apk;
  const size = siteConfig.apk.size(locale);
  const howHref = localizedPath(locale, "/telecharger");
  const features = [
    { t: a.f1t, b: size ? `${size} ${a.f1b}` : a.f1bNoSize },
    { t: a.f2t, b: a.f2b },
    { t: a.f3t, b: a.f3b },
  ];

  return (
    <section id="application" aria-labelledby="app-title" className="section-y relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_85%_30%,#EFE6FF_0%,#FFFFFF_65%)]" />
      <div className="container-smz relative grid items-center gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div>
          <Reveal as="p" className="eyebrow">
            {a.eyebrow}
          </Reveal>
          <Reveal delay={80}>
            <h2 id="app-title" className="mt-5 text-4xl leading-[1.06] text-mist-50 sm:text-5xl">
              {a.title}
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-mist-300 sm:text-lg">{a.sub}</p>
          </Reveal>

          <ul className="mt-8 grid gap-4">
            {features.map((f, i) => (
              <Reveal as="li" key={f.t} delay={200 + i * 70} className="flex gap-4">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-violet-100 text-violet-700">
                  <Check width={16} height={16} />
                </span>
                <span>
                  <span className="block font-semibold text-mist-50">{f.t}</span>
                  <span className="block text-[0.9375rem] text-mist-400">{f.b}</span>
                </span>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={420} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            {url ? (
              <a href={url} className="btn btn-primary text-base" download="sur-mezur.apk" rel="noopener">
                {a.cta}
                <ArrowRight className="btn-arrow" width={18} height={18} />
              </a>
            ) : (
              <Link href={howHref} className="btn btn-primary text-base">
                {a.cta}
                <ArrowRight className="btn-arrow" width={18} height={18} />
              </Link>
            )}
            <Link href={howHref} className="btn btn-ghost">
              {a.how}
            </Link>
          </Reveal>
          <Reveal delay={480}>
            <p className="mt-4 text-sm text-mist-500">
              {a.note}
              {version ? ` · v${version}` : ""}
              {size ? ` · ${size}` : ""}
            </p>
          </Reveal>
        </div>

        {/* Telephone : premier ecran de l'application. */}
        <Reveal from="scale" delay={160} className="mx-auto w-full max-w-[19rem]">
          <div className="relative rounded-[2.6rem] bg-[#0b0820] p-[0.65rem] shadow-2xl shadow-violet-900/25 ring-1 ring-white/10">
            <div className="absolute left-1/2 top-[1.05rem] z-10 h-[1.15rem] w-[5.5rem] -translate-x-1/2 rounded-full bg-[#0b0820]" aria-hidden />
            <div className="relative overflow-hidden rounded-[2.05rem] bg-white">
              <div className="aspect-[9/19.5] w-full">
                <div className="relative h-[58%] w-full p-3 pt-10">
                  <div className="relative h-full w-full overflow-hidden rounded-[1.4rem]">
                    <Image src={photos.heroAtelier} alt="" fill sizes="18rem" className="object-cover object-[42%_50%]" />
                  </div>
                </div>
                <div className="px-5 pt-2">
                  <p className="font-display text-[1.35rem] leading-tight text-mist-50">{a.screenTitle}</p>
                  <p className="mt-2 text-[0.8125rem] leading-snug text-mist-400">{a.screenBody}</p>
                  <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
                    <span className="h-1.5 w-6 rounded-full bg-violet-600" />
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-200" />
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-200" />
                  </div>
                  <div className="mt-4 rounded-full bg-gradient-to-r from-violet-600 to-violet-800 py-2.5 text-center text-[0.8125rem] font-semibold text-white" aria-hidden>
                    {a.screenCta}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
