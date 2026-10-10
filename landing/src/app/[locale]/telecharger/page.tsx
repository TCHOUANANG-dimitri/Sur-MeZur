import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { photos } from "@/data/photos";
import { appPaths, siteConfig } from "@/data/site";
import { getDictionary } from "@/i18n";
import { defaultLocale, isLocale, localizedPath, type Locale } from "@/i18n/config";
import { AppLink } from "@/components/ui/AppLink";
import { ArrowRight } from "@/components/ui/Icons";
import { Reveal } from "@/components/ui/Reveal";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  return { title: dict.download.metaTitle, description: dict.download.metaDescription };
}

/**
 * Téléchargement de l'application Android (APK). L'adresse du fichier vient
 * de NEXT_PUBLIC_APK_URL : tant qu'elle est vide, la page propose
 * l'application web et l'ajout à l'écran d'accueil.
 */
export default async function DownloadPage({ params }: Params) {
  const { locale } = await params;
  const active: Locale = isLocale(locale) ? locale : defaultLocale;
  const d = getDictionary(active).download;
  const { url, size, version } = siteConfig.apk;
  const steps = [d.s1, d.s2, d.s3];

  return (
    <section className="relative overflow-hidden pb-24 pt-[calc(var(--nav-h)+2.5rem)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_70%_at_80%_0%,#EFE6FF_0%,#FFFFFF_70%)]" />
      <div className="container-smz relative grid items-start gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div>
          <Reveal as="p" className="eyebrow">
            {d.eyebrow}
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 text-[clamp(2.2rem,6vw,3.8rem)] leading-[1.04] text-mist-50">{d.title}</h1>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist-300">{d.sub}</p>
          </Reveal>

          {url ? (
            <Reveal delay={220} className="mt-8">
              <a href={url} className="btn btn-primary text-base" rel="noopener" download>
                {d.cta}
                <ArrowRight className="btn-arrow" width={18} height={18} />
              </a>
              <p className="mt-3 text-sm text-mist-500">
                {size ? `${d.sizeLabel} : ${size}` : null}
                {size && version ? " · " : null}
                {version ? `${d.versionLabel} ${version}` : null}
              </p>

              <h2 className="mt-12 font-sans text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">{d.stepsTitle}</h2>
              <ol className="mt-4 flex flex-col gap-4">
                {steps.map((s, i) => (
                  <li key={s} className="flex gap-4">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-violet-100 font-display text-violet-700">{i + 1}</span>
                    <span className="pt-1 text-[0.9375rem] text-mist-300">{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 max-w-xl rounded-2xl border border-violet-950/10 bg-ink-900 p-4 text-sm text-mist-400">{d.safety}</p>
            </Reveal>
          ) : (
            <Reveal delay={220} className="surface-tint mt-8 max-w-xl p-6">
              <p className="font-display text-2xl text-mist-50">{d.soonTitle}</p>
              <p className="mt-2 text-[0.9375rem] text-mist-400">{d.soonBody}</p>
              <AppLink path={appPaths.measure} cta="download-web" className="btn btn-primary mt-5">
                {d.openWeb}
                <ArrowRight className="btn-arrow" width={16} height={16} />
              </AppLink>
            </Reveal>
          )}

          <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2">
            <Reveal className="surface-card p-5">
              <p className="font-semibold text-mist-50">{d.pwaTitle}</p>
              <p className="mt-1 text-sm text-mist-400">{d.pwaBody}</p>
            </Reveal>
            <Reveal delay={80} className="surface-card p-5">
              <p className="font-semibold text-mist-50">{d.iosTitle}</p>
              <p className="mt-1 text-sm text-mist-400">{d.iosBody}</p>
            </Reveal>
          </div>

          <Link href={localizedPath(active, "/")} className="mt-10 inline-block text-sm font-semibold text-violet-700 hover:underline">
            ← {d.back}
          </Link>
        </div>

        <Reveal from="scale" delay={120} className="mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-[1.75rem] shadow-2xl shadow-violet-900/15 ring-1 ring-violet-200/60">
            <Image src={photos.stepResult} alt="" sizes="(min-width: 1024px) 28rem, 100vw" className="aspect-[4/5] h-auto w-full object-cover" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
