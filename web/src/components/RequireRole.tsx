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
import { SignedInNotice } from "./SignedInNotice";
import { Spinner } from "./ui";
import { ROLE_AUDIENCE } from "@/lib/home";

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
    // Sans session : connexion, puis retour sur la page demandee.
    if (!user) {
      const here = `${window.location.pathname}${window.location.search}`;
      router.replace(`/connexion?suite=${encodeURIComponent(here)}`);
    }
    else if (user.is_guest) router.replace("/mesurer");
    // 2.6 : mot de passe provisoire fixe par l'equipe, a changer d'abord.
    else if (user.must_change_password) router.replace("/changer-mot-de-passe");
    // Mauvais role : pas de redirection silencieuse vers un autre espace,
    // le message ci-dessous laisse choisir.
  }, [loading, user, role, router]);

  if (loading) return <Spinner label="Chargement…" />;
  if (user && !user.is_guest && !user.must_change_password && user.role !== role) {
    return (
      <SignedInNotice
        title={`Cette page est réservée aux ${ROLE_AUDIENCE[role]}`}
        message="Allez à votre espace, ou changez de compte pour y accéder."
      />
    );
  }
  if (!user || user.is_guest || user.must_change_password) return null;
  return <>{children}</>;
}
