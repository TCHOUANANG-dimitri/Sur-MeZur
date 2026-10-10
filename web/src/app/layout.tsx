import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import "@/styles/shell.css";
import "@/styles/ui.css";
import "@/styles/auth.css";
import "@/styles/landing.css";
import "@/styles/catalog.css";
import "@/styles/mesures.css";
import "@/styles/profile.css";
import "@/styles/mesurer.css";
// Espace tailleur (B3).
import "@/styles/tailleur.css";
// Page d'accueil publique (B1) : chargee en dernier avec les ajustements.
import "@/styles/accueil.css";
// Charge en dernier : affine ce que les feuilles precedentes posent.
import "@/styles/mobile.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AcquisitionTracker } from "@/components/AcquisitionTracker";
import { SiteBanner } from "@/components/SiteBanner";
import { SwRegister } from "@/components/SwRegister";

export const metadata: Metadata = {
  metadataBase: new URL("https://sur-me-zur.vercel.app"),
  manifest: "/manifest.webmanifest",
  title: "Sur-MeZur — Vos mesures, sans mètre ruban",
  description:
    "Choisissez un modèle, prenez deux photos, obtenez vos mesures de couture et repartez avec votre fiche prête à imprimer.",
  icons: { icon: "/icon.png", apple: "/icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Sur-MeZur" },
};

// `viewport-fit=cover` + les variables `env(safe-area-inset-*)` du CSS : sans
// les deux, la barre d'onglets passe sous l'indicateur d'accueil des iPhone
// recents.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5b21b6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <SiteBanner />
          <AcquisitionTracker />
          <SwRegister />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
