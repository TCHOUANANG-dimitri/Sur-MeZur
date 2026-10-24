/**
 * Adresse publique du site (liens partages, metadonnees, message WhatsApp).
 *
 * Fixee au build par `NEXT_PUBLIC_SITE_URL` : `https://sur-mezur.com` sur
 * o2switch. Sans la variable (le projet Vercel, garde pendant la transition
 * pour les telephones qui ont encore l'ancienne appli), on reste sur
 * l'adresse Vercel.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://sur-me-zur.vercel.app").replace(/\/$/, "");
