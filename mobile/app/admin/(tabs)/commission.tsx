import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AdminApi } from "../../../src/api/endpoints";
import { Card } from "../../../src/components/Card";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa } from "../../../src/i18n/I18nProvider";
import { useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";

interface Tier {
  id: string;
  min_price: number;
  max_price: number | null;
  rate: number;
}

export default function CommissionSettings() {
  const styles = useThemedStyles(makeStyles);
  const [tiers, setTiers] = useState<Tier[] | null>(null);

  useEffect(() => {
    AdminApi.commissionTiers().then(setTiers);
  }, []);

  if (!tiers) return <Spinner />;

  return (
    <Screen>
      <Header title="Barème de commission" />
      <View style={{ padding: 18 }}>
        <Text style={styles.intro}>Barème par tranches (CDC §10.1) — taux décroissant, prélevé sur le tailleur.</Text>
        {tiers.map((t) => (
          <Card key={t.id} style={{ marginBottom: 10 }}>
            <View style={styles.row}>
              <Text style={styles.range}>
                {formatFcfa(t.min_price)} — {t.max_price ? formatFcfa(t.max_price) : "∞"}
              </Text>
              <Text style={styles.rate}>{(t.rate * 100).toFixed(0)}%</Text>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  intro: { fontSize: 12, color: colors.textSecondary, marginBottom: 14, fontFamily: fonts.body },
  row: { flexDirection: "row", justifyContent: "space-between" },
  range: { fontSize: 13, color: colors.indigoText, fontFamily: fonts.body },
  rate: { fontFamily: fonts.bodyBold, color: colors.violetPrimary },
});
