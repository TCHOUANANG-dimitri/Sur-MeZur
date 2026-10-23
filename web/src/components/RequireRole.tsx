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
import { reservedTitle } from "@/lib/home";
import { tr } from "@/lib/i18n";

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

  if (loading) return <Spinner />;
  if (user && !user.is_guest && !user.must_change_password && user.role !== role) {
    return (
      <SignedInNotice
        title={reservedTitle(role)}
        message={tr("Allez à votre espace, ou changez de compte.", "Go to your space, or switch account.")}
        // Connexion, puis retour ici SEULEMENT si le nouveau compte y a droit
        // (destinationFor) : plus de boucle sur cet ecran.
        switchTo={
          typeof window === "undefined"
            ? "/connexion"
            : `/connexion?suite=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`
        }
      />
    );
  }
  if (!user || user.is_guest || user.must_change_password) return null;
  return <>{children}</>;
}
