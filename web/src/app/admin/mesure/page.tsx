"use client";

// Mesure par photo (M9) : journal des analyses, sante, etat de la chaine,
// precision observee. Les mesures faites par les tailleurs (carnet) ont leur
// onglet : saisie manuelle et photo reunies.

import Link from "next/link";
import { Measure, type MeasureHealth, type Precision, type SessionRow, type TailorMeasureRow } from "@/lib/api/admin";
import {
  DataTable,
  FilterDate,
  FilterSelect,
  FilterText,
  TABLE_DEFAULTS,
  filtersOf,
  tableQuery,
  useUrlState,
  type Column,
} from "@/components/admin/DataTable";
import { ErrorState, Loading, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { formatDate, formatDateTime, formatNumber, formatPct } from "@/components/admin/format";

const SESSION_STATUS = { processing: { label: "En cours", tone: "pending" as const }, ready: { label: "Réussie", tone: "success" as const }, failed: { label: "Échouée", tone: "error" as const } };

export default function MeasurePage() {
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, tab: "analyses", status: "", platform: "", account: "", date_from: "", date_to: "", q: "", source: "" });
  const tab = ["analyses", "tailleurs", "sante", "precision"].includes(s.tab) ? s.tab : "analyses";
  const health = useLoad(() => Measure.health(7), [tab]);
  const precision = useLoad(() => Measure.precision(), [tab]);
  const chain = useLoad(() => Measure.chain(), [tab]);

  return (
    <div className="adPage">
      <PageHead title="Mesure par photo" sub="Journal des analyses, santé de la chaîne, précision observée." />
      <div className="adTabs" role="tablist">
        {[{ key: "analyses", label: "Analyses" }, { key: "tailleurs", label: "Mesures tailleurs" }, { key: "sante", label: "Santé" }, { key: "precision", label: "Précision" }].map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`adTab ${tab === t.key ? "adTabActive" : ""}`} onClick={() => set({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "analyses" && <SessionsTab s={s} set={set} />}
      {tab === "tailleurs" && <TailorMeasuresTab s={s} set={set} />}
      {tab === "sante" && <HealthTab health={health} chain={chain} />}
      {tab === "precision" && <PrecisionTab precision={precision} />}
    </div>
  );
}

function SessionsTab({ s, set }: { s: Record<string, string>; set: (p: Partial<Record<string, string>>) => void }) {
  const columns: Column<SessionRow>[] = [
    { key: "created_at", label: "Date", sort: "created_at", render: (x) => formatDate(x.created_at) },
    { key: "account", label: "Compte", render: (x) => (x.is_guest ? "Invité" : x.account) },
    { key: "platform", label: "Support", render: (x) => (x.platform === "web" ? "Site" : "Application") },
    { key: "status", label: "Résultat", render: (x) => <StatusBadge map={SESSION_STATUS} value={x.status} /> },
    { key: "duration_s", label: "Durée", align: "right", optional: true, render: (x) => (x.duration_s == null ? "—" : `${formatNumber(x.duration_s, 1)} s`) },
    { key: "error_message", label: "Cause", render: (x) => x.error_message ?? "—" },
    { key: "open", label: "Diagnostic", render: (x) => <Link className="btn btnSecondary adBtnSm" href={`/admin/mesure/${x.id}`}>Ouvrir</Link> },
  ];
  return (
    <>
      <div className="adToolbar">
        <FilterSelect label="Résultat" value={s.status} onChange={(status) => set({ status })} options={{ processing: "En cours", ready: "Réussies", failed: "Échouées" }} />
        <FilterSelect label="Support" value={s.platform} onChange={(platform) => set({ platform })} options={{ web: "Site web", app: "Application" }} />
        <FilterSelect label="Compte" value={s.account} onChange={(account) => set({ account })} options={{ guest: "Invités", registered: "Inscrits" }} />
        <FilterDate label="Depuis" value={s.date_from} onChange={(date_from) => set({ date_from })} />
        <FilterDate label="Jusqu'au" value={s.date_to} onChange={(date_to) => set({ date_to })} />
      </div>
      <DataTable<SessionRow>
        id="sessions"
        columns={columns}
        fetcher={(p) => Measure.sessions({ ...filtersOf(s, ["tab", "q", "source"]), ...p })}
        filters={filtersOf(s, ["tab", "q", "source"])}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(x) => x.id}
        rowHref={(x) => `/admin/mesure/${x.id}`}
        exportPath="/admin/tables/measurement-sessions"
        exportName="analyses"
      />
    </>
  );
}

function TailorMeasuresTab({ s, set }: { s: Record<string, string>; set: (p: Partial<Record<string, string>>) => void }) {
  const columns: Column<TailorMeasureRow>[] = [
    { key: "created_at", label: "Date", sort: "created_at", render: (x) => formatDate(x.created_at) },
    { key: "shop_name", label: "Atelier", render: (x) => <Link href={`/admin/utilisateurs/${x.tailor_user_id}`}>{x.shop_name}</Link> },
    { key: "client", label: "Client", render: (x) => x.client },
    { key: "source", label: "Origine", render: (x) => (x.source === "photo" ? "Photo" : "Manuelle") },
    { key: "keys", label: "Mesures", align: "right", render: (x) => formatNumber(x.keys) },
    { key: "height_cm", label: "Taille", align: "right", optional: true, render: (x) => (x.height_cm == null ? "—" : `${formatNumber(x.height_cm)} cm`) },
    { key: "note", label: "Note", optional: true, render: (x) => x.note ?? "—" },
  ];
  return (
    <>
      <div className="adToolbar">
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Client, atelier" wide />
        <FilterSelect label="Origine" value={s.source} onChange={(source) => set({ source })} options={{ manual: "Saisie manuelle", photo: "Photo" }} />
        <FilterDate label="Depuis" value={s.date_from} onChange={(date_from) => set({ date_from })} />
        <FilterDate label="Jusqu'au" value={s.date_to} onChange={(date_to) => set({ date_to })} />
      </div>
      <DataTable<TailorMeasureRow>
        id="tailor-measures"
        columns={columns}
        fetcher={(p) => Measure.tailorMeasurements({ ...filtersOf(s, ["tab", "status", "platform", "account"]), ...p })}
        filters={filtersOf(s, ["tab", "status", "platform", "account"])}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(x) => x.id}
        exportPath="/admin/tables/tailor-measurements"
        exportName="mesures-tailleurs"
      />
    </>
  );
}

function HealthTab({ health, chain }: { health: { data: MeasureHealth | null; error: unknown; reload: () => void }; chain: { data: Record<string, unknown> | null; error: unknown; reload: () => void } }) {
  return (
    <>
      {health.error ? <ErrorState error={health.error} onRetry={health.reload} /> : !health.data ? <Loading /> : (
        <Panel title={`Santé — ${health.data.days} derniers jours`}>
          <div className="adKpis">
            <div className="adKpi"><div className="adKpiLabel">Analyses</div><div className="adKpiValue">{formatNumber(health.data.total)}</div></div>
            <div className="adKpi"><div className="adKpiLabel">Réussite</div><div className="adKpiValue">{health.data.success_rate_pct == null ? "—" : formatPct(health.data.success_rate_pct / 100)}</div></div>
            <div className="adKpi"><div className="adKpiLabel">Durée médiane</div><div className="adKpiValue">{health.data.median_duration_s == null ? "—" : `${formatNumber(health.data.median_duration_s, 1)} s`}</div></div>
            <div className="adKpi"><div className="adKpiLabel">En cours</div><div className="adKpiValue">{formatNumber(health.data.processing_now)}</div></div>
          </div>
          <h4>Causes d&apos;échec fréquentes</h4>
          {health.data.top_errors.length === 0 ? <p className="adHint">Aucun échec.</p> : (
            <ul className="adList">{health.data.top_errors.map((e) => <li key={e.cause}>{e.cause} : <strong>{e.count}</strong></li>)}</ul>
          )}
        </Panel>
      )}
      {chain.error ? <ErrorState error={chain.error} onRetry={chain.reload} /> : !chain.data ? <Loading /> : (
        <Panel title="État de la chaîne">
          <pre className="adCode">{JSON.stringify(chain.data, null, 2)}</pre>
        </Panel>
      )}
    </>
  );
}

function PrecisionTab({ precision }: { precision: { data: Precision | null; error: unknown; reload: () => void } }) {
  return (
    <>
      {precision.error ? <ErrorState error={precision.error} onRetry={precision.reload} /> : !precision.data ? <Loading /> : (
        <Panel title="Précision observée">
          <p className="adHint">
            {precision.data.delivered_orders} commande(s) livrée(s) ·{" "}
            {precision.data.good_fit_pct == null ? "retours insuffisants" : `${formatPct(precision.data.good_fit_pct / 100)} de bons ajustements`}
          </p>
          <ul className="adList">
            {precision.data.measures.map((m) => (
              <li key={m.measure}>{m.measure} : erreur moyenne {formatNumber(m.mean_error_cm, 1)} cm ({m.count} mesure(s), {formatPct(m.within_2cm_pct / 100)} à ±2 cm)</li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
