import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CatalogApi, TailorsApi } from "../../../src/api/endpoints";
import type { GarmentCategory, GarmentModel, TailorProfile } from "../../../src/api/types";
import { LikeButton, VerificationBadge } from "../../../src/components/Badges";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Header, Input, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Stars } from "../../../src/components/Stars";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, gradientColors, radii, type ThemeColors } from "../../../src/theme/tokens";

const CATEGORIES: GarmentCategory[] = ["top", "bottom", "dress", "traditional", "other"];

export default function Search() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<"tailors" | "models">("tailors");
  const [sort, setSort] = useState<"rating" | "proximity">("rating");
  const [modelSort, setModelSort] = useState<"recent" | "popular">("recent");
  const [category, setCategory] = useState<GarmentCategory | null>(null);
  const [q, setQ] = useState("");
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);

  const loadModels = () => CatalogApi.models({ q: q || undefined, sort: modelSort, category: category || undefined }).then(setModels);

  useEffect(() => {
    if (tab === "tailors") TailorsApi.search({ sort, q: q || undefined }).then(setTailors);
    else loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sort, modelSort, category, q]);

  const toggleLike = async (m: GarmentModel) => {
    setModels((prev) => prev?.map((x) => (x.id === m.id ? { ...x, liked_by_me: !x.liked_by_me, like_count: x.like_count + (x.liked_by_me ? -1 : 1) } : x)) ?? null);
    try {
      if (m.liked_by_me) await CatalogApi.unlike(m.id);
      else await CatalogApi.like(m.id);
    } catch {
      loadModels();
    }
  };

  return (
    <Screen>
      <Header title={t("search.title")} />
      <View style={{ padding: 16 }}>
        <Input placeholder="Rechercher…" value={q} onChangeText={setQ} />
        <View style={styles.row}>
          <Chip label={t("search.tailors")} active={tab === "tailors"} onPress={() => setTab("tailors")} />
          <Chip label={t("search.models")} active={tab === "models"} onPress={() => setTab("models")} />
        </View>
        {tab === "tailors" ? (
          <View style={styles.row}>
            <Chip label={t("search.sortProximity")} active={sort === "proximity"} onPress={() => setSort("proximity")} />
            <Chip label={t("search.sortRating")} active={sort === "rating"} onPress={() => setSort("rating")} />
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <Chip label="Récents" active={modelSort === "recent"} onPress={() => setModelSort("recent")} />
              <Chip label="Plus aimés" active={modelSort === "popular"} onPress={() => setModelSort("popular")} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 12 }}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? null : c)} />
              ))}
            </ScrollView>
          </>
        )}

        {tab === "tailors" ? (
          !tailors ? (
            <Spinner />
          ) : (
            tailors.map((tl) => (
              <Card key={tl.id} onPress={() => router.push(`/client/tailors/${tl.id}`)} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <LinearGradient colors={gradientColors} style={styles.avatar} />
                  <View>
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <Text style={styles.tailorName}>{tl.shop_name}</Text>
                      <VerificationBadge status={tl.verification_status} />
                    </View>
                    <Stars value={tl.rating_avg} />
                  </View>
                </View>
              </Card>
            ))
          )
        ) : !models ? (
          <Spinner />
        ) : (
          <View style={styles.grid}>
            {models.map((m) => (
              <TouchableOpacity key={m.id} style={styles.gridItem} onPress={() => router.push(`/client/models/${m.id}`)}>
                <View>
                  <LinearGradient colors={[m.thumbnail_color, colors.indigoText]} style={styles.gridThumb} />
                  <View style={styles.likeOverlay}>
                    <LikeButton liked={m.liked_by_me} count={m.like_count} onPress={() => toggleLike(m)} />
                  </View>
                </View>
                <Text style={styles.modelName}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginVertical: 12 },
  avatar: { width: 44, height: 44, borderRadius: 12 },
  tailorName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { width: "47%" },
  gridThumb: { height: 120, borderRadius: radii.card },
  likeOverlay: { position: "absolute", top: 6, right: 6 },
  modelName: { fontSize: 12, fontFamily: fonts.bodySemiBold, marginTop: 6, color: colors.indigoText },
});
