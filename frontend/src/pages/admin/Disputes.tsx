import React, { useEffect, useState } from "react";
import { AdminApi } from "../../api/endpoints";
import type { Order } from "../../api/types";
import { formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState, Header, Spinner } from "../../components/Misc";

export default function Disputes() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  const load = () => AdminApi.disputes().then(setOrders);
  useEffect(() => {
    load();
  }, []);

  const resolve = async (id: string, resolution: string) => {
    await AdminApi.resolveDispute(id, resolution, "Résolu par l'administrateur.");
    load();
  };

  if (!orders) return <Spinner />;

  return (
    <div>
      <Header title="Litiges" />
      <div style={{ padding: 18 }}>
        {orders.length === 0 ? (
          <EmptyState text="Aucun litige ouvert." />
        ) : (
          orders.map((o) => (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>#{o.id.slice(0, 8)}</strong>
              <p style={{ fontSize: 12, margin: "4px 0 10px" }}>{o.agreed_price ? formatFcfa(o.agreed_price) : "-"}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="secondary" onClick={() => resolve(o.id, "resolved_client")} style={{ flex: 1 }}>
                  En faveur du client
                </Button>
                <Button onClick={() => resolve(o.id, "resolved_tailor")} style={{ flex: 1 }}>
                  En faveur du tailleur
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
