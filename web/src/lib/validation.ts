/**
 * Controles de saisie partages par les formulaires.
 *
 * Chaque fonction rend un MESSAGE (a afficher sous le champ) ou `null` si la
 * valeur est acceptable. Le serveur reste juge en dernier ressort ; ces
 * controles evitent surtout d'enregistrer des donnees inutilisables : un
 * client sans numero joignable, une avance superieure au prix, un tour de
 * taille de 3 000 cm.
 */

import { splitPhone } from "./countries";
import { tr } from "./i18n";
import type { MeasureKey } from "./measurements";

/** Numero de telephone complet (indicatif + numero local). Cameroun : 9
 *  chiffres commencant par 6 (portable) ou 2 (fixe) ; ailleurs, 7 a 10. */
export function phoneError(value: string, { required = true } = {}): string | null {
  const { country, local } = splitPhone(value.replace(/\s/g, ""));
  const digits = local.replace(/\D/g, "");
  if (!digits) return required ? tr("Saisissez le numéro.", "Enter the phone number.") : null;
  if (country.code === "CM") {
    if (digits.length !== 9) return tr("9 chiffres (ex. 6 XX XX XX XX).", "9 digits (e.g. 6 XX XX XX XX).");
    if (!/^[62]/.test(digits)) return tr("Commence par 6 ou 2.", "Starts with 6 or 2.");
    return null;
  }
  if (digits.length < 7 || digits.length > 10) return tr("Numéro incomplet ou trop long.", "Number too short or too long.");
  return null;
}

/** E-mail facultatif : vide accepte, sinon forme nom@domaine.ext. */
export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : tr("E-mail invalide (ex. nom@exemple.com).", "Invalid e-mail (e.g. name@example.com).");
}

/** Nom de personne ou d'atelier : 2 a 120 caracteres, au moins une lettre. */
export function nameError(value: string): string | null {
  const v = value.trim();
  if (v.length < 2) return tr("2 caractères au moins.", "At least 2 characters.");
  if (v.length > 120) return tr("120 caractères au plus.", "120 characters at most.");
  if (!/\p{L}/u.test(v)) return tr("Des lettres, s'il vous plaît.", "Letters, please.");
  return null;
}

/** Plafond d'un montant en FCFA : au-dela, c'est une faute de frappe.
 *  Dix millions de FCFA : au-dela, ce n'est plus un travail de couture. */
export const AMOUNT_MAX = 10_000_000;

/** Montant facultatif en FCFA : entier positif, plafonne. `min` fixe le
 *  plancher (une recette doit valoir plus que zero). */
export function amountError(value: string, { min = 0 } = {}): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return tr("Chiffres seulement, sans espace.", "Digits only, no spaces.");
  const n = Number(v);
  if (n < min) return min > 0 ? tr("Plus que zéro.", "More than zero.") : null;
  if (n > AMOUNT_MAX) return tr("Montant trop élevé.", "Amount too high.");
  return null;
}

/** Plages plausibles d'une mesure adulte, en cm (larges : enfants grands,
 *  fortes corpulences). Hors plage, c'est presque toujours une erreur de
 *  saisie (unite, chiffre en trop). */
export const MEASURE_RANGES: Record<MeasureKey, [number, number]> = {
  neck: [25, 60],
  chest: [60, 180],
  waist: [45, 180],
  hips: [60, 190],
  biceps: [15, 60],
  thigh: [30, 100],
  wrist: [10, 30],
  ankle: [15, 45],
  shoulder: [30, 70],
  sleeve_length: [40, 90],
  inseam: [50, 110],
  back_length: [30, 65],
};

export function measureError(key: MeasureKey, value: string): string | null {
  const v = value.trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  const [min, max] = MEASURE_RANGES[key];
  if (!isFinite(n)) return tr("En chiffres.", "Numbers only.");
  if (n < min || n > max) return tr(`Entre ${min} et ${max} cm.`, `Between ${min} and ${max} cm.`);
  return null;
}

/** Date AAAA-MM-JJ d'aujourd'hui, heure locale (attribut `min` des dates). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
