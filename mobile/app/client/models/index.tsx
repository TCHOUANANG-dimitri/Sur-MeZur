import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fileUrl } from "../../../src/api/client";
import { CatalogApi } from "../../../src/api/endpoints";
import type { Category, GarmentModel } from "../../../src/api/types";
import { LikeButton } from "../../../src/components/Badges";
import { Chip } from "../../../src/components/Chip";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

export default function Gallery() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ tailorId?: string; category_id?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(params.category_id || null);
  const [sort, setSort] = useState<"recent" | "popular">("recent");
  const [models, setModels] = useState<GarmentModel[] | null>(null);

  useEffect(() => {
    CatalogApi.categories().then(setCategories);
  }, []);

  const load = () => CatalogApi.models({ category_id: categoryId || undefined, sort }).then(setModels);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, sort]);

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
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />
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
                {m.photo_url ? (
                  <Image source={{ uri: fileUrl(m.photo_url) }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={[m.thumbnail_color, colors.indigoText]} style={styles.thumb} />
                )}
                <View style={styles.likeOverlay}>
                  <LikeButton liked={m.liked_by_me} count={m.like_count} onPress={() => toggleLike(m)} />
                </View>
              </View>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.category}>{m.category.name}</Text>
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
