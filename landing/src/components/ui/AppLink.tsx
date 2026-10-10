import type { ReactNode } from "react";

import { appHref } from "@/data/site";

type AppLinkProps = {
  /** Chemin dans l'application (voir `appPaths`). */
  path: string;
  /** Identifie le bouton dans les statistiques d'acquisition (utm_content). */
  cta: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
};

/**
 * Lien vers l'application web. Rendu côté serveur avec une adresse complète
 * (il fonctionne donc sans JavaScript) ; `Attribution` y ajoute ensuite
 * l'origine de la visite pour que l'inscription sache d'où vient la personne.
 */
export function AppLink({ path, cta, className, children, ...rest }: AppLinkProps) {
  return (
    <a href={appHref(path)} data-app-link={cta} className={className} {...rest}>
      {children}
    </a>
  );
}
