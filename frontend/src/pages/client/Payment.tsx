import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { OrdersApi, PaymentsApi } from "../../api/endpoints";
import type { Quote } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header, ErrorBanner, Field, inputStyle, Spinner } from "../../components/Misc";
import { ApiError } from "../../api/client";
import { colors } from "../../theme/tokens";

export default function Payment() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [provider, setProvider] = useState<"mtn_momo" | "orange_money">("mtn_momo");
  const [phone, setPhone] = useState("+237670000000");
  const [status, setStatus] = useState<"form" | "pending" | "paid" | "error">("form");
  const [error, setError] = useState("");

  useEffect(() => {
    OrdersApi.getQuote(id).then(setQuote);
  }, [id]);

  const pay = async () => {
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
    <div>
      <Header title={t("payment.title")} onBack />
      <div style={{ padding: 18 }}>
        {error && <ErrorBanner message={error} />}
        <Card style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: colors.textSecondary }}>Total</p>
          <p style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700 }}>{formatFcfa(quote.total)}</p>
          <p style={{ margin: 0, fontSize: 13 }}>{t("payment.deposit")}: <strong>{formatFcfa(deposit)}</strong></p>
          <p style={{ margin: "4px 0 0", fontSize: 13 }}>{t("payment.balance")}: <strong>{formatFcfa(balance)}</strong></p>
          <p style={{ fontSize: 11, color: colors.textSecondary, marginTop: 10, marginBottom: 0 }}>{t("payment.escrowNote")}</p>
        </Card>

        {status === "form" && (
          <>
            <Field label={t("payment.chooseProvider")}>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant={provider === "mtn_momo" ? "primary" : "secondary"} onClick={() => setProvider("mtn_momo")} style={{ flex: 1 }}>
                  MTN MoMo
                </Button>
                <Button variant={provider === "orange_money" ? "primary" : "secondary"} onClick={() => setProvider("orange_money")} style={{ flex: 1 }}>
                  Orange Money
                </Button>
              </div>
            </Field>
            <Field label={t("payment.phone")}>
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Button fullWidth onClick={pay}>
              {t("payment.pay")} ({formatFcfa(deposit)})
            </Button>
          </>
        )}

        {status === "pending" && <Spinner label="Confirmation Mobile Money en cours…" />}

        {status === "paid" && (
          <>
            <p style={{ textAlign: "center", color: "#16A34A", fontWeight: 700 }}>✓ Paiement confirmé</p>
            <Button fullWidth onClick={() => navigate(`/client/orders/${id}`)}>
              {t("common.confirm")}
            </Button>
          </>
        )}

        {status === "error" && (
          <Button fullWidth onClick={() => setStatus("form")}>
            {t("common.retry")}
          </Button>
        )}
      </div>
    </div>
  );
}
