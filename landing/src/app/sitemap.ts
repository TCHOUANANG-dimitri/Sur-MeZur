import type { MetadataRoute } from "next";

import { locales } from "@/i18n/config";
import { absoluteUrl, languageAlternates, publicPaths } from "@/lib/seo";

/**
 * Chaque page dans chaque langue, avec ses versions sœurs (hreflang). Pas de
 * date de modification : une date inventée à chaque build tromperait Google.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.flatMap((path) =>
    locales.map((locale) => ({
      url: absoluteUrl(locale, path),
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.6,
      alternates: { languages: languageAlternates(path) },
    })),
  );
}
