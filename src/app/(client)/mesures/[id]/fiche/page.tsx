"use client";

/**
 * Fiche de mesures a imprimer ou enregistrer en PDF.
 *
 * POURQUOI L'IMPRESSION NAVIGATEUR plutot qu'une bibliotheque PDF cote
 * serveur : aucune dependance a installer sur l'hebergement mutualise (qui
 * n'a ni Cairo ni Pango, ce qui exclut WeasyPrint), et le « Enregistrer en
 * PDF » natif existe aussi bien sur Android et iOS que sur ordinateur. La
 * mise en page est donc du HTML, pilotee par `@media print`.
 *
 * La page est volontairement lisible a l'ecran ET a l'impression : ce qui ne
 * doit pas figurer sur le papier porte la classe `no-print`.
 */

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi } from "@/lib/api/endpoints";
import type { GarmentModel, Measurement } from "@/lib/api/types";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { useAuth } from "@/components/AuthProvider";
import { Button, EmptyState, PageHeader, Spinner } from "@/components/ui";

function FicheInner() {
  const { id } = useParams<{ id: string }>();
  const modeleId = useSearchParams().get("modele");
  const { user } = useAuth();

  const [measurement, setMeasurement] = useState<Measurement | null | undefined>(undefined);
  const [model, setModel] = useState<GarmentModel | null>(null);

  useEffect(() => {
    if (!id) return;
    MeasurementsApi.list()
      .then((list) => setMeasurement(list.find((m) => m.id === id) ?? null))
      .catch(() => setMeasurement(null));
  }, [id]);

  useEffect(() => {
    if (!modeleId) return;
    CatalogApi.model(modeleId).then(setModel).catch(() => setModel(null));
  }, [modeleId]);

  if (measurement === undefined) return <Spinner label="Preparation de la fiche&hellip;" />;
  if (measurement === null) {
    return (
      <>
        <PageHeader title="Fiche" back />
        <EmptyState icon="&#128196;" title="Fiche indisponible" />
      </>
    );
  }

  const groups = presentableGroups(measurement.data as Record<string, number>);
  // L'API ne renvoie pas la date de la prise de mesure : la fiche date donc
  // son EDITION, ce qui est exact et utile a un tailleur, plutot que
  // d'afficher une date de prise que nous n'avons pas.
  const editee = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <PageHeader title="Ma fiche de mesures" back />

      <div className="container section">
        <div className="ficheActions no-print">
          <Button block onClick={() => window.print()}>
            Enregistrer en PDF
          </Button>
          <p className="fieldHint" style={{ textAlign: "center" }}>
            Dans la fenetre qui s&apos;ouvre, choisissez &laquo;&nbsp;Enregistrer au format
            PDF&nbsp;&raquo; comme destination.
          </p>
        </div>

        <article className="fiche">
          <header className="ficheHeader">
            <div>
              <span className="ficheBrand">Sur-MeZur</span>
              <h1 className="ficheTitle">Fiche de mesures</h1>
            </div>
            <div className="ficheMeta">
              {user?.full_name && <div><strong>{user.full_name}</strong></div>}
              <div>Fiche editee le {editee}</div>
              <div>Prise de mesures n&deg;{measurement.version}</div>
            </div>
          </header>

          <section className="ficheContext">
            <div>
              <span className="ficheLabel">Taille</span>
              <span className="ficheValue">{measurement.height_cm} cm</span>
            </div>
            {measurement.weight_kg != null && (
              <div>
                <span className="ficheLabel">Poids</span>
                <span className="ficheValue">{measurement.weight_kg} kg</span>
              </div>
            )}
            {model && (
              <div>
                <span className="ficheLabel">Modele souhaite</span>
                <span className="ficheValue">{model.name}</span>
              </div>
            )}
          </section>

          {groups.map((group) => (
            <section key={group.id} className="ficheGroup">
              <h2 className="ficheGroupTitle">{group.title}</h2>
              <table className="ficheTable">
                <tbody>
                  {group.items.map(({ key, info, value }) => (
                    <tr key={key}>
                      <th scope="row">
                        <span className="ficheMeasureName">{info.label}</span>
                        <span className="ficheMeasureWhere">{info.where}</span>
                      </th>
                      <td>{formatCm(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          <footer className="ficheFooter">
            Mesures obtenues a partir de deux photographies. A verifier au metre ruban avant
            la coupe si le vetement est ajuste.
          </footer>
        </article>
      </div>
    </>
  );
}

export default function Fiche() {
  return (
    <Suspense fallback={<Spinner label="Chargement&hellip;" />}>
      <FicheInner />
    </Suspense>
  );
}
