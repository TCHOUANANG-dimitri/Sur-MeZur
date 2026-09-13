"use client";

/**
 * Garde de route cote client. Tant que la session n'est pas connue on affiche
 * un chargement, puis on redirige si le role ne correspond pas.
 *
 * Un compte INVITE porte le role client, mais n'a acces qu'a la prise de
 * mesure publique : il est renvoye vers /mesurer plutot que vers la
 * connexion, pour ne pas perdre le parcours qu'il vient de commencer. Le
 * serveur le refuse de toute facon sur les routes reservees aux inscrits.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Spinner } from "./ui";

export function RequireRole({
  role,
  children,
}: {
  role: "client" | "tailor" | "admin";
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/connexion");
    else if (user.is_guest) router.replace("/mesurer");
    else if (user.role !== role) router.replace("/");
  }, [loading, user, role, router]);

  if (loading) return <Spinner label="Chargement…" />;
  if (!user || user.is_guest || user.role !== role) return null;
  return <>{children}</>;
}
