import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { avatarMeshUrl, userMessage } from "../../src/api/client";
import { AvatarsApi, MeasurementsApi } from "../../src/api/endpoints";
import type { Avatar as AvatarT, Measurement } from "../../src/api/types";
import { Button } from "../../src/components/Button";
import { EmptyState, ErrorBanner, Header, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { Viewer3D } from "../../src/components/Viewer3D";
import { useI18n } from "../../src/i18n/I18nProvider";
import { useThemedStyles } from "../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../src/theme/tokens";

const SKIN_TONES = ["#F2D0B4", "#E8B584", "#C68863", "#9C6644", "#6B4226", "#3E2723"];

export default function AvatarPage() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ measurementId?: string; modelId?: string; tailorId?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  // undefined = chargement en cours, null = introuvable/échec — sans cette
  // distinction, un MeasurementsApi.list() en échec laissait `measurement`
  // à sa valeur initiale et l'écran restait bloqué sur le spinner pour
  // toujours, sans jamais rien afficher au client.
  const [measurement, setMeasurement] = useState<Measurement | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [skinTone, setSkinTone] = useState(SKIN_TONES[2]);
  const [avatar, setAvatar] = useState<AvatarT | null>(null);
  const [loading, setLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [slow, setSlow] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

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

  const generate = async () => {
    if (!measurement) return;
    setGenError("");
    setSlow(false);
    setLoading(true);
    try {
      let av = await AvatarsApi.create({ measurement_id: measurement.id, skin_tone_hex: skinTone });
      // Le subprocess Blender dispose de jusqu'à 120s côté serveur
      // (avatar_blender_timeout) : un budget de poll à 8s abandonnait bien
      // avant que le serveur ait pu finir, et affichait l'avatar comme
      // "mort" alors qu'il continuait de se générer en arrière-plan.
      const POLL_INTERVAL_MS = 2000;
      const MAX_ATTEMPTS = 65; // ~130s, au-delà du timeout serveur
      const SLOW_AFTER_ATTEMPTS = 5; // ~10s
      for (let i = 0; i < MAX_ATTEMPTS && av.status === "processing"; i++) {
        if (!mountedRef.current) return;
        if (i === SLOW_AFTER_ATTEMPTS) setSlow(true);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (!mountedRef.current) return;
        av = await AvatarsApi.get(av.id);
      }
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

  if (measurement === undefined) return <Spinner />;
  if (measurement === null) {
    return (
      <Screen>
        <Header title={t("avatar.title")} showBack />
        <View style={{ padding: 18 }}>
          <EmptyState text={loadError || t("avatar.err.noMeasurement")} />
        </View>
      </Screen>
    );
  }

  const goTryOn = () =>
    router.push({
      pathname: "/client/(tabs)/tryon",
      params: {
        avatarId: avatar?.id || "",
        ...(params.modelId ? { modelId: params.modelId } : {}),
        ...(params.tailorId ? { tailorId: params.tailorId } : {}),
      },
    });

  return (
    <Screen>
      <Header title={t("avatar.title")} showBack />
      <View style={{ padding: 18 }}>
        <Viewer3D
          glbUrl={avatarMeshUrl(avatar)}
          skinToneHex={skinTone}
          measurements={measurement.data}
          gender={measurement.gender}
          height={300}
        />

        <Text style={styles.label}>{t("avatar.skinTone")}</Text>
        <View style={styles.swatchRow}>
          {SKIN_TONES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setSkinTone(c)}
              style={[styles.swatch, { backgroundColor: c }, skinTone === c && styles.swatchActive]}
            />
          ))}
        </View>

        {genError ? <ErrorBanner message={genError} /> : null}
        {loading && slow ? <Text style={styles.slowHint}>{t("avatar.err.stillGenerating")}</Text> : null}

        {!avatar || avatar.status !== "ready" ? (
          <Button fullWidth loading={loading} onPress={generate}>
            {t("avatar.generate")}
          </Button>
        ) : (
          <Button fullWidth onPress={goTryOn}>
            {t("avatar.dressButton")}
          </Button>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  label: { fontSize: 12, fontFamily: fonts.bodyBold, marginTop: 16, marginBottom: 8, color: colors.indigoText },
  swatchRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  swatchActive: { borderWidth: 3, borderColor: colors.violetPrimary },
  slowHint: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, textAlign: "center", marginBottom: 8 },
});
