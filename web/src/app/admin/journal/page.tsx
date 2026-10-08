"use client";

// Journal des actions (M13) : filtrable et exportable.

import { Security, type AuditRow } from "@/lib/api/admin";
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
import { PageHead, useLoad } from "@/components/admin/kit";
import { formatDateTime } from "@/components/admin/format";

const COLUMNS: Column<AuditRow>[] = [
  { key: "created_at", label: "Date", sort: "created_at", render: (r) => formatDateTime(r.created_at) },
  { key: "actor_name", label: "Acteur", render: (r) => r.actor_name ?? "—" },
  { key: "action", label: "Action", render: (r) => r.action },
  { key: "entity_type", label: "Objet", optional: true, render: (r) => (r.entity_type ? `${r.entity_type}${r.entity_id ? ` ${r.entity_id.slice(0, 8)}` : ""}` : "—") },
  { key: "summary", label: "Détail", render: (r) => r.summary ?? "—" },
  { key: "ip", label: "IP", optional: true, render: (r) => r.ip ?? "—" },
];

export default function JournalPage() {
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, q: "", action: "", entity_type: "", date_from: "", date_to: "" });
  const actions = useLoad(() => Security.auditActions(), []);

  return (
    <div className="adPage">
      <PageHead title="Journal des actions" sub="Qui a fait quoi, quand : la mémoire de l'équipe." />
      <div className="adToolbar">
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Acteur, résumé" wide />
        <FilterSelect label="Action" value={s.action} onChange={(action) => set({ action })} options={(actions.data ?? []).map((a) => ({ value: a, label: a }))} allLabel="Toutes" />
        <FilterSelect label="Objet" value={s.entity_type} onChange={(entity_type) => set({ entity_type })} options={{ user: "Utilisateurs", order: "Commandes", dispute: "Litiges", tailor: "Tailleurs", ticket: "Support", payment: "Paiements" }} />
        <FilterDate label="Depuis" value={s.date_from} onChange={(date_from) => set({ date_from })} />
        <FilterDate label="Jusqu'au" value={s.date_to} onChange={(date_to) => set({ date_to })} />
      </div>
      <DataTable<AuditRow>
        id="audit"
        columns={COLUMNS}
        fetcher={(p) => Security.audit({ ...filtersOf(s), ...p })}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(r) => r.id}
        exportPath="/admin/tables/audit"
        exportName="journal"
      />
    </div>
  );
}
