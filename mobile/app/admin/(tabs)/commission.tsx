import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AdminApi } from "../../../src/api/endpoints";
import { Card } from "../../../src/components/Card";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";

interface Tier {
  id: string;
  min_price: number;
  max_price: number | null;
  rate: number;
}

export default function CommissionSettings() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [tiers, setTiers] = useState<Tier[] | null>(null);

  useEffect(() => {
    AdminApi.commissionTiers().then(setTiers);
  }, []);

  if (!tiers) return <Spinner />;

  return (
    <Screen>
      <Header title={t("admin.commission.title")} />
      <View style={{ padding: 18 }}>
        <Text style={styles.intro}>{t("admin.commission.description")}</Text>
        {tiers.map((tier) => (
          <Card key={tier.id} style={{ marginBottom: 10 }}>
            <View style={styles.row}>
              <Text style={styles.range}>
                {formatFcfa(tier.min_price)} — {tier.max_price ? formatFcfa(tier.max_price) : "∞"}
              </Text>
              <Text style={styles.rate}>{(tier.rate * 100).toFixed(0)}%</Text>
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
