import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CatalogApi } from "../../src/api/endpoints";
import type { GarmentModel } from "../../src/api/types";
import { LikeButton } from "../../src/components/Badges";
import { EmptyState, Header, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { useTheme, useThemedStyles } from "../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../src/theme/tokens";

export default function LikedModels() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const [models, setModels] = useState<GarmentModel[] | null>(null);

  const load = useCallback(() => {
    CatalogApi.models({ liked_only: true }).then(setModels);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unlike = async (m: GarmentModel) => {
    setModels((prev) => prev?.filter((x) => x.id !== m.id) ?? null);
    try {
      await CatalogApi.unlike(m.id);
    } catch {
      load();
    }
  };

  if (!models) return <Spinner />;

  return (
    <Screen>
      <Header title="Modèles enregistrés" showBack />
      <View style={{ padding: 18 }}>
        {models.length === 0 ? (
          <EmptyState text="Aucun modèle enregistré pour le moment. Touchez le cœur sur un modèle pour l'ajouter ici." />
        ) : (
          <View style={styles.grid}>
            {models.map((m) => (
              <TouchableOpacity key={m.id} style={styles.item} onPress={() => router.push(`/client/models/${m.id}`)}>
                <View>
                  <LinearGradient colors={[m.thumbnail_color, colors.indigoText]} style={styles.thumb} />
                  <View style={styles.likeOverlay}>
                    <LikeButton liked count={m.like_count} onPress={() => unlike(m)} />
                  </View>
                </View>
                <Text style={styles.name}>{m.name}</Text>
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  item: { width: "47%" },
  thumb: { height: 150, borderRadius: radii.card },
  likeOverlay: { position: "absolute", top: 8, right: 8 },
  name: { fontSize: 12, fontFamily: fonts.bodySemiBold, marginTop: 8, color: colors.indigoText },
});
