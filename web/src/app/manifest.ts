/**
 * Manifeste PWA (B4, Next 15) : servi en `/manifest.webmanifest`.
 * Nom « Sur-MeZur », `start_url: "/"`, `display: "standalone"`, couleurs
 * `#5b21b6`, icones 192 et 512 px + maskable generees depuis
 * `public/logo-mark.png`.
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sur-MeZur",
    short_name: "Sur-MeZur",
    description:
      "Vos mesures de couture en 2 photos, gratuitement. Carnet tailleur et patrons.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#5b21b6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
