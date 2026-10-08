"use client";

// Tableau de bord (M1) : chiffres cles de la periode comparee a la
// precedente, objectifs, evolution dans le temps, sante de la mesure,
// entonnoir de conversion, activite par ville et taches en attente.

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminApi } from "@/lib/api/endpoints";
import { Core } from "@/lib/api/admin";
import { Chip } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useUrlState } from "@/components/admin/DataTable";
import { Funnel, HBars, LineChart } from "@/components/admin/Charts";
import { ErrorState, Kpi, Loading, PageHead, Panel, Progress, useLoad } from "@/components/admin/kit";
import { ORDER_STATUS, ago, formatDate, formatFcfa, formatNumber, formatPct } from "@/components/admin/format";

const PERIODS = [
  { key: "day", label: "Aujourd'hui" },
  { key: "week", label: "7 jours" },
  { key: "month", label: "30 jours" },
  { key: "quarter", label: "90 jours" },
  { key: "custom", label: "Période libre" },
];

const METRICS = [
  { key: "signups", label: "Inscriptions" },
  { key: "active_users", label: "Utilisateurs actifs" },
  { key: "measurements", label: "Mesures réalisées" },
  { key: "orders", label: "Commandes" },
  { key: "gmv", label: "Encaissements" },
  { key: "commission", label: "Commissions" },
];

export default function Dashboard() {
  const { can } = useAdmin();
  const [s, set] = useUrlState({ period: "month", start: "", end: "", metric: "signups", granularity: "day" });
  const range = s.period === "custom" && s.start && s.end ? { start: s.start, end: s.end } : { period: s.period === "custom" ? "month" : s.period };
  const rangeKey = JSON.stringify(range);

  const dash = useLoad(() => Core.dashboard(range), [rangeKey]);
  const series = useLoad(() => Core.timeseries({ ...range, metric: s.metric, granularity: s.granularity }), [rangeKey, s.metric, s.granularity]);
  const funnel = useLoad(() => Core.funnel(range), [rangeKey]);
  const health = useLoad(() => (can("measure") || can("dashboard") ? Core.measureHealth(7) : Promise.resolve(null)), []);
  const totals = useLoad(() => AdminApi.stats(), []);
  const cities = useLoad(() => Core.byCity(), []);
  const queue = useLoad(() => Core.queue(), []);
  const [showAllCities, setShowAllCities] = useState(false);

  const k = dash.data?.kpis;
  const money = s.metric === "gmv" || s.metric === "commission";
  const chartLabels = useMemo(() => series.data?.series.map((p) => p.period) ?? [], [series.data]);

  return (
    <div className="adPage">
      <PageHead
        title="Tableau de bord"
        sub={dash.data ? `Du ${formatDate(dash.data.start)} au ${formatDate(dash.data.end)}, comparé au ${formatDate(dash.data.previous_start)} – ${formatDate(dash.data.previous_end)}` : undefined}
      />

      <div className="adToolbar">
        <div className="chipRow" style={{ margin: 0 }}>
          {PERIODS.map((p) => (
            <Chip key={p.key} active={s.period === p.key} onClick={() => set({ period: p.key })}>
              {p.label}
            </Chip>
          ))}
        </div>
        {s.period === "custom" && (
          <>
            <label className="adFilter" style={{ flex: "0 1 160px" }}>
              <span>Du</span>
              <input className="input" type="date" value={s.start} onChange={(e) => set({ start: e.target.value })} />
            </label>
            <label className="adFilter" style={{ flex: "0 1 160px" }}>
              <span>Au</span>
              <input className="input" type="date" value={s.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
          </>
        )}
      </div>

      {dash.error ? (
        <ErrorState error={dash.error} onRetry={dash.reload} />
      ) : !k ? (
        <Loading />
      ) : (
        <div className="adKpis" style={{ marginBottom: 16 }}>
          <Kpi label="Nouveaux inscrits" value={formatNumber(k.new_users.value)} change={k.new_users.change_pct} href="/admin/statistiques" />
          <Kpi label="Nouveaux clients" value={formatNumber(k.new_clients.value)} change={k.new_clients.change_pct} />
          <Kpi label="Nouveaux tailleurs" value={formatNumber(k.new_tailors.value)} change={k.new_tailors.change_pct} />
          <Kpi label="Utilisateurs actifs" value={formatNumber(k.active_users.value)} change={k.active_users.change_pct} />
          <Kpi label="Mesures réalisées" value={formatNumber(k.measurements.value)} change={k.measurements.change_pct} href="/admin/mesure" />
          <Kpi label="Analyses en échec" value={formatNumber(k.measurement_failures.value)} change={k.measurement_failures.change_pct} invert />
          <Kpi label="Commandes" value={formatNumber(k.orders.value)} change={k.orders.change_pct} href="/admin/commandes" />
          <Kpi label="Litiges ouverts" value={formatNumber(k.disputes.value)} change={k.disputes.change_pct} invert href="/admin/litiges" />
          <Kpi label="Encaissements" value={formatFcfa(k.cash_in.value)} change={k.cash_in.change_pct} />
          <Kpi label="Commissions" value={formatFcfa(k.commission.value)} change={k.commission.change_pct} />
        </div>
      )}

      {dash.data && dash.data.goals.length > 0 && (
        <Panel title="Objectifs de croissance" actions={<Link href="/admin/acquisition?onglet=objectifs" className="adHint">Gérer</Link>}>
          <div className="adGrid3">
            {dash.data.goals.map((g) => (
              <div key={g.id}>
                <div className="adRow">
                  <strong style={{ fontSize: 13 }}>{g.label}</strong>
                  <span className="adSpacer" />
                  <span className={g.reached ? "adUp" : "adHint"}>{g.reached ? "atteint" : g.period === "month" ? "ce mois" : "cette semaine"}</span>
                </div>
                <div className="adHint">
                  {formatNumber(g.value ?? 0, 1)} {g.comparator === "<=" ? "≤" : "/"} {formatNumber(g.target)} — {g.metric_label}
                </div>
                {g.comparator === ">=" && <Progress pct={g.progress_pct} />}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="adSplit" style={{ marginTop: 16 }}>
        <div>
          <Panel
            title="Évolution"
            actions={
              <div className="adRow">
                <select className="input adInput" value={s.metric} onChange={(e) => set({ metric: e.target.value }, true)} aria-label="Indicateur">
                  {METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select className="input adInput" value={s.granularity} onChange={(e) => set({ granularity: e.target.value }, true)} aria-label="Pas">
                  <option value="day">Par jour</option>
                  <option value="week">Par semaine</option>
                  <option value="month">Par mois</option>
                </select>
              </div>
            }
          >
            {series.error ? (
              <ErrorState error={series.error} onRetry={series.reload} />
            ) : !series.data ? (
              <Loading />
            ) : (
              <LineChart
                labels={chartLabels}
                granularity={s.granularity}
                series={[{ label: METRICS.find((m) => m.key === s.metric)?.label ?? s.metric, values: series.data.series.map((p) => p.value) }]}
                bars={s.granularity !== "day"}
                format={money ? (v) => formatNumber(v / 1000, 0) + " k" : undefined}
              />
            )}
          </Panel>

          <Panel title="Entonnoir de conversion" actions={<span className="adHint">sur la période</span>}>
            {funnel.data ? <Funnel steps={funnel.data.steps} /> : funnel.error ? <ErrorState error={funnel.error} onRetry={funnel.reload} /> : <Loading />}
          </Panel>

          <Panel title="Activité par ville">
            {cities.data ? (
              <>
                <div className="adTableScroll">
                  <table className="adTable">
                    <thead>
                      <tr>
                        <th>Ville</th>
                        <th style={{ textAlign: "right" }}>Clients</th>
                        <th style={{ textAlign: "right" }}>Tailleurs (vérifiés)</th>
                        <th style={{ textAlign: "right" }}>Commandes</th>
                        <th>Quartiers des tailleurs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllCities ? cities.data.cities : cities.data.cities.slice(0, 8)).map((c) => (
                        <tr key={c.city}>
                          <td data-label="Ville">{c.city}</td>
                          <td data-label="Clients" className="adCellNum">{c.clients}</td>
                          <td data-label="Tailleurs" className="adCellNum">
                            {c.tailors} ({c.tailors_verified})
                          </td>
                          <td data-label="Commandes" className="adCellNum">{c.orders}</td>
                          <td data-label="Quartiers" className="adHint">
                            {c.quartiers.slice(0, 5).map((q) => `${q.name} (${q.tailors})`).join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {cities.data.cities.length > 8 && (
                  <button className="btn btnGhost adBtnSm" onClick={() => setShowAllCities((v) => !v)}>
                    {showAllCities ? "Réduire" : `Voir les ${cities.data.cities.length} villes`}
                  </button>
                )}
              </>
            ) : (
              <Loading />
            )}
          </Panel>
        </div>

        <div>
          <Panel title="À traiter" actions={<Link href="/admin/a-traiter" className="adHint">Tout voir ({queue.data?.total ?? "…"})</Link>}>
            {!queue.data ? (
              <Loading />
            ) : queue.data.items.length === 0 ? (
              <p className="adHint">Rien en attente. 🎉</p>
            ) : (
              queue.data.items.slice(0, 8).map((i, idx) => (
                <Link key={idx} href={i.href} className="adSearchItem" style={{ padding: "8px 4px" }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: 13 }}>{i.label}</strong>
                    <div className="adHint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                  </span>
                  <span className="adHint">{ago(i.since)}</span>
                </Link>
              ))
            )}
          </Panel>

          <Panel title="Santé de la mesure par photo" actions={<span className="adHint">7 derniers jours</span>}>
            {!health.data ? (
              health.error ? <ErrorState error={health.error} /> : <Loading />
            ) : (
              <>
                <dl className="adDl">
                  <dt>Analyses</dt>
                  <dd>{formatNumber(health.data.total)}</dd>
                  <dt>Taux de réussite</dt>
                  <dd>
                    <strong className={health.data.success_rate_pct != null && health.data.success_rate_pct < 80 ? "adDown" : "adUp"}>
                      {formatPct(health.data.success_rate_pct)}
                    </strong>
                  </dd>
                  <dt>Durée moyenne</dt>
                  <dd>{health.data.avg_duration_s != null ? `${formatNumber(health.data.avg_duration_s, 1)} s` : "—"}</dd>
                  <dt>En cours</dt>
                  <dd>{health.data.processing_now}</dd>
                </dl>
                <div className="adHint" style={{ margin: "10px 0 6px" }}>Principales causes d&apos;échec</div>
                <HBars rows={health.data.top_errors.map((e) => ({ label: e.cause, value: e.count }))} />
                <Link href="/admin/mesure" className="adHint">Journal des analyses</Link>
              </>
            )}
          </Panel>

          <Panel title="Chiffres clés (total)">
            {!totals.data ? (
              <Loading />
            ) : (
              <>
                <dl className="adDl">
                  <dt>Clients</dt>
                  <dd>{formatNumber(totals.data.clients)}</dd>
                  <dt>Tailleurs</dt>
                  <dd>
                    {formatNumber(totals.data.tailors)} <span className="adHint">({totals.data.tailors_pending} à vérifier)</span>
                  </dd>
                  <dt>Comptes suspendus</dt>
                  <dd>{totals.data.suspended}</dd>
                  <dt>Litiges ouverts</dt>
                  <dd>{totals.data.open_disputes}</dd>
                  <dt>Avis signalés</dt>
                  <dd>{totals.data.pending_reviews}</dd>
                  <dt>Volume livré</dt>
                  <dd>{formatFcfa(totals.data.gmv)}</dd>
                  <dt>Commissions perçues</dt>
                  <dd>{formatFcfa(totals.data.commission_earned)}</dd>
                </dl>
                <div className="adHint" style={{ margin: "12px 0 6px" }}>Commandes par statut</div>
                <HBars rows={Object.entries(totals.data.orders_by_status).map(([key, v]) => ({ label: ORDER_STATUS[key]?.label ?? key, value: v }))} />
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
