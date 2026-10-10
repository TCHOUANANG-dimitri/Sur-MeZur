/** Sur-MeZur — configuration du site vitrine. */
export const siteConfig = {
  name: "Sur-MeZur",
  tagline: "Mesurez plus juste. Cousez mieux.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sur-mezur.korah.tech",
  /**
   * L'application web elle-même : chaque appel à l'action y mène. Les liens
   * passent par `appHref`, qui y ajoute la page d'arrivée ; le composant
   * `Attribution` y ajoute ensuite l'origine de la visite (utm_*, code).
   */
  appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://sur-me-zur.vercel.app",
  /** APK Android (page /telecharger). Vide tant qu'aucune version n'est publiée. */
  apk: {
    url: process.env.NEXT_PUBLIC_APK_URL || "",
    size: process.env.NEXT_PUBLIC_APK_SIZE || "",
    version: process.env.NEXT_PUBLIC_APK_VERSION || "",
  },
  email: "contact@korah.tech",
  location: {
    city: "Douala",
    country: { en: "Cameroon", fr: "Cameroun" } as const,
  },
  parent: {
    name: "KORAH",
    url: "https://korah.tech",
  },
  /** Couleurs relevées sur le logo (public/brand/Sur-MeZur.png). */
  brand: {
    indigo: "#08044D",
    deep: "#4502AD",
    base: "#5D06CC",
    bright: "#8C29FB",
    paper: "#FFFFFF",
  },
  socials: [
    { label: "Instagram", href: "https://www.instagram.com/korah.tech" },
    { label: "Facebook", href: "https://www.facebook.com/techkorah" },
    { label: "LinkedIn", href: "https://www.linkedin.com/company/korah-tech" },
  ],
} as const;

/** Pages de l'application vers lesquelles pointe le site. */
export const appPaths = {
  measure: "/mesurer",
  tailorSignup: "/inscription?role=tailleur",
  login: "/connexion",
  contact: "/contact",
  privacy: "/infos/confidentialite",
  terms: "/infos/conditions",
} as const;

export function appHref(path: string): string {
  return `${siteConfig.appUrl}${path}`;
}
