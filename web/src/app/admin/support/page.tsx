"use client";

// Support (M12) : file des demandes, attribution, reponse, rattachement a un
// compte ou une commande.

import Link from "next/link";
import { Support, type TicketRow } from "@/lib/api/admin";
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
import { PageHead, StatusBadge } from "@/components/admin/kit";
import { TICKET_STATUS, formatDate } from "@/components/admin/format";

const COLUMNS: Column<TicketRow>[] = [
  { key: "number", label: "N°", sort: "number", render: (t) => <Link href={`/admin/support/${t.id}`}>#{t.number}</Link> },
  { key: "subject", label: "Objet", render: (t) => <Link href={`/admin/support/${t.id}`}>{t.subject}</Link> },
  { key: "name", label: "Demandeur", render: (t) => `${t.name}${t.phone ? ` · ${t.phone}` : ""}` },
  { key: "category_label", label: "Catégorie", render: (t) => t.category_label },
  { key: "status", label: "Statut", render: (t) => <StatusBadge map={TICKET_STATUS} value={t.status} /> },
  { key: "assignee", label: "Attribué à", optional: true, render: (t) => t.assignee ?? "—" },
  { key: "created_at", label: "Reçue le", sort: "created_at", render: (t) => formatDate(t.created_at) },
];

export default function SupportPage() {
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, q: "", status: "new", category: "", assigned: "" });

  return (
    <div className="adPage">
      <PageHead title="Support" sub="Demandes des utilisateurs et visiteurs : attribuer, répondre, rattacher." />
      <div className="adToolbar">
        <div className="adTabs" role="tablist">
          {[{ key: "new", label: "Nouvelles" }, { key: "in_progress", label: "En cours" }, { key: "resolved", label: "Résolues" }, { key: "", label: "Toutes" }].map((t) => (
            <button key={t.key} role="tab" aria-selected={s.status === t.key} className={`adTab ${s.status === t.key ? "adTabActive" : ""}`} onClick={() => set({ status: t.key })}>
              {t.label}
            </button>
          ))}
        </div>
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Objet, nom, téléphone" wide />
        <FilterSelect label="Catégorie" value={s.category} onChange={(category) => set({ category })} options={{ mesure: "Prise de mesure", compte: "Mon compte", commande: "Une commande", paiement: "Un paiement", tailleur: "Un tailleur", suggestion: "Suggestion", autre: "Autre" }} />
        <FilterSelect label="Attribution" value={s.assigned} onChange={(assigned) => set({ assigned })} options={{ me: "À moi", none: "Non attribuées", all: "Attribuées" }} allLabel="Toutes" />
      </div>
      <DataTable<TicketRow>
        id="tickets"
        columns={COLUMNS}
        fetcher={(p) => Support.table({ ...filtersOf(s), ...p })}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(t) => t.id}
        rowHref={(t) => `/admin/support/${t.id}`}
        exportPath="/admin/tables/tickets"
        exportName="support"
      />
    </div>
  );
}
