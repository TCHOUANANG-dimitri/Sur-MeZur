"use client";

/**
 * Point d'arrivee depuis la landing page : la prise de mesure, sans compte.
 *
 * Un client deja inscrit n'a rien a faire ici — ses mesures ne doivent pas
 * etre floutees — et part donc vers le parcours complet. Un tailleur part
 * vers « Mesurer un client ». Un administrateur ne mesure pas : on lui dit
 * qu'il est connecte et on le laisse choisir (aller a son espace, ou changer
 * de compte pour mesurer en visiteur), au lieu de l'envoyer en silence vers
 * l'administration.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { MeasureFlow } from "@/components/MeasureFlow";
import { SignedInNotice } from "@/components/SignedInNotice";
import { Spinner } from "@/components/ui";

export default function Mesurer() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const registered = Boolean(user && !user.is_guest);

  const measuresHere = user?.role === "client" || user?.role === "tailor";

  useEffect(() => {
    if (loading || !user || user.is_guest) return;
    if (user.role === "client") router.replace("/mesures/nouvelle");
    else if (user.role === "tailor") router.replace("/tailleur/mesurer");
  }, [loading, user, router]);

  if (loading) return <Spinner label="Chargement…" />;
  if (registered && !measuresHere) {
    return (
      <SignedInNotice message="La prise de mesure se fait avec un compte client ou tailleur, ou sans compte. Choisissez « Changer de compte » pour l'essayer en visiteur." />
    );
  }
  if (registered) return <Spinner label="Chargement…" />;

  return (
    <div className="flowWrap section">
      <MeasureFlow guest onDone={(id) => router.replace(`/mesurer/resultat/${id}`)} />
    </div>
  );
}
