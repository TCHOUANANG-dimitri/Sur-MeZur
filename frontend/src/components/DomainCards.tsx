import React from "react";
import { formatFcfa, useI18n } from "../i18n/I18nProvider";
import type { Quote } from "../api/types";
import { Card } from "./Card";
import { colors } from "../theme/tokens";

export function PriceSummary({
  total,
  deposit,
  balance,
  showEscrowNote,
}: {
  total: number;
  deposit: number;
  balance: number;
  showEscrowNote?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <Row label="Total" value={formatFcfa(total)} bold />
      <Row label={t("payment.deposit")} value={formatFcfa(deposit)} />
      <Row label={t("payment.balance")} value={formatFcfa(balance)} />
      {showEscrowNote && (
        <p style={{ fontSize: 11, color: colors.textSecondary, marginTop: 8, marginBottom: 0 }}>
          {t("payment.escrowNote")}
        </p>
      )}
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: bold ? 15 : 13 }}>
      <span style={{ color: bold ? colors.indigoText : colors.textSecondary, fontWeight: bold ? 700 : 500 }}>
        {label}
      </span>
      <span style={{ fontWeight: bold ? 700 : 600, color: colors.indigoText }}>{value}</span>
    </div>
  );
}

const MEASUREMENT_LABELS: Record<string, string> = {
  neck: "Cou",
  chest: "Poitrine",
  waist: "Taille",
  hips: "Hanches",
  shoulder: "Épaules",
  sleeve: "Manche",
  back_length: "Dos",
  inseam: "Entrejambe",
  outseam: "Long. jambe",
  biceps: "Biceps",
  wrist: "Poignet",
  thigh: "Cuisse",
  ankle: "Cheville",
  height_total: "Hauteur totale",
};

export function MeasurementRow({
  measureKey,
  value,
  editable,
  onChange,
}: {
  measureKey: string;
  value: number;
  editable?: boolean;
  onChange?: (v: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <span style={{ fontSize: 13, color: colors.indigoText }}>
        {MEASUREMENT_LABELS[measureKey] || measureKey}
      </span>
      {editable ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
          style={{
            width: 70,
            textAlign: "right",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: "4px 8px",
            fontSize: 13,
          }}
        />
      ) : (
        <span style={{ fontSize: 13, fontWeight: 700 }}>{value.toFixed(1)} cm</span>
      )}
    </div>
  );
}

export function QuoteCard({ quote }: { quote: Quote }) {
  const { t } = useI18n();
  return (
    <Card>
      <h4 style={{ margin: "0 0 10px" }}>{t("quote.title")}</h4>
      {quote.line_items.map((li, i) => (
        <Row key={i} label={li.label} value={formatFcfa(li.amount)} />
      ))}
      <div style={{ borderTop: `1px dashed ${colors.border}`, margin: "8px 0" }} />
      <Row label="Total" value={formatFcfa(quote.total)} bold />
      <Row label={`${t("quote.commission")} (${(quote.commission_rate * 100).toFixed(0)}%)`} value={`- ${formatFcfa(quote.commission_amount)}`} />
      <Row label={t("quote.net")} value={formatFcfa(quote.net_to_tailor)} bold />
    </Card>
  );
}

export function ChatBubble({ mine, body, kind, time }: { mine: boolean; body: string; kind: "text" | "modification" | "system"; time?: string }) {
  const isSystem = kind === "system";
  return (
    <div style={{ display: "flex", justifyContent: isSystem ? "center" : mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
      <div
        style={{
          maxWidth: isSystem ? "90%" : "78%",
          background: isSystem ? colors.backgroundAlt : mine ? colors.violetPrimary : colors.white,
          color: isSystem ? colors.textSecondary : mine ? colors.white : colors.indigoText,
          border: isSystem ? "none" : mine ? "none" : `1px solid ${colors.border}`,
          borderRadius: 14,
          padding: "9px 13px",
          fontSize: 13,
          fontStyle: isSystem ? "italic" : "normal",
          textAlign: isSystem ? "center" : "left",
        }}
      >
        {kind === "modification" && (
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 4, opacity: 0.8 }}>
            Modification proposée
          </div>
        )}
        {body}
        {time && (
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4, textAlign: "right" }}>
            {new Date(time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
    </div>
  );
}
