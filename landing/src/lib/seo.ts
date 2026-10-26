/**
 * Référencement : adresses canoniques, versions linguistiques et données
 * structurées (schema.org), partagées par les pages, le sitemap et le layout.
 */
import type { Metadata } from "next";

import { appPaths, appHref, siteConfig } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { defaultLocale, htmlLang, locales, localizedPath, type Locale } from "@/i18n/config";

/** Pages publiques du site, sans la langue (`""` = accueil). */
export const publicPaths = ["", "/telecharger"] as const;

export function absoluteUrl(locale: Locale, path = ""): string {
  return `${siteConfig.url}${localizedPath(locale, path || "/")}`;
}

/** hreflang de chaque langue + x-default (le français, marché visé). */
export function languageAlternates(path = ""): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[htmlLang[locale]] = absoluteUrl(locale, path);
  languages["x-default"] = absoluteUrl(defaultLocale, path);
  return languages;
}

/**
 * Canonique + hreflang propres à UNE page. Sans cela, une page hérite de
 * l'adresse canonique du layout (l'accueil) et Google la prend pour un double.
 */
export function pageAlternates(locale: Locale, path = ""): Metadata["alternates"] {
  return { canonical: absoluteUrl(locale, path), languages: languageAlternates(path) };
}

const ORG_ID = `${siteConfig.url}/#organisation`;
const SITE_ID = `${siteConfig.url}/#site`;

/** Organisation, site et application : le « qui » et le « quoi » du service. */
export function siteJsonLd(locale: Locale, dict: Dictionary) {
  const country = siteConfig.location.country[locale];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: siteConfig.name,
        alternateName: ["Sur MeZur", "SurMeZur"],
        url: siteConfig.url,
        logo: {
          "@type": "ImageObject",
          url: `${siteConfig.url}/brand/icon-512.png`,
          width: 512,
          height: 512,
        },
        slogan: siteConfig.tagline,
        description: dict.meta.description,
        address: {
          "@type": "PostalAddress",
          addressLocality: siteConfig.location.city,
          addressCountry: "CM",
        },
        areaServed: { "@type": "Country", name: country },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          url: appHref(appPaths.contact),
          availableLanguage: ["French", "English"],
        },
      },
      {
        "@type": "WebSite",
        "@id": SITE_ID,
        name: siteConfig.name,
        alternateName: ["Sur MeZur", "SurMeZur"],
        url: siteConfig.url,
        inLanguage: locales.map((l) => htmlLang[l]),
        publisher: { "@id": ORG_ID },
      },
      {
        "@type": "WebApplication",
        name: siteConfig.name,
        url: siteConfig.appUrl,
        description: dict.meta.description,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Android, Web",
        inLanguage: locales.map((l) => htmlLang[l]),
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "XAF" },
        provider: { "@id": ORG_ID },
      },
    ],
  };
}

/** Les questions fréquentes de l'accueil, telles qu'affichées. */
export function faqJsonLd(locale: Locale, dict: Dictionary) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: htmlLang[locale],
    url: absoluteUrl(locale),
    mainEntity: dict.faq.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** Balise <script type="application/ld+json"> : `<` échappé contre l'injection. */
export function jsonLdHtml(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
