import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrdersApi } from "../../api/endpoints";
import type { Order, OrderStatus } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Card } from "../../components/Card";
import { Chip, StatusChip } from "../../components/Chip";
import { EmptyState, Header, Spinner } from "../../components/Misc";
import { colors } from "../../theme/tokens";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

export default function TailorOrders() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<OrderStatus | null>(null);

  useEffect(() => {
    OrdersApi.list().then(setOrders);
  }, []);

  const filtered = orders?.filter((o) => !filter || o.status === filter) || [];

  return (
    <div>
      <Header title={t("nav.orders")} />
      <div style={{ padding: "12px 18px 0", display: "flex", gap: 8, overflowX: "auto" }}>
        {(["new", "in_progress", "finished_delivered"] as OrderStatus[]).map((s) => (
          <Chip key={s} label={t(`order.status.${s}`)} active={filter === s} onClick={() => setFilter(filter === s ? null : s)} />
        ))}
      </div>
      <div style={{ padding: 18 }}>
        {!orders ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState text="Aucune commande." />
        ) : (
          filtered.map((o) => (
            <Card key={o.id} onClick={() => navigate(`/tailor/orders/${o.id}`)} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>#{o.id.slice(0, 8)} · {o.priority}</span>
                <StatusChip status={STATUS_VARIANT[o.status]} label={t(`order.status.${o.status}`)} />
              </div>
              <p style={{ margin: "8px 0 0", fontWeight: 700 }}>{o.agreed_price ? formatFcfa(o.agreed_price) : "En négociation"}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
