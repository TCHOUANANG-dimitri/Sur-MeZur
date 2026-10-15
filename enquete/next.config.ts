import path from "node:path";
import type { NextConfig } from "next";

// Meme montage que web/ et collecte/ : le navigateur n'appelle jamais l'API
// directement, Vercel relaie /api cote serveur (pas de CORS, pas de contenu
// mixte HTTPS -> HTTP).
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dossier imbrique dans le monodepot : sans cette ligne Next remonte
  // jusqu'a un package-lock.json parent et se trompe de racine.
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      // Photos publiques du catalogue (galerie de modeles).
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Lien personnel dans l'URL : ne jamais le transmettre a un site tiers.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
