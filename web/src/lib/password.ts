/**
 * Regle de mot de passe, alignee sur le backend (Agent A, octobre 2026).
 *
 * Le serveur exige entre 6 et 64 caracteres, dont au moins une lettre et au
 * moins un chiffre. (L'ancienne regle « exactement 6 caracteres » a ete
 * assouplie cote serveur ; ce module suit la nouvelle regle des que l'Agent A
 * l'a confirmee.)
 */

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;

export function passwordError(value: string): string | null {
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return `Le mot de passe doit contenir entre ${PASSWORD_MIN} et ${PASSWORD_MAX} caractères, dont au moins une lettre et un chiffre.`;
  }
  if (!/[a-zA-Z]/.test(value)) {
    return "Le mot de passe doit contenir au moins une lettre.";
  }
  if (!/[0-9]/.test(value)) {
    return "Le mot de passe doit contenir au moins un chiffre.";
  }
  return null;
}

export const PASSWORD_HINT = "Entre 6 et 64 caractères, avec au moins une lettre et un chiffre.";
