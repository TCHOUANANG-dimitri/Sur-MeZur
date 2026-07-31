import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { OrdersApi } from "../../api/endpoints";
import type { Offer } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StatusChip } from "../../components/Chip";
import { Header, Field, inputStyle, Spinner } from "../../components/Misc";

export default function Negotiation() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [amount, setAmount] = useState(0);
  const [delay, setDelay] = useState(10);
  const [busy, setBusy] = useState(false);

  const load = () => OrdersApi.offers(id).then(setOffers);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!offers) return <Spinner />;

  const last = offers[offers.length - 1];
  const canRespond = last && last.status === "pending" && last.actor !== user?.role;
  const roundsLeft = 3 - (last?.round || 0);

  const counterOffer = async () => {
    setBusy(true);
    try {
      await OrdersApi.createOffer(id, { actor: user!.role as "client" | "tailor", amount, delay_days: delay });
      load();
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!last) return;
    setBusy(true);
    try {
      await OrdersApi.acceptOffer(id, last.id);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header title={t("negotiation.title")} onBack />
      <div style={{ padding: 18 }}>
        {offers.map((o) => (
          <Card key={o.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>
                {t(`role.${o.actor}`)} · round {o.round}
              </strong>
              <StatusChip
                status={o.status === "accepted" ? "success" : o.status === "refused" || o.status === "expired" ? "error" : "pending"}
                label={o.status}
              />
            </div>
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{formatFcfa(o.amount)}</p>
            {o.delay_days && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6B7280" }}>Délai: {o.delay_days} j</p>}
          </Card>
        ))}

        {last?.status === "accepted" && <p style={{ fontSize: 13, color: "#16A34A" }}>Offre validée ✓</p>}

        {last?.status === "pending" && (
          <>
            {canRespond && (
              <Button fullWidth disabled={busy} onClick={accept} style={{ marginBottom: 10 }}>
                {t("negotiation.accept")} ({formatFcfa(last.amount)})
              </Button>
            )}
            {roundsLeft > 0 ? (
              <>
                <Field label={t("order.priceOffer")}>
                  <input type="number" style={inputStyle} value={amount || last.amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} />
                </Field>
                <Field label="Délai (jours)">
                  <input type="number" style={inputStyle} value={delay} onChange={(e) => setDelay(parseInt(e.target.value) || 0)} />
                </Field>
                <Button variant="secondary" fullWidth disabled={busy} onClick={counterOffer}>
                  {t("negotiation.counterOffer")}
                </Button>
              </>
            ) : (
              <p style={{ fontSize: 12, color: "#6B7280" }}>Plafond de 3 propositions atteint (RG-05).</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
