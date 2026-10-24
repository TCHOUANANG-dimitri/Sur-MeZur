/**
 * Outils communs a l'annuaire des tailleurs : message WhatsApp pre-rempli,
 * liens Google Maps, adresse lisible.
 *
 * Les liens Maps sont de simples navigations (pas de fetch, pas de carte
 * integree) : la CSP `connect-src 'self'` n'a donc pas a s'ouvrir, et aucune
 * cle d'API n'est necessaire.
 */

import { SITE_URL } from "./site";
import type { TailorProfile } from "./api/types";
import { langue, tr } from "./i18n";

export const APP_URL = SITE_URL;

/** Message pre-rempli quand un client ecrit a un tailleur sur WhatsApp : il
 *  dit d'ou vient le contact. Avec une commande, il en donne la reference. */
export function tailorWhatsappMessage(shopName: string, orderId?: string | null): string {
  const ref = orderId ? orderId.slice(0, 6).toUpperCase() : "";
  let text = tr(
    `Bonjour ${shopName}, je vous contacte depuis l'application Sur-MeZur (${APP_URL}). J'aimerais vous parler d'une commande de couture.`,
    `Hello ${shopName}, I'm contacting you from the Sur-MeZur app (${APP_URL}). I'd like to talk about a tailoring order.`
  );
  if (ref) {
    text += tr(
      ` Je viens de vous envoyer ma commande n° ${ref} avec mes mesures sur Sur-MeZur.`,
      ` I've just sent you my order no. ${ref} with my measurements on Sur-MeZur.`
    );
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
  const v = km.toFixed(km < 10 ? 1 : 0);
  return `${langue() === "en" ? v : v.replace(".", ",")} km`;
}

/** Position du navigateur, avec un message clair en cas de refus. */
export function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error(tr("Position indisponible sur ce navigateur.", "Location not available in this browser.")));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? tr("Position refusée : autorisez la localisation dans les réglages.", "Location blocked: allow it in settings.")
              : tr("Position introuvable. Activez le GPS et réessayez.", "Location not found. Turn on GPS and try again.")
          )
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}
