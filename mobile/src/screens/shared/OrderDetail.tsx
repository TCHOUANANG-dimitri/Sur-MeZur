import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CatalogApi, DeliveriesApi, MeasurementsApi, OrdersApi, PaymentsApi } from "../../api/endpoints";
import type { Fabric, GarmentModel, Measurement, Order, Payment, PaymentSplit, Quote } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { formatFcfa, useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StatusChip } from "../../components/Chip";
import { Header, Spinner } from "../../components/Misc";
import { Screen } from "../../components/Screen";
import { PriceSummary, QuoteCard } from "../../components/DomainCards";
import { colors, fonts } from "../../theme/tokens";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

export function OrderDetailScreen({ orderId, base }: { orderId: string; base: "client" | "tailor" }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [split, setSplit] = useState<PaymentSplit | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const o = await OrdersApi.get(orderId);
    setOrder(o);
    OrdersApi.getQuote(orderId).then(setQuote).catch(() => setQuote(null));
    PaymentsApi.listForOrder(orderId).then(setPayments).catch(() => {});
    PaymentsApi.split(orderId).then(setSplit).catch(() => setSplit(null));
    if (o.garment_model_id) CatalogApi.model(o.garment_model_id).then(setModel).catch(() => {});
    if (o.fabric_id) CatalogApi.fabrics().then((list) => setFabric(list.find((f) => f.id === o.fabric_id) || null));
    if (user?.role === "client") {
      MeasurementsApi.list().then((list) => setMeasurement(list.find((m) => m.id === o.measurement_id) || null));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (!order) return <Spinner />;

  const depositPaid = payments.some((p) => p.phase === "deposit_70" && p.status === "paid");
  const isTailor = user?.role === "tailor";
  const isClient = user?.role === "client";
  const isFinished = order.status === "finished_delivered" || order.status === "finished_not_delivered";

  const confirmDelivery = async () => {
    setBusy(true);
    try {
      await DeliveriesApi.confirm(orderId, {});
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={`Commande #${order.id.slice(0, 8)}`} showBack />
      <View style={{ padding: 18 }}>
        <View style={{ marginBottom: 14 }}>
          <StatusChip status={STATUS_VARIANT[order.status]} label={t(`order.status.${order.status}`)} />
        </View>

        <Card style={{ marginBottom: 14 }}>
          {model && <Text style={styles.modelName}>{model.name}</Text>}
          {fabric && <Text style={styles.detail}>Tissu: {fabric.name}</Text>}
          <Text style={styles.detail}>Réception: {t(`order.${order.reception_mode}`)}</Text>
          {order.desired_date && <Text style={styles.detail}>Date souhaitée: {order.desired_date}</Text>}
          {order.agreed_price ? <Text style={styles.price}>{formatFcfa(order.agreed_price)}</Text> : null}
        </Card>

        {order.client_notes && (
          <Card style={{ marginBottom: 14 }}>
            <Text style={styles.detailTitle}>Précisions du client</Text>
            <Text style={styles.measureList}>{order.client_notes}</Text>
          </Card>
        )}

        {measurement && (
          <Card style={{ marginBottom: 14 }}>
            <Text style={styles.detailTitle}>{t("profile.myMeasurements")}</Text>
            <Text style={styles.measureList}>
              {Object.entries(measurement.data)
                .filter(([k]) => k !== "height_total")
                .map(([k, v]) => `${k}: ${v}cm`)
                .join(" · ")}
            </Text>
          </Card>
        )}

        {!quote && isTailor && order.status === "new" && (
          <Button fullWidth onPress={() => router.push(`/tailor/orders/${orderId}/quote`)} style={{ marginBottom: 10 }}>
            {t("tailor.orders.respond")}
          </Button>
        )}
        {!quote && isClient && <Text style={styles.hint}>En attente du devis du tailleur.</Text>}

        {quote && (
          <View style={{ marginBottom: 14 }}>
            <QuoteCard quote={quote} />
            {!quote.accepted && isClient && (
              <Button
                fullWidth
                style={{ marginTop: 10 }}
                onPress={async () => {
                  await OrdersApi.acceptQuote(orderId);
                  load();
                }}
              >
                {t("quote.accept")}
              </Button>
            )}
          </View>
        )}

        {quote?.accepted && !depositPaid && isClient && (
          <Button fullWidth onPress={() => router.push(`/client/orders/${orderId}/payment`)} style={{ marginBottom: 10 }}>
            {t("payment.title")}
          </Button>
        )}

        {split && <PriceSummary total={split.total} deposit={split.deposit_70} balance={split.balance_30} showEscrowNote />}

        {depositPaid && isTailor && (
          <Button variant="secondary" fullWidth onPress={() => router.push(`/tailor/orders/${orderId}/pattern`)} style={{ marginTop: 10 }}>
            Voir le patron
          </Button>
        )}

        {depositPaid && order.status === "in_progress" && isClient && (
          <Button fullWidth loading={busy} onPress={confirmDelivery} style={{ marginTop: 10 }}>
            Confirmer la livraison
          </Button>
        )}

        {depositPaid && isTailor && order.status === "new" && (
          <Button
            variant="secondary"
            fullWidth
            style={{ marginTop: 10 }}
            onPress={async () => {
              await OrdersApi.setStatus(orderId, "in_progress");
              load();
            }}
          >
            Démarrer la confection
          </Button>
        )}

        {order.status === "finished_delivered" && isClient && (
          <Button variant="secondary" fullWidth style={{ marginTop: 10 }} onPress={() => router.push(`/client/orders/${orderId}/review`)}>
            {t("review.title")}
          </Button>
        )}

        <Button variant="secondary" fullWidth style={{ marginTop: 10 }} onPress={() => router.push(`/${base}/orders/${orderId}/chat`)}>
          {t("chat.title")}
        </Button>
        {!isFinished && (
          <Button variant="text" fullWidth style={{ marginTop: 6 }} onPress={() => router.push(`/${base}/orders/${orderId}/negotiation`)}>
            {t("negotiation.title")}
          </Button>
        )}

        {depositPaid && !order.dispute_status && order.status !== "finished_delivered" && (
          <Button
            variant="text"
            fullWidth
            style={{ marginTop: 6 }}
            onPress={async () => {
              await OrdersApi.openDispute(orderId, "Signalé depuis l'application.");
              load();
            }}
          >
            <Text style={{ color: colors.error, fontFamily: fonts.bodySemiBold, fontSize: 14 }}>Signaler un litige</Text>
          </Button>
        )}
        {order.dispute_status === "open" && (
          <Text style={styles.disputeNote}>Litige en cours d&apos;examen par l&apos;administrateur.</Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modelName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  detail: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontFamily: fonts.body },
  detailTitle: { fontSize: 12, fontFamily: fonts.bodyBold, marginBottom: 8, color: colors.indigoText },
  measureList: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
  price: { marginTop: 8, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.indigoText },
  hint: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  disputeNote: { fontSize: 12, color: colors.pending, textAlign: "center", marginTop: 8, fontFamily: fonts.body },
});
