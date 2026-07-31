import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrdersApi } from "../../api/endpoints";
import type { Order } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Card } from "../../components/Card";
import { StatusChip } from "../../components/Chip";
import { EmptyState, Header, Spinner } from "../../components/Misc";
import { colors } from "../../theme/tokens";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

export default function OrderList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    OrdersApi.list().then(setOrders);
  }, []);

  return (
    <div>
      <Header title={t("nav.orders")} />
      <div style={{ padding: 18 }}>
        {!orders ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <EmptyState text="Aucune commande pour le moment." />
        ) : (
          orders.map((o) => (
            <Card key={o.id} onClick={() => navigate(`/client/orders/${o.id}`)} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>#{o.id.slice(0, 8)}</span>
                <StatusChip status={STATUS_VARIANT[o.status]} label={t(`order.status.${o.status}`)} />
              </div>
              <p style={{ margin: "8px 0 0", fontWeight: 700 }}>{o.agreed_price ? formatFcfa(o.agreed_price) : "En négociation"}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: colors.textSecondary }}>
                {new Date(o.created_at).toLocaleDateString("fr-FR")}
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
