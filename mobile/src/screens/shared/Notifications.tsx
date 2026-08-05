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
  XCircle,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NotificationsApi } from "../../api/endpoints";
import type { Notification } from "../../api/types";
import { EmptyState, Header, Spinner } from "../../components/Misc";
import { Screen } from "../../components/Screen";
import { useTheme, useThemedStyles } from "../../theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../theme/tokens";

const NOTIF_META: Record<string, { Icon: typeof Bell; label: string }> = {
  order_received: { Icon: Package, label: "Nouvelle commande" },
  quote_received: { Icon: FileText, label: "Devis reçu" },
  quote_accepted: { Icon: FileText, label: "Devis accepté" },
  modification_proposed: { Icon: Pencil, label: "Modification proposée" },
  verification_decided: { Icon: BadgeCheck, label: "Vérification traitée" },
  delivery_confirmed: { Icon: CheckCircle2, label: "Livraison confirmée" },
  order_in_progress: { Icon: Scissors, label: "Confection démarrée" },
  order_ready_for_pickup: { Icon: BellRing, label: "Commande prête à récupérer" },
  order_delivered: { Icon: CheckCircle2, label: "Commande remise" },
  order_not_delivered: { Icon: XCircle, label: "Commande non livrée" },
  measurement_ready: { Icon: Ruler, label: "Vos mensurations sont prêtes" },
  measurement_failed: { Icon: XCircle, label: "Analyse des photos échouée" },
};

export function NotificationsScreen({ base }: { base: "client" | "tailor" }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
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
    // Échec : renvoyer vers la prise de mesure pour recommencer, pas vers une
    // fiche de mensurations qui n'existe pas.
    if (n.type === "measurement_failed" && base === "client") {
      router.push("/client/measurements");
      return;
    }
    const orderId = (n.payload as { order_id?: string })?.order_id;
    if (orderId) router.push(`/${base}/orders/${orderId}`);
  };

  if (!notifications) return <Spinner />;

  return (
    <Screen>
      <Header title="Notifications" showBack />
      <View style={{ padding: 18 }}>
        {notifications.length === 0 ? (
          <EmptyState text="Aucune notification pour le moment." />
        ) : (
          notifications.map((n) => {
            const meta = NOTIF_META[n.type] || { Icon: Bell, label: n.type };
            const Icon = meta.Icon;
            return (
              <TouchableOpacity key={n.id} style={styles.row} onPress={() => openNotification(n)} activeOpacity={0.7}>
                <View style={[styles.iconWrap, !n.read_at && styles.iconWrapUnread]}>
                  <Icon size={18} color={n.read_at ? colors.textSecondary : colors.violetPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{meta.label}</Text>
                  <Text style={styles.time}>{new Date(n.created_at).toLocaleString("fr-FR")}</Text>
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
