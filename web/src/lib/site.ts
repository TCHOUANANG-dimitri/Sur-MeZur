/**
 * Adresses publiques, fixees au build.
 *
 * `SITE_URL` : l'application elle-meme (liens partages, metadonnees, message
 * WhatsApp) — `https://app.sur-mezur.com` sur o2switch. Sans la variable (le
 * projet Vercel, garde pendant la transition pour les telephones qui ont
 * encore l'ancienne appli), on reste sur l'adresse Vercel.
 *
 * `LANDING_URL` : la landing (presentation du service), vers laquelle la
 * racine de l'application renvoie les visiteurs.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://sur-me-zur.vercel.app").replace(/\/$/, "");

export const LANDING_URL = (process.env.NEXT_PUBLIC_LANDING_URL || "https://sur-mezur.com").replace(/\/$/, "");
