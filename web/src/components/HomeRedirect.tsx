"use client";

/**
 * Aiguillage de la racine de l'application.
 *
 * Compte inscrit : son espace (client -> /accueil, tailleur -> /tailleur).
 * Invite en pleine prise de mesure : /mesurer. Visiteur : la landing
 * (sur-mezur.com), qui presente le service et mene a l'application.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { homeFor } from "@/lib/home";
import { LANDING_URL } from "@/lib/site";

export function HomeRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) window.location.replace(LANDING_URL);
    else if (user.is_guest) router.replace("/mesurer");
    else router.replace(homeFor(user.role));
  }, [loading, user, router]);

  return null;
}
