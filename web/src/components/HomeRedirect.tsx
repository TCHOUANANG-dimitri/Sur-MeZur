"use client";

/**
 * Redirection des comptes deja inscrits qui ouvrent `/`.
 *
 * La page d'accueil reste un composant serveur statique (aucun appel API au
 * chargement) : ce petit composant client, monte dedans, lit la session
 * partagee et renvoie chacun vers son espace. Les invites (en pleine prise
 * de mesure) et les visiteurs restent sur la page.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export function HomeRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || user.is_guest) return;
    if (user.role === "tailor") router.replace("/tailleur");
    else if (user.role === "admin") router.replace("/admin");
    else router.replace("/accueil");
  }, [loading, user, router]);

  return null;
}
