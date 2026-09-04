"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MeasurementsApi } from "@/lib/api/endpoints";
import type { Measurement } from "@/lib/api/types";
import { presentableMeasures } from "@/lib/measurements";
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconMeasure } from "@/components/icons";

export default function MesMesures() {
  const [list, setList] = useState<Measurement[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    MeasurementsApi.list()
      .then(setList)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Impossible de charger vos mesures.");
        setList([]);
      });
  }, []);

  return (
    <>
      <PageHeader title="Mes mesures" />
      <div className="container section">
        <ErrorBanner message={error} />

        {list === null ? (
          <Spinner label="Chargement&hellip;" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconMeasure size={30} strokeWidth={1.6} />}
            title="Aucune mesure pour l'instant"
            body="Prenez deux photos et obtenez vos douze mesures de couture en moins d'une minute."
            action={
              <Link href="/mesures/nouvelle">
                <Button>Prendre mes mesures</Button>
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
                      <strong>Prise de mesures n&deg;{m.version}</strong>
                      <div className="fieldHint">
                        {count} mesure{count > 1 ? "s" : ""} &middot; {m.height_cm} cm
                        {m.weight_kg != null ? ` · ${m.weight_kg} kg` : ""}
                      </div>
                    </div>
                    {m.is_active && <Badge tone="success">Actuelles</Badge>}
                  </Link>
                );
              })}
            </div>

            <div className="actionBar">
              <Link href="/mesures/nouvelle" style={{ display: "contents" }}>
                <Button block>Nouvelle prise de mesures</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
