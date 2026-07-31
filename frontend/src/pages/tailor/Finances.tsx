import React, { useEffect, useState } from "react";
import { OrdersApi, PaymentsApi } from "../../api/endpoints";
import type { Order, PaymentSplit } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Header, Spinner } from "../../components/Misc";
import { colors } from "../../theme/tokens";

type Period = "week" | "month" | "year";

function inPeriod(dateStr: string, period: Period): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return d >= weekAgo;
  }
  if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear();
}

export default function Finances() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<Period>("month");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [splits, setSplits] = useState<Record<string, PaymentSplit>>({});

  useEffect(() => {
    OrdersApi.list().then(async (list) => {
      setOrders(list);
      const entries = await Promise.all(
        list.map(async (o) => {
          try {
            return [o.id, await PaymentsApi.split(o.id)] as const;
          } catch {
            return null;
          }
        })
      );
      const map: Record<string, PaymentSplit> = {};
      entries.forEach((e) => e && (map[e[0]] = e[1]));
      setSplits(map);
    });
  }, []);

  if (!orders) return <Spinner />;

  const relevant = orders.filter((o) => splits[o.id] && inPeriod(o.created_at, period));
  const total = relevant.reduce((s, o) => s + (splits[o.id]?.total || 0), 0);

  return (
    <div>
      <Header title={t("tailor.finances.title")} />
      <div style={{ padding: "12px 18px 0", display: "flex", gap: 8 }}>
        <Chip label="Semaine" active={period === "week"} onClick={() => setPeriod("week")} />
        <Chip label="Mois" active={period === "month"} onClick={() => setPeriod("month")} />
        <Chip label="Année" active={period === "year"} onClick={() => setPeriod("year")} />
      </div>
      <div style={{ padding: 18 }}>
        <Card style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: colors.textSecondary }}>Total période</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{formatFcfa(total)}</p>
        </Card>

        {relevant.length === 0 ? (
          <p style={{ fontSize: 13, color: colors.textSecondary }}>Aucune commande sur cette période.</p>
        ) : (
          relevant.map((o) => {
            const split = splits[o.id];
            return (
              <Card key={o.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12 }}>#{o.id.slice(0, 8)}</span>
                  <strong>{formatFcfa(split.total)}</strong>
                </div>
                <p style={{ fontSize: 11, color: colors.textSecondary, margin: "6px 0 0" }}>
                  40% reçu ({formatFcfa(split.tailor_immediate_40)}) · {split.escrow_status === "released" ? "30% libéré" : "30% séquestré"} ({formatFcfa(split.escrow_30)}) ·{" "}
                  {split.escrow_status === "released" ? "30% reçu" : "30% à venir"} ({formatFcfa(split.balance_30)})
                </p>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
