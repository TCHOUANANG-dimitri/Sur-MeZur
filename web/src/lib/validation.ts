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
import type { MeasureKey } from "./measurements";

/** Numero de telephone complet (indicatif + numero local). Cameroun : 9
 *  chiffres commencant par 6 (portable) ou 2 (fixe) ; ailleurs, 7 a 10. */
export function phoneError(value: string, { required = true } = {}): string | null {
  const { country, local } = splitPhone(value.replace(/\s/g, ""));
  const digits = local.replace(/\D/g, "");
  if (!digits) return required ? "Saisissez le numéro de téléphone." : null;
  if (country.code === "CM") {
    if (digits.length !== 9) return "Un numéro camerounais compte 9 chiffres (ex. 6 XX XX XX XX).";
    if (!/^[62]/.test(digits)) return "Un numéro camerounais commence par 6 ou 2.";
    return null;
  }
  if (digits.length < 7 || digits.length > 10) return "Numéro incomplet ou trop long.";
  return null;
}

/** E-mail facultatif : vide accepte, sinon forme nom@domaine.ext. */
export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Adresse e-mail invalide (ex. nom@exemple.com).";
}

/** Nom de personne ou d'atelier : 2 a 120 caracteres, au moins une lettre. */
export function nameError(value: string, label = "Le nom"): string | null {
  const v = value.trim();
  if (v.length < 2) return `${label} doit contenir au moins 2 caractères.`;
  if (v.length > 120) return `${label} ne doit pas dépasser 120 caractères.`;
  if (!/\p{L}/u.test(v)) return `${label} doit contenir des lettres.`;
  return null;
}

/** Plafond d'un montant en FCFA : au-dela, c'est une faute de frappe. */
export const AMOUNT_MAX = 100_000_000;

/** Montant facultatif en FCFA : entier positif, plafonne. */
export function amountError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return "Montant en chiffres entiers, sans espace ni virgule.";
  if (Number(v) > AMOUNT_MAX) return "Montant trop élevé.";
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
  if (!isFinite(n)) return "Valeur en chiffres.";
  if (n < min || n > max) return `Entre ${min} et ${max} cm.`;
  return null;
}

/** Date AAAA-MM-JJ d'aujourd'hui, heure locale (attribut `min` des dates). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
