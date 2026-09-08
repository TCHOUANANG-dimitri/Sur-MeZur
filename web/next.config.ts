import path from "node:path";
import type { NextConfig } from "next";

// Origine du backend FastAPI. Cote navigateur on ne l'utilise jamais
// directement : tout passe par les rewrites ci-dessous, pour que le code
// client garde des chemins relatifs (`/api/...`) exactement comme le
// frontend Vite le faisait via son proxy.
//
// Deux consequences, l'une prevue et l'autre heureuse :
//  - aucune requete cross-origin, donc aucune configuration CORS a maintenir
//    cote backend ;
//  - la reecriture s'execute cote SERVEUR (Vercel), pas dans le navigateur :
//    un site servi en HTTPS peut donc appeler une API en HTTP sans declencher
//    de blocage pour contenu mixte. C'est ce qui rend le deploiement possible
//    alors qu'AutoSSL n'a jamais emis de certificat pour l'API.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Ce dossier est un depot independant, mais il reste physiquement imbrique
  // dans l'arborescence du monorepo, qui possede son propre package-lock.json.
  // Sans cette ligne, Next remonte jusqu'a ce lockfile parent et deduit une
  // racine d'espace de travail erronee, ce qui fausse le calcul des fichiers
  // a embarquer au deploiement.
  outputFileTracingRoot: path.join(__dirname),

  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
