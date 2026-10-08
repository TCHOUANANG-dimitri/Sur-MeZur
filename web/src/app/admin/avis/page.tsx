"use client";

// Avis (M8) : filtres, signalements, reponse du tailleur, actions groupees.

import { useState } from "react";
import { Reviews, type ReviewRow } from "@/lib/api/admin";
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
import { ErrorState, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { REVIEW_STATUS, formatDate, formatNumber } from "@/components/admin/format";

export default function ReviewsPage() {
  const { confirm, toast } = useFeedback();
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, q: "", stars: "", reported: "", has_reply: "", status: "" });
  const [reload, setReload] = useState(0);
  const [reportsId, setReportsId] = useState<string | null>(null);

  const columns: Column<ReviewRow>[] = [
    { key: "stars", label: "Note", sort: "stars", render: (r) => `${r.stars}★` },
    { key: "comment", label: "Commentaire", render: (r) => r.comment ?? "—" },
    { key: "client_name", label: "Client", render: (r) => r.client_name ?? "—" },
    { key: "tailor_name", label: "Tailleur", render: (r) => r.tailor_name ?? "—" },
    { key: "moderation_status", label: "Modération", render: (r) => <StatusBadge map={REVIEW_STATUS} value={r.moderation_status} /> },
    { key: "reports", label: "Signalements", align: "right", render: (r) => (r.reports > 0 ? <strong className="adWarn">{formatNumber(r.reports)}</strong> : "0") },
    { key: "tailor_reply", label: "Réponse du tailleur", optional: true, render: (r) => r.tailor_reply ?? "—" },
    { key: "created_at", label: "Date", sort: "created_at", render: (r) => formatDate(r.created_at) },
    {
      key: "reports_open",
      label: "Signalements",
      render: (r) => (r.reports > 0 ? <Button variant="secondary" className="adBtnSm" onClick={() => setReportsId(r.id)}>Voir ({r.reports})</Button> : null),
    },
  ];

  const moderate = async (ids: string[], status: string) => {
    const answer = await confirm({
      title: `${status === "hidden" ? "Masquer" : status === "visible" ? "Rendre visible" : "Signaler"} ${ids.length} avis ?`,
      danger: status === "hidden",
      confirmLabel: "Appliquer",
    });
    if (answer === null) return;
    try {
      await Reviews.bulk(ids, status);
      toast("Avis traités.", status === "hidden" ? { undo: async () => { await Reviews.bulk(ids, "visible"); setReload((n) => n + 1); } } : undefined);
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <div className="adPage">
      <PageHead title="Avis" sub="Modération des avis clients, signalements et réponses des tailleurs." />
      <div className="adToolbar">
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Commentaire, client, tailleur" wide />
        <FilterSelect label="Note max" value={s.stars} onChange={(stars) => set({ stars })} options={{ "5": "5★", "4": "4★ et moins", "3": "3★ et moins", "2": "2★ et moins", "1": "1★ seulement" }} allLabel="Toutes" />
        <FilterSelect label="Signalés" value={s.reported} onChange={(reported) => set({ reported })} options={{ true: "Avec signalements ouverts" }} allLabel="Tous" />
        <FilterSelect label="Réponse tailleur" value={s.has_reply} onChange={(has_reply) => set({ has_reply })} options={{ true: "Avec réponse", false: "Sans réponse" }} allLabel="Tous" />
        <FilterSelect label="Modération" value={s.status} onChange={(status) => set({ status })} options={{ visible: "Visibles", flagged: "Signalés", hidden: "Masqués" }} />
      </div>
      <DataTable<ReviewRow>
        id="reviews"
        columns={columns}
        fetcher={(p) => {
          const f = filtersOf(s);
          // « 4★ et moins » = note max 4 ; « 1★ seulement » = note exacte 1.
          if (f.stars === "1") return Reviews.table({ ...f, ...p });
          const { stars, ...rest } = f;
          return Reviews.table({ ...rest, ...(stars ? { max_stars: stars } : {}), ...p });
        }}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(r) => r.id}
        exportPath="/admin/tables/reviews"
        exportName="avis"
        selectable
        bulk={(ids, done) => (
          <span className="adRow">
            <Button variant="secondary" className="adBtnSm" onClick={() => { void moderate(ids, "visible").then(done); }}>Rendre visible</Button>
            <Button variant="danger" className="adBtnSm" onClick={() => { void moderate(ids, "hidden").then(done); }}>Masquer</Button>
          </span>
        )}
        reloadToken={reload}
      />
      {reportsId && <ReportsModal id={reportsId} onClose={() => { setReportsId(null); setReload((n) => n + 1); }} />}
    </div>
  );
}

function ReportsModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { confirm, toast } = useFeedback();
  const reports = useLoad(() => Reviews.reports(id), [id]);

  const decide = async (decision: "hide" | "keep") => {
    const reason = await confirm({
      title: decision === "hide" ? "Masquer cet avis ?" : "Conserver cet avis ?",
      danger: decision === "hide",
      confirmLabel: decision === "hide" ? "Masquer" : "Conserver",
      reason: { label: "Motif (tracé)", required: false },
    });
    if (reason === null) return;
    try {
      await Reviews.decideReports(id, decision, reason || undefined);
      toast("Signalements traités.");
      onClose();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <Panel title="Signalements" actions={<Button variant="secondary" className="adBtnSm" onClick={onClose}>Fermer</Button>}>
      {reports.error ? <ErrorState error={reports.error} onRetry={reports.reload} /> : !reports.data ? <p className="adHint">Chargement…</p> : reports.data.length === 0 ? (
        <p className="adHint">Aucun signalement.</p>
      ) : (
        <ul className="adList">
          {reports.data.map((r) => (
            <li key={r.id}>{r.reporter ?? "Anonyme"} — {r.reason} <span className="adHint">({r.status} · {formatDate(r.created_at)})</span></li>
          ))}
        </ul>
      )}
      <div className="adRow">
        <Button variant="danger" className="adBtnSm" onClick={() => void decide("hide")}>Masquer l&apos;avis</Button>
        <Button variant="secondary" className="adBtnSm" onClick={() => void decide("keep")}>Conserver l&apos;avis</Button>
      </div>
    </Panel>
  );
}
