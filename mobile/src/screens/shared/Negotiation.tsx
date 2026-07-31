import { CheckCircle2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { OrdersApi } from "../../api/endpoints";
import type { Offer } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { formatFcfa, useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StatusChip } from "../../components/Chip";
import { Header, Field, Input, Spinner } from "../../components/Misc";
import { Screen } from "../../components/Screen";
import { colors, fonts } from "../../theme/tokens";

export function NegotiationScreen({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [amount, setAmount] = useState("");
  const [delay, setDelay] = useState("10");
  const [busy, setBusy] = useState(false);

  const load = () => OrdersApi.offers(orderId).then(setOffers);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (!offers) return <Spinner />;

  const last = offers[offers.length - 1];
  const canRespond = last && last.status === "pending" && last.actor !== user?.role;
  const roundsLeft = 3 - (last?.round || 0);

  const counterOffer = async () => {
    setBusy(true);
    try {
      await OrdersApi.createOffer(orderId, {
        actor: user!.role as "client" | "tailor",
        amount: parseFloat(amount) || last.amount,
        delay_days: parseInt(delay, 10) || undefined,
      });
      setAmount("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!last) return;
    setBusy(true);
    try {
      await OrdersApi.acceptOffer(orderId, last.id);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={t("negotiation.title")} showBack />
      <View style={{ padding: 18 }}>
        {offers.map((o) => (
          <Card key={o.id} style={{ marginBottom: 10 }}>
            <View style={styles.row}>
              <Text style={styles.actor}>
                {t(`role.${o.actor}`)} · round {o.round}
              </Text>
              <StatusChip
                status={o.status === "accepted" ? "success" : o.status === "refused" || o.status === "expired" ? "error" : "pending"}
                label={o.status}
              />
            </View>
            <Text style={styles.amount}>{formatFcfa(o.amount)}</Text>
            {o.delay_days ? <Text style={styles.delay}>Délai: {o.delay_days} j</Text> : null}
          </Card>
        ))}

        {last?.status === "accepted" && (
          <View style={styles.acceptedRow}>
            <CheckCircle2 size={16} color={colors.success} />
            <Text style={styles.accepted}>Offre validée</Text>
          </View>
        )}

        {last?.status === "pending" && (
          <>
            {canRespond && (
              <Button fullWidth loading={busy} onPress={accept} style={{ marginBottom: 10 }}>
                {t("negotiation.accept")} ({formatFcfa(last.amount)})
              </Button>
            )}
            {roundsLeft > 0 ? (
              <>
                <Field label={t("order.priceOffer")}>
                  <Input keyboardType="numeric" value={amount} onChangeText={setAmount} placeholder={String(last.amount)} />
                </Field>
                <Field label="Délai (jours)">
                  <Input keyboardType="numeric" value={delay} onChangeText={setDelay} />
                </Field>
                <Button variant="secondary" fullWidth loading={busy} onPress={counterOffer}>
                  {t("negotiation.counterOffer")}
                </Button>
              </>
            ) : (
              <Text style={styles.hint}>Plafond de 3 propositions atteint (RG-05).</Text>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actor: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  amount: { marginTop: 6, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
  delay: { marginTop: 2, fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
  acceptedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  accepted: { fontSize: 13, color: colors.success, fontFamily: fonts.bodySemiBold },
  hint: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
});
