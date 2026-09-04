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
    return `Le mot de passe doit contenir exactement ${PASSWORD_LENGTH} caractères.`;
  }
  if (!/[a-zA-Z]/.test(value)) return "Il doit contenir au moins une lettre.";
  if (!/[0-9]/.test(value)) return "Il doit contenir au moins un chiffre.";
  return null;
}

export const PASSWORD_HINT = "Exactement 6 caractères, avec au moins une lettre et un chiffre.";
