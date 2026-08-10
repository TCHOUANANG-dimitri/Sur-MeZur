import { useFocusEffect, useRouter } from "expo-router";
import { CalendarClock, ChevronRight, Inbox, Loader, Star, Wallet } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NotificationsApi, OrdersApi, TailorsApi } from "../../../src/api/endpoints";
import type { Notification, Order, Review, TailorProfile } from "../../../src/api/types";
import { NotifBell, VerificationBadge } from "../../../src/components/Badges";
import { Card } from "../../../src/components/Card";
import { StatusChip } from "../../../src/components/Chip";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Stars } from "../../../src/components/Stars";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";
import { dueLabel, formatDate } from "../../../src/utils/dates";

const STATUS_VARIANT: Record<string, "success" | "error" | "pending" | "neutral"> = {
  new: "pending",
  in_progress: "neutral",
  ready_for_pickup: "pending",
  finished_delivered: "success",
  finished_not_delivered: "error",
};

export default function Dashboard() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useFocusEffect(
    useCallback(() => {
      TailorsApi.me().then((p) => {
        setProfile(p);
        if (p?.id) TailorsApi.reviews(p.id).then(setReviews).catch(() => {});
      });
      OrdersApi.list().then(setOrders);
      NotificationsApi.list().then(setNotifs).catch(() => {});
    }, [])
  );

  if (!orders) return <Spinner />;

  const now = new Date();
  const newOrders = orders.filter((o) => o.status === "new");
  const inProgress = orders.filter((o) => o.status === "in_progress");
  const monthRevenue = orders
    .filter((o) => o.status === "finished_delivered" && new Date(o.created_at).getMonth() === now.getMonth())
    .reduce((sum, o) => sum + (o.agreed_price || 0), 0);

  // Star distribution, 5 → 1, for the ratings breakdown.
  const distribution = [5, 4, 3, 2, 1].map((s) => ({
    stars: s,
    count: reviews.filter((r) => r.stars === s).length,
  }));
  const maxCount = Math.max(1, ...distribution.map((d) => d.count));

  // Awaiting collection still counts as open work for the tailor: it stays in
  // the queue until the client actually picks it up.
  const readyForPickup = orders.filter((o) => o.status === "ready_for_pickup");

  /** Orders needing attention first: new, then those with the nearest due date. */
  const upcoming = [...newOrders, ...inProgress, ...readyForPickup]
    .sort((a, b) => {
      if (!a.desired_date) return 1;
      if (!b.desired_date) return -1;
      return a.desired_date.localeCompare(b.desired_date);
    })
    .slice(0, 6);

  return (
    <Screen>
      <Header
        title={t("nav.dashboard")}
        right={
          <NotifBell
            count={notifs.filter((n) => !n.read_at).length}
            onPress={() => router.push("/tailor/notifications")}
          />
        }
      />
      <View style={{ padding: 18 }}>
        {profile && profile.verification_status !== "approved" && (
          <Card style={{ marginBottom: 14, backgroundColor: colors.pendingBg, borderWidth: 0 }}>
            <Text style={styles.pendingText}>{t("tailor.verification.pending")}</Text>
          </Card>
        )}

        <View style={styles.grid}>
          <StatTile
            Icon={Inbox}
            label={t("tailor.dashboard.newOrders")}
            value={String(newOrders.length)}
            tone="pending"
            onPress={() => router.push("/tailor/(tabs)/orders")}
          />
          <StatTile
            Icon={Loader}
            label={t("tailor.dashboard.inProgress")}
            value={String(inProgress.length)}
            onPress={() => router.push("/tailor/(tabs)/orders")}
          />
          <StatTile
            Icon={Wallet}
            label={t("tailor.dashboard.revenue")}
            value={formatFcfa(monthRevenue)}
            onPress={() => router.push("/tailor/(tabs)/finances")}
          />
          <StatTile
            Icon={Star}
            label={t("tailor.dashboard.rating")}
            value={reviews.length > 0 ? (profile?.rating_avg || 0).toFixed(1) : "—"}
            hint={`${reviews.length} avis`}
          />
        </View>

        {/* Ratings breakdown — how many clients gave each score. */}
        {reviews.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <View style={styles.ratingHead}>
              <View>
                <Text style={styles.ratingBig}>{(profile?.rating_avg || 0).toFixed(1)}</Text>
                <Stars value={profile?.rating_avg || 0} />
              </View>
              <Text style={styles.ratingCount}>
                {reviews.length} avis client{reviews.length > 1 ? "s" : ""}
              </Text>
            </View>
            <View style={{ marginTop: 12, gap: 6 }}>
              {distribution.map((d) => (
                <View key={d.stars} style={styles.distRow}>
                  <Text style={styles.distStar}>{d.stars}</Text>
                  <Star size={11} color={colors.pending} fill={colors.pending} />
                  <View style={styles.distTrack}>
                    <View style={[styles.distFill, { width: `${(d.count / maxCount) * 100}%` }]} />
                  </View>
                  <Text style={styles.distCount}>{d.count}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>À traiter</Text>
          <TouchableOpacity onPress={() => router.push("/tailor/(tabs)/orders")} hitSlop={8}>
            <Text style={styles.seeAll}>Tout voir</Text>
          </TouchableOpacity>
        </View>

        {upcoming.length === 0 ? (
          <Text style={styles.hint}>Aucune commande en attente.</Text>
        ) : (
          upcoming.map((o) => {
            const due = dueLabel(o.desired_date, lang);
            const late = o.desired_date ? new Date(o.desired_date) < now : false;
            return (
              <Card key={o.id} onPress={() => router.push(`/tailor/orders/${o.id}`)} style={{ marginBottom: 8 }}>
                <View style={styles.orderTop}>
                  <Text style={styles.orderId}>#{o.id.slice(0, 8)}</Text>
                  <StatusChip status={STATUS_VARIANT[o.status]} label={t(`order.status.${o.status}`)} />
                </View>
                <View style={styles.dateRow}>
                  <CalendarClock size={13} color={colors.textSecondary} />
                  <Text style={styles.dateText}>
                    Passée le {formatDate(o.created_at, lang)} · Livraison {formatDate(o.desired_date, lang)}
                  </Text>
                </View>
                <View style={styles.orderBottom}>
                  <Text style={styles.orderPrice}>
                    {o.agreed_price ? formatFcfa(o.agreed_price) : "En négociation"}
                  </Text>
                  {due && (
                    <Text style={[styles.due, late && o.status !== "finished_delivered" && styles.dueLate]}>{due}</Text>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}

function StatTile({
  Icon,
  label,
  value,
  hint,
  tone,
  onPress,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "pending";
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Card onPress={onPress} style={{ width: "47%" }}>
      <View style={styles.tileHead}>
        <View style={[styles.tileIcon, tone === "pending" && { backgroundColor: colors.pendingBg }]}>
          <Icon size={15} color={tone === "pending" ? colors.pending : colors.violetPrimary} />
        </View>
        {onPress && <ChevronRight size={14} color={colors.textSecondary} />}
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </Card>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    pendingText: { fontSize: 12, color: colors.indigoText, fontFamily: fonts.body },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    tileIcon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      backgroundColor: colors.violetTint,
      alignItems: "center",
      justifyContent: "center",
    },
    statLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 2 },
    statHint: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 3 },
    statValue: { fontSize: 20, fontFamily: fonts.bodyBold, color: colors.indigoText },
    ratingHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    ratingBig: { fontSize: 26, fontFamily: fonts.bodyBold, color: colors.indigoText },
    ratingCount: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
    distRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    distStar: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.bodySemiBold, width: 8 },
    distTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.backgroundAlt, overflow: "hidden" },
    distFill: { height: 6, borderRadius: 3, backgroundColor: colors.violetPrimary },
    distCount: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, width: 18, textAlign: "right" },
    sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 10 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.indigoText },
    seeAll: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.violetPrimary },
    hint: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
    orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    orderId: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
    dateText: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, flexShrink: 1 },
    orderBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
    orderPrice: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.indigoText },
    due: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textSecondary },
    dueLate: { color: colors.error },
  });
