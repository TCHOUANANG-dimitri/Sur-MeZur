import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { OrdersApi } from "../../../src/api/endpoints";
import type { Order, OrderStatus } from "../../../src/api/types";
import { Card } from "../../../src/components/Card";
import { Chip, StatusChip } from "../../../src/components/Chip";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { colors, fonts } from "../../../src/theme/tokens";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

export default function TailorOrders() {
  const { t } = useI18n();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<OrderStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      OrdersApi.list().then(setOrders);
    }, [])
  );

  const filtered = orders?.filter((o) => !filter || o.status === filter) || [];

  return (
    <Screen scroll={false}>
      <Header title={t("nav.orders")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 18, paddingBottom: 0 }}>
        {(["new", "in_progress", "finished_delivered"] as OrderStatus[]).map((s) => (
          <Chip key={s} label={t(`order.status.${s}`)} active={filter === s} onPress={() => setFilter(filter === s ? null : s)} />
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        {!orders ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState text="Aucune commande." />
        ) : (
          filtered.map((o) => (
            <Card key={o.id} onPress={() => router.push(`/tailor/orders/${o.id}`)} style={{ marginBottom: 10 }}>
              <View style={styles.row}>
                <Text style={styles.meta}>
                  #{o.id.slice(0, 8)} · {o.priority}
                </Text>
                <StatusChip status={STATUS_VARIANT[o.status]} label={t(`order.status.${o.status}`)} />
              </View>
              <Text style={styles.price}>{o.agreed_price ? formatFcfa(o.agreed_price) : "En négociation"}</Text>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meta: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  price: { marginTop: 8, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
});
