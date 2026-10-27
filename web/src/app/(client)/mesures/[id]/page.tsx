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
import { friendlyError, withRetry } from "@/lib/retry";
import type { GarmentModel, Measurement } from "@/lib/api/types";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconMeasure, IconModels, IconPrint } from "@/components/icons";
import { getSelection, onSelectionChange } from "@/lib/selection";
import { tr } from "@/lib/i18n";
import { nomModele } from "@/lib/modelText";

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
    withRetry(() => MeasurementsApi.list())
      .then((list) => setMeasurement(list.find((m) => m.id === id) ?? null))
      .catch((e) => {
        setError(friendlyError(e, tr("réessayez", "try again")));
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

  if (measurement === undefined) return <Spinner />;

  if (measurement === null) {
    return (
      <>
        <PageHeader title={tr("Mes mesures", "My measurements")} back />
        <div className="container section">
          <ErrorBanner message={error} />
          <EmptyState icon={<IconMeasure size={30} strokeWidth={1.6} />} title={tr("Mesures introuvables", "Measurements not found")} />
        </div>
      </>
    );
  }

  const groups = presentableGroups(measurement.data as Record<string, number>);

  return (
    <>
      <PageHeader title={tr("Vos mesures", "Your measurements")} back />
      <div className="container section">

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
              aria-label={nomModele(model)}
            />
            <div>
              <span className="fieldHint">{tr("Modèle retenu", "Chosen style")}</span>
              <strong style={{ display: "block" }}>{nomModele(model)}</strong>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <EmptyState
            icon={<IconMeasure size={30} strokeWidth={1.6} />}
            title={tr("Aucune mesure exploitable", "No usable measurements")}
            body={tr("Reprenez les photos, corps entier dans le cadre.", "Retake the photos, whole body in frame.")}
            action={
              <Link href="/mesures/nouvelle">
                <Button>{tr("Reprendre mes photos", "Retake photos")}</Button>
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
                  <strong>{tr("Fiche de mesures", "Measurement sheet")}</strong>
                  <span className="fieldHint">{tr("À remettre au tailleur.", "For your tailor.")}</span>
                </span>
              </Link>

              <Link href={`/mesures/${measurement.id}/modeles`} className="downloadCard">
                <span className="downloadIcon" aria-hidden>
                  <IconModels size={20} strokeWidth={1.9} />
                </span>
                <span className="downloadText">
                  <strong>{tr("Mes modèles", "My styles")}</strong>
                  <span className="fieldHint">
                    {selectionCount > 0
                      ? tr(`${selectionCount} modèle${selectionCount > 1 ? "s" : ""} retenu${selectionCount > 1 ? "s" : ""}`, `${selectionCount} style${selectionCount > 1 ? "s" : ""} chosen`)
                      : tr("Aucun pour l'instant.", "None yet.")}
                  </span>
                </span>
              </Link>
            </div>

          </>
        )}
      </div>
    </>
  );
}

export default function DetailMesure() {
  return (
    <Suspense fallback={<Spinner />}>
      <DetailMesureInner />
    </Suspense>
  );
}
