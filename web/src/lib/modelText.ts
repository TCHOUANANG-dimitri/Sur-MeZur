import { langue } from "@/lib/i18n";

/**
 * Nom et description d'un modèle du catalogue dans la langue du téléphone.
 * L'anglais (`name_en`, `description_en`, proposés par Qwen3-VL puis relus
 * dans l'administration) peut manquer : on retombe alors sur le français.
 */
type Textes = { name: string; name_en?: string | null; description?: string | null; description_en?: string | null };

export function nomModele(m: Textes): string {
  return langue() === "en" && m.name_en ? m.name_en : m.name;
}

export function descriptionModele(m: Textes): string | null {
  return (langue() === "en" && m.description_en ? m.description_en : m.description) ?? null;
}
