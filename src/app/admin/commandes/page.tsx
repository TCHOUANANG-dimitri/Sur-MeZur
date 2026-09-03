"use client";

// Toutes les commandes de la plateforme, filtrables par statut.
// Le backend connaît aussi le statut `ready_for_pickup`, absent du type
// `OrderStatus` de `lib/api/types.ts` (fichier partagé, non modifiable ici).

import { useCallback, useEffect, useState } from "react";
import { AdminApi } from "@/lib/api/endpoints";
import type { Order, OrderStatus } from "@/lib/api/types";
import { Badge, Card, Chip, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { formatDate, formatFcfa } from "@/components/admin/format";

type StatusFilter = OrderStatus | "ready_for_pickup" | null;

const STATUS_LABEL: Record<string, string> = {
  new: "Nouvelle",
  in_progress: "En cours",
  ready_for_pickup: "Prête à retirer",
  finished_delivered: "Terminée et livrée",
  finished_not_delivered: "Terminée non livrée",
};

const STATUS_TONE: Record<string, "success" | "pending" | "error" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  ready_for_pickup: "pending",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

const FILTERS: StatusFilter[] = [null, "new", "in_progress", "ready_for_pickup", "finished_delivered"];

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>(null);
  const [error, setError] = useState("");

  const load = useCallback((f: StatusFilter) => {
    setError("");
    AdminApi.allOrders(f ?? undefined)
      .then(setOrders)
      .catch((e: Error) => {
        setError(e.message);
        setOrders([]);
      });
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  return (
    <div className="container">
      <PageHeader title="Commandes" />
      <div className="section">
        <ErrorBanner message={error} />

        <div className="chipRow" style={{ marginBottom: 14 }}>
          {FILTERS.map((key) => (
            <Chip key={key ?? "all"} active={filter === key} onClick={() => setFilter(key)}>
              {key === null ? "Toutes" : STATUS_LABEL[key] ?? key}
            </Chip>
          ))}
        </div>

        {!orders ? (
          <Spinner label="Chargement des commandes…" />
        ) : orders.length === 0 ? (
          <EmptyState icon="📦" title="Aucune commande" />
        ) : (
          <Card style={{ padding: 8, overflow: "hidden" }}>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Litige</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}

function OrderRow({ order: o }: { order: Order }) {
  return (
    <tr>
      <td data-label="Référence">#{o.id.slice(0, 8)}</td>
      <td data-label="Type">{o.type === "ready_to_wear" ? "Prêt-à-porter" : "Sur mesure"}</td>
      <td data-label="Date">{formatDate(o.created_at)}</td>
      <td data-label="Montant">{formatFcfa(o.agreed_price)}</td>
      <td data-label="Statut">
        <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
      </td>
      <td data-label="Litige">
        {o.dispute_status === "open" ? (
          <Badge tone="error">Ouvert</Badge>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}