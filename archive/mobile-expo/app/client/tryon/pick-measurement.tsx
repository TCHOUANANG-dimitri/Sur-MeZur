import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { userMessage } from "../../../src/api/client";
import { AvatarsApi, MeasurementsApi, UsersApi } from "../../../src/api/endpoints";
import type { Avatar, ClientProfile, Measurement } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { StatusChip } from "../../../src/components/Chip";
import { EmptyState, ErrorBanner, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

/**
 * Second option from the tryon "pas d'avatar" guard : pick one of the
 * client's already-saved measurements instead of re-capturing new photos.
 * Mirrors frontend/src/pages/client/UseExistingMeasurements.tsx (web) —
 * this screen didn't exist on mobile until now, see PIPELINE_AMELIORE.md
 * investigation of the 25 aout 2026 build discrepancy.
 */
const SKIN_TONES = ["#C68863", "#8D5524", "#FFDBAC", "#F1C27D", "#E0AC69", "#503335"];

function averageConfidence(confidence: Record<string, number> | null | undefined): number | null {
  if (!confidence) return null;
  const values = Object.values(confidence);
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100);
}

export default function PickMeasurement() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ modelId?: string; tailorId?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [measurements, setMeasurements] = useState<Measurement[] | null>(null);
  const [skinTone, setSkinTone] = useState(SKIN_TONES[0]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    MeasurementsApi.list()
      .then(setMeasurements)
      .catch((e) => {
        setMeasurements([]);
        setLoadError(userMessage(e));
      });
    UsersApi.myClientProfile()
      .then((p: ClientProfile) => {
        if (p.skin_tone_hex) setSkinTone(p.skin_tone_hex);
      })
      .catch(() => {});
  }, []);

  const handleCreateAvatar = async () => {
    if (!selected) return;
    setCreateError("");
    setBusy(true);
    try {
      const avatar: Avatar = await AvatarsApi.create({ measurement_id: selected, skin_tone_hex: skinTone });
      router.replace({
        pathname: "/client/(tabs)/tryon",
        params: {
          avatarId: avatar.id,
          ...(params.modelId ? { modelId: params.modelId } : {}),
          ...(params.tailorId ? { tailorId: params.tailorId } : {}),
        },
      });
    } catch (e) {
      setCreateError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (measurements === null) {
    return (
      <Screen>
        <Header title={t("measurement.pickExisting")} showBack />
        <Spinner />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={t("measurement.pickExisting")} showBack />
      <View style={{ padding: 18 }}>
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {measurements.length === 0 ? (
          <EmptyState
            text={t("measurement.noExisting")}
            cta={<Button onPress={() => router.push("/client/measurements")}>{t("measurement.intro.title")}</Button>}
          />
        ) : (
          <>
            <Text style={styles.subtitle}>{t("measurement.pickExisting.subtitle")}</Text>

            {measurements.map((m) => {
              const isSelected = selected === m.id;
              const confidence = averageConfidence(m.confidence);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.card, isSelected && styles.cardSelected]}
                  onPress={() => setSelected(m.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardRow}>
                    <View>
                      <Text style={styles.cardHeight}>
                        {t("measurement.height")}: {m.height_cm} cm
                      </Text>
                      {m.weight_kg ? (
                        <Text style={styles.cardWeight}>
                          {t("measurement.weight")}: {m.weight_kg} kg
                        </Text>
                      ) : null}
                    </View>
                    <StatusChip status="neutral" label={t(`measurement.source.${m.source}`)} />
                  </View>
                  {confidence !== null && (
                    <Text style={styles.cardConfidence}>
                      {t("measurement.confidence")}: {confidence}%
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}

            <Text style={styles.label}>{t("avatar.skinTone")}</Text>
            <View style={styles.skinRow}>
              {SKIN_TONES.map((hex) => (
                <TouchableOpacity
                  key={hex}
                  onPress={() => setSkinTone(hex)}
                  style={[styles.skinSwatch, { backgroundColor: hex }, skinTone === hex && styles.skinSwatchActive]}
                />
              ))}
            </View>

            {createError ? <ErrorBanner message={createError} /> : null}

            <Button fullWidth loading={busy} disabled={!selected} onPress={handleCreateAvatar} style={{ marginTop: 10 }}>
              {t("tryon.useMeasurement")}
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    subtitle: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 14 },
    card: {
      padding: 14,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: 10,
    },
    cardSelected: { borderWidth: 2, borderColor: colors.violetPrimary },
    cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardHeight: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.indigoText },
    cardWeight: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 2 },
    cardConfidence: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 6 },
    label: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.indigoText, marginTop: 6, marginBottom: 8 },
    skinRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    skinSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
    skinSwatchActive: { borderWidth: 3, borderColor: colors.violetPrimary },
  });
