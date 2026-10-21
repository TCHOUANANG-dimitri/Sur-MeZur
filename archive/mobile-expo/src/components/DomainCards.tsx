import React, { useEffect, useState } from "react";
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
      <Row label={t("common.total")} value={formatFcfa(total)} bold />
      <Row label={t("payment.deposit")} value={formatFcfa(deposit)} />
      <Row label={t("payment.balance")} value={formatFcfa(balance)} />
      {showEscrowNote && <Text style={styles.note}>{t("payment.escrowNote")}</Text>}
    </Card>
  );
}

/** Les libellés vivent dans les dictionnaires de traduction (`measure.*`) :
 *  codés en dur ici, ils restaient en français quelle que soit la langue
 *  choisie. Une clé sans traduction retombe sur la clé technique, ce qui la
 *  rend visible plutôt que silencieuse — c'est ainsi qu'on a repéré
 *  `sleeve_length`, renvoyé par le serveur mais absent de l'ancienne table. */

export function MeasurementRow({
  measureKey,
  value,
  editable,
  onChange,
  unit = "cm",
  labelPrefix = "measure",
  confidence,
}: {
  measureKey: string;
  value: number;
  editable?: boolean;
  onChange?: (v: number) => void;
  /** `weight_kg` est la seule entrée du modèle en kilos ; tout le reste (y
   *  compris `stature_m`, en centimètres malgré son nom de colonne ANSUR)
   *  est en centimètres. */
  unit?: "cm" | "kg";
  /** Les entrées brutes du modèle (`feature.*`) partagent des clés avec les
   *  mesures finales (ex. `hipbreadth` vs `hips`) : un préfixe distinct évite
   *  toute collision de traduction entre les deux tables. */
  labelPrefix?: "measure" | "feature";
  /** Score 0-1 renvoyé par le serveur pour cette mesure précise — jusqu'ici
   *  calculé mais jamais montré au client, qui n'avait aucun moyen de savoir
   *  qu'une valeur était moins fiable qu'une autre. */
  confidence?: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  // Texte local plutôt que `value` directement : sinon effacer le champ pour
  // taper une nouvelle valeur repassait par `parseFloat("") || 0`, qui
  // écrasait silencieusement la mesure à 0 le temps de la frappe suivante.
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const handleChange = (v: string) => {
    setText(v);
    const parsed = parseFloat(v);
    // Rien n'est propagé tant que le champ ne contient pas un nombre valide
    // (vide, "-", "1." en cours de frappe) : la dernière valeur connue reste
    // la valeur réelle jusqu'à ce que l'utilisateur en tape une nouvelle.
    if (v.trim() !== "" && Number.isFinite(parsed)) {
      onChange?.(parsed);
    }
  };

  return (
    <View style={styles.measureRow}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.measureLabel}>{t(`${labelPrefix}.${measureKey}`)}</Text>
        {confidence !== undefined && (
          <Text style={styles.measureConfidence}>{Math.round(confidence * 100)}%</Text>
        )}
      </View>
      {editable ? (
        <TextInput
          keyboardType="numeric"
          value={text}
          onChangeText={handleChange}
          style={styles.measureInput}
        />
      ) : (
        <Text style={styles.measureValue}>{value.toFixed(1)} {unit}</Text>
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
      <Row label={t("common.total")} value={formatFcfa(quote.total)} bold />
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
  const { t, lang } = useI18n();
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
        {kind === "modification" && <Text style={styles.bubbleKicker}>{t("notifications.modificationProposed")}</Text>}
        <Text style={[styles.bubbleText, isSystem ? styles.bubbleTextSystem : mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
          {body}
        </Text>
        {time && (
          <Text style={[styles.bubbleTime, mine && !isSystem && { color: "rgba(255,255,255,0.7)" }]}>
            {new Date(time).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
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
  measureConfidence: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 1 },
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
