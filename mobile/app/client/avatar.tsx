import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { avatarMeshUrl, userMessage } from "../../src/api/client";
import { AvatarsApi, MeasurementsApi } from "../../src/api/endpoints";
import type { Avatar as AvatarT, Measurement } from "../../src/api/types";
import { Button } from "../../src/components/Button";
import { ErrorBanner } from "../../src/components/Misc";
import { Viewer3D } from "../../src/components/Viewer3D";
import { useI18n } from "../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../src/theme/tokens";
import { SafeAreaView } from "react-native-safe-area-context";

const SKIN_TONES = ["#F2D0B4", "#E8B584", "#C68863", "#9C6644", "#6B4226", "#3E2723"];
const { height: SCREEN_H } = Dimensions.get("window");

export default function AvatarPage() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ measurementId?: string; modelId?: string; tailorId?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [measurement, setMeasurement] = useState<Measurement | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [skinTone, setSkinTone] = useState(SKIN_TONES[2]);
  const [avatar, setAvatar] = useState<AvatarT | null>(null);
  const [loading, setLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Charger la mensuration
  useEffect(() => {
    MeasurementsApi.list()
      .then((list) => {
        const found = params.measurementId ? list.find((m) => m.id === params.measurementId) : list[0];
        setMeasurement(found || null);
      })
      .catch((e) => {
        setLoadError(userMessage(e));
        setMeasurement(null);
      });
  }, [params.measurementId]);

  // Génération automatique dès que la mensuration est chargée
  const generate = async () => {
    if (!measurement) return;
    setGenError("");
    setLoading(true);
    try {
      const av = await AvatarsApi.create({ measurement_id: measurement.id, skin_tone_hex: skinTone });
      if (!mountedRef.current) return;
      if (av.status === "failed") {
        setGenError(t("avatar.err.generationFailed"));
      }
      setAvatar(av);
    } catch (e) {
      if (mountedRef.current) setGenError(userMessage(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // Déclencher la génération automatiquement
  useEffect(() => {
    if (measurement && !avatar && !loading) {
      generate();
    }
  }, [measurement]);

  const goTryOn = (openAcc?: boolean) =>
    router.push({
      pathname: "/client/(tabs)/tryon",
      params: {
        avatarId: avatar?.id || "",
        ...(params.modelId ? { modelId: params.modelId } : {}),
        ...(params.tailorId ? { tailorId: params.tailorId } : {}),
        ...(openAcc ? { openAccessories: "1" } : {}),
      },
    });

  const isReady = avatar?.status === "ready";
  const isGenerating = loading || (avatar !== null && avatar?.status !== "ready" && avatar?.status !== "failed");

  // État de chargement plein écran (pas de mensuration ou génération en cours)
  if (measurement === undefined || (measurement && !avatar && loading)) {
    return (
      <View style={styles.fullscreen}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.violetPrimary} />
          <Text style={styles.loadingText}>{t("avatar.generating")}</Text>
          <Text style={styles.loadingHint}>{t("avatar.generatingHint")}</Text>
        </View>
      </View>
    );
  }

  if (measurement === null) {
    return (
      <View style={styles.fullscreen}>
        <View style={styles.loadingCenter}>
          <Text style={styles.loadingText}>{loadError || t("avatar.err.noMeasurement")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fullscreen}>
      {/* Viewer3D plein écran */}
      <View style={styles.viewerContainer}>
        <Viewer3D
          avatarMorphology={avatar?.morph_weights}
          glbUrl={avatarMeshUrl(avatar)}
          skinToneHex={skinTone}
          measurements={measurement.data}
          gender={measurement.gender}
          height={SCREEN_H}
        />
      </View>

      {/* Header overlay semi-transparent */}
      <SafeAreaView style={styles.headerOverlay} edges={["top"]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("avatar.title")}</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Error overlay */}
      {genError ? (
        <View style={styles.errorOverlay}>
          <ErrorBanner message={genError} />
        </View>
      ) : null}

      {/* État de génération en cours (overlay au centre) */}
      {isGenerating && !isReady && (
        <View style={styles.generatingOverlay}>
          <ActivityIndicator size="large" color={colors.violetPrimary} />
          <Text style={styles.loadingText}>{t("avatar.generating")}</Text>
        </View>
      )}

      {/* Pastilles de teinte — rangée en bas au-dessus des boutons */}
      <View style={styles.skinToneOverlay}>
        <Text style={styles.skinLabel}>{t("avatar.skinTone")}</Text>
        <View style={styles.swatchRow}>
          {SKIN_TONES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setSkinTone(c)}
              style={[styles.swatch, { backgroundColor: c }, skinTone === c && styles.swatchActive]}
            />
          ))}
        </View>
      </View>

      {/* Boutons ancrés en bas */}
      {isReady && (
        <View style={styles.bottomActions}>
          <Button fullWidth onPress={() => goTryOn(false)}>
            {t("avatar.confirm")}
          </Button>
          <Button fullWidth variant="secondary" onPress={() => goTryOn(true)}>
            {t("avatar.addAccessories")}
          </Button>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    fullscreen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    viewerContainer: {
      ...StyleSheet.absoluteFillObject,
    },
    headerOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: "rgba(0,0,0,0.25)",
      zIndex: 10,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    backText: {
      fontSize: 20,
      color: "#fff",
      fontFamily: fonts.bodyBold,
    },
    headerTitle: {
      fontSize: 16,
      fontFamily: fonts.bodyBold,
      color: "#fff",
    },
    errorOverlay: {
      position: "absolute",
      top: 100,
      left: 18,
      right: 18,
      zIndex: 20,
    },
    generatingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 15,
    },
    loadingCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    loadingText: {
      fontSize: 15,
      fontFamily: fonts.bodyBold,
      color: colors.indigoText,
      marginTop: 14,
      textAlign: "center",
    },
    loadingHint: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      marginTop: 6,
      textAlign: "center",
    },
    skinToneOverlay: {
      position: "absolute",
      bottom: 130,
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 10,
      backgroundColor: "rgba(0,0,0,0.3)",
      paddingVertical: 8,
    },
    skinLabel: {
      fontSize: 11,
      fontFamily: fonts.bodyBold,
      color: "#fff",
      marginBottom: 6,
    },
    swatchRow: {
      flexDirection: "row",
      gap: 10,
    },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.4)",
    },
    swatchActive: {
      borderWidth: 3,
      borderColor: colors.violetPrimary,
    },
    bottomActions: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: "rgba(0,0,0,0.35)",
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 34,
      gap: 10,
      zIndex: 10,
    },
  });
