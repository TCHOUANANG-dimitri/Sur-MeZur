import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Globe,
  Heart,
  History,
  LogOut,
  Moon,
  Package,
  Pencil,
  Ruler,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CatalogApi, MeasurementsApi, OrdersApi, UsersApi } from "../../../src/api/endpoints";
import { Button } from "../../../src/components/Button";
import { Field, Input } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Segmented } from "../../../src/components/Segmented";
import { SettingsRow, SettingsSection } from "../../../src/components/SettingsRow";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useAuth } from "../../../src/state/AuthContext";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, gradientFor, type ThemeColors } from "../../../src/theme/tokens";

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  const [measurementCount, setMeasurementCount] = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      MeasurementsApi.list().then((l) => setMeasurementCount(l.length)).catch(() => {});
      CatalogApi.models({ liked_only: true }).then((l) => setLikedCount(l.length)).catch(() => {});
      OrdersApi.list().then((l) => setOrderCount(l.length)).catch(() => {});
    }, [])
  );

  const saveInfo = async () => {
    setBusy(true);
    try {
      await UsersApi.patchMe({ full_name: fullName, email: email || undefined });
      await refreshUser();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const purgePhotos = () => {
    Alert.alert(
      "Effacer mes photos corporelles",
      "Cette action supprime le consentement lié à vos photos de mesure. Continuer ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Effacer",
          style: "destructive",
          onPress: async () => {
            await UsersApi.purgePhotos();
            Alert.alert("Fait", "Vos données photo ont été effacées.");
          },
        },
      ]
    );
  };

  return (
    <Screen>
      {/* Identity header — the profile's own content, not just a menu. */}
      <LinearGradient colors={gradientFor(colors)} style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{user?.full_name?.charAt(0).toUpperCase()}</Text>
        </View>
        {!editing && (
          <>
            <Text style={styles.heroName}>{user?.full_name}</Text>
            <Text style={styles.heroSub}>{user?.phone}</Text>
            {user?.email ? <Text style={styles.heroSub}>{user.email}</Text> : null}
            <TouchableOpacity
              style={styles.editChip}
              onPress={() => {
                setFullName(user?.full_name || "");
                setEmail(user?.email || "");
                setEditing(true);
              }}
            >
              <Pencil size={12} color="#FFFFFF" />
              <Text style={styles.editChipText}>Modifier mon profil</Text>
            </TouchableOpacity>
          </>
        )}
      </LinearGradient>

      <View style={styles.body}>
        {editing && (
          <View style={styles.editCard}>
            <Field label={t("auth.fullName")}>
              <Input value={fullName} onChangeText={setFullName} />
            </Field>
            <Field label="Email">
              <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </Field>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button onPress={saveInfo} loading={busy} style={{ flex: 1 }}>
                {t("common.save")}
              </Button>
              <Button variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }}>
                {t("common.cancel")}
              </Button>
            </View>
          </View>
        )}

        <View style={styles.statsRow}>
          <Stat value={measurementCount} label="Mesures" Icon={Ruler} />
          <View style={styles.statDivider} />
          <Stat value={likedCount} label="Favoris" Icon={Heart} />
          <View style={styles.statDivider} />
          <Stat value={orderCount} label="Commandes" Icon={Package} />
        </View>

        <SettingsSection title="Mon compte">
          <SettingsRow
            Icon={Ruler}
            label={t("profile.myMeasurements")}
            value={measurementCount > 0 ? `v${measurementCount}` : undefined}
            onPress={() => router.push("/client/my-measurements")}
          />
          <SettingsRow
            Icon={Heart}
            label="Modèles enregistrés"
            value={likedCount > 0 ? String(likedCount) : undefined}
            onPress={() => router.push("/client/liked-models")}
          />
          <SettingsRow
            Icon={History}
            label={t("profile.history")}
            onPress={() => router.push("/client/(tabs)/orders")}
            last
          />
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

        <SettingsSection title="Confidentialité">
          <SettingsRow Icon={ShieldCheck} label="Effacer mes photos corporelles" onPress={purgePhotos} last />
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

function Stat({
  value,
  label,
  Icon,
}: {
  value: number;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stat}>
      <Icon size={15} color={colors.violetPrimary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    hero: {
      alignItems: "center",
      paddingTop: 26,
      paddingBottom: 30,
      paddingHorizontal: 18,
    },
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
    avatarInitial: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 30 },
    heroName: { color: "#FFFFFF", fontFamily: fonts.bodyBold, fontSize: 18 },
    heroSub: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
    editChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(255,255,255,0.2)",
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 14,
      marginTop: 14,
    },
    editChipText: { color: "#FFFFFF", fontSize: 12, fontFamily: fonts.bodySemiBold },
    body: { padding: 18 },
    editCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      marginBottom: 20,
    },
    stat: { flex: 1, alignItems: "center", gap: 3 },
    statDivider: { width: 1, height: 32, backgroundColor: colors.border },
    statValue: { fontSize: 17, fontFamily: fonts.bodyBold, color: colors.indigoText },
    statLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body },
  });
