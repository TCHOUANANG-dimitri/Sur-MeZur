// Petits utilitaires partages par les ecrans admin.

/** Formate une somme en francs CFA (ex: 12 500 FCFA). */
export function formatFcfa(value: number | null | undefined): string {
  if (value == null) return "—";
  const n = Math.round(value);
  return `${n.toLocaleString("fr-FR").replace(/\u202f/g, " ")} FCFA`;
}

/** Date lisible en francais (jour mois annee). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * URL d'une image renvoyee par le backend. Cetterne toujours un chemin
 * relatif `/uploads/...` (see `save_upload` cote backend) : on le passe tel
 * quel au navigateur, le proxy Next le retransmet au backend. Jamais d'URL
 * absolue, pour rester coherent avec la consigne du proxy.
 */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("http") ? path : path;
}
