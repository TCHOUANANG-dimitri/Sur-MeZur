import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../src/api/client";
import { CatalogApi, TailorsApi } from "../../../src/api/endpoints";
import type { ReadyToWear, Review, TailorProfile } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Stars } from "../../../src/components/Stars";
import { VerifiedBadge } from "../../../src/components/Badges";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, gradientColors, radii, type ThemeColors } from "../../../src/theme/tokens";

export default function TailorProfilePage() {
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [tailor, setTailor] = useState<TailorProfile | null>(null);
  const [tab, setTab] = useState<"pap" | "reviews">("pap");
  const [items, setItems] = useState<ReadyToWear[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!id) return;
    TailorsApi.get(id).then(setTailor);
    CatalogApi.readyToWear(id).then(setItems);
    api.get<Review[]>(`/tailors/${id}/reviews`).then(setReviews).catch(() => {});
  }, [id]);

  if (!tailor) return <Spinner />;

  return (
    <Screen>
      <Header title={tailor.shop_name} showBack />
      <View style={{ padding: 18 }}>
        <LinearGradient colors={gradientColors} style={styles.banner} />
        <View style={styles.avatarWrap}>
          <View style={styles.avatar} />
        </View>
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Text style={styles.name}>{tailor.shop_name}</Text>
            {tailor.verification_status === "approved" && <VerifiedBadge />}
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" }}>
            <Stars value={tailor.rating_avg} />
            <Text style={styles.meta}>
              {tailor.completed_orders_count} commandes · ~{tailor.avg_response_minutes}min
            </Text>
          </View>
          <Text style={styles.bio}>{tailor.bio}</Text>
        </View>

        <Button fullWidth onPress={() => router.push({ pathname: "/client/models", params: { tailorId: tailor.id } })} style={{ marginVertical: 16 }}>
          {t("order.placeOrder")}
        </Button>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          <Chip label={t("nav.readyToWear")} active={tab === "pap"} onPress={() => setTab("pap")} />
          <Chip label="Avis" active={tab === "reviews"} onPress={() => setTab("reviews")} />
        </View>

        {tab === "pap" ? (
          items.length === 0 ? (
            <Text style={styles.empty}>Aucun article pour le moment.</Text>
          ) : (
            <View style={styles.grid}>
              {items.map((it) => (
                <Card key={it.id} onPress={() => router.push(`/client/ready-to-wear/${it.id}`)} style={styles.gridItem}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  <Text style={styles.itemPrice}>{formatFcfa(it.price)}</Text>
                </Card>
              ))}
            </View>
          )
        ) : reviews.length === 0 ? (
          <Text style={styles.empty}>Aucun avis pour le moment.</Text>
        ) : (
          reviews.map((r) => (
            <Card key={r.id} style={{ marginBottom: 8 }}>
              <Stars value={r.stars} />
              <Text style={styles.reviewComment}>{r.comment}</Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  banner: { height: 90, borderRadius: radii.card },
  avatarWrap: { alignItems: "center", marginTop: -34 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.white, borderWidth: 3, borderColor: colors.white },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
  meta: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  bio: { fontSize: 12, color: colors.textSecondary, marginTop: 6, textAlign: "center", fontFamily: fonts.body },
  empty: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { width: "47%" },
  itemName: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.indigoText, marginBottom: 4 },
  itemPrice: { fontSize: 12, color: colors.violetPrimary, fontFamily: fonts.bodyBold },
  reviewComment: { fontSize: 13, marginTop: 6, color: colors.indigoText, fontFamily: fonts.body },
});
