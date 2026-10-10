"use client";

/**
 * Commandes recues via Sur-MeZur (B3.6) : accepter ou refuser (avec motif),
 * faire avancer le statut, messagerie, mesures du client et modele demande.
 * Ni offre, ni devis, ni paiement.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { Order } from "@/lib/api/types";
import { Chip, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconOrders } from "@/components/icons";
import { OrderBadge, formatDateFR } from "../_components";

const FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "new", label: "Nouvelles" },
  { key: "in_progress", label: "En cours" },
  { key: "ready_for_pickup", label: "Prêtes" },
  { key: "finished_delivered", label: "Livrées" },
];

export default function Commandes() {
  const [filter, setFilter] = useState("all");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    TailorApi.orders()
      .then(setOrders)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Chargement impossible.");
        setOrders([]);
      });
  }, []);

  const filtered = orders?.filter((o) => filter === "all" || o.status === filter) ?? [];

  return (
    <div className="tPage">
      <PageHeader title="Commandes reçues" back />
      <ErrorBanner message={error} />
      <div className="tFilters" role="group" aria-label="Filtrer les commandes">
        {FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {orders === null ? (
        <Spinner label="Chargement…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconOrders size={30} strokeWidth={1.6} />}
          title="Aucune commande ici"
          body="Les commandes envoyées par les clients via Sur-MeZur apparaîtront ici."
        />
      ) : (
        <ul className="tList">
          {filtered.map((o) => (
            <li key={o.id}>
              <Link href={`/tailleur/commandes/${o.id}`} className="tRow">
                <span className="tRowMain">
                  <span className="tRowTitle">Commande n°{o.id.slice(0, 8)}</span>
                  <br />
                  <span className="tRowSub">
                    Passée le {formatDateFR(o.created_at)}
                    {o.desired_date ? ` · Souhaitée le ${formatDateFR(o.desired_date)}` : ""}
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
