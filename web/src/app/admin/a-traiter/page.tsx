"use client";

// 1.2 — file unique des actions en attente, de la plus ancienne a la plus
// recente, avec un lien direct vers chacune.

import Link from "next/link";
import { useMemo } from "react";
import { Core } from "@/lib/api/admin";
import { Chip } from "@/components/ui";
import { useUrlState } from "@/components/admin/DataTable";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { ago, formatDateTime } from "@/components/admin/format";

export default function Queue() {
  const { data, error, reload } = useLoad(() => Core.queue(), []);
  const [s, set] = useUrlState({ type: "" });
  const types = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    data?.items.forEach((i) => m.set(i.type, { label: i.label, n: (m.get(i.type)?.n ?? 0) + 1 }));
    return Array.from(m.entries());
  }, [data]);
  const items = (data?.items ?? []).filter((i) => !s.type || i.type === s.type);

  return (
    <div className="adPage">
      <PageHead title="À traiter" sub="Toutes les tâches en attente, de la plus ancienne à la plus récente." />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="chipRow" style={{ marginBottom: 12 }}>
            <Chip active={!s.type} onClick={() => set({ type: "" })}>
              Tout ({data.total})
            </Chip>
            {types.map(([type, t]) => (
              <Chip key={type} active={s.type === type} onClick={() => set({ type })}>
                {t.label} ({t.n})
              </Chip>
            ))}
          </div>
          <Panel>
            {items.length === 0 ? (
              <div className="adState">
                <h3>Rien en attente</h3>
                <p>Toutes les tâches de ce type sont traitées.</p>
              </div>
            ) : (
              <div className="adTableScroll">
                <table className="adTable">
                  <thead>
                    <tr>
                      <th>Tâche</th>
                      <th>Élément</th>
                      <th>En attente depuis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i, idx) => (
                      <tr key={idx}>
                        <td data-label="Tâche">
                          <Link href={i.href}>{i.label}</Link>
                        </td>
                        <td data-label="Élément">{i.title}</td>
                        <td data-label="Depuis" title={formatDateTime(i.since)}>
                          {ago(i.since)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
