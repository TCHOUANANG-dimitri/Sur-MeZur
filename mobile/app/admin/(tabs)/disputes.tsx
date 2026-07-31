import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AdminApi } from "../../../src/api/endpoints";
import type { Order } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa } from "../../../src/i18n/I18nProvider";
import { colors, fonts } from "../../../src/theme/tokens";

export default function Disputes() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  const load = useCallback(() => {
    AdminApi.disputes().then(setOrders);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const resolve = async (id: string, resolution: string) => {
    await AdminApi.resolveDispute(id, resolution, "Résolu par l'administrateur.");
    load();
  };

  if (!orders) return <Spinner />;

  return (
    <Screen>
      <Header title="Litiges" />
      <View style={{ padding: 18 }}>
        {orders.length === 0 ? (
          <EmptyState text="Aucun litige ouvert." />
        ) : (
          orders.map((o) => (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <Text style={styles.id}>#{o.id.slice(0, 8)}</Text>
              <Text style={styles.price}>{o.agreed_price ? formatFcfa(o.agreed_price) : "-"}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button variant="secondary" onPress={() => resolve(o.id, "resolved_client")} style={{ flex: 1 }}>
                  En faveur du client
                </Button>
                <Button onPress={() => resolve(o.id, "resolved_tailor")} style={{ flex: 1 }}>
                  En faveur du tailleur
                </Button>
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  id: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  price: { fontSize: 12, marginTop: 4, color: colors.textSecondary, fontFamily: fonts.body },
});
