import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "../../../../src/api/client";
import { OrdersApi, PaymentsApi } from "../../../../src/api/endpoints";
import type { Quote } from "../../../../src/api/types";
import { Button } from "../../../../src/components/Button";
import { Card } from "../../../../src/components/Card";
import { ErrorBanner, Field, Header, Input, Spinner } from "../../../../src/components/Misc";
import { Screen } from "../../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../../src/i18n/I18nProvider";
import { colors, fonts } from "../../../../src/theme/tokens";

export default function Payment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [provider, setProvider] = useState<"mtn_momo" | "orange_money">("mtn_momo");
  const [phone, setPhone] = useState("+237670000000");
  const [status, setStatus] = useState<"form" | "pending" | "paid" | "error">("form");
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) OrdersApi.getQuote(id).then(setQuote);
  }, [id]);

  const pay = async () => {
    if (!id) return;
    setError("");
    setStatus("pending");
    try {
      await PaymentsApi.deposit({ order_id: id, provider, phone });
      let attempts = 0;
      let paid = false;
      while (attempts < 10 && !paid) {
        await new Promise((r) => setTimeout(r, 1000));
        const payments = await PaymentsApi.listForOrder(id);
        paid = payments.some((p) => p.phase === "deposit_70" && p.status === "paid");
        attempts++;
      }
      setStatus(paid ? "paid" : "error");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setStatus("error");
    }
  };

  if (!quote) return <Spinner />;

  const deposit = Math.round(quote.total * 0.7);
  const balance = Math.round(quote.total * 0.3);

  return (
    <Screen>
      <Header title={t("payment.title")} showBack />
      <View style={{ padding: 18 }}>
        {error ? <ErrorBanner message={error} /> : null}
        <Card style={{ marginBottom: 16 }}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>{formatFcfa(quote.total)}</Text>
          <Text style={styles.line}>
            {t("payment.deposit")}: <Text style={styles.bold}>{formatFcfa(deposit)}</Text>
          </Text>
          <Text style={styles.line}>
            {t("payment.balance")}: <Text style={styles.bold}>{formatFcfa(balance)}</Text>
          </Text>
          <Text style={styles.note}>{t("payment.escrowNote")}</Text>
        </Card>

        {status === "form" && (
          <>
            <Field label={t("payment.chooseProvider")}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button variant={provider === "mtn_momo" ? "primary" : "secondary"} onPress={() => setProvider("mtn_momo")} style={{ flex: 1 }}>
                  MTN MoMo
                </Button>
                <Button variant={provider === "orange_money" ? "primary" : "secondary"} onPress={() => setProvider("orange_money")} style={{ flex: 1 }}>
                  Orange Money
                </Button>
              </View>
            </Field>
            <Field label={t("payment.phone")}>
              <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </Field>
            <Button fullWidth onPress={pay}>
              {t("payment.pay")} ({formatFcfa(deposit)})
            </Button>
          </>
        )}

        {status === "pending" && <Spinner label="Confirmation Mobile Money en cours…" />}

        {status === "paid" && (
          <>
            <View style={styles.successRow}>
              <CheckCircle2 size={18} color={colors.success} />
              <Text style={styles.success}>Paiement confirmé</Text>
            </View>
            <Button fullWidth onPress={() => router.replace(`/client/orders/${id}`)}>
              {t("common.confirm")}
            </Button>
          </>
        )}

        {status === "error" && (
          <Button fullWidth onPress={() => setStatus("form")}>
            {t("common.retry")}
          </Button>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  totalLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  total: { fontSize: 20, fontFamily: fonts.bodyBold, color: colors.indigoText, marginBottom: 12 },
  line: { fontSize: 13, color: colors.indigoText, marginTop: 2, fontFamily: fonts.body },
  bold: { fontFamily: fonts.bodyBold },
  note: { fontSize: 11, color: colors.textSecondary, marginTop: 10, fontFamily: fonts.body },
  successRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 },
  success: { color: colors.success, fontFamily: fonts.bodyBold, fontSize: 15 },
});
