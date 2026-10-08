"use client";

// Statistiques (M14) : total a date, nouveaux par jour, actifs, churn,
// cohortes, activation, retours, segmentation, rapport telechargeable, et
// indicateurs du nouveau produit (mesures par photo, tailleurs, patrons).

import { useMemo, useState } from "react";
import { Growth, type ChannelStatsRow } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { LineChart, Funnel } from "@/components/admin/Charts";
import { FilterSelect } from "@/components/admin/DataTable";
import { ErrorState, Kpi, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { formatDate, formatFcfa, formatNumber, formatPct } from "@/components/admin/format";

export default function StatsPage() {
  const [period, setPeriod] = useState("month");
  const [segment, setSegment] = useState({ role: "", city: "", gender: "", platform: "", channel_id: "" });
  const rng = { period };
  const rngKey = period + JSON.stringify(segment);

  const overview = useLoad(() => Growth.overview(), []);
  const product = useLoad(() => Growth.product(30), []);
  const nu = useLoad(() => Growth.newUsers({ ...rng, granularity: period === "month" ? "day" : "week" }), [rngKey]);
  const active = useLoad(() => Growth.active({ ...rng }), [rngKey]);
  const churn = useLoad(() => Growth.churn({ ...rng }), [rngKey]);
  const cohorts = useLoad(() => Growth.cohorts({ months: 6 }), []);
  const activation = useLoad(() => Growth.activation({ ...rng }), [rngKey]);
  const returns = useLoad(() => Growth.returns({ ...rng }), [rngKey]);
  const channels = useLoad(() => Growth.channelStats({ ...rng }), [rngKey]);
  const segments = useLoad(() => Growth.segments(), []);

  const nuLabels = useMemo(() => nu.data?.series.map((p) => String(p.period)) ?? [], [nu.data]);
  const activeLabels = useMemo(() => active.data?.series.map((p) => p.period) ?? [], [active.data]);

  return (
    <div className="adPage">
      <PageHead
        title="Utilisateurs & croissance"
        sub="Acquisition, activité, rétention et nouveau produit."
        actions={
          <>
            <div className="adTabs" role="tablist">
              {[{ key: "week", label: "7 jours" }, { key: "month", label: "30 jours" }].map((t) => (
                <button key={t.key} role="tab" aria-selected={period === t.key} className={`adTab ${period === t.key ? "adTabActive" : ""}`} onClick={() => setPeriod(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" className="adBtnSm" onClick={() => Growth.reportCsv({ period })}>Télécharger le rapport</Button>
          </>
        }
      />

      {overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : !overview.data ? <Loading /> : (
        <div className="adKpis" style={{ marginBottom: 16 }}>
          <Kpi label="Comptes à date" value={formatNumber(overview.data.total)} href="/admin/utilisateurs" />
          <Kpi label="Actifs" value={formatNumber(overview.data.active_accounts)} />
          <Kpi label="Suspendus" value={formatNumber(overview.data.suspended)} invert />
          <Kpi label="Invités" value={formatNumber(overview.data.guests)} href="/admin/utilisateurs?status=guest" />
        </div>
      )}

      <Panel title="Nouveau produit (30 jours) : les deux services gratuits">
        {product.error ? <ErrorState error={product.error} onRetry={product.reload} /> : !product.data ? <Loading /> : (
          <div className="adKpis">
            <Kpi label="Mesures par photo (invités)" value={formatNumber(product.data.guest_sessions)} href="/admin/mesure" />
            <Kpi label="Mesures par photo (inscrits)" value={formatNumber(product.data.registered_sessions)} href="/admin/mesure" />
            <Kpi label="Mesures tailleurs (photo)" value={formatNumber(product.data.tailor_photo_measurements)} href="/admin/mesure" />
            <Kpi label="Mesures tailleurs (manuel)" value={formatNumber(product.data.tailor_manual_measurements)} href="/admin/mesure" />
            <Kpi label="Inscriptions tailleurs" value={formatNumber(product.data.tailor_signups)} href="/admin/tailleurs" />
            <Kpi label="Patrons générés" value={formatNumber(product.data.patterns_ready)} />
          </div>
        )}
      </Panel>

      <Panel title="Nouveaux par jour">
        {nu.error ? <ErrorState error={nu.error} onRetry={nu.reload} /> : !nu.data ? <Loading /> : (
          <>
            <p className="adHint">{formatNumber(nu.data.total)} sur la période{nu.data.change_pct != null && <> ({nu.data.change_pct > 0 ? "+" : ""}{formatNumber(nu.data.change_pct, 1)} % vs précédente)</>}.</p>
            <LineChart labels={nuLabels} series={[{ label: "Nouveaux", values: nu.data.series.map((p) => Number(p.total)) }]} granularity={period === "month" ? "day" : "week"} />
          </>
        )}
      </Panel>

      <div className="adToolbar">
        <FilterSelect label="Rôle" value={segment.role} onChange={(role) => setSegment((p) => ({ ...p, role }))} options={{ client: "Clients", tailor: "Tailleurs", collector: "Agents" }} />
        <FilterSelect label="Ville" value={segment.city} onChange={(city) => setSegment((p) => ({ ...p, city }))} options={(segments.data?.cities ?? []).map((c) => ({ value: c, label: c }))} allLabel="Toutes" />
        <FilterSelect label="Sexe" value={segment.gender} onChange={(gender) => setSegment((p) => ({ ...p, gender }))} options={{ female: "Femmes", male: "Hommes" }} />
        <FilterSelect label="Support" value={segment.platform} onChange={(platform) => setSegment((p) => ({ ...p, platform }))} options={{ web: "Site web", app: "Application" }} />
        <FilterSelect label="Canal" value={segment.channel_id} onChange={(channel_id) => setSegment((p) => ({ ...p, channel_id }))} options={(segments.data?.channels ?? []).map((c) => ({ value: c.id, label: c.name }))} allLabel="Tous" />
      </div>

      <Panel title="Actifs (jour, semaine, mois)">
        {active.error ? <ErrorState error={active.error} onRetry={active.reload} /> : !active.data ? <Loading /> : (
          <>
            <p className="adHint">
              Jour {formatNumber(active.data.dau)} · semaine {formatNumber(active.data.wau)} · mois {formatNumber(active.data.mau)}
              {active.data.stickiness_pct != null && <> · {formatNumber(active.data.stickiness_pct, 0)} % des actifs du mois reviennent chaque jour</>} (depuis le {formatDate(active.data.tracking_since)}).
            </p>
            <LineChart
              labels={activeLabels}
              granularity={period === "month" ? "day" : "week"}
              series={[
                { label: "Jour", values: active.data.series.map((p) => p.dau) },
                { label: "Semaine", values: active.data.series.map((p) => p.wau) },
                { label: "Mois", values: active.data.series.map((p) => p.mau) },
              ]}
            />
          </>
        )}
      </Panel>

      <div className="adGrid2">
        <Panel title="Churn (partis)">
          {churn.error ? <ErrorState error={churn.error} onRetry={churn.reload} /> : !churn.data ? <Loading /> : (
            <>
              <p className="adHint">Inactif depuis {churn.data.threshold_days} jours = parti (depuis le {formatDate(churn.data.tracking_since)}).</p>
              <LineChart
                labels={churn.data.series.map((p) => p.period)}
                granularity={period === "month" ? "day" : "week"}
                format={(v) => `${formatNumber(v, 1)} %`}
                series={[
                  { label: "Tous", values: churn.data.series.map((p) => p.rate_pct ?? 0) },
                  { label: "Clients", values: churn.data.series.map((p) => p.client_rate_pct ?? 0) },
                  { label: "Tailleurs", values: churn.data.series.map((p) => p.tailor_rate_pct ?? 0) },
                ]}
              />
            </>
          )}
        </Panel>
        <Panel title="Activation">
          {activation.error ? <ErrorState error={activation.error} onRetry={activation.reload} /> : !activation.data ? <Loading /> : (
            <Funnel
              steps={[
                { label: `Clients inscrits (${formatNumber(activation.data.clients.signed_up)})`, value: activation.data.clients.signed_up },
                { label: `Première mesure (${activation.data.clients.first_measure_pct == null ? "—" : formatPct(activation.data.clients.first_measure_pct / 100)})`, value: activation.data.clients.first_measure },
                { label: `Première commande (${activation.data.clients.first_order_pct == null ? "—" : formatPct(activation.data.clients.first_order_pct / 100)})`, value: activation.data.clients.first_order },
              ]}
            />
          )}
        </Panel>
      </div>

      <Panel title="Cohortes (rétention par mois d'inscription)">
        {cohorts.error ? <ErrorState error={cohorts.error} onRetry={cohorts.reload} /> : !cohorts.data ? <Loading /> : (
          <div className="adTableWrap">
            <table className="adTable">
              <thead><tr><th>Cohorte</th><th>Effectif</th>{cohorts.data.rows[0]?.retention_pct.map((_, i) => <th key={i}>M+{i + 1}</th>) ?? null}</tr></thead>
              <tbody>
                {cohorts.data.rows.map((r) => (
                  <tr key={r.cohort}>
                    <td>{r.cohort}</td><td>{formatNumber(r.size)}</td>
                    {r.retention_pct.map((v, i) => <td key={i}>{v == null ? "—" : formatPct(v / 100)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Retours (revenus après inactivité)">
        {returns.error ? <ErrorState error={returns.error} onRetry={returns.reload} /> : !returns.data ? <Loading /> : (
          <>
            <p className="adHint">{formatNumber(returns.data.count)} retour(s) après {returns.data.threshold_days} jours d&apos;inactivité.</p>
            <ul className="adList">{Object.entries(returns.data.by_cause).map(([k, v]) => <li key={k}>{k} : <strong>{v}</strong></li>)}</ul>
          </>
        )}
      </Panel>

      <Panel title="Par canal et campagne">
        {channels.error ? <ErrorState error={channels.error} onRetry={channels.reload} /> : !channels.data ? <Loading /> : (
          <div className="adTableWrap">
            <table className="adTable">
              <thead><tr><th>Canal / campagne</th><th>Inscriptions</th><th>Clients</th><th>Tailleurs</th><th>Mesure</th><th>Commandes</th><th>CA</th></tr></thead>
              <tbody>
                {channels.data.channels.map((c: ChannelStatsRow & { name: string }, i: number) => (
                  <tr key={i}>
                    <td>{c.name}</td><td>{formatNumber(c.signups)}</td><td>{formatNumber(c.clients)}</td>
                    <td>{formatNumber(c.tailors)}</td><td>{formatNumber(c.activated_measure)}</td>
                    <td>{formatNumber(c.orders)}</td><td>{formatFcfa(c.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
