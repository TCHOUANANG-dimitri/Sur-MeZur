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

/** Vrai si `path` designe `base` ou une de ses sous-pages. */
function sous(base: string, path: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/** Pages ouvertes a tous, connectes ou non. Les pages d'atelier
 *  (`/tailleurs`) commencent comme `/tailleur` : la comparaison se fait donc
 *  sur le chemin complet, jamais avec un simple `startsWith`. */
const PAGES_PUBLIQUES = [
  "/",
  "/bienvenue",
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/changer-mot-de-passe",
  "/telecharger",
  "/contact",
  "/infos",
  "/mesurer",
  "/tailleurs",
  "/fiches",
  "/hors-connexion",
];

const PAGES_CLIENT = ["/accueil", "/modeles", "/mesures", "/commandes", "/profil"];

/**
 * Le role a-t-il le droit d'ouvrir cette page ? Sert apres une connexion ou
 * une inscription : `suite` n'est suivi que si le compte qui vient de
 * s'ouvrir peut y aller. Sinon, on repart vers son espace (`homeFor`), sans
 * passer par l'ecran « cette page est reservee aux … ».
 */
export function pathAllowedFor(role: string | null | undefined, path: string | null | undefined): boolean {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  // Le chemin seul : `?suite=/tailleur` ne doit pas etre confondu avec une
  // page, et une query ne change jamais les droits.
  const chemin = path.split(/[?#]/, 1)[0] || "/";
  if (PAGES_PUBLIQUES.some((p) => sous(p, chemin))) return true;
  if (role === "admin") return sous("/admin", chemin);
  if (role === "tailor") return sous("/tailleur", chemin);
  if (role === "client") return PAGES_CLIENT.some((p) => sous(p, chemin));
  return false;
}

/** Ou aller apres une connexion ou une inscription : la page demandee
 *  (`suite`) si ce compte y a droit, sinon son espace. */
export function destinationFor(role: string | null | undefined, next: string | null | undefined): string {
  return next && pathAllowedFor(role, next) ? next : homeFor(role);
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
