import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrdersApi, TailorsApi } from "../../api/endpoints";
import type { Order, TailorProfile } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Card } from "../../components/Card";
import { Header, Spinner } from "../../components/Misc";
import { Stars } from "../../components/Stars";
import { colors } from "../../theme/tokens";

export default function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    TailorsApi.me().then(setProfile);
    OrdersApi.list().then(setOrders);
  }, []);

  if (!orders || profile === null) return <Spinner />;

  const now = new Date();
  const newCount = orders.filter((o) => o.status === "new").length;
  const inProgressCount = orders.filter((o) => o.status === "in_progress").length;
  const monthRevenue = orders
    .filter((o) => o.status === "finished_delivered" && new Date(o.created_at).getMonth() === now.getMonth())
    .reduce((sum, o) => sum + (o.agreed_price || 0), 0);

  return (
    <div>
      <Header title={t("nav.dashboard")} />
      <div style={{ padding: 18 }}>
        {profile?.verification_status !== "approved" && (
          <Card style={{ marginBottom: 14, background: "#FEF3C7", border: "none" }}>
            <p style={{ margin: 0, fontSize: 12 }}>{t("tailor.verification.pending")}</p>
          </Card>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <StatCard label={t("tailor.dashboard.newOrders")} value={String(newCount)} onClick={() => navigate("/tailor/orders")} />
          <StatCard label={t("tailor.dashboard.inProgress")} value={String(inProgressCount)} onClick={() => navigate("/tailor/orders")} />
          <StatCard label={t("tailor.dashboard.revenue")} value={formatFcfa(monthRevenue)} onClick={() => navigate("/tailor/finances")} />
          <StatCard label={t("tailor.dashboard.rating")} value={<Stars value={profile?.rating_avg || 0} />} />
        </div>

        <h4 style={{ margin: "8px 0" }}>{t("nav.orders")}</h4>
        {orders.slice(0, 5).map((o) => (
          <Card key={o.id} onClick={() => navigate(`/tailor/orders/${o.id}`)} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12 }}>#{o.id.slice(0, 8)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.violetPrimary }}>{t(`order.status.${o.status}`)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, onClick }: { label: string; value: React.ReactNode; onClick?: () => void }) {
  return (
    <Card onClick={onClick}>
      <p style={{ margin: "0 0 6px", fontSize: 11, color: colors.textSecondary }}>{label}</p>
      <div style={{ fontSize: 18, fontWeight: 700, color: colors.indigoText }}>{value}</div>
    </Card>
  );
}
