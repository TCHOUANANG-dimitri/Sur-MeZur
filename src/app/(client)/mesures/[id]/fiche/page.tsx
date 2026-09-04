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

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi } from "@/lib/api/endpoints";
import type { GarmentModel, Measurement } from "@/lib/api/types";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { getSelection } from "@/lib/selection";
import { useAuth } from "@/components/AuthProvider";
import { Button, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { IconPrint } from "@/components/icons";

function FicheInner() {
  const { id } = useParams<{ id: string }>();
  const modeleId = useSearchParams().get("modele");
  const { user } = useAuth();

  const [measurement, setMeasurement] = useState<Measurement | null | undefined>(undefined);
  const [models, setModels] = useState<GarmentModel[]>([]);

  useEffect(() => {
    if (!id) return;
    MeasurementsApi.list()
      .then((list) => setMeasurement(list.find((m) => m.id === id) ?? null))
      .catch(() => setMeasurement(null));
  }, [id]);

  useEffect(() => {
    // La fiche part avec les modeles que la personne a retenus : ceux de sa
    // selection, plus celui par lequel elle est arrivee s'il n'y figure pas
    // deja. Les modeles introuvables sont ignores plutot que de faire echouer
    // toute la fiche.
    const ids = Array.from(new Set([...getSelection(), ...(modeleId ? [modeleId] : [])]));
    if (!ids.length) {
      setModels([]);
      return;
    }
    Promise.all(ids.map((id) => CatalogApi.model(id).catch(() => null))).then((list) =>
      setModels(list.filter((m): m is GarmentModel => m !== null))
    );
  }, [modeleId]);

  if (measurement === undefined) return <Spinner label="Preparation de la fiche&hellip;" />;
  if (measurement === null) {
    return (
      <>
        <PageHeader title="Fiche" back />
        <EmptyState icon={<IconPrint size={30} strokeWidth={1.6} />} title="Fiche indisponible" />
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
      <PageHeader title="Fiche de mesures" back />

      <div className="container section">
        <div className="ficheSwitch no-print">
          {models.length > 0 ? (
            <span>
              {models.length} modèle{models.length > 1 ? "s" : ""} retenu
              {models.length > 1 ? "s" : ""}.{" "}
              <Link href={`/mesures/${measurement.id}/modeles`}>
                Télécharger la fiche des modèles
              </Link>{" "}
              — c&apos;est un second document, séparé de vos mesures.
            </span>
          ) : (
            <span>
              Aucun modèle retenu.{" "}
              <Link href="/modeles">Choisissez-en un ou plusieurs</Link> pour obtenir aussi
              leur fiche.
            </span>
          )}
        </div>

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
          </section>

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
