import { useFocusEffect } from "expo-router";
import { Lock, LockOpen, MessageSquare, Ruler, Shirt } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { OrdersApi, PaymentsApi, TailorsApi } from "../../../src/api/endpoints";
import type { Order, PaymentSplit, Review } from "../../../src/api/types";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Stars } from "../../../src/components/Stars";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";
import { formatDate } from "../../../src/utils/dates";

type Period = "week" | "month" | "year";

function inPeriod(dateStr: string, period: Period): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "week") return d >= new Date(now.getTime() - 7 * 86400000);
  if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear();
}

/**
 * What the tailor actually receives on an order, per the 40/30/30 split.
 * Ready-to-wear sales don't always carry a split (direct sale, no staged
 * payment), so fall back to the agreed price — otherwise they'd silently
 * vanish from the tailor's revenue.
 */
function earnedFor(order: Order, split: PaymentSplit | undefined): number {
  if (split) return split.tailor_immediate_40 + split.escrow_30 + split.balance_30;
  return order.agreed_price || 0;
}

export default function Finances() {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [period, setPeriod] = useState<Period>("month");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [splits, setSplits] = useState<Record<string, PaymentSplit>>({});
  const [reviews, setReviews] = useState<Review[]>([]);

  useFocusEffect(
    useCallback(() => {
      TailorsApi.me().then((p) => {
        if (p?.id) TailorsApi.reviews(p.id).then(setReviews).catch(() => {});
      });
      OrdersApi.list().then(async (list) => {
        setOrders(list);
        const entries = await Promise.all(
          list.map(async (o) => {
            try {
              return [o.id, await PaymentsApi.split(o.id)] as const;
            } catch {
              return null;
            }
          })
        );
        const map: Record<string, PaymentSplit> = {};
        entries.forEach((e) => e && (map[e[0]] = e[1]));
        setSplits(map);
      });
    }, [])
  );

  if (!orders) return <Spinner />;

  // Finances are about work actually delivered — no longer gated on a payment
  // split existing, which used to hide ready-to-wear sales entirely.
  const delivered = orders
    .filter((o) => o.status === "finished_delivered" && inPeriod(o.created_at, period))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = delivered.reduce((s, o) => s + earnedFor(o, splits[o.id]), 0);
  const customTotal = delivered
    .filter((o) => o.type !== "ready_to_wear")
    .reduce((s, o) => s + earnedFor(o, splits[o.id]), 0);
  const rtwTotal = delivered
    .filter((o) => o.type === "ready_to_wear")
    .reduce((s, o) => s + earnedFor(o, splits[o.id]), 0);
  const rtwCount = delivered.filter((o) => o.type === "ready_to_wear").length;

  const pending = delivered
    .filter((o) => splits[o.id] && splits[o.id].escrow_status !== "released")
    .reduce((s, o) => s + splits[o.id].escrow_30, 0);

  const reviewFor = (orderId: string) => reviews.find((r) => r.order_id === orderId);
  const rated = delivered.filter((o) => reviewFor(o.id));
  const avgStars = rated.length
    ? rated.reduce((s, o) => s + (reviewFor(o.id)?.stars || 0), 0) / rated.length
    : 0;

  return (
    <Screen scroll={false}>
      <Header title={t("tailor.finances.title")} />
      <View style={styles.periodRow}>
        <Chip label="Semaine" active={period === "week"} onPress={() => setPeriod("week")} />
        <Chip label="Mois" active={period === "month"} onPress={() => setPeriod("month")} />
        <Chip label="Année" active={period === "year"} onPress={() => setPeriod("year")} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 10 }}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.totalLabel}>Gains sur la période</Text>
          <Text style={styles.total}>{formatFcfa(total)}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{delivered.length}</Text>
              <Text style={styles.summaryLabel}>commande{delivered.length > 1 ? "s" : ""} livrée{delivered.length > 1 ? "s" : ""}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{rated.length > 0 ? avgStars.toFixed(1) : "—"}</Text>
              <Text style={styles.summaryLabel}>note moyenne</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatFcfa(pending)}</Text>
              <Text style={styles.summaryLabel}>en séquestre</Text>
            </View>
          </View>
        </Card>

        {/* Split by origin so the tailor sees what stock sales bring in versus
            made-to-measure work. */}
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.detailTitle}>Répartition</Text>
          <View style={styles.breakRow}>
            <View style={styles.breakLabelWrap}>
              <Ruler size={13} color={colors.violetPrimary} />
              <Text style={styles.breakLabel}>Sur mesure</Text>
            </View>
            <Text style={styles.breakValue}>{formatFcfa(customTotal)}</Text>
          </View>
          <View style={styles.breakRow}>
            <View style={styles.breakLabelWrap}>
              <Shirt size={13} color={colors.violetPrimary} />
              <Text style={styles.breakLabel}>
                Prêt-à-porter{rtwCount > 0 ? ` (${rtwCount})` : ""}
              </Text>
            </View>
            <Text style={styles.breakValue}>{formatFcfa(rtwTotal)}</Text>
          </View>
        </Card>

        {delivered.length === 0 ? (
          <EmptyState text="Aucune commande livrée sur cette période." />
        ) : (
          delivered.map((o) => {
            const split = splits[o.id];
            const review = reviewFor(o.id);
            const released = split?.escrow_status === "released";
            const isRtw = o.type === "ready_to_wear";
            return (
              <Card key={o.id} style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <Text style={styles.orderId}>#{o.id.slice(0, 8)}</Text>
                  <Text style={styles.orderTotal}>{formatFcfa(earnedFor(o, split))}</Text>
                </View>
                <View style={styles.typeRow}>
                  {isRtw ? (
                    <Shirt size={11} color={colors.textSecondary} />
                  ) : (
                    <Ruler size={11} color={colors.textSecondary} />
                  )}
                  <Text style={styles.date}>
                    {isRtw ? "Prêt-à-porter" : "Sur mesure"} · Livrée {formatDate(o.created_at, lang)}
                  </Text>
                </View>

                <View style={styles.ratingRow}>
                  {review ? (
                    <>
                      <Stars value={review.stars} />
                      <Text style={styles.ratingText}>{review.stars}/5</Text>
                    </>
                  ) : (
                    <Text style={styles.noRating}>Pas encore noté par le client</Text>
                  )}
                </View>

                {review?.comment ? (
                  <View style={styles.commentWrap}>
                    <MessageSquare size={12} color={colors.textSecondary} />
                    <Text style={styles.comment} numberOfLines={3}>
                      {review.comment}
                    </Text>
                  </View>
                ) : null}

                {split && (
                  <View style={styles.escrowRow}>
                    {released ? (
                      <LockOpen size={12} color={colors.success} />
                    ) : (
                      <Lock size={12} color={colors.pending} />
                    )}
                    <Text style={[styles.escrowText, { color: released ? colors.success : colors.pending }]}>
                      {released
                        ? `Séquestre libéré (${formatFcfa(split.escrow_30)})`
                        : `${formatFcfa(split.escrow_30)} en séquestre`}
                    </Text>
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    periodRow: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingTop: 14 },
    totalLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
    total: { fontSize: 26, fontFamily: fonts.bodyBold, color: colors.indigoText, marginTop: 2 },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    summaryItem: { flex: 1, alignItems: "center" },
    summaryDivider: { width: 1, height: 26, backgroundColor: colors.border },
    summaryValue: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.indigoText },
    summaryLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, textAlign: "center", marginTop: 2 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    orderId: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
    orderTotal: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
    date: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
    typeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
    detailTitle: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.indigoText, marginBottom: 10 },
    breakRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5 },
    breakLabelWrap: { flexDirection: "row", alignItems: "center", gap: 7 },
    breakLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
    breakValue: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
    ratingText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.indigoText },
    noRating: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, fontStyle: "italic" },
    commentWrap: { flexDirection: "row", gap: 6, marginTop: 8, alignItems: "flex-start" },
    comment: { flex: 1, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, lineHeight: 17 },
    escrowRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 },
    escrowText: { fontSize: 11, fontFamily: fonts.bodySemiBold },
  });
