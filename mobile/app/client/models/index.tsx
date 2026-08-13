import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CatalogApi } from "../../../src/api/endpoints";
import type { GarmentCategory, GarmentModel } from "../../../src/api/types";
import { LikeButton } from "../../../src/components/Badges";
import { Chip } from "../../../src/components/Chip";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

const CATEGORIES: GarmentCategory[] = ["top", "bottom", "dress", "traditional", "other"];

export default function Gallery() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ tailorId?: string; category?: GarmentCategory }>();
  const router = useRouter();
  const { t } = useI18n();
  const [category, setCategory] = useState<GarmentCategory | null>(params.category || null);
  const [sort, setSort] = useState<"recent" | "popular">("recent");
  const [models, setModels] = useState<GarmentModel[] | null>(null);

  const load = () => CatalogApi.models({ category: category || undefined, sort }).then(setModels);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sort]);

  const toggleLike = async (m: GarmentModel) => {
    setModels((prev) => prev?.map((x) => (x.id === m.id ? { ...x, liked_by_me: !x.liked_by_me, like_count: x.like_count + (x.liked_by_me ? -1 : 1) } : x)) ?? null);
    try {
      if (m.liked_by_me) await CatalogApi.unlike(m.id);
      else await CatalogApi.like(m.id);
    } catch {
      load();
    }
  };

  return (
    <Screen>
      <Header title={t("search.modelsGallery")} showBack />
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 16 }}>
        <Chip label={t("common.recent")} active={sort === "recent"} onPress={() => setSort("recent")} />
        <Chip label={t("common.mostLiked")} active={sort === "popular"} onPress={() => setSort("popular")} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 16 }}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? null : c)} />
        ))}
      </ScrollView>
      <View style={styles.grid}>
        {!models ? (
          <Spinner />
        ) : (
          models.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.item}
              onPress={() => router.push({ pathname: `/client/models/${m.id}`, params: params.tailorId ? { tailorId: params.tailorId } : {} })}
            >
              <View>
                <LinearGradient colors={[m.thumbnail_color, colors.indigoText]} style={styles.thumb} />
                <View style={styles.likeOverlay}>
                  <LikeButton liked={m.liked_by_me} count={m.like_count} onPress={() => toggleLike(m)} />
                </View>
              </View>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.category}>{m.category}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16, paddingBottom: 24 },
  item: { width: "47%" },
  thumb: { height: 150, borderRadius: radii.card },
  likeOverlay: { position: "absolute", top: 8, right: 8 },
  name: { fontSize: 12, fontFamily: fonts.bodySemiBold, marginTop: 8, color: colors.indigoText },
  category: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
});
