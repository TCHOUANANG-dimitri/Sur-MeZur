/**
 * Espace de chaque role : la seule table de correspondance du site. Toutes
 * les redirections « vers mon espace » passent par ici, pour qu'un role ne
 * soit jamais renvoye vers l'espace d'un autre.
 */

export function homeFor(role: string | null | undefined): string {
  if (role === "tailor") return "/tailleur";
  if (role === "admin") return "/admin";
  return "/accueil";
}

export const ROLE_NAME: Record<string, string> = {
  client: "client",
  tailor: "tailleur",
  admin: "administrateur",
  collector: "agent de collecte",
};

/** Libelle du public d'un espace, pour « Cette page est reservee aux … ». */
export const ROLE_AUDIENCE: Record<string, string> = {
  client: "clients",
  tailor: "tailleurs",
  admin: "administrateurs",
};
