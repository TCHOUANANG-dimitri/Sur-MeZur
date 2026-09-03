"use client";

/**
 * Garde de route cote client. Equivalent Next du `ProtectedRoute` de
 * l'ancien frontend : tant que la session n'est pas connue on affiche un
 * chargement, puis on redirige si le role ne correspond pas.
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
    else if (user.role !== role) router.replace("/");
  }, [loading, user, role, router]);

  if (loading) return <Spinner label="Chargement…" />;
  if (!user || user.role !== role) return null;
  return <>{children}</>;
}
