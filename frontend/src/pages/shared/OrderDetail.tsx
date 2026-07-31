import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CatalogApi, DeliveriesApi, MeasurementsApi, OrdersApi, PaymentsApi } from "../../api/endpoints";
import type { Fabric, GarmentModel, Measurement, Order, Payment, PaymentSplit, Quote } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StatusChip } from "../../components/Chip";
import { Header, Spinner } from "../../components/Misc";
import { QuoteCard, PriceSummary } from "../../components/DomainCards";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

export default function OrderDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const base = user?.role === "tailor" ? "/tailor" : "/client";

  const [order, setOrder] = useState<Order | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [split, setSplit] = useState<PaymentSplit | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const o = await OrdersApi.get(id);
    setOrder(o);
    OrdersApi.getQuote(id).then(setQuote).catch(() => setQuote(null));
    PaymentsApi.listForOrder(id).then(setPayments).catch(() => {});
    PaymentsApi.split(id).then(setSplit).catch(() => setSplit(null));
    if (o.garment_model_id) CatalogApi.model(o.garment_model_id).then(setModel).catch(() => {});
    if (o.fabric_id) CatalogApi.fabrics().then((list) => setFabric(list.find((f) => f.id === o.fabric_id) || null));
    if (user?.role === "client") {
      MeasurementsApi.list().then((list) => setMeasurement(list.find((m) => m.id === o.measurement_id) || null));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!order) return <Spinner />;

  const depositPaid = payments.some((p) => p.phase === "deposit_70" && p.status === "paid");
  const isTailor = user?.role === "tailor";
  const isClient = user?.role === "client";

  const confirmDelivery = async () => {
    setBusy(true);
    try {
      await DeliveriesApi.confirm(id, {});
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header title={`Commande #${order.id.slice(0, 8)}`} onBack />
      <div style={{ padding: 18 }}>
        <div style={{ marginBottom: 14 }}>
          <StatusChip status={STATUS_VARIANT[order.status]} label={t(`order.status.${order.status}`)} />
        </div>

        <Card style={{ marginBottom: 14 }}>
          {model && <p style={{ margin: "0 0 4px", fontSize: 13 }}><strong>{model.name}</strong></p>}
          {fabric && <p style={{ margin: "0 0 4px", fontSize: 12 }}>Tissu: {fabric.name}</p>}
          <p style={{ margin: "0 0 4px", fontSize: 12 }}>Réception: {t(`order.${order.reception_mode}`)}</p>
          {order.desired_date && <p style={{ margin: 0, fontSize: 12 }}>Date souhaitée: {order.desired_date}</p>}
          {order.agreed_price && <p style={{ margin: "8px 0 0", fontWeight: 700 }}>{formatFcfa(order.agreed_price)}</p>}
        </Card>

        {measurement && (
          <Card style={{ marginBottom: 14 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700 }}>{t("profile.myMeasurements")}</p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
              {Object.entries(measurement.data)
                .filter(([k]) => k !== "height_total")
                .map(([k, v]) => `${k}: ${v}cm`)
                .join(" · ")}
            </p>
          </Card>
        )}

        {!quote && isTailor && order.status === "new" && (
          <Button fullWidth onClick={() => navigate(`${base}/orders/${id}/quote`)} style={{ marginBottom: 10 }}>
            {t("tailor.orders.respond")}
          </Button>
        )}
        {!quote && isClient && <p style={{ fontSize: 12, color: "#6B7280" }}>En attente du devis du tailleur.</p>}

        {quote && (
          <div style={{ marginBottom: 14 }}>
            <QuoteCard quote={quote} />
            {!quote.accepted && isClient && (
              <Button
                fullWidth
                style={{ marginTop: 10 }}
                onClick={async () => {
                  await OrdersApi.acceptQuote(id);
                  load();
                }}
              >
                {t("quote.accept")}
              </Button>
            )}
          </div>
        )}

        {quote?.accepted && !depositPaid && isClient && (
          <Button fullWidth onClick={() => navigate(`/client/orders/${id}/payment`)} style={{ marginBottom: 10 }}>
            {t("payment.title")}
          </Button>
        )}

        {split && (
          <PriceSummary total={split.total} deposit={split.deposit_70} balance={split.balance_30} showEscrowNote />
        )}

        {depositPaid && isTailor && (
          <Button variant="secondary" fullWidth onClick={() => navigate(`/tailor/orders/${id}/pattern`)} style={{ marginTop: 10 }}>
            Voir le patron
          </Button>
        )}

        {depositPaid && order.status === "in_progress" && isClient && (
          <Button fullWidth disabled={busy} onClick={confirmDelivery} style={{ marginTop: 10 }}>
            Confirmer la livraison
          </Button>
        )}

        {depositPaid && isTailor && order.status === "new" && (
          <Button
            variant="secondary"
            fullWidth
            style={{ marginTop: 10 }}
            onClick={async () => {
              await OrdersApi.setStatus(id, "in_progress");
              load();
            }}
          >
            Démarrer la confection
          </Button>
        )}

        {order.status === "finished_delivered" && isClient && (
          <Button variant="secondary" fullWidth style={{ marginTop: 10 }} onClick={() => navigate(`/client/orders/${id}/review`)}>
            {t("review.title")}
          </Button>
        )}

        <Button variant="secondary" fullWidth style={{ marginTop: 10 }} onClick={() => navigate(`${base}/orders/${id}/chat`)}>
          {t("chat.title")}
        </Button>
        <Button variant="text" fullWidth style={{ marginTop: 6 }} onClick={() => navigate(`${base}/orders/${id}/negotiation`)}>
          {t("negotiation.title")}
        </Button>

        {depositPaid && !order.dispute_status && order.status !== "finished_delivered" && (
          <Button
            variant="text"
            fullWidth
            style={{ marginTop: 6, color: "#DC2626" }}
            onClick={async () => {
              await OrdersApi.openDispute(id, "Signalé depuis l'application.");
              load();
            }}
          >
            Signaler un litige
          </Button>
        )}
        {order.dispute_status === "open" && <p style={{ fontSize: 12, color: "#D97706", textAlign: "center" }}>Litige en cours d'examen par l'administrateur.</p>}
      </div>
    </div>
  );
}
