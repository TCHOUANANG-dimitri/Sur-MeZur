import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { OrdersApi } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header, ErrorBanner, Field, inputStyle } from "../../components/Misc";
import { colors } from "../../theme/tokens";

// Mirrors CDC §10.1 for the live preview; the server is authoritative.
function previewCommission(total: number) {
  if (total <= 15000) return 0.1;
  if (total <= 50000) return 0.08;
  if (total <= 150000) return 0.06;
  return 0.05;
}

export default function QuoteForm() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [lineItems, setLineItems] = useState([{ label: "Tissu", amount: 0 }, { label: "Confection", amount: 0 }]);
  const [fabricMetrage, setFabricMetrage] = useState("");
  const [delayDays, setDelayDays] = useState(10);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const total = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
  const rate = previewCommission(total);
  const commission = Math.round(total * rate);

  const updateItem = (i: number, field: "label" | "amount", value: string) => {
    setLineItems((items) =>
      items.map((it, idx) => (idx === i ? { ...it, [field]: field === "amount" ? parseFloat(value) || 0 : value } : it))
    );
  };

  const submit = async () => {
    setError("");
    if (total <= 0) {
      setError("Ajoutez au moins un poste de coût.");
      return;
    }
    setBusy(true);
    try {
      await OrdersApi.createQuote(id, { line_items: lineItems, fabric_metrage: fabricMetrage, delay_days: delayDays });
      navigate(`/tailor/orders/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header title={t("tailor.orders.respond")} onBack />
      <div style={{ padding: 18 }}>
        {error && <ErrorBanner message={error} />}
        <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t("tailor.quote.lineItems")}</p>
        {lineItems.map((li, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input style={{ ...inputStyle, flex: 2 }} value={li.label} onChange={(e) => updateItem(i, "label", e.target.value)} />
            <input
              type="number"
              style={{ ...inputStyle, flex: 1 }}
              value={li.amount || ""}
              onChange={(e) => updateItem(i, "amount", e.target.value)}
            />
          </div>
        ))}
        <Button variant="text" onClick={() => setLineItems((items) => [...items, { label: "", amount: 0 }])}>
          + Ajouter un poste
        </Button>

        <Field label="Métrage tissu">
          <input style={inputStyle} value={fabricMetrage} onChange={(e) => setFabricMetrage(e.target.value)} placeholder="ex: 2.5m" />
        </Field>
        <Field label={t("tailor.quote.delay")}>
          <input type="number" style={inputStyle} value={delayDays} onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)} />
        </Field>

        <Card style={{ marginBottom: 16 }}>
          <Row label="Total" value={formatFcfa(total)} />
          <Row label={`Commission (${(rate * 100).toFixed(0)}%)`} value={`- ${formatFcfa(commission)}`} />
          <Row label={t("quote.net")} value={formatFcfa(total - commission)} bold />
        </Card>

        <Button fullWidth disabled={busy} onClick={submit}>
          {t("tailor.quote.submit")}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: bold ? 14 : 12 }}>
      <span style={{ color: colors.textSecondary }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
