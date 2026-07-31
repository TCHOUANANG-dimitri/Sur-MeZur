import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NotificationsApi, OrdersApi, TailorsApi } from "../../../src/api/endpoints";
import type { Notification, Order, TailorProfile } from "../../../src/api/types";
import { NotifBell } from "../../../src/components/Badges";
import { Card } from "../../../src/components/Card";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Stars } from "../../../src/components/Stars";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { colors, fonts } from "../../../src/theme/tokens";

export default function Dashboard() {
  const { t } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);

  useFocusEffect(
    useCallback(() => {
      TailorsApi.me().then(setProfile);
      OrdersApi.list().then(setOrders);
      NotificationsApi.list().then(setNotifs).catch(() => {});
    }, [])
  );

  if (!orders) return <Spinner />;

  const now = new Date();
  const newCount = orders.filter((o) => o.status === "new").length;
  const inProgressCount = orders.filter((o) => o.status === "in_progress").length;
  const monthRevenue = orders
    .filter((o) => o.status === "finished_delivered" && new Date(o.created_at).getMonth() === now.getMonth())
    .reduce((sum, o) => sum + (o.agreed_price || 0), 0);

  return (
    <Screen>
      <Header
        title={t("nav.dashboard")}
        right={
          <NotifBell
            count={notifs.filter((n) => !n.read_at).length}
            onPress={() => router.push("/tailor/notifications")}
          />
        }
      />
      <View style={{ padding: 18 }}>
        {profile && profile.verification_status !== "approved" && (
          <Card style={{ marginBottom: 14, backgroundColor: colors.pendingBg, borderWidth: 0 }}>
            <Text style={styles.pendingText}>{t("tailor.verification.pending")}</Text>
          </Card>
        )}

        <View style={styles.grid}>
          <StatCard label={t("tailor.dashboard.newOrders")} value={String(newCount)} onPress={() => router.push("/tailor/(tabs)/orders")} />
          <StatCard label={t("tailor.dashboard.inProgress")} value={String(inProgressCount)} onPress={() => router.push("/tailor/(tabs)/orders")} />
          <StatCard label={t("tailor.dashboard.revenue")} value={formatFcfa(monthRevenue)} onPress={() => router.push("/tailor/(tabs)/finances")} />
          <Card>
            <Text style={styles.statLabel}>{t("tailor.dashboard.rating")}</Text>
            <Stars value={profile?.rating_avg || 0} />
          </Card>
        </View>

        <Text style={styles.sectionTitle}>{t("nav.orders")}</Text>
        {orders.slice(0, 5).map((o) => (
          <Card key={o.id} onPress={() => router.push(`/tailor/orders/${o.id}`)} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.orderId}>#{o.id.slice(0, 8)}</Text>
              <Text style={styles.orderStatus}>{t(`order.status.${o.status}`)}</Text>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

function StatCard({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={{ width: "47%" }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  pendingText: { fontSize: 12, color: colors.indigoText, fontFamily: fonts.body },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 6, fontFamily: fonts.body },
  statValue: { fontSize: 18, fontFamily: fonts.bodyBold, color: colors.indigoText },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.indigoText, marginVertical: 8 },
  orderId: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  orderStatus: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.violetPrimary },
});
