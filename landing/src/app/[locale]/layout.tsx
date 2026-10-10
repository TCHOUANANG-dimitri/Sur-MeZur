import type { Metadata, Viewport } from "next";
import { Jost, Playfair_Display } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Attribution } from "@/components/layout/Attribution";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { siteConfig } from "@/data/site";
import { getDictionary } from "@/i18n";
import { defaultLocale, htmlLang, isLocale, locales, type Locale } from "@/i18n/config";

import "../globals.css";

/*
 * The wordmark in the logo is a high-contrast Didone; Playfair Display is the
 * closest match available as a variable web font. Jost is the geometric
 * companion that echoes the tagline set in wide capitals underneath it.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#5D06CC",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

function alternateLanguages(path = "") {
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[htmlLang[locale]] = `${siteConfig.url}/${locale}${path}`;
  }
  languages["x-default"] = `${siteConfig.url}/${defaultLocale}${path}`;
  return languages;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  const active = isLocale(locale) ? locale : defaultLocale;

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: dict.meta.title,
      template: `%s | ${siteConfig.name}`,
    },
    description: dict.meta.description,
    applicationName: siteConfig.name,
    keywords:
      active === "fr"
        ? [
            "prise de mesure par photo",
            "mesures de couture",
            "tailleur Douala",
            "couturier Cameroun",
            "fiche de mesures",
            "patron de couture",
            "Sur-MeZur",
          ]
        : [
            "photo body measurement",
            "tailoring measurements",
            "tailor Cameroon",
            "sewing pattern",
            "Sur-MeZur",
          ],
    authors: [{ name: siteConfig.name }],
    creator: siteConfig.name,
    alternates: {
      canonical: `${siteConfig.url}/${active}`,
      languages: alternateLanguages(),
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: active === "fr" ? "fr_CM" : "en_US",
      url: `${siteConfig.url}/${active}`,
      title: dict.meta.title,
      description: dict.meta.description,
      // L'image d'aperçu (WhatsApp, Facebook) est générée par
      // opengraph-image.tsx, dans la langue de la page.
    },
    twitter: {
      card: "summary_large_image",
      title: dict.meta.title,
      description: dict.meta.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const active = locale as Locale;
  const dict = getDictionary(active);

  return (
    <html lang={htmlLang[active]} className={`${playfair.variable} ${jost.variable}`}>
      <head>
        {/*
          Scroll reveals start at opacity:0 and are switched on by JS. Without
          scripts that would hide the page, so no-JS gets them shown.
        */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}.pattern-draw .pp-cut,.pattern-draw .pp-seam{stroke-dashoffset:0!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-screen antialiased">
        <Navbar locale={active} dict={dict} />
        <main id="main">{children}</main>
        <Footer locale={active} dict={dict} />
        <Attribution />
      </body>
    </html>
  );
}