"use client";

/**
 * Nouvelle prise de mesure, pour un client inscrit.
 *
 * Le parcours lui-meme (informations, consignes de posture, photos, analyse)
 * vit dans `MeasureFlow`, partage avec la prise de mesure sans compte de
 * /mesurer : une consigne corrigee l'est ainsi pour tout le monde.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MeasureFlow } from "@/components/MeasureFlow";
import { PageHeader, Spinner } from "@/components/ui";

function NouvelleMesureInner() {
  const router = useRouter();
  const modeleId = useSearchParams().get("modele");

  return (
    <>
      <PageHeader title="Prendre mes mesures" back />
      <div className="containerNarrow section">
        <MeasureFlow
          onDone={(id) =>
            router.replace(`/mesures/${id}${modeleId ? `?modele=${modeleId}` : ""}`)
          }
        />
      </div>
    </>
  );
}

export default function NouvelleMesure() {
  // `useSearchParams` impose une frontiere Suspense en App Router.
  return (
    <Suspense fallback={<Spinner label="Chargement…" />}>
      <NouvelleMesureInner />
    </Suspense>
  );
}
