/**
 * Reprise sur refus PASSAGERS, et messages comprehensibles.
 *
 * 429 : la couche « PowerBoost » de l'hebergeur O2Switch limite la frequence
 * des requetes — le backend, lui, n'en impose aucune. Observe en production.
 * Sur le site en ligne, tout le trafic lui parvient depuis les quelques
 * adresses du proxy Vercel : une limite par adresse peut donc toucher
 * plusieurs visiteurs a la fois.
 * 502, 503, 504 : redemarrage de l'application par Passenger.
 * TypeError : coupure reseau, frequente sur mobile.
 *
 * Partage entre la prise de mesure et les pages qui affichent le resultat :
 * une analyse reussie suivie d'un 429 au chargement des mesures faisait
 * croire a la personne que ses mesures etaient perdues.
 */

import { ApiError } from "./api/client";

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  // 3 s, 6 s, 12 s : laisse retomber la limite plutot que d'insister, et
  // borne l'attente supplementaire a une vingtaine de secondes.
  let delay = 3000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const transient =
        (e instanceof ApiError && RETRYABLE_STATUS.has(e.status)) || e instanceof TypeError;
      if (!transient || attempt >= attempts) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

/**
 * Message a afficher, a la place du texte technique en anglais que renvoie
 * le serveur (« Too Many Requests », « Internal Server Error »).
 *
 * `nextStep` complete la phrase selon l'ecran : « relancez l'analyse » sur la
 * prise de mesure, « réessayez » sur une page de resultat.
 */
export function friendlyError(e: unknown, nextStep = "relancez l'analyse"): string {
  if (e instanceof ApiError) {
    if (e.status === 429) {
      return `Le service reçoit beaucoup de demandes en ce moment. Patientez une minute puis ${nextStep}.`;
    }
    if (e.status >= 500) {
      return "Le service rencontre un problème passager. Réessayez dans un instant.";
    }
  }
  if (e instanceof TypeError) {
    return `La connexion a été interrompue. Vérifiez votre réseau puis ${nextStep}.`;
  }
  return e instanceof Error ? e.message : "Une erreur est survenue.";
}

/** Vrai pour un echec de chargement, par opposition a une donnee absente. */
export function isTransientError(e: unknown): boolean {
  return (e instanceof ApiError && RETRYABLE_STATUS.has(e.status)) || e instanceof TypeError;
}
