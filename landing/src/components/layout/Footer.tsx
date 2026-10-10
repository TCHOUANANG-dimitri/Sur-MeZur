import Link from "next/link";

import { appHref, appPaths, siteConfig } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { localizePath, localizedPath, type Locale } from "@/i18n/config";
import { Logo } from "@/components/ui/Logo";

type FooterProps = { locale: Locale; dict: Dictionary };

const linkClass = "text-sm text-mist-300 transition-colors duration-300 hover:text-violet-600";
const titleClass = "font-sans text-xs font-semibold uppercase tracking-[0.18em] text-mist-500";

export function Footer({ locale, dict }: FooterProps) {
  const f = dict.footer;
  const year = new Date().getFullYear();

  const product = [
    { label: f.how, href: localizePath(locale, "#comment-ca-marche") },
    { label: f.clients, href: localizePath(locale, "#clients") },
    { label: f.tailors, href: localizePath(locale, "#tailleurs") },
    { label: f.pattern, href: localizePath(locale, "#patron") },
    { label: f.download, href: localizedPath(locale, "/telecharger") },
  ];
  const help = [
    { label: f.faq, href: localizePath(locale, "#questions"), external: false },
    { label: f.contact, href: appHref(appPaths.contact), external: true },
    { label: f.privacy, href: appHref(appPaths.privacy), external: true },
    { label: f.terms, href: appHref(appPaths.terms), external: true },
  ];

  return (
    <footer className="border-t border-violet-950/[0.09] bg-ink-950 pb-24 md:pb-0">
      <div className="container-smz pb-10 pt-16 lg:pt-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:gap-10">
          <div className="flex flex-col gap-5">
            <Link href={localizedPath(locale, "/")} aria-label="Sur-MeZur" className="w-fit">
              <Logo size={52} />
            </Link>
            <p className="font-display text-xl text-mist-50">{f.tagline}</p>
            <p className="max-w-sm text-sm leading-relaxed text-mist-400">{f.blurb}</p>
          </div>

          <nav aria-labelledby="footer-product" className="flex flex-col gap-4">
            <h2 id="footer-product" className={titleClass}>
              {f.product}
            </h2>
            <ul className="flex flex-col gap-3">
              {product.map((item) => (
                <li key={item.label}>
                  <a href={item.href} className={linkClass}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-help" className="flex flex-col gap-4">
            <h2 id="footer-help" className={titleClass}>
              {f.help}
            </h2>
            <ul className="flex flex-col gap-3">
              {help.map((item) => (
                <li key={item.label}>
                  <a href={item.href} className={linkClass} {...(item.external ? { rel: "noopener" } : {})}>
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <a href={`mailto:${siteConfig.email}`} className={linkClass}>
                  {siteConfig.email}
                </a>
              </li>
            </ul>
          </nav>

          <div className="flex flex-col gap-4">
            <h2 className={titleClass}>{f.social}</h2>
            <ul className="flex flex-col gap-3">
              {siteConfig.socials.map((social) => (
                <li key={social.label}>
                  <a href={social.href} target="_blank" rel="noreferrer noopener" className={linkClass}>
                    {social.label}
                  </a>
                </li>
              ))}
              <li>
                <a href={siteConfig.parent.url} target="_blank" rel="noreferrer noopener" className={linkClass}>
                  {f.about}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="rule-smz my-8 opacity-60" />

        <div className="flex flex-col-reverse items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs text-mist-500">
            © {year} Sur-MeZur. {f.rights}
          </p>
          <p className="text-xs text-mist-500">
            {f.built} {siteConfig.location.city}, {siteConfig.location.country[locale]}
          </p>
        </div>
      </div>
    </footer>
  );
}
