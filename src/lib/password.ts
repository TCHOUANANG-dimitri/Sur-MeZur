/**
 * Regle de mot de passe, alignee sur le backend.
 *
 * Le serveur exige EXACTEMENT six caracteres, dont au moins une lettre et au
 * moins un chiffre (voir backend app/schemas/auth.py::validate_password).
 * C'est inhabituel — la plupart des formulaires imposent un minimum, pas une
 * longueur exacte — et le formulaire web imposait au depart huit caracteres,
 * ce qui refusait des mots de passe parfaitement valides et en laissait passer
 * d'autres que le serveur rejetait ensuite.
 */

export const PASSWORD_LENGTH = 6;

export function passwordError(value: string): string | null {
  if (value.length !== PASSWORD_LENGTH) {
    return "Le mot de passe doit contenir exactement 6 caractères, dont au moins un chiffre et une lettre.";
  }
  if (!/[a-zA-Z]/.test(value)) {
    return "Le mot de passe doit contenir au moins une lettre (6 caractères, dont au moins un chiffre).";
  }
  if (!/[0-9]/.test(value)) {
    return "Le mot de passe doit contenir au moins un chiffre (6 caractères, dont au moins une lettre).";
  }
  return null;
}

export const PASSWORD_HINT = "Exactement 6 caractères, avec au moins une lettre et un chiffre.";
