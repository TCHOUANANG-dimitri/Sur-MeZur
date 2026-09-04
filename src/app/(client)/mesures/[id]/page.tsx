"use client";

/**
 * Resultat d'une prise de mesure, en langage de tous les jours.
 *
 * Ce que cet ecran ne montre PAS, deliberement : les variables intermediaires
 * du modele de vision (`chestbreadth`, `buttockdepth`, `biacromialbreadth`,
 * profondeurs, scores de confiance). Ce sont des grandeurs de travail, sans
 * traduction en couture, que l'application mobile laisse apparaitre. Le tri
 * est fait par `presentableGroups` (lib/measurements.ts), qui ne laisse
 * passer que les douze mesures qu'un tailleur releve au metre ruban.
 */

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi } from "@/lib/api/endpoints";
import type { GarmentModel, Measurement } from "@/lib/api/types";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconMeasure, IconModels, IconPrint } from "@/components/icons";
import { getSelection, onSelectionChange } from "@/lib/selection";

function DetailMesureInner() {
  const { id } = useParams<{ id: string }>();
  const modeleId = useSearchParams().get("modele");

  const [measurement, setMeasurement] = useState<Measurement | null | undefined>(undefined);
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [selectionCount, setSelectionCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    // Il n'existe pas de route `GET /measurements/{id}` cote backend : on
    // recupere la liste et on y retrouve la mesure voulue.
    MeasurementsApi.list()
      .then((list) => setMeasurement(list.find((m) => m.id === id) ?? null))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Mesures introuvables.");
        setMeasurement(null);
      });
  }, [id]);

  useEffect(() => {
    if (!modeleId) return;
    CatalogApi.model(modeleId)
      .then(setModel)
      .catch(() => setModel(null));
  }, [modeleId]);

  // La selection vit dans le navigateur : on la lit apres le montage pour
  // eviter tout ecart entre le rendu serveur et le rendu client.
  useEffect(() => {
    const sync = () => setSelectionCount(getSelection().length);
    sync();
    return onSelectionChange(sync);
  }, []);

  if (measurement === undefined) return <Spinner label="Chargement de vos mesures&hellip;" />;

  if (measurement === null) {
    return (
      <>
        <PageHeader title="Mes mesures" back />
        <div className="container section">
          <ErrorBanner message={error} />
          <EmptyState icon={<IconMeasure size={30} strokeWidth={1.6} />} title="Ces mesures n'existent pas" />
        </div>
      </>
    );
  }

  const groups = presentableGroups(measurement.data as Record<string, number>);

  return (
    <>
      <PageHeader title="Vos mesures" back />
      <div className="container section">
        <div className="resultIntro">
          <h2>Voici vos mesures</h2>
          <p className="muted">
            Elles sont pretes a etre remises a votre tailleur. Chaque mesure indique
            l&apos;endroit du corps ou elle se prend, pour que vous puissiez la verifier au
            metre ruban si vous le souhaitez.
          </p>
        </div>

        {model && (
          <div className="card cardFlat resultModel">
            <div
              className="resultModelThumb"
              style={
                model.photo_url
                  ? { backgroundImage: `url(${model.photo_url})` }
                  : { background: model.thumbnail_color }
              }
              role="img"
              aria-label={model.name}
            />
            <div>
              <span className="fieldHint">Modele retenu</span>
              <strong style={{ display: "block" }}>{model.name}</strong>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <EmptyState
            icon={<IconMeasure size={30} strokeWidth={1.6} />}
            title="Aucune mesure exploitable"
            body="L'analyse n'a rien pu retenir de ces photos. Reprenez-les en veillant a etre entierement dans le cadre."
            action={
              <Link href="/mesures/nouvelle">
                <Button>Reprendre mes photos</Button>
              </Link>
            }
          />
        ) : (
          groups.map((group) => (
            <section key={group.id} className="measureGroup">
              <h3 className="measureGroupTitle">{group.title}</h3>
              <div className="measureList">
                {group.items.map(({ key, info, value }) => (
                  <div key={key} className="measureItem">
                    <div className="measureItemHead">
                      <span className="measureName">{info.label}</span>
                      <span className="measureValue">{formatCm(value)}</span>
                    </div>
                    <p className="measureWhere">{info.where}</p>
                    <p className="measurePurpose">{info.purpose}</p>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}

        {groups.length > 0 && (
          <>
            <div className="downloadCards">
              <Link
                href={`/mesures/${measurement.id}/fiche${modeleId ? `?modele=${modeleId}` : ""}`}
                className="downloadCard"
              >
                <span className="downloadIcon" aria-hidden>
                  <IconPrint size={20} strokeWidth={1.9} />
                </span>
                <span className="downloadText">
                  <strong>Fiche de mesures</strong>
                  <span className="fieldHint">
                    Vos douze mesures, expliquées. À remettre au tailleur.
                  </span>
                </span>
              </Link>

              <Link href={`/mesures/${measurement.id}/modeles`} className="downloadCard">
                <span className="downloadIcon" aria-hidden>
                  <IconModels size={20} strokeWidth={1.9} />
                </span>
                <span className="downloadText">
                  <strong>Fiche des modèles</strong>
                  <span className="fieldHint">
                    {selectionCount > 0
                      ? `${selectionCount} modèle${selectionCount > 1 ? "s" : ""} retenu${selectionCount > 1 ? "s" : ""}.`
                      : "Aucun modèle retenu pour l'instant."}
                  </span>
                </span>
              </Link>
            </div>

            <p className="muted downloadNote">
              Ce sont deux documents distincts : vos mesures d&apos;un côté, les modèles à
              coudre de l&apos;autre.
            </p>
          </>
        )}
      </div>
    </>
  );
}

export default function DetailMesure() {
  return (
    <Suspense fallback={<Spinner label="Chargement&hellip;" />}>
      <DetailMesureInner />
    </Suspense>
  );
}
