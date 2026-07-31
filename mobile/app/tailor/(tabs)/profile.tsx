import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { BadgeCheck, Bell, Globe, LogOut, Package, Wallet } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { TailorsApi } from "../../../src/api/endpoints";
import type { TailorProfile } from "../../../src/api/types";
import { Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { SettingsRow, SettingsSection } from "../../../src/components/SettingsRow";
import { Stars } from "../../../src/components/Stars";
import { VerifiedBadge } from "../../../src/components/Badges";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useAuth } from "../../../src/state/AuthContext";
import { colors, fonts, gradientColors } from "../../../src/theme/tokens";

export default function TailorProfilePage() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<TailorProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      TailorsApi.me().then(setProfile);
    }, [])
  );

  if (!profile) return <Spinner />;

  return (
    <Screen>
      <View style={{ padding: 18 }}>
        <View style={styles.header}>
          <LinearGradient colors={gradientColors} style={styles.avatar} />
          <View>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Text style={styles.name}>{profile.shop_name}</Text>
              {profile.verification_status === "approved" && <VerifiedBadge />}
            </View>
            <Stars value={profile.rating_avg} />
            <Text style={styles.phone}>{user?.phone}</Text>
          </View>
        </View>

        {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        <SettingsSection title="Mon atelier">
          <SettingsRow
            Icon={BadgeCheck}
            label="Statut de vérification"
            value={profile.verification_status === "approved" ? "Vérifié" : "En attente"}
            onPress={() => router.push("/tailor/verification")}
          />
          <SettingsRow Icon={Package} label={t("nav.orders")} onPress={() => router.push("/tailor/(tabs)/orders")} />
          <SettingsRow Icon={Wallet} label={t("nav.finances")} onPress={() => router.push("/tailor/(tabs)/finances")} />
          <SettingsRow Icon={Bell} label="Notifications" onPress={() => router.push("/tailor/notifications")} />
        </SettingsSection>

        <SettingsSection title={t("profile.language")}>
          <SettingsRow Icon={Globe} label="Français" value={lang === "fr" ? "Actif" : undefined} onPress={() => setLang("fr")} />
          <SettingsRow Icon={Globe} label="English" value={lang === "en" ? "Actif" : undefined} onPress={() => setLang("en")} />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow
            Icon={LogOut}
            label={t("profile.logout")}
            danger
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

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
  bio: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 18 },
  phone: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: fonts.body },
});
