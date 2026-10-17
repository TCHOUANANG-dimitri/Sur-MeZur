"use client";

// Tailleurs (3.6 a 3.8) : suivi (commandes, livraisons, retards, delai de
// reponse, alertes), mise en avant et ordre, repartition par ville et quartier.

import Link from "next/link";
import { useState } from "react";
import { Tailors, type TailorRow } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useFeedback } from "@/components/admin/Feedback";
import {
  DataTable,
  FilterSelect,
  FilterText,
  TABLE_DEFAULTS,
  filtersOf,
  tableQuery,
  useUrlState,
  type Column,
} from "@/components/admin/DataTable";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { formatNumber } from "@/components/admin/format";

const COLUMNS: Column<TailorRow>[] = [
  { key: "shop_name", label: "Atelier", sort: "shop_name", render: (t) => <Link href={`/admin/utilisateurs/${t.user_id}`}>{t.shop_name}</Link> },
  { key: "full_name", label: "Tailleur", render: (t) => `${t.full_name} · ${t.phone}` },
  { key: "city", label: "Ville", render: (t) => `${t.city ?? "—"}${t.quartier ? ` · ${t.quartier}` : ""}` },
  { key: "orders", label: "Commandes", align: "right", render: (t) => formatNumber(t.orders) },
  { key: "delivered", label: "Livrées", align: "right", optional: true, render: (t) => formatNumber(t.delivered) },
  { key: "late_rate", label: "Retards", align: "right", render: (t) => (t.late_rate == null ? "—" : `${formatNumber(t.late_rate * 100, 0)} %`) },
  { key: "avg_response_minutes", label: "Délai réponse", align: "right", optional: true, render: (t) => (t.avg_response_minutes == null ? "—" : `${formatNumber(t.avg_response_minutes)} min`) },
  { key: "alerts", label: "Alertes", render: (t) => (t.alerts ? <span className="adWarn">{t.alerts}</span> : <span className="adMuted">—</span>) },
  { key: "is_featured", label: "En avant", render: (t) => (t.is_featured ? `Oui${t.featured_rank != null ? ` (#${t.featured_rank})` : ""}` : "—") },
];

export default function TailorsPage() {
  const { confirm, toast } = useFeedback();
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, q: "", city: "", featured: "", alert: "", tab: "liste" });
  const [reload, setReload] = useState(0);
  const map = useLoad(() => Tailors.map(), [s.tab]);

  const setFeatured = async (row: TailorRow, on: boolean) => {
    let rank: number | null = row.featured_rank;
    if (on) {
      const answer = await confirm({ title: `Mettre « ${row.shop_name} » en avant ?`, body: "Un tailleur mis en avant passe en tête de la recherche.", confirmLabel: "Mettre en avant", reason: { label: "Rang (1 = premier, vide = à la suite)", required: false, placeholder: "ex. 1" } });
      if (answer === null) return;
      rank = answer.trim() === "" ? null : Number(answer);
      if (rank !== null && (!Number.isFinite(rank) || rank < 1)) {
        toast("Rang invalide.", { error: true });
        return;
      }
    } else {
      const answer = await confirm({ title: `Retirer « ${row.shop_name} » de la mise en avant ?`, confirmLabel: "Retirer", danger: true });
      if (answer === null) return;
      rank = null;
    }
    try {
      await Tailors.featured(row.id, on, rank);
      toast(on ? "Tailleur mis en avant." : "Mise en avant retirée.", on ? { undo: async () => { await Tailors.featured(row.id, false); setReload((n) => n + 1); } } : undefined);
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <div className="adPage">
      <PageHead title="Tailleurs" sub="Qualité, mise en avant et répartition géographique." />
      <div className="adTabs" role="tablist">
        {(["liste", "carte"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={s.tab === t} className={`adTab ${s.tab === t ? "adTabActive" : ""}`} onClick={() => set({ tab: t })}>
            {t === "liste" ? "Liste" : "Carte et villes"}
          </button>
        ))}
      </div>

      {s.tab === "carte" ? (
        map.error ? <ErrorState error={map.error} onRetry={map.reload} /> : !map.data ? <Loading /> : (
          <Panel title="Répartition par ville et quartier">
            <ul className="adList">
              {map.data.cities.map((c) => (
                <li key={c.city}>
                  <strong>{c.city}</strong> — {c.total} tailleur(s)
                  {c.quartiers.length > 0 && <span className="adHint"> · {c.quartiers.slice(0, 6).map((q) => `${q.name} (${q.total})`).join(", ")}</span>}
                </li>
              ))}
            </ul>
            <p className="adHint">{map.data.points.length} position(s) connue(s). La carte détaillée viendra avec le fond de plan.</p>
          </Panel>
        )
      ) : (
        <>
          <div className="adToolbar">
            <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Atelier, nom, téléphone" wide />
            <FilterText label="Ville" value={s.city} onChange={(city) => set({ city })} placeholder="Douala" />
            <FilterSelect label="Mise en avant" value={s.featured} onChange={(featured) => set({ featured })} options={{ true: "Mis en avant", false: "Non mis en avant" }} />
            <FilterSelect label="Alertes" value={s.alert} onChange={(alert) => set({ alert })} options={{ true: "Avec alertes" }} allLabel="Tous" />
          </div>
          <DataTable<TailorRow>
            id="tailors"
            columns={[
              ...COLUMNS,
              {
                key: "actions",
                label: "Actions",
                render: (t) => (
                  <Button variant="secondary" className="adBtnSm" onClick={() => void setFeatured(t, !t.is_featured)}>
                    {t.is_featured ? "Retirer" : "Mettre en avant"}
                  </Button>
                ),
              },
            ]}
            fetcher={(p) => Tailors.table({ ...filtersOf(s), ...p })}
            filters={filtersOf(s)}
            query={tableQuery(s)}
            onQuery={set}
            rowKey={(t) => t.id}
            exportPath="/admin/tables/tailors"
            exportName="tailleurs"
            reloadToken={reload}
          />
        </>
      )}
    </div>
  );
}
