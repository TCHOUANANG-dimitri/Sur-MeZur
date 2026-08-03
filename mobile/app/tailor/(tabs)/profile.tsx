import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import {
  BadgeCheck,
  Bell,
  Globe,
  LogOut,
  Moon,
  Package,
  Scissors,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { OrdersApi, TailorsApi } from "../../../src/api/endpoints";
import type { Order, Review, TailorProfile } from "../../../src/api/types";
import { VerifiedBadge } from "../../../src/components/Badges";
import { Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Segmented } from "../../../src/components/Segmented";
import { SettingsRow, SettingsSection } from "../../../src/components/SettingsRow";
import { Stars } from "../../../src/components/Stars";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useAuth } from "../../../src/state/AuthContext";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, gradientFor, type ThemeColors } from "../../../src/theme/tokens";

export default function TailorProfilePage() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useFocusEffect(
    useCallback(() => {
      TailorsApi.me().then((p) => {
        setProfile(p);
        if (p?.id) TailorsApi.reviews(p.id).then(setReviews).catch(() => {});
      });
      OrdersApi.list().then(setOrders).catch(() => {});
    }, [])
  );

  if (!profile) return <Spinner />;

  const delivered = orders.filter((o) => o.status === "finished_delivered").length;

  return (
    <Screen>
      <LinearGradient colors={gradientFor(colors)} style={styles.hero}>
        <View style={styles.avatar}>
          <Scissors size={28} color="#FFFFFF" />
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.heroName}>{profile.shop_name}</Text>
          {profile.verification_status === "approved" && <VerifiedBadge />}
        </View>
        <Text style={styles.heroSub}>{user?.phone}</Text>
        {profile.city ? <Text style={styles.heroSub}>{profile.city}</Text> : null}
        {profile.bio ? <Text style={styles.heroBio}>{profile.bio}</Text> : null}
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Star size={15} color={colors.violetPrimary} />
            <Text style={styles.statValue}>{reviews.length > 0 ? profile.rating_avg.toFixed(1) : "—"}</Text>
            <Text style={styles.statLabel}>Note</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <BadgeCheck size={15} color={colors.violetPrimary} />
            <Text style={styles.statValue}>{reviews.length}</Text>
            <Text style={styles.statLabel}>Avis</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Package size={15} color={colors.violetPrimary} />
            <Text style={styles.statValue}>{delivered}</Text>
            <Text style={styles.statLabel}>Livrées</Text>
          </View>
        </View>

        {reviews.length > 0 && (
          <View style={styles.ratingCard}>
            <Stars value={profile.rating_avg} />
            <Text style={styles.ratingHint}>
              Moyenne sur {reviews.length} avis client{reviews.length > 1 ? "s" : ""}
            </Text>
          </View>
        )}

        <SettingsSection title="Mon atelier">
          <SettingsRow
            Icon={BadgeCheck}
            label="Statut de vérification"
            value={profile.verification_status === "approved" ? "Vérifié" : "En attente"}
            onPress={() => router.push("/tailor/verification")}
          />
          <SettingsRow Icon={Package} label={t("nav.orders")} onPress={() => router.push("/tailor/(tabs)/orders")} />
          <SettingsRow
            Icon={Scissors}
            label={t("nav.readyToWear")}
            onPress={() => router.push("/tailor/(tabs)/ready-to-wear")}
          />
          <SettingsRow Icon={Wallet} label={t("nav.finances")} onPress={() => router.push("/tailor/(tabs)/finances")} />
          <SettingsRow Icon={Bell} label="Notifications" onPress={() => router.push("/tailor/notifications")} last />
        </SettingsSection>

        <SettingsSection title="Apparence et langue">
          <SettingsRow
            Icon={Globe}
            label={t("profile.language")}
            right={
              <Segmented
                value={lang}
                onChange={(v) => setLang(v)}
                options={[
                  { value: "fr", label: "FR" },
                  { value: "en", label: "EN" },
                ]}
              />
            }
          />
          <SettingsRow
            Icon={mode === "dark" ? Moon : Sparkles}
            label="Thème"
            last
            right={
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "light", label: "Clair" },
                  { value: "dark", label: "Sombre" },
                  { value: "system", label: "Auto" },
                ]}
              />
            }
          />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow
            Icon={LogOut}
            label={t("profile.logout")}
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

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    hero: { alignItems: "center", paddingTop: 26, paddingBottom: 30, paddingHorizontal: 18 },
    avatar: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: "rgba(255,255,255,0.22)",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.5)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    heroName: { color: "#FFFFFF", fontFamily: fonts.bodyBold, fontSize: 18 },
    heroSub: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
    heroBio: {
      color: "rgba(255,255,255,0.9)",
      fontFamily: fonts.body,
      fontSize: 12,
      marginTop: 10,
      textAlign: "center",
      lineHeight: 17,
    },
    body: { padding: 18 },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      marginBottom: 14,
    },
    stat: { flex: 1, alignItems: "center", gap: 3 },
    statDivider: { width: 1, height: 32, backgroundColor: colors.border },
    statValue: { fontSize: 17, fontFamily: fonts.bodyBold, color: colors.indigoText },
    statLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body },
    ratingCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      alignItems: "center",
      gap: 6,
      marginBottom: 20,
    },
    ratingHint: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
  });
