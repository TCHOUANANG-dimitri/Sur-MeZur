import { useFocusEffect } from "expo-router";
import { CalendarClock, LayoutGrid } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AdminApi } from "../../src/api/endpoints";
import type { Order, OrderStatus } from "../../src/api/types";
import { Card } from "../../src/components/Card";
import { Chip, StatusChip } from "../../src/components/Chip";
import { EmptyState, Header, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { formatFcfa, useI18n } from "../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../src/theme/tokens";
import { formatDate } from "../../src/utils/dates";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  ready_for_pickup: "pending",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

const FILTERS: (OrderStatus | null)[] = [
  null,
  "new",
  "in_progress",
  "ready_for_pickup",
  "finished_delivered",
];

export default function AdminOrders() {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<OrderStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      AdminApi.allOrders(filter || undefined)
        .then(setOrders)
        .catch(() => setOrders([]));
    }, [filter])
  );

  return (
    <Screen scroll={false}>
      <Header title={t("admin.ordersPage.title")} showBack />

      <View style={styles.filterRow}>
        {FILTERS.map((key) => {
          const active = filter === key;
          return (
            <Chip
              key={key ?? "all"}
              label={key === null ? t("common.all") : t(`order.status.${key}`)}
              active={active}
              icon={key === null ? <LayoutGrid size={13} color={active ? colors.white : colors.textSecondary} /> : undefined}
              onPress={() => setFilter(key)}
            />
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 8 }}>
        {!orders ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <EmptyState text={t("common.noOrders")} />
        ) : (
          orders.map((o) => (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <View style={styles.row}>
                <Text style={styles.meta}>#{o.id.slice(0, 8)}</Text>
                <StatusChip status={STATUS_VARIANT[o.status]} label={t(`order.status.${o.status}`)} />
              </View>
              <View style={styles.dateRow}>
                <CalendarClock size={12} color={colors.textSecondary} />
                <Text style={styles.meta}>
                  {o.type === "ready_to_wear" ? t("admin.ordersPage.typeRtw") : t("admin.ordersPage.typeCustom")} · {formatDate(o.created_at, lang)}
                </Text>
              </View>
              <View style={styles.footer}>
                <Text style={styles.price}>
                  {o.agreed_price ? formatFcfa(o.agreed_price) : t("common.inNegotiation")}
                </Text>
                {o.dispute_status === "open" && <Text style={styles.dispute}>{t("admin.ordersPage.openDispute")}</Text>}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    filterRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8, paddingHorizontal: 18, paddingTop: 14 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    meta: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
    footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
    price: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.indigoText },
    dispute: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.error },
  });
