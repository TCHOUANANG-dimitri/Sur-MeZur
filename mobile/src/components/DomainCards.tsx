import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { formatFcfa, useI18n } from "../i18n/I18nProvider";
import type { Quote } from "../api/types";
import { Card } from "./Card";
import { useThemedStyles } from "../theme/ThemeProvider";
import { fonts, type ThemeColors } from "../theme/tokens";

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.rowLabelBold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  );
}

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
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  return (
    <Card>
      <Row label="Total" value={formatFcfa(total)} bold />
      <Row label={t("payment.deposit")} value={formatFcfa(deposit)} />
      <Row label={t("payment.balance")} value={formatFcfa(balance)} />
      {showEscrowNote && <Text style={styles.note}>{t("payment.escrowNote")}</Text>}
    </Card>
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
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.measureRow}>
      <Text style={styles.measureLabel}>{MEASUREMENT_LABELS[measureKey] || measureKey}</Text>
      {editable ? (
        <TextInput
          keyboardType="numeric"
          value={String(value)}
          onChangeText={(v) => onChange?.(parseFloat(v) || 0)}
          style={styles.measureInput}
        />
      ) : (
        <Text style={styles.measureValue}>{value.toFixed(1)} cm</Text>
      )}
    </View>
  );
}

export function QuoteCard({ quote }: { quote: Quote }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  return (
    <Card>
      <Text style={styles.quoteTitle}>{t("quote.title")}</Text>
      {quote.line_items.map((li, i) => (
        <Row key={i} label={li.label} value={formatFcfa(li.amount)} />
      ))}
      <View style={styles.divider} />
      <Row label="Total" value={formatFcfa(quote.total)} bold />
      <Row
        label={`${t("quote.commission")} (${(quote.commission_rate * 100).toFixed(0)}%)`}
        value={`- ${formatFcfa(quote.commission_amount)}`}
      />
      <Row label={t("quote.net")} value={formatFcfa(quote.net_to_tailor)} bold />
    </Card>
  );
}

export function ChatBubble({
  mine,
  body,
  kind,
  time,
}: {
  mine: boolean;
  body: string;
  kind: "text" | "modification" | "system";
  time?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const isSystem = kind === "system";
  return (
    <View
      style={[
        styles.bubbleRow,
        { justifyContent: isSystem ? "center" : mine ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubble,
          isSystem ? styles.bubbleSystem : mine ? styles.bubbleMine : styles.bubbleTheirs,
        ]}
      >
        {kind === "modification" && <Text style={styles.bubbleKicker}>Modification proposée</Text>}
        <Text style={[styles.bubbleText, isSystem ? styles.bubbleTextSystem : mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
          {body}
        </Text>
        {time && (
          <Text style={[styles.bubbleTime, mine && !isSystem && { color: "rgba(255,255,255,0.7)" }]}>
            {new Date(time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  rowLabel: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
  rowLabelBold: { fontSize: 15, color: colors.indigoText, fontFamily: fonts.bodyBold },
  rowValue: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.indigoText },
  rowValueBold: { fontSize: 15, fontFamily: fonts.bodyBold },
  note: { fontSize: 11, color: colors.textSecondary, marginTop: 8, fontFamily: fonts.body },
  measureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  measureLabel: { fontSize: 13, color: colors.indigoText, fontFamily: fonts.body },
  measureValue: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  measureInput: {
    width: 70,
    textAlign: "right",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.indigoText,
  },
  quoteTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.indigoText, marginBottom: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed", marginVertical: 8 },
  bubbleRow: { flexDirection: "row", marginBottom: 10 },
  bubble: { maxWidth: "78%", borderRadius: 14, paddingVertical: 9, paddingHorizontal: 13 },
  bubbleMine: { backgroundColor: colors.violetPrimary },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleSystem: { backgroundColor: colors.backgroundAlt, maxWidth: "90%" },
  bubbleKicker: {
    fontSize: 10,
    fontFamily: fonts.bodyBold,
    textTransform: "uppercase",
    opacity: 0.8,
    marginBottom: 4,
    color: colors.indigoText,
  },
  bubbleText: { fontSize: 13, fontFamily: fonts.body },
  bubbleTextMine: { color: colors.white },
  bubbleTextTheirs: { color: colors.indigoText },
  bubbleTextSystem: { color: colors.textSecondary, fontStyle: "italic", textAlign: "center" },
  bubbleTime: { fontSize: 9, opacity: 0.6, marginTop: 4, textAlign: "right", color: colors.textSecondary },
});
