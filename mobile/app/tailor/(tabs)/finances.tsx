import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { OrdersApi, PaymentsApi } from "../../../src/api/endpoints";
import type { Order, PaymentSplit } from "../../../src/api/types";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { colors, fonts } from "../../../src/theme/tokens";

type Period = "week" | "month" | "year";

function inPeriod(dateStr: string, period: Period): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "week") return d >= new Date(now.getTime() - 7 * 86400000);
  if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear();
}

export default function Finances() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<Period>("month");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [splits, setSplits] = useState<Record<string, PaymentSplit>>({});

  useFocusEffect(
    useCallback(() => {
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
    }, [])
  );

  if (!orders) return <Spinner />;

  const relevant = orders.filter((o) => splits[o.id] && inPeriod(o.created_at, period));
  const total = relevant.reduce((s, o) => s + (splits[o.id]?.total || 0), 0);

  return (
    <Screen scroll={false}>
      <Header title={t("tailor.finances.title")} />
      <View style={{ flexDirection: "row", gap: 8, padding: 18, paddingBottom: 0 }}>
        <Chip label="Semaine" active={period === "week"} onPress={() => setPeriod("week")} />
        <Chip label="Mois" active={period === "month"} onPress={() => setPeriod("month")} />
        <Chip label="Année" active={period === "year"} onPress={() => setPeriod("year")} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <Card style={{ marginBottom: 16 }}>
          <Text style={styles.totalLabel}>Total période</Text>
          <Text style={styles.total}>{formatFcfa(total)}</Text>
        </Card>

        {relevant.length === 0 ? (
          <Text style={styles.hint}>Aucune commande sur cette période.</Text>
        ) : (
          relevant.map((o) => {
            const split = splits[o.id];
            return (
              <Card key={o.id} style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <Text style={styles.orderId}>#{o.id.slice(0, 8)}</Text>
                  <Text style={styles.orderTotal}>{formatFcfa(split.total)}</Text>
                </View>
                <Text style={styles.detail}>
                  40% reçu ({formatFcfa(split.tailor_immediate_40)}) · {split.escrow_status === "released" ? "30% libéré" : "30% séquestré"} (
                  {formatFcfa(split.escrow_30)}) · {split.escrow_status === "released" ? "30% reçu" : "30% à venir"} (
                  {formatFcfa(split.balance_30)})
                </Text>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  totalLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  total: { fontSize: 22, fontFamily: fonts.bodyBold, color: colors.indigoText },
  hint: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
  row: { flexDirection: "row", justifyContent: "space-between" },
  orderId: { fontSize: 12, color: colors.indigoText, fontFamily: fonts.body },
  orderTotal: { fontFamily: fonts.bodyBold, color: colors.indigoText },
  detail: { fontSize: 11, color: colors.textSecondary, marginTop: 6, fontFamily: fonts.body },
});
