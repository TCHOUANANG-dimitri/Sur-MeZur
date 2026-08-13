import { useRouter } from "expo-router";
import {
  BadgeCheck,
  Bell,
  BellRing,
  CheckCircle2,
  FileText,
  Package,
  Pencil,
  Ruler,
  Scissors,
  ShieldAlert,
  XCircle,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NotificationsApi } from "../../api/endpoints";
import type { Notification } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { EmptyState, Header, Spinner } from "../../components/Misc";
import { Screen } from "../../components/Screen";
import { useTheme, useThemedStyles } from "../../theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../theme/tokens";

/** `verification_decided` porte le résultat (approuvé/refusé) dans son
 *  payload : un libellé unique pour les deux issues aurait laissé le
 *  tailleur deviner s'il doit se réjouir ou resoumettre. */
function getNotifMeta(t: (key: string) => string, n: Notification): { Icon: typeof Bell; label: string } {
  if (n.type === "verification_decided") {
    const approved = (n.payload as { status?: string })?.status === "approved";
    return {
      Icon: approved ? BadgeCheck : XCircle,
      label: approved ? t("notifications.verificationApproved") : t("notifications.verificationRejected"),
    };
  }
  const meta: Record<string, { Icon: typeof Bell; label: string }> = {
    order_received: { Icon: Package, label: t("notifications.newOrder") },
    quote_received: { Icon: FileText, label: t("notifications.quoteReceived") },
    quote_accepted: { Icon: FileText, label: t("notifications.quoteAccepted") },
    modification_proposed: { Icon: Pencil, label: t("notifications.modificationProposed") },
    verification_submitted: { Icon: ShieldAlert, label: t("notifications.verificationSubmitted") },
    delivery_confirmed: { Icon: CheckCircle2, label: t("notifications.deliveryConfirmed") },
    order_in_progress: { Icon: Scissors, label: t("notifications.confectionStarted") },
    order_ready_for_pickup: { Icon: BellRing, label: t("notifications.orderReady") },
    order_delivered: { Icon: CheckCircle2, label: t("notifications.orderDelivered") },
    order_not_delivered: { Icon: XCircle, label: t("notifications.orderNotDelivered") },
    measurement_ready: { Icon: Ruler, label: t("notifications.measurementsReady") },
    measurement_failed: { Icon: XCircle, label: t("notifications.analysisFailed") },
  };
  return meta[n.type] || { Icon: Bell, label: n.type };
}

export function NotificationsScreen({ base }: { base: "client" | "tailor" | "admin" }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { t, lang } = useI18n();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    NotificationsApi.list().then((list) => {
      setNotifications(list);
      if (list.some((n) => !n.read_at)) NotificationsApi.markAllRead().catch(() => {});
    });
  }, []);

  const openNotification = (n: Notification) => {
    if (n.type === "measurement_ready" && base === "client") {
      router.push("/client/my-measurements");
      return;
    }
    if (n.type === "measurement_failed" && base === "client") {
      router.push("/client/measurements");
      return;
    }
    if (n.type === "verification_submitted" && base === "admin") {
      router.push("/admin/(tabs)/verifications");
      return;
    }
    if (n.type === "verification_decided" && base === "tailor") {
      router.push("/tailor/verification");
      return;
    }
    const orderId = (n.payload as { order_id?: string })?.order_id;
    if (orderId) router.push(`/${base}/orders/${orderId}`);
  };

  if (!notifications) return <Spinner />;

  return (
    <Screen>
      <Header title={t("notifications.title")} showBack />
      <View style={{ padding: 18 }}>
        {notifications.length === 0 ? (
          <EmptyState text={t("common.noNotifications")} />
        ) : (
          notifications.map((n) => {
            const meta = getNotifMeta(t, n);
            const Icon = meta.Icon;
            return (
              <TouchableOpacity key={n.id} style={styles.row} onPress={() => openNotification(n)} activeOpacity={0.7}>
                <View style={[styles.iconWrap, !n.read_at && styles.iconWrapUnread]}>
                  <Icon size={18} color={n.read_at ? colors.textSecondary : colors.violetPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{meta.label}</Text>
                  <Text style={styles.time}>{new Date(n.created_at).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</Text>
                </View>
                {!n.read_at && <View style={styles.dot} />}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapUnread: {
    backgroundColor: "#EDE9FE",
  },
  label: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.indigoText },
  time: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: fonts.body },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.violetPrimary },
});
