/**
 * Page d'accueil publique (B1) — orientee conversion.
 *
 * Composant SERVEUR pour les metadonnees (partage, referencement) ; le
 * contenu, dans la langue du telephone, est dans `components/PublicHome`.
 *
 * Un compte deja inscrit ne reste pas ici : `HomeRedirect` le renvoie vers
 * son espace (client -> /accueil, tailleur -> /tailleur).
 */

import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { PublicHome } from "@/components/PublicHome";

export const metadata: Metadata = {
  title: "Sur-MeZur — Vos mesures de couture en 2 photos, gratuitement",
  description:
    "Prenez deux photos et recevez vos 12 mensurations de couture, gratuitement. Clients : envoyez vos mesures à votre tailleur. Tailleurs : carnet de clients, mesures par photo et patrons.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: `${SITE_URL}/`,
    siteName: "Sur-MeZur",
    title: "Sur-MeZur — Vos mesures de couture en 2 photos, gratuitement",
    description:
      "Deux photos suffisent pour obtenir vos mensurations de couture. Gratuit, sans mètre ruban, pensé pour le Cameroun.",
    images: [{ url: `${SITE_URL}/logo.png`, width: 420, height: 630, alt: "Sur-MeZur" }],
  },
  twitter: {
    card: "summary",
    title: "Sur-MeZur — Vos mesures de couture en 2 photos, gratuitement",
    description:
      "Deux photos suffisent pour obtenir vos mensurations de couture. Gratuit, sans mètre ruban.",
    images: [`${SITE_URL}/logo.png`],
  },
};

export default function Accueil() {
  return <PublicHome />;
}
