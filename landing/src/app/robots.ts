import type { MetadataRoute } from "next";

import { siteConfig } from "@/data/site";

/**
 * Tout le site est public, robots des moteurs d'IA compris (ChatGPT,
 * Perplexity, Gemini... citent les pages qu'ils peuvent lire). L'application
 * (app.sur-mezur.com) se retire elle-même de l'index par un en-tête noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
