"use client";

/**
 * Mes commandes : celles envoyees aux tailleurs depuis l'annuaire. Statut,
 * tailleur, date ; le detail porte le prix convenu et le contact du tailleur.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { OrdersApi, TailorsApi } from "@/lib/api/endpoints";
import type { Order } from "@/lib/api/types";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconOrders } from "@/components/icons";
import { OrderBadge, formatDateFR } from "@/app/tailleur/_components";

export default function MesCommandes() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    OrdersApi.list()
      .then(async (list) => {
        const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setOrders(sorted);
        const ids = [...new Set(sorted.map((o) => o.tailor_id))];
        const pairs = await Promise.all(
          ids.map((t) => TailorsApi.get(t).then((p) => [t, p.shop_name] as const).catch(() => [t, tr("Tailleur", "Tailor")] as const))
        );
        setNames(Object.fromEntries(pairs));
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
        setOrders([]);
      });
  }, []);

  return (
    <>
      <PageHeader title={tr("Mes commandes", "My orders")} back />
      <div className="container section stack">
        <ErrorBanner message={error} />
        {orders === null ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<IconOrders size={30} strokeWidth={1.6} />}
            title={tr("Aucune commande", "No orders")}
            action={
              <Link href="/tailleurs">
                <Button>{tr("Trouver un tailleur", "Find a tailor")}</Button>
              </Link>
            }
          />
        ) : (
          <ul className="tList">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/commandes/${o.id}`} className="tRow">
                  <span className="tRowMain">
                    <span className="tRowTitle">{names[o.tailor_id] ?? "…"}</span>
                    <br />
                    <span className="tRowSub">
                      N° {o.id.slice(0, 6).toUpperCase()} · {formatDateFR(o.created_at)}
                    </span>
                  </span>
                  <OrderBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
