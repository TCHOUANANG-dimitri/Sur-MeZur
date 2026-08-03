import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
  const { id, tailorId } = useLocalSearchParams<{ id: string; tailorId?: string }>();
  const router = useRouter();
  const [model, setModel] = useState<GarmentModel | null>(null);

  useEffect(() => {
    if (id) CatalogApi.model(id).then(setModel);
  }, [id]);

  if (!model) return <Spinner />;

  const goTryOn = () =>
    router.push({
      pathname: "/client/(tabs)/tryon",
      params: { modelId: model.id, ...(tailorId ? { tailorId } : {}) },
    });

  const toggleLike = async () => {
    const wasLiked = model.liked_by_me;
    setModel({ ...model, liked_by_me: !wasLiked, like_count: model.like_count + (wasLiked ? -1 : 1) });
    try {
      const updated = wasLiked ? await CatalogApi.unlike(model.id) : await CatalogApi.like(model.id);
      setModel(updated);
    } catch {
      CatalogApi.model(model.id).then(setModel);
    }
  };

  return (
    <Screen>
      <Header title={model.name} showBack />
      <View>
        <LinearGradient colors={[model.thumbnail_color, colors.indigoText]} style={styles.hero} />
        <View style={styles.likeOverlay}>
          <LikeButton liked={model.liked_by_me} count={model.like_count} onPress={toggleLike} size={20} />
        </View>
      </View>
      <View style={{ padding: 18 }}>
        <StatusChip status="neutral" label={model.category} />
        <Text style={styles.title}>{model.name}</Text>
        <Text style={styles.description}>{model.description}</Text>
        <View style={styles.tags}>
          {model.style_tags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>

        <Button fullWidth onPress={goTryOn}>
          Essayer sur mon avatar
        </Button>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  hero: { height: 260 },
  likeOverlay: { position: "absolute", top: 12, right: 12 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.indigoText, marginTop: 10, marginBottom: 6 },
  description: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 },
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
