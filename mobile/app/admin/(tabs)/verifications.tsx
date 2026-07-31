import React, { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AdminApi } from "../../../src/api/endpoints";
import type { TailorProfile } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { colors, fonts } from "../../../src/theme/tokens";

export default function Verifications() {
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);

  const load = useCallback(() => {
    AdminApi.pendingVerifications().then(setTailors);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const decide = async (id: string, status: "approved" | "rejected") => {
    await AdminApi.decideVerification(id, status);
    load();
  };

  if (!tailors) return <Spinner />;

  return (
    <Screen>
      <Header title="Vérifications" />
      <View style={{ padding: 18 }}>
        {tailors.length === 0 ? (
          <EmptyState text="Aucune vérification en attente." />
        ) : (
          tailors.map((tl) => (
            <Card key={tl.id} style={{ marginBottom: 10 }}>
              <Text style={styles.name}>{tl.shop_name}</Text>
              <Text style={styles.meta}>
                {tl.tailor_type} · {tl.city}
              </Text>
              <Text style={styles.bio}>{tl.bio}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button variant="danger" onPress={() => decide(tl.id, "rejected")} style={{ flex: 1 }}>
                  Rejeter
                </Button>
                <Button onPress={() => decide(tl.id, "approved")} style={{ flex: 1 }}>
                  Approuver
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
  name: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontFamily: fonts.body },
  bio: { fontSize: 12, marginTop: 8, color: colors.indigoText, fontFamily: fonts.body },
});
