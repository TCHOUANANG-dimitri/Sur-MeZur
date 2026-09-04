"use client";

// Arbitrage des litiges ouverts : liste des commandes en litige et resolution
// en faveur du client ou du tailleur.

import { useCallback, useEffect, useState } from "react";
import { AdminApi } from "@/lib/api/endpoints";
import type { Order } from "@/lib/api/types";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { formatFcfa } from "@/components/admin/format";
import { IconDisputes } from "@/components/icons";

export default function AdminDisputes() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    AdminApi.disputes()
      .then(setOrders)
      .catch((e: Error) => {
        setError(e.message);
        setOrders([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (id: string, resolution: string) => {
    setBusyId(id);
    setError("");
    try {
      await AdminApi.resolveDispute(id, resolution, "Résolu par l'administrateur");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="container">
      <PageHeader title="Litiges" />
      <div className="section">
        <ErrorBanner message={error} />

        {!orders ? (
          <Spinner label="Chargement des litiges…" />
        ) : orders.length === 0 ? (
          <EmptyState icon={<IconDisputes size={30} strokeWidth={1.6} />} title="Aucun litige ouvert" body="Tous les litiges sont résolus." />
        ) : (
          <div className="adminStack">
            {orders.map((o) => (
              <Card key={o.id}>
                <div className="rowLabel">#{o.id.slice(0, 8)}</div>
                <div className="rowMeta">Montant convenu : {formatFcfa(o.agreed_price)}</div>
                {o.dispute_note && <p className="muted" style={{ margin: "8px 0 0" }}>{o.dispute_note}</p>}
                <div className="adminActions">
                  <Button
                    variant="secondary"
                    disabled={busyId === o.id}
                    onClick={() => resolve(o.id, "resolved_client")}
                  >
                    En faveur du client
                  </Button>
                  <Button disabled={busyId === o.id} onClick={() => resolve(o.id, "resolved_tailor")}>
                    En faveur du tailleur
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}