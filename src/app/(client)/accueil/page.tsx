"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi } from "@/lib/api/endpoints";
import type { GarmentModel, Measurement } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { ModelCard } from "@/components/ModelCard";
import { Button, PageHeader, Spinner } from "@/components/ui";

export default function Accueil() {
  const { user } = useAuth();
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  useEffect(() => {
    CatalogApi.models()
      .then((l) => setModels(l.slice(0, 8)))
      .catch(() => setModels([]));
    MeasurementsApi.list()
      .then(setMeasurements)
      .catch(() => setMeasurements([]));
  }, []);

  const firstName = user?.full_name?.split(" ")[0];
  const hasMeasures = measurements.length > 0;

  return (
    <>
      <PageHeader title="Accueil" />
      <div className="container section">
        <h2>{firstName ? `Bonjour ${firstName}` : "Bonjour"}</h2>

        {/* L'action principale change selon que la personne a deja des mesures
            ou non : c'est la seule chose qu'elle vient faire ici. */}
        <div className="card cardElevated homeCta">
          {hasMeasures ? (
            <>
              <h3>Vos mesures sont prêtes</h3>
              <p className="muted">
                Consultez-les, ou téléchargez la fiche à remettre à votre tailleur.
              </p>
              <Link href={`/mesures/${measurements[0].id}`} style={{ display: "contents" }}>
                <Button block>Voir mes mesures</Button>
              </Link>
            </>
          ) : (
            <>
              <h3>Prenez vos mesures</h3>
              <p className="muted">
                Deux photos suffisent. Vous obtenez douze mesures de couture, expliquées
                simplement, à télécharger.
              </p>
              <Link href="/mesures/nouvelle" style={{ display: "contents" }}>
                <Button block>Commencer</Button>
              </Link>
            </>
          )}
        </div>

        <div className="homeSectionHead">
          <h3>Modèles</h3>
          <Link href="/modeles">Tout voir</Link>
        </div>

        {models === null ? (
          <Spinner />
        ) : models.length === 0 ? (
          <p className="muted">Le catalogue est vide pour le moment.</p>
        ) : (
          <div className="rail">
            {models.map((m) => (
              <ModelCard key={m.id} model={m} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
