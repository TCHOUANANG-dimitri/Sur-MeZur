import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AdminApi } from "../../src/api/endpoints";
import type { Review } from "../../src/api/types";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { StatusChip } from "../../src/components/Chip";
import { EmptyState, Header, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { Stars } from "../../src/components/Stars";
import { fonts } from "../../src/theme/tokens";

export default function ReviewModeration() {
  const [reviews, setReviews] = useState<Review[] | null>(null);

  const load = useCallback(() => {
    AdminApi.reviews().then(setReviews);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const moderate = async (id: string, status: string) => {
    await AdminApi.moderateReview(id, status);
    load();
  };

  if (!reviews) return <Spinner />;

  return (
    <Screen>
      <Header title="Modération avis" showBack />
      <View style={{ padding: 18 }}>
        {reviews.length === 0 ? (
          <EmptyState text="Aucun avis." />
        ) : (
          reviews.map((r) => (
            <Card key={r.id} style={{ marginBottom: 10 }}>
              <View style={styles.row}>
                <Stars value={r.stars} />
                <StatusChip
                  status={r.moderation_status === "visible" ? "success" : r.moderation_status === "flagged" ? "pending" : "error"}
                  label={r.moderation_status}
                />
              </View>
              <Text style={styles.comment}>{r.comment}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button variant="secondary" onPress={() => moderate(r.id, "visible")} style={{ flex: 1 }}>
                  Visible
                </Button>
                <Button variant="danger" onPress={() => moderate(r.id, "hidden")} style={{ flex: 1 }}>
                  Masquer
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
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  comment: { fontSize: 13, marginVertical: 8, fontFamily: fonts.body },
});
