import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import "@/styles/shell.css";
import "@/styles/ui.css";
import "@/styles/auth.css";
import "@/styles/landing.css";
import "@/styles/catalog.css";
import "@/styles/mesures.css";
import "@/styles/profile.css";
// Charge en dernier : affine ce que les feuilles precedentes posent.
import "@/styles/mobile.css";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
