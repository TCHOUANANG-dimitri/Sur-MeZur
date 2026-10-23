"use client";

/**
 * Commandes recues via Sur-MeZur (B3.6) : accepter ou refuser (avec motif),
 * faire avancer le statut, mesures du client et modele demande.
 * Ni offre, ni devis, ni paiement.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { Order } from "@/lib/api/types";
import { Chip, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconOrders } from "@/components/icons";
import { OrderBadge, formatDateFR } from "../_components";

const FILTERS = [
  { key: "all", fr: "Toutes", en: "All" },
  { key: "new", fr: "Nouvelles", en: "New" },
  { key: "in_progress", fr: "En cours", en: "In progress" },
  { key: "ready_for_pickup", fr: "Prêtes", en: "Ready" },
  { key: "finished_delivered", fr: "Livrées", en: "Delivered" },
];

export default function Commandes() {
  const [filter, setFilter] = useState("all");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    TailorApi.orders()
      .then(setOrders)
      .catch((e) => {
        setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
        setOrders([]);
      });
  }, []);

  const filtered = orders?.filter((o) => filter === "all" || o.status === filter) ?? [];

  return (
    <div className="tPage">
      <PageHeader title={tr("Commandes reçues", "Orders received")} back />
      <ErrorBanner message={error} />
      <div className="tFilters" role="group" aria-label={tr("Filtrer", "Filter")}>
        {FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {tr(f.fr, f.en)}
          </Chip>
        ))}
      </div>
      {orders === null ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconOrders size={30} strokeWidth={1.6} />}
          title={tr("Aucune commande", "No orders")}
        />
      ) : (
        <ul className="tList">
          {filtered.map((o) => (
            <li key={o.id}>
              <Link href={`/tailleur/commandes/${o.id}`} className="tRow">
                <span className="tRowMain">
                  <span className="tRowTitle">{tr("Commande", "Order")} n°{o.id.slice(0, 6).toUpperCase()}</span>
                  <br />
                  <span className="tRowSub">
                    {formatDateFR(o.created_at)}
                    {o.desired_date ? ` · ${tr("pour le", "for")} ${formatDateFR(o.desired_date)}` : ""}
                  </span>
                </span>
                <OrderBadge status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
