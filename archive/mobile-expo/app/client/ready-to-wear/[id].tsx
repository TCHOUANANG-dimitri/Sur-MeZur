import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CatalogApi, MeasurementsApi } from "../../../src/api/endpoints";
import type { Measurement, ReadyToWear } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

export default function ReadyToWearDetail() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [item, setItem] = useState<ReadyToWear | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [result, setResult] = useState<{ match: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    CatalogApi.readyToWearItem(id).then(setItem);
    MeasurementsApi.list().then(setMeasurements).catch(() => {});
  }, [id]);

  const compare = async () => {
    if (measurements.length === 0 || !id) return;
    setBusy(true);
    try {
      const res = await CatalogApi.compare(measurements[0].id, id);
      setResult(res);
    } finally {
      setBusy(false);
    }
  };

  if (!item) return <Spinner />;

  return (
    <Screen>
      <Header title={item.name} showBack />
      <View style={styles.hero} />
      <View style={{ padding: 18 }}>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <Text style={styles.price}>{formatFcfa(item.price)}</Text>

        <Button fullWidth disabled={busy || measurements.length === 0} loading={busy} onPress={compare} style={{ marginTop: 10 }}>
          {t("order.compareMeasures")}
        </Button>

        {measurements.length === 0 && (
          <Text style={styles.hint}>{t("order.compareHint")}</Text>
        )}

        {result && (
          <View style={[styles.resultBox, { backgroundColor: result.match ? colors.successBg : colors.pendingBg }]}>
            <Text style={styles.resultText}>{result.message}</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  hero: { height: 220, backgroundColor: colors.backgroundAlt },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.indigoText, marginBottom: 6 },
  description: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
  price: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.violetPrimary, marginTop: 6 },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 8, fontFamily: fonts.body },
  resultBox: { marginTop: 14, padding: 14, borderRadius: radii.card },
  resultText: { fontSize: 13, color: colors.indigoText, fontFamily: fonts.body },
});
