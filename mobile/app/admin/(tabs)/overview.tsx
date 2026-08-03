import { useFocusEffect, useRouter } from "expo-router";
import {
  BadgeCheck,
  ChevronRight,
  LogOut,
  Package,
  Percent,
  Scale,
  Star,
  UserX,
  Users,
  Wallet,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AdminApi, type AdminStats } from "../../../src/api/endpoints";
import { Card } from "../../../src/components/Card";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { SettingsRow, SettingsSection } from "../../../src/components/SettingsRow";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useAuth } from "../../../src/state/AuthContext";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";

const STATUS_LABEL: Record<string, string> = {
  new: "Nouvelles",
  in_progress: "En cours",
  ready_for_pickup: "Prêtes",
  finished_delivered: "Livrées",
  finished_not_delivered: "Non livrées",
};

export default function AdminOverview() {
  const router = useRouter();
  const { logout } = useAuth();
  const { lang, setLang } = useI18n();
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [stats, setStats] = useState<AdminStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      AdminApi.stats().then(setStats).catch(() => {});
    }, [])
  );

  if (!stats) return <Spinner />;

  const maxStatus = Math.max(1, ...Object.values(stats.orders_by_status));

  return (
    <Screen>
      <Header title="Vue d'ensemble" />
      <View style={{ padding: 18 }}>
        {/* Anything needing action is surfaced first. */}
        {(stats.tailors_pending > 0 || stats.open_disputes > 0) && (
          <Card style={styles.alertCard}>
            <Text style={styles.alertTitle}>À traiter</Text>
            {stats.tailors_pending > 0 && (
              <Text style={styles.alertLine}>
                {stats.tailors_pending} vérification{stats.tailors_pending > 1 ? "s" : ""} de tailleur en attente
              </Text>
            )}
            {stats.open_disputes > 0 && (
              <Text style={styles.alertLine}>
                {stats.open_disputes} litige{stats.open_disputes > 1 ? "s" : ""} ouvert
                {stats.open_disputes > 1 ? "s" : ""}
              </Text>
            )}
          </Card>
        )}

        <View style={styles.grid}>
          <Tile Icon={Users} label="Clients" value={String(stats.clients)} />
          <Tile Icon={BadgeCheck} label="Tailleurs" value={String(stats.tailors)} hint={`${stats.tailors_pending} en attente`} />
          <Tile Icon={Package} label="Commandes" value={String(stats.orders_total)} />
          <Tile Icon={UserX} label="Suspendus" value={String(stats.suspended)} tone={stats.suspended > 0 ? "error" : undefined} />
        </View>

        <Card style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>Activité financière</Text>
          <View style={styles.moneyRow}>
            <View style={styles.moneyItem}>
              <Wallet size={14} color={colors.violetPrimary} />
              <Text style={styles.moneyValue}>{formatFcfa(stats.gmv)}</Text>
              <Text style={styles.moneyLabel}>Volume livré</Text>
            </View>
            <View style={styles.moneyDivider} />
            <View style={styles.moneyItem}>
              <Percent size={14} color={colors.violetPrimary} />
              <Text style={styles.moneyValue}>{formatFcfa(stats.commission_earned)}</Text>
              <Text style={styles.moneyLabel}>Commission plateforme</Text>
            </View>
          </View>
        </Card>

        {Object.keys(stats.orders_by_status).length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>Commandes par statut</Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {Object.entries(stats.orders_by_status).map(([key, count]) => (
                <View key={key} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {STATUS_LABEL[key] || key}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(count / maxStatus) * 100}%` }]} />
                  </View>
                  <Text style={styles.barCount}>{count}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <SettingsSection title="Modération">
          <SettingsRow
            Icon={Star}
            label="Avis clients"
            value={stats.pending_reviews > 0 ? String(stats.pending_reviews) : undefined}
            onPress={() => router.push("/admin/reviews")}
          />
          <SettingsRow Icon={Package} label="Toutes les commandes" onPress={() => router.push("/admin/orders")} last />
        </SettingsSection>

        <SettingsSection title="Apparence et langue">
          <SettingsRow
            Icon={Users}
            label="Langue"
            value={lang === "fr" ? "Français" : "English"}
            onPress={() => setLang(lang === "fr" ? "en" : "fr")}
          />
          <SettingsRow
            Icon={Star}
            label="Thème"
            value={mode === "light" ? "Clair" : mode === "dark" ? "Sombre" : "Auto"}
            last
            onPress={() => setMode(mode === "light" ? "dark" : mode === "dark" ? "system" : "light")}
          />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow
            Icon={LogOut}
            label="Déconnexion"
            danger
            last
            onPress={async () => {
              await logout();
              router.replace("/role");
            }}
          />
        </SettingsSection>
      </View>
    </Screen>
  );
}

function Tile({
  Icon,
  label,
  value,
  hint,
  tone,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "error";
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Card style={{ width: "47%" }}>
      <View style={[styles.tileIcon, tone === "error" && { backgroundColor: colors.errorBg }]}>
        <Icon size={15} color={tone === "error" ? colors.error : colors.violetPrimary} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {hint && <Text style={styles.tileHint}>{hint}</Text>}
    </Card>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    alertCard: { backgroundColor: colors.pendingBg, borderColor: colors.pending, marginBottom: 14 },
    alertTitle: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.indigoText, marginBottom: 6 },
    alertLine: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 2 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    tileIcon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      backgroundColor: colors.violetTint,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    tileValue: { fontSize: 20, fontFamily: fonts.bodyBold, color: colors.indigoText },
    tileLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 2 },
    tileHint: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 3 },
    sectionTitle: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.indigoText, marginBottom: 10 },
    moneyRow: { flexDirection: "row", alignItems: "center" },
    moneyItem: { flex: 1, alignItems: "center", gap: 4 },
    moneyDivider: { width: 1, height: 40, backgroundColor: colors.border },
    moneyValue: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.indigoText },
    moneyLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, textAlign: "center" },
    barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    barLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, width: 72 },
    barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.backgroundAlt, overflow: "hidden" },
    barFill: { height: 6, borderRadius: 3, backgroundColor: colors.violetPrimary },
    barCount: { fontSize: 11, color: colors.indigoText, fontFamily: fonts.bodySemiBold, width: 22, textAlign: "right" },
  });
