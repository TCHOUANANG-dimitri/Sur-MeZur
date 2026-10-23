"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MeasurementsApi } from "@/lib/api/endpoints";
import type { Measurement } from "@/lib/api/types";
import { presentableMeasures } from "@/lib/measurements";
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconMeasure } from "@/components/icons";
import { tr } from "@/lib/i18n";

export default function MesMesures() {
  const [list, setList] = useState<Measurement[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    MeasurementsApi.list()
      .then(setList)
      .catch((e) => {
        setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
        setList([]);
      });
  }, []);

  return (
    <>
      <PageHeader title={tr("Mes mesures", "My measurements")} />
      <div className="container section">
        <ErrorBanner message={error} />

        {list === null ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconMeasure size={30} strokeWidth={1.6} />}
            title={tr("Aucune mesure", "No measurements yet")}
            body={tr("Deux photos suffisent.", "Two photos are enough.")}
            action={
              <Link href="/mesures/nouvelle">
                <Button>{tr("Prendre mes mesures", "Take my measurements")}</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="stack">
              {list.map((m) => {
                const count = presentableMeasures(m.data as Record<string, number>).length;
                return (
                  <Link key={m.id} href={`/mesures/${m.id}`} className="card measureRow">
                    <div>
                      {/* L'API n'expose pas de date de creation sur une mesure
                          (voir MeasurementOut cote backend) : on identifie donc
                          la prise par son numero plutot que d'afficher une date
                          inventee. */}
                      <strong>{tr("Mesures n°", "Measurements #")}{m.version}</strong>
                      <div className="fieldHint">
                        {count} {tr(count > 1 ? "mesures" : "mesure", count > 1 ? "measurements" : "measurement")} &middot; {m.height_cm} cm
                        {m.weight_kg != null ? ` · ${m.weight_kg} kg` : ""}
                      </div>
                    </div>
                    {m.is_active && <Badge tone="success">{tr("Actuelles", "Current")}</Badge>}
                  </Link>
                );
              })}
            </div>

            <div className="actionBar">
              <Link href="/mesures/nouvelle" style={{ display: "contents" }}>
                <Button block>{tr("Nouvelles mesures", "New measurements")}</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
