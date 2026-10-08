"use client";

// Litiges (M7) : liste avec anciennete et alertes, statistiques des causes.

import Link from "next/link";
import { Orders, type DisputeStats, type OrderRow } from "@/lib/api/admin";
import { useAdmin } from "@/components/admin/AdminContext";
import {
  DataTable,
  FilterSelect,
  FilterText,
  TABLE_DEFAULTS,
  filtersOf,
  tableQuery,
  useUrlState,
} from "@/components/admin/DataTable";
import { DISPUTE_CATEGORY } from "@/components/admin/format";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { formatDate, formatNumber } from "@/components/admin/format";

export default function DisputesPage() {
  const { features } = useAdmin();
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, state: "open", category: "", q: "" });
  const stats = useLoad<DisputeStats>(() => Orders.disputeStats(), []);

  return (
    <div className="adPage">
      <PageHead
        title="Litiges"
        sub={features.payments ? "Instruction graduée, échanges avec les parties, décision." : "Sans argent : une décision « remboursement » vaut « en faveur du client », sans créer de remboursement."}
      />
      {stats.error ? <ErrorState error={stats.error} onRetry={stats.reload} /> : !stats.data ? <Loading /> : (
        <div className="adKpis" style={{ marginBottom: 16 }}>
          <div className="adKpi"><div className="adKpiLabel">Ouverts</div><div className="adKpiValue">{formatNumber(stats.data.open)}</div></div>
          <div className="adKpi"><div className="adKpiLabel">En alerte ({stats.data.alert_days} j)</div><div className="adKpiValue">{formatNumber(stats.data.overdue)}</div></div>
          <div className="adKpi"><div className="adKpiLabel">Ancienneté moyenne</div><div className="adKpiValue">{stats.data.avg_open_age_days == null ? "—" : `${formatNumber(stats.data.avg_open_age_days, 1)} j`}</div></div>
          <div className="adKpi"><div className="adKpiLabel">Résolution moyenne</div><div className="adKpiValue">{stats.data.avg_resolution_days == null ? "—" : `${formatNumber(stats.data.avg_resolution_days, 1)} j`}</div></div>
        </div>
      )}
      {stats.data && (
        <Panel title="Causes et issues">
          <div className="adGrid2">
            <div>
              <h4>Causes fréquentes</h4>
              <ul className="adList">
                {Object.entries(stats.data.by_category).map(([k, v]) => <li key={k}>{DISPUTE_CATEGORY[k] ?? k} : <strong>{v}</strong></li>)}
              </ul>
            </div>
            <div>
              <h4>Issues</h4>
              <ul className="adList">
                {Object.entries(stats.data.by_outcome).map(([k, v]) => <li key={k}>{k} : <strong>{v}</strong></li>)}
              </ul>
            </div>
          </div>
        </Panel>
      )}
      <div className="adToolbar">
        <div className="adTabs" role="tablist">
          {[{ key: "open", label: "Ouverts" }, { key: "resolved", label: "Tranchés" }, { key: "all", label: "Tous" }].map((t) => (
            <button key={t.key} role="tab" aria-selected={s.state === t.key} className={`adTab ${s.state === t.key ? "adTabActive" : ""}`} onClick={() => set({ state: t.key })}>
              {t.label}
            </button>
          ))}
        </div>
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="N° de commande" wide />
        <FilterSelect label="Cause" value={s.category} onChange={(category) => set({ category })} options={DISPUTE_CATEGORY} />
      </div>
      <DisputesTable s={s} set={set} />
    </div>
  );
}

function DisputesTable({ s, set }: { s: Record<string, string>; set: (p: Partial<Record<string, string>>) => void }) {
  return (
    <DataTable<OrderRow>
      id="disputes"
      columns={[
        { key: "ref", label: "Commande", render: (o) => <Link href={`/admin/litiges/${o.id}`}>{o.ref || o.id.slice(0, 8).toUpperCase()}</Link> },
        { key: "dispute_category", label: "Cause", render: (o) => DISPUTE_CATEGORY[o.dispute_category ?? ""] ?? o.dispute_category ?? "—" },
        { key: "dispute_opened_at", label: "Ouvert le", sort: "dispute_opened_at", render: (o) => formatDate(o.dispute_opened_at) },
        { key: "age_days", label: "Ancienneté", render: (o) => (o.age_days == null ? "—" : <span className={o.overdue ? "adWarn" : undefined}>{o.age_days} j</span>) },
        { key: "dispute_status", label: "Statut", render: (o) => o.dispute_status ?? "—" },
        { key: "client_name", label: "Client", render: (o) => o.client_name ?? "—" },
        { key: "tailor_name", label: "Tailleur", render: (o) => o.tailor_name ?? "—" },
      ]}
      fetcher={(p) => Orders.disputes({ ...filtersOf(s), ...p })}
      filters={filtersOf(s)}
      query={tableQuery(s)}
      onQuery={set}
      rowKey={(o) => o.id}
      rowHref={(o) => `/admin/litiges/${o.id}`}
      exportPath="/admin/tables/disputes"
      exportName="litiges"
    />
  );
}
