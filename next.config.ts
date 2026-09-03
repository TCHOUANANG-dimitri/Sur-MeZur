import type { NextConfig } from "next";

// Origine du backend FastAPI. Cote navigateur on ne l'utilise jamais
// directement : tout passe par les rewrites ci-dessous, pour que le code
// client garde des chemins relatifs (`/api/...`) exactement comme le
// frontend Vite le faisait via son proxy. Consequence importante : aucune
// requete cross-origin, donc aucune configuration CORS a maintenir cote
// backend, et aucun probleme de contenu mixte si le site passe un jour en
// HTTPS avant l'API.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
