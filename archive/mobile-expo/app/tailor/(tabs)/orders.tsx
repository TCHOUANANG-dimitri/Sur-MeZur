import { useFocusEffect, useRouter } from "expo-router";
import { CalendarClock, CheckCircle2, Inbox, LayoutGrid, Loader, PackageCheck } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { OrdersApi } from "../../../src/api/endpoints";
import type { Order, OrderStatus } from "../../../src/api/types";
import { Card } from "../../../src/components/Card";
import { Chip, StatusChip } from "../../../src/components/Chip";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { VerificationNudge } from "../../../src/components/VerificationNudge";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";
import { dueLabel, formatDate } from "../../../src/utils/dates";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  ready_for_pickup: "pending",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

/** `null` is the "all" pseudo-filter. */
const FILTERS: { key: OrderStatus | null; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { key: null, Icon: LayoutGrid },
  { key: "new", Icon: Inbox },
  { key: "in_progress", Icon: Loader },
  { key: "ready_for_pickup", Icon: PackageCheck },
  { key: "finished_delivered", Icon: CheckCircle2 },
];

export default function TailorOrders() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<OrderStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      OrdersApi.list().then(setOrders);
    }, [])
  );

  const filtered = orders?.filter((o) => !filter || o.status === filter) || [];
  const countFor = (key: OrderStatus | null) =>
    key === null ? orders?.length ?? 0 : orders?.filter((o) => o.status === key).length ?? 0;

  return (
    <Screen scroll={false}>
      <Header title={t("nav.orders")} />

      {/* Wraps instead of scrolling horizontally: with icons the chips no
          longer fit one row, which is what made them look cut off. */}
      <View style={styles.filterRow}>
        {FILTERS.map(({ key, Icon }) => {
          const active = filter === key;
          return (
            <Chip
              key={key ?? "all"}
              label={`${key === null ? t("common.all") : t(`order.status.${key}`)} (${countFor(key)})`}
              active={active}
              icon={<Icon size={13} color={active ? colors.white : colors.textSecondary} />}
              onPress={() => setFilter(key)}
            />
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 6 }}>
        <VerificationNudge />
        {!orders ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState text={t("common.noOrders")} />
        ) : (
          filtered.map((o) => {
            const due = dueLabel(o.desired_date, lang, t);
            const late =
              o.desired_date &&
              new Date(o.desired_date) < new Date() &&
              o.status !== "finished_delivered" &&
              o.status !== "finished_not_delivered";
            return (
              <Card key={o.id} onPress={() => router.push(`/tailor/orders/${o.id}`)} style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <Text style={styles.meta}>
                    #{o.id.slice(0, 8)} · {o.priority}
                  </Text>
                  <StatusChip status={STATUS_VARIANT[o.status]} label={t(`order.status.${o.status}`)} />
                </View>

                <View style={styles.dates}>
                  <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>{t("common.orderedOn")}</Text>
                    <Text style={styles.dateValue}>{formatDate(o.created_at, lang)}</Text>
                  </View>
                  <View style={styles.dateDivider} />
                  <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>{t("common.deliveryDate")}</Text>
                    <Text style={[styles.dateValue, late && styles.dateLate]}>
                      {formatDate(o.desired_date, lang)}
                    </Text>
                  </View>
                </View>

                <View style={styles.footer}>
                  <Text style={styles.price}>{o.agreed_price ? formatFcfa(o.agreed_price) : t("common.inNegotiation")}</Text>
                  {due && (
                    <View style={styles.dueWrap}>
                      <CalendarClock size={12} color={late ? colors.error : colors.textSecondary} />
                      <Text style={[styles.due, late && styles.dateLate]}>{due}</Text>
                    </View>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 18,
      paddingTop: 14,
    },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    meta: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, flexShrink: 1 },
    dates: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.backgroundAlt,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginTop: 10,
    },
    dateItem: { flex: 1 },
    dateDivider: { width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 10 },
    dateLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 2 },
    dateValue: { fontSize: 12, color: colors.indigoText, fontFamily: fonts.bodySemiBold },
    dateLate: { color: colors.error },
    footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
    price: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
    dueWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
    due: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textSecondary },
  });
