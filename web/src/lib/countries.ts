/**
 * Indicatifs telephoniques proposes a l'inscription et a la connexion.
 * Repris a l'identique de mobile/src/constants/countries.ts, sans le champ
 * `flag` : les drapeaux emoji ne se rendent pas sur Windows, et la consigne
 * est de n'employer aucun emoji dans l'interface web.
 */

export interface Country {
  code: string;
  dial: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "CM", dial: "+237", name: "Cameroun" },
  { code: "CI", dial: "+225", name: "Côte d'Ivoire" },
  { code: "SN", dial: "+221", name: "Sénégal" },
  { code: "BJ", dial: "+229", name: "Bénin" },
  { code: "TG", dial: "+228", name: "Togo" },
  { code: "BF", dial: "+226", name: "Burkina Faso" },
  { code: "ML", dial: "+223", name: "Mali" },
  { code: "GA", dial: "+241", name: "Gabon" },
  { code: "CG", dial: "+242", name: "Congo" },
  { code: "CD", dial: "+243", name: "RD Congo" },
  { code: "GH", dial: "+233", name: "Ghana" },
  { code: "NG", dial: "+234", name: "Nigeria" },
];

/**
 * Decoupe un numero complet (ex. "+237600000000") en indicatif reconnu +
 * numero local. Retourne le Cameroun par defaut si `value` ne commence par
 * aucun indicatif connu (numero vide ou saisie en cours).
 */
export function splitPhone(value: string): { country: Country; local: string } {
  const country = COUNTRIES.find((c) => value.startsWith(c.dial)) ?? COUNTRIES[0];
  const local = value.startsWith(country.dial) ? value.slice(country.dial.length) : "";
  return { country, local };
}
