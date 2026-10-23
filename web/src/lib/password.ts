/**
 * Regle de mot de passe, alignee sur le backend (Agent A, octobre 2026).
 *
 * Le serveur exige entre 6 et 64 caracteres, dont au moins une lettre et au
 * moins un chiffre. (L'ancienne regle « exactement 6 caracteres » a ete
 * assouplie cote serveur ; ce module suit la nouvelle regle des que l'Agent A
 * l'a confirmee.)
 */

import { tr } from "./i18n";

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;

export function passwordError(value: string): string | null {
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return tr(`Entre ${PASSWORD_MIN} et ${PASSWORD_MAX} caractères.`, `Between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`);
  }
  if (!/[a-zA-Z]/.test(value)) return tr("Au moins une lettre.", "At least one letter.");
  if (!/[0-9]/.test(value)) return tr("Au moins un chiffre.", "At least one digit.");
  return null;
}

/** Rappel de la regle, sous le champ, et etat du mot de passe saisi. */
export function passwordHint(value: string): string {
  if (!value) return tr("6 caractères ou plus, avec une lettre et un chiffre.", "6+ characters, with a letter and a digit.");
  return passwordError(value) ?? tr("Mot de passe valide.", "Password OK.");
}
