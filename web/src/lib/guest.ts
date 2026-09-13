/**
 * Session invitee : prendre ses mesures avant de creer un compte.
 *
 * Le backend cree un vrai compte client marque `is_guest`, utilisable
 * uniquement par ses jetons. Toute la chaine de mesure fonctionne donc sans
 * cas particulier ; c'est le serveur qui retient une partie des resultats et
 * qui convertit le compte au moment de l'inscription.
 */

import { AuthApi } from "./api/endpoints";
import { getRefreshToken, getToken, setTokens, startAuthTimer } from "./api/client";

/** Garantit une session avant d'appeler l'API de mesure. Ne cree un invite
 *  que si aucun jeton n'existe : un visiteur qui reprend ses photos garde le
 *  meme compte, et donc ses mesures precedentes. */
export async function ensureSession(): Promise<boolean> {
  if (getToken() || getRefreshToken()) return false;
  const res = await AuthApi.guest();
  setTokens(res.access_token, res.refresh_token);
  startAuthTimer();
  return true;
}

/** Jeton a joindre a l'inscription ou a la connexion pour rattacher les
 *  mesures. Le jeton de renouvellement est prefere : il vit 30 jours, contre
 *  une heure pour le jeton d'acces. */
export function guestClaimToken(): string | undefined {
  return getRefreshToken() ?? getToken() ?? undefined;
}

/** Destination de retour apres authentification. Seuls les chemins internes
 *  sont acceptes : `//exemple.com` serait interprete comme une autre origine,
 *  ce qui ferait de ce parametre une redirection ouverte. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
