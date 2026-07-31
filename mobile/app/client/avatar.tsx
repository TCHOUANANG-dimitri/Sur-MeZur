import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AvatarsApi, MeasurementsApi } from "../../src/api/endpoints";
import type { Avatar as AvatarT, Measurement } from "../../src/api/types";
import { Button } from "../../src/components/Button";
import { Header, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { Viewer3D } from "../../src/components/Viewer3D";
import { useI18n } from "../../src/i18n/I18nProvider";
import { colors, fonts } from "../../src/theme/tokens";

const SKIN_TONES = ["#F2D0B4", "#E8B584", "#C68863", "#9C6644", "#6B4226", "#3E2723"];

export default function AvatarPage() {
  const params = useLocalSearchParams<{ measurementId?: string; modelId?: string; tailorId?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [skinTone, setSkinTone] = useState(SKIN_TONES[2]);
  const [avatar, setAvatar] = useState<AvatarT | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    MeasurementsApi.list().then((list) => {
      const found = params.measurementId ? list.find((m) => m.id === params.measurementId) : list[0];
      setMeasurement(found || null);
    });
  }, [params.measurementId]);

  const generate = async () => {
    if (!measurement) return;
    setLoading(true);
    try {
      let av = await AvatarsApi.create({ measurement_id: measurement.id, skin_tone_hex: skinTone });
      for (let i = 0; i < 10 && av.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, 800));
        av = await AvatarsApi.get(av.id);
      }
      setAvatar(av);
    } finally {
      setLoading(false);
    }
  };

  if (!measurement) return <Spinner />;

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
        <Viewer3D skinToneHex={skinTone} measurements={measurement.data} height={300} />

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

        {!avatar || avatar.status !== "ready" ? (
          <Button fullWidth loading={loading} onPress={generate}>
            {t("avatar.title")}
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

const styles = StyleSheet.create({
  label: { fontSize: 12, fontFamily: fonts.bodyBold, marginTop: 16, marginBottom: 8, color: colors.indigoText },
  swatchRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  swatchActive: { borderWidth: 3, borderColor: colors.violetPrimary },
});
