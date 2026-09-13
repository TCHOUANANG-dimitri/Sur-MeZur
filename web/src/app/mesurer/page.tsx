"use client";

/**
 * Point d'arrivee depuis la landing page : la prise de mesure, sans compte.
 *
 * Un client deja inscrit n'a rien a faire ici — ses mesures ne doivent pas
 * etre floutees — et part donc vers le parcours complet.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { MeasureFlow } from "@/components/MeasureFlow";
import { Spinner } from "@/components/ui";

export default function Mesurer() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const registered = Boolean(user && !user.is_guest);

  useEffect(() => {
    if (loading || !user || user.is_guest) return;
    router.replace(user.role === "admin" ? "/admin" : "/mesures/nouvelle");
  }, [loading, user, router]);

  if (loading) return <Spinner label="Chargement…" />;
  if (registered) return null;

  return (
    <div className="containerNarrow section">
      <MeasureFlow guest onDone={(id) => router.replace(`/mesurer/resultat/${id}`)} />
    </div>
  );
}
