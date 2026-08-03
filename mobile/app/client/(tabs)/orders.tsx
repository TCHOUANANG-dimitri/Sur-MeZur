import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { OrdersApi } from "../../../src/api/endpoints";
import type { Order } from "../../../src/api/types";
import { Card } from "../../../src/components/Card";
import { StatusChip } from "../../../src/components/Chip";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  ready_for_pickup: "pending",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

export default function OrderList() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      OrdersApi.list().then(setOrders);
    }, [])
  );

  return (
    <Screen>
      <Header title={t("nav.orders")} />
      <View style={{ padding: 18 }}>
        {!orders ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <EmptyState text="Aucune commande pour le moment." />
        ) : (
          orders.map((o) => (
            <Card key={o.id} onPress={() => router.push(`/client/orders/${o.id}`)} style={{ marginBottom: 10 }}>
              <Text style={styles.id}>#{o.id.slice(0, 8)}</Text>
              <StatusChip status={STATUS_VARIANT[o.status]} label={t(`order.status.${o.status}`)} />
              <Text style={styles.price}>{o.agreed_price ? formatFcfa(o.agreed_price) : "En négociation"}</Text>
              <Text style={styles.date}>{new Date(o.created_at).toLocaleDateString("fr-FR")}</Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  id: { fontSize: 12, color: colors.textSecondary, marginBottom: 6, fontFamily: fonts.body },
  price: { marginTop: 8, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
  date: { marginTop: 2, fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
});
