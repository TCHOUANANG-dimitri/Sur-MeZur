/** Sur-MeZur — configuration du site vitrine. */
import apkBuild from "./apk.json";

/**
 * L'APK Android est servi par le site lui-même (public/android/sur-mezur.apk).
 * Version et taille sont écrites par `app-mobile/scripts/compiler.ps1 -Publier`
 * dans `apk.json` ; les variables NEXT_PUBLIC_APK_* restent prioritaires (APK
 * hébergé ailleurs).
 */
function apkSize(locale: "fr" | "en"): string {
  if (process.env.NEXT_PUBLIC_APK_SIZE) return process.env.NEXT_PUBLIC_APK_SIZE;
  const b = apkBuild.bytes;
  if (!b) return "";
  const unit = locale === "fr" ? ["Ko", "Mo"] : ["KB", "MB"];
  const fmt = (n: number) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 1 });
  return b < 1024 * 1024 ? `${fmt(Math.round(b / 1024))} ${unit[0]}` : `${fmt(b / (1024 * 1024))} ${unit[1]}`;
}
export const siteConfig = {
  name: "Sur-MeZur",
  tagline: "Mesurez plus juste. Cousez mieux.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sur-mezur.com",
  /**
   * L'application web elle-même : chaque appel à l'action y mène. Les liens
   * passent par `appHref`, qui y ajoute la page d'arrivée ; le composant
   * `Attribution` y ajoute ensuite l'origine de la visite (utm_*, code).
   */
  appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://app.sur-mezur.com",
  /** APK Android (page /telecharger, section « Application »). Vide tant qu'aucune version n'est publiée. */
  apk: {
    url: process.env.NEXT_PUBLIC_APK_URL || apkBuild.file || "",
    size: apkSize,
    version: process.env.NEXT_PUBLIC_APK_VERSION || apkBuild.version || "",
  },
  location: {
    city: "Douala",
    country: { en: "Cameroon", fr: "Cameroun" } as const,
  },
  /** Couleurs relevées sur le logo (public/brand/Sur-MeZur.png). */
  brand: {
    indigo: "#08044D",
    deep: "#4502AD",
    base: "#5D06CC",
    bright: "#8C29FB",
    paper: "#FFFFFF",
  },
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
