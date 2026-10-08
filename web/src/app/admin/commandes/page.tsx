"use client";

// Commandes (M5) : liste filtrable, alertes de retard.

import Link from "next/link";
import { useState } from "react";
import { Orders, type OrderRow } from "@/lib/api/admin";
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
import { ErrorState, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { ORDER_STATUS, formatDate, formatFcfa } from "@/components/admin/format";

const COLUMNS: Column<OrderRow>[] = [
  {
    key: "ref",
    label: "Commande",
    render: (o) => <Link href={`/admin/commandes/${o.id}`}>{o.ref || o.id.slice(0, 8).toUpperCase()}</Link>,
  },
  { key: "status", label: "Statut", render: (o) => <StatusBadge map={ORDER_STATUS} value={o.status} /> },
  { key: "client_name", label: "Client", render: (o) => (o.client_user_id ? <Link href={`/admin/utilisateurs/${o.client_user_id}`}>{o.client_name}</Link> : (o.client_name ?? "—")) },
  { key: "tailor_name", label: "Tailleur", render: (o) => (o.tailor_user_id ? <Link href={`/admin/utilisateurs/${o.tailor_user_id}`}>{o.tailor_name}</Link> : (o.tailor_name ?? "—")) },
  { key: "city", label: "Ville", optional: true, render: (o) => o.city ?? "—" },
  { key: "agreed_price", label: "Prix convenu", sort: "agreed_price", align: "right", render: (o) => (o.agreed_price == null ? "—" : formatFcfa(o.agreed_price)) },
  { key: "desired_date", label: "Souhaitée le", sort: "desired_date", render: (o) => formatDate(o.desired_date) },
  { key: "dispute_status", label: "Litige", optional: true, render: (o) => (o.dispute_status ? "Oui" : "—") },
  { key: "created_at", label: "Créée le", sort: "created_at", render: (o) => formatDate(o.created_at) },
  { key: "alert", label: "Alerte", render: (o) => (o.overdue || o.alert ? <span className="adWarn">{o.alert ?? `En retard (${o.age_days} j)`}</span> : <span className="adMuted">—</span>) },
];

export default function OrdersPage() {
  const [s, set] = useUrlState({
    ...TABLE_DEFAULTS,
    q: "", status: "", city: "", dispute: "", late: "", date_from: "", date_to: "",
  });
  const alerts = useLoad(() => Orders.alerts(), []);

  return (
    <div className="adPage">
      <PageHead title="Commandes" sub="Envoi client → tailleur, suivi et messagerie. Sans argent : le prix convenu est une information." />
      {alerts.data && alerts.data.items.length > 0 && (
        <Panel title={`Alertes de retard (${alerts.data.items.length})`}>
          <ul className="adList">
            {alerts.data.items.slice(0, 8).map((o) => (
              <li key={o.id}>
                <Link href={`/admin/commandes/${o.id}`}>{o.ref || o.id.slice(0, 8).toUpperCase()}</Link> — {o.client_name} → {o.tailor_name}{" "}
                <span className="adWarn">{o.alert ?? `sans réponse depuis ${o.age_days} j`}</span>
              </li>
            ))}
          </ul>
          <button className="adLinkBtn" onClick={() => set({ late: "true" })}>Voir toutes les commandes en retard</button>
        </Panel>
      )}
      <div className="adToolbar">
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="N°, client, tailleur" wide />
        <FilterSelect
          label="Statut"
          value={s.status}
          onChange={(status) => set({ status })}
          options={{ new: "Nouvelles", in_progress: "En cours", ready_for_pickup: "Prêtes à retirer", finished_delivered: "Livrées", finished_not_delivered: "Non livrées", declined: "Refusées", cancelled: "Annulées" }}
        />
        <FilterText label="Ville" value={s.city} onChange={(city) => set({ city })} placeholder="Douala" />
        <FilterSelect label="Litige" value={s.dispute} onChange={(dispute) => set({ dispute })} options={{ open: "Litige ouvert" }} allLabel="Tous" />
        <FilterSelect label="Retard" value={s.late} onChange={(late) => set({ late })} options={{ true: "En retard" }} allLabel="Toutes" />
        <FilterDate label="Depuis" value={s.date_from} onChange={(date_from) => set({ date_from })} />
        <FilterDate label="Jusqu'au" value={s.date_to} onChange={(date_to) => set({ date_to })} />
      </div>
      <DataTable<OrderRow>
        id="orders"
        columns={COLUMNS}
        fetcher={(p) => Orders.table({ ...filtersOf(s), ...p })}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(o) => o.id}
        rowHref={(o) => `/admin/commandes/${o.id}`}
        exportPath="/admin/tables/orders"
        exportName="commandes"
      />
      {alerts.error ? <ErrorState error={alerts.error} onRetry={alerts.reload} /> : null}
    </div>
  );
}
