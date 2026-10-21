import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fileUrl } from "../../../src/api/client";
import { CatalogApi, TailorsApi } from "../../../src/api/endpoints";
import type { Category, GarmentModel, TailorProfile } from "../../../src/api/types";
import { LikeButton, VerificationBadge } from "../../../src/components/Badges";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Header, Input, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Stars } from "../../../src/components/Stars";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, gradientColors, radii, type ThemeColors } from "../../../src/theme/tokens";
import { CITIES_DATA, CITY_NAMES } from "../../../src/data/citiesData";

export default function Search() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<"tailors" | "models">("tailors");
  const [sort, setSort] = useState<"rating" | "proximity">("rating");
  const [modelSort, setModelSort] = useState<"recent" | "popular">("recent");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [quartier, setQuartier] = useState<string | null>(null);

  useEffect(() => {
    CatalogApi.categories().then(setCategories);
  }, []);

  const loadModels = () => CatalogApi.models({ q: q || undefined, sort: modelSort, category_id: categoryId || undefined }).then(setModels);

  useEffect(() => {
    if (tab === "tailors") TailorsApi.search({ sort, q: q || undefined, city: city || undefined, quartier: quartier || undefined }).then(setTailors);
    else loadModels();
  }, [tab, sort, modelSort, categoryId, q, city, quartier]);

  const toggleLike = async (m: GarmentModel) => {
    setModels((prev) => prev?.map((x) => (x.id === m.id ? { ...x, liked_by_me: !x.liked_by_me, like_count: x.like_count + (x.liked_by_me ? -1 : 1) } : x)) ?? null);
    try {
      if (m.liked_by_me) await CatalogApi.unlike(m.id);
      else await CatalogApi.like(m.id);
    } catch {
      loadModels();
    }
  };

  const quartiers = city ? CITIES_DATA[city] || [] : [];

  return (
    <Screen>
      <Header title={t("search.title")} />
      <View style={{ padding: 16 }}>
        <Input placeholder={t("search.placeholder")} value={q} onChangeText={setQ} />
        <View style={styles.row}>
          <Chip label={t("search.tailors")} active={tab === "tailors"} onPress={() => setTab("tailors")} />
          <Chip label={t("search.models")} active={tab === "models"} onPress={() => setTab("models")} />
        </View>
        {tab === "tailors" ? (
          <>
            <View style={styles.row}>
              <Chip label={t("search.sortProximity")} active={sort === "proximity"} onPress={() => setSort("proximity")} />
              <Chip label={t("search.sortRating")} active={sort === "rating"} onPress={() => setSort("rating")} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ marginBottom: 4 }}>
              <Chip label="Toutes" active={!city} onPress={() => { setCity(null); setQuartier(null); }} />
              {CITY_NAMES.map((c) => (
                <Chip key={c} label={c} active={city === c} onPress={() => { setCity(c); setQuartier(null); }} />
              ))}
            </ScrollView>
            {city && quartiers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ marginBottom: 8 }}>
                <Chip label="Tous" active={!quartier} onPress={() => setQuartier(null)} />
                {quartiers.map((q) => (
                  <Chip key={q} label={q} active={quartier === q} onPress={() => setQuartier(q)} />
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <>
            <View style={styles.row}>
              <Chip label={t("common.recent")} active={modelSort === "recent"} onPress={() => setModelSort("recent")} />
              <Chip label={t("common.mostLiked")} active={modelSort === "popular"} onPress={() => setModelSort("popular")} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 12 }}>
              {categories.map((c) => (
                <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />
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
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <Text style={styles.tailorName}>{tl.shop_name}</Text>
                      <VerificationBadge status={tl.verification_status} />
                    </View>
                    <Stars value={tl.rating_avg} />
                    {tl.city ? (
                      <Text style={styles.locationText}>
                        {tl.city}{tl.quartier ? ` · ${tl.quartier}` : ""}
                      </Text>
                    ) : null}
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
              <TouchableOpacity
                key={m.id}
                style={styles.gridItem}
                onPress={() =>
                  router.push({
                    pathname: `/client/models/${m.id}`,
                    params: {
                      sort: modelSort,
                      ...(categoryId ? { category_id: categoryId } : {}),
                      ...(q ? { q } : {}),
                    },
                  })
                }
              >
                <View>
                  {m.photo_url ? (
                    <Image source={{ uri: fileUrl(m.photo_url) }} style={styles.gridThumb} resizeMode="cover" />
                  ) : (
                    <LinearGradient colors={[m.thumbnail_color, colors.indigoText]} style={styles.gridThumb} />
                  )}
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
  chipRow: { gap: 8, paddingVertical: 4 },
  avatar: { width: 44, height: 44, borderRadius: 12 },
  tailorName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  locationText: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { width: "47%" },
  gridThumb: { height: 120, borderRadius: radii.card },
  likeOverlay: { position: "absolute", top: 6, right: 6 },
  modelName: { fontSize: 12, fontFamily: fonts.bodySemiBold, marginTop: 6, color: colors.indigoText },
});
