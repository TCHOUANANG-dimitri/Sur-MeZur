import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import ImageView from "react-native-image-viewing";
import { fileUrl } from "../../../src/api/client";
import { CatalogApi } from "../../../src/api/endpoints";
import type { GarmentModel } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { LikeButton } from "../../../src/components/Badges";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { StatusChip } from "../../../src/components/Chip";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

export default function ModelDetail() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    id: string;
    tailorId?: string;
    category_id?: string;
    sort?: "recent" | "popular";
    q?: string;
    liked_only?: string;
  }>();
  const router = useRouter();
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [index, setIndex] = useState(0);
  const [zoomTarget, setZoomTarget] = useState<GarmentModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = {
      category_id: params.category_id || undefined,
      sort: params.sort || undefined,
      q: params.q || undefined,
      liked_only: params.liked_only === "true" ? true : undefined,
    };
    CatalogApi.models(query).then((list) => {
      if (cancelled) return;
      const startIndex = list.findIndex((m) => m.id === params.id);
      if (startIndex >= 0) {
        setModels(list);
        setIndex(startIndex);
      } else {
        // La liste filtrée ne contient plus cet identifiant (lien direct,
        // filtres périmés...) : on retombe sur le modèle seul.
        CatalogApi.model(params.id).then((m) => {
          if (!cancelled) {
            setModels([m]);
            setIndex(0);
          }
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const toggleLike = async (m: GarmentModel) => {
    setModels((prev) => prev?.map((x) => (x.id === m.id ? { ...x, liked_by_me: !x.liked_by_me, like_count: x.like_count + (x.liked_by_me ? -1 : 1) } : x)) ?? null);
    try {
      if (m.liked_by_me) await CatalogApi.unlike(m.id);
      else await CatalogApi.like(m.id);
    } catch {
      CatalogApi.model(m.id).then((updated) => setModels((prev) => prev?.map((x) => (x.id === m.id ? updated : x)) ?? null));
    }
  };

  const goTryOn = (item: GarmentModel) =>
    router.push({
      pathname: "/client/(tabs)/tryon",
      params: { modelId: item.id, ...(params.tailorId ? { tailorId: params.tailorId } : {}) },
    });

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  if (!models) return <Spinner />;

  const current = models[index];

  return (
    <Screen scroll={false} edges={["top", "left", "right"]}>
      <Header title={current?.name ?? ""} showBack />

      {/* Zone image — remplit l'espace disponible, jamais rognee (contain) ;
          tap pour zoomer en plein ecran. Le nom/la description/le bouton
          d'essayage vivent dans la barre du bas, TOUJOURS visible. */}
      <FlatList
        data={models}
        keyExtractor={(m) => m.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <View style={{ width, flex: 1 }}>
            <TouchableOpacity
              activeOpacity={0.92}
              disabled={!item.photo_url}
              onPress={() => setZoomTarget(item)}
              style={styles.imageWrap}
            >
              {item.photo_url ? (
                <Image source={{ uri: fileUrl(item.photo_url) }} style={styles.heroImage} resizeMode="contain" />
              ) : (
                <LinearGradient colors={[item.thumbnail_color, colors.indigoText]} style={StyleSheet.absoluteFillObject} />
              )}
            </TouchableOpacity>
            <View style={styles.likeOverlay}>
              <LikeButton liked={item.liked_by_me} count={item.like_count} onPress={() => toggleLike(item)} size={20} />
            </View>
          </View>
        )}
      />

      {/* Barre du bas — fixe, hors de tout scroll : ne defile jamais. */}
      {current && (
        <View style={styles.bottomBar}>
          <StatusChip status="neutral" label={current.category.name} />
          <Text style={styles.title}>{current.name}</Text>
          <ScrollView style={styles.descScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.description}>{current.description}</Text>
          </ScrollView>
          <View style={styles.tags}>
            {current.style_tags.map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>
          <Button fullWidth onPress={() => goTryOn(current)}>
            Essayer sur mon avatar
          </Button>
        </View>
      )}

      <ImageView
        images={zoomTarget?.photo_url ? [{ uri: fileUrl(zoomTarget.photo_url) }] : []}
        imageIndex={0}
        visible={!!zoomTarget}
        onRequestClose={() => setZoomTarget(null)}
      />
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  imageWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundAlt, overflow: "hidden" },
  heroImage: { width: "100%", height: "100%" },
  likeOverlay: { position: "absolute", top: 12, right: 12 },
  bottomBar: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.indigoText, marginTop: 8, marginBottom: 4 },
  descScroll: { maxHeight: 60, marginBottom: 8 },
  description: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  tag: {
    fontSize: 11,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radii.chip,
    paddingVertical: 4,
    paddingHorizontal: 10,
    color: colors.indigoText,
    fontFamily: fonts.body,
    overflow: "hidden",
  },
});
