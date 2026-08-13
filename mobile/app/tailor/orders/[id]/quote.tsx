import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { userMessage, ApiError } from "../../../../src/api/client";
import { OrdersApi } from "../../../../src/api/endpoints";
import { Button } from "../../../../src/components/Button";
import { Card } from "../../../../src/components/Card";
import { ErrorBanner, Field, Header, Input } from "../../../../src/components/Misc";
import { Screen } from "../../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../../src/i18n/I18nProvider";
import { useThemedStyles } from "../../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../../src/theme/tokens";

// Mirrors CDC §10.1 for the live preview; the server is authoritative.
function previewCommission(total: number) {
  if (total <= 15000) return 0.1;
  if (total <= 50000) return 0.08;
  if (total <= 150000) return 0.06;
  return 0.05;
}

export default function QuoteForm() {
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [lineItems, setLineItems] = useState([
    { label: t("quote.fabric"), amount: "" },
    { label: t("quote.confection"), amount: "" },
  ]);
  const [fabricMetrage, setFabricMetrage] = useState("");
  const [delayDays, setDelayDays] = useState("10");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const total = lineItems.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
  const rate = previewCommission(total);
  const commission = Math.round(total * rate);

  const updateItem = (i: number, field: "label" | "amount", value: string) => {
    setLineItems((items) => items.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  };

  const submit = async () => {
    if (!id) return;
    setError("");
    if (total <= 0) {
      setError(t("quote.atLeastOneItem"));
      return;
    }
    setBusy(true);
    try {
      await OrdersApi.createQuote(id, {
        line_items: lineItems.map((li) => ({ label: li.label, amount: parseFloat(li.amount) || 0 })),
        fabric_metrage: fabricMetrage,
        delay_days: parseInt(delayDays, 10) || 0,
      });
      router.replace(`/tailor/orders/${id}`);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={t("tailor.orders.respond")} showBack />
      <View style={{ padding: 18 }}>
        {error ? <ErrorBanner message={error} /> : null}
        <Text style={styles.label}>{t("tailor.quote.lineItems")}</Text>
        {lineItems.map((li, i) => (
          <View key={i} style={styles.itemRow}>
            <Input style={{ flex: 2 }} value={li.label} onChangeText={(v) => updateItem(i, "label", v)} />
            <Input style={{ flex: 1 }} keyboardType="numeric" value={li.amount} onChangeText={(v) => updateItem(i, "amount", v)} />
          </View>
        ))}
        <Button variant="text" onPress={() => setLineItems((items) => [...items, { label: "", amount: "" }])}>
          {t("quote.addLineItem")}
        </Button>

        <Field label={t("quote.fabricLength")}>
          <Input value={fabricMetrage} onChangeText={setFabricMetrage} placeholder={t("quote.fabricLengthPlaceholder")} />
        </Field>
        <Field label={t("tailor.quote.delay")}>
          <Input keyboardType="numeric" value={delayDays} onChangeText={setDelayDays} />
        </Field>

        <Card style={{ marginBottom: 16 }}>
          <Row label={t("quote.total")} value={formatFcfa(total)} />
          <Row label={`Commission (${(rate * 100).toFixed(0)}%)`} value={`- ${formatFcfa(commission)}`} />
          <Row label={t("quote.net")} value={formatFcfa(total - commission)} bold />
        </Card>

        <Button fullWidth loading={busy} onPress={submit}>
          {t("tailor.quote.submit")}
        </Button>
      </View>
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontSize: 14 }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  label: { fontSize: 12, fontFamily: fonts.bodyBold, marginBottom: 8, color: colors.indigoText },
  itemRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.body },
  rowValue: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.indigoText },
});
