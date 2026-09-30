import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import "@/styles/shell.css";
import "@/styles/ui.css";
import "@/styles/auth.css";
import "@/styles/camera.css";
import "@/styles/collecte.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Sur-MeZur Collecte",
  description: "Collecte de mensurations et de photos de référence pour la chaîne de mesure Sur-MeZur.",
  icons: { icon: "/icon.png", apple: "/icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SMZ Collecte" },
  // Outil interne : ne doit pas apparaitre dans les moteurs de recherche.
  robots: { index: false, follow: false },
};

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
        <ServiceWorker />
      </body>
    </html>
  );
}
