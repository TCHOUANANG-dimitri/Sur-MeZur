import path from "node:path";
import type { NextConfig } from "next";

// Meme montage que l'application web (web/next.config.ts) : le navigateur
// n'appelle jamais l'API directement, tout passe par ces reecritures
// executees cote serveur Vercel.
//  - aucune requete cross-origin, donc rien a declarer dans CORS_ORIGINS ;
//  - la page est en HTTPS (Vercel) alors que l'API est en HTTP : sans ce
//    relais, le navigateur bloquerait les appels pour contenu mixte, et sans
//    HTTPS la camera dans la page (getUserMedia) serait inaccessible.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Dossier imbrique dans le monodepot : sans cette ligne Next remonte
  // jusqu'a un package-lock.json parent et se trompe de racine.
  outputFileTracingRoot: path.join(__dirname),

  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
