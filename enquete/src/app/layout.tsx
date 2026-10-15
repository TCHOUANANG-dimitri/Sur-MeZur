import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import "@/styles/ui.css";
import "@/styles/enquete.css";

export const metadata: Metadata = {
  title: "Sur-MeZur — Savoir-faire des tailleurs",
  description: "Questionnaire pour les tailleurs partenaires de Sur-MeZur.",
  icons: { icon: "/icon.png", apple: "/icon.png" },
  // Liens personnels : rien ne doit etre indexe.
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
      <body>{children}</body>
    </html>
  );
}
