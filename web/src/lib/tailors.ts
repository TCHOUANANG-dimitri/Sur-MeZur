/**
 * Outils communs a l'annuaire des tailleurs : message WhatsApp pre-rempli,
 * liens Google Maps, adresse lisible.
 *
 * Les liens Maps sont de simples navigations (pas de fetch, pas de carte
 * integree) : la CSP `connect-src 'self'` n'a donc pas a s'ouvrir, et aucune
 * cle d'API n'est necessaire.
 */

import type { TailorProfile } from "./api/types";

export const APP_URL = "https://sur-me-zur.vercel.app";

/** Message pre-rempli quand un client ecrit a un tailleur sur WhatsApp : il
 *  dit d'ou vient le contact. Avec une commande, il en donne la reference. */
export function tailorWhatsappMessage(shopName: string, orderId?: string | null): string {
  let text =
    `Bonjour ${shopName}, je vous contacte depuis l'application Sur-MeZur (${APP_URL}). ` +
    "J'aimerais vous parler d'une commande de couture.";
  if (orderId) {
    text += ` Je viens de vous envoyer ma commande n° ${orderId.slice(0, 6).toUpperCase()} avec mes mesures sur Sur-MeZur.`;
  }
  return text;
}

/** « Ville · Quartier », ou une chaine vide. */
export function tailorPlace(t: Pick<TailorProfile, "city" | "quartier">): string {
  return [t.city, t.quartier].filter((x) => x && x.trim()).join(" · ");
}

export function hasPosition(t: Pick<TailorProfile, "lat" | "lng">): boolean {
  return typeof t.lat === "number" && typeof t.lng === "number";
}

/** Itineraire vers l'atelier si sa position est connue, sinon une recherche
 *  sur son adresse texte. `null` s'il n'y a rien a chercher. */
export function tailorMapHref(t: Pick<TailorProfile, "lat" | "lng" | "city" | "quartier" | "landmark">): string | null {
  if (hasPosition(t)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}`;
  }
  const query = [t.landmark, t.quartier, t.city].filter((x) => x && x.trim()).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/** Distance lisible : « 850 m », « 3,2 km ». */
export function formatDistance(km: number | null | undefined): string | null {
  if (km == null || !isFinite(km)) return null;
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`;
}

/** Position du navigateur, avec un message clair en cas de refus. */
export function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Ce navigateur ne donne pas la position."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Position refusée : autorisez la localisation pour ce site dans les réglages du navigateur."
              : "Position introuvable pour l'instant. Réessayez à l'extérieur ou avec le GPS activé."
          )
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}
