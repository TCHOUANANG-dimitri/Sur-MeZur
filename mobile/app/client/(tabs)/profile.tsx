import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Globe,
  Heart,
  History,
  LogOut,
  Pencil,
  Ruler,
  ShieldCheck,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MeasurementsApi, UsersApi } from "../../../src/api/endpoints";
import { Button } from "../../../src/components/Button";
import { Field, Input } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { SettingsRow, SettingsSection } from "../../../src/components/SettingsRow";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useAuth } from "../../../src/state/AuthContext";
import { colors, fonts, gradientColors } from "../../../src/theme/tokens";

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [measurementCount, setMeasurementCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      MeasurementsApi.list()
        .then((list) => setMeasurementCount(list.length))
        .catch(() => {});
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
      <View style={{ padding: 18 }}>
        <View style={styles.header}>
          <LinearGradient colors={gradientColors} style={styles.avatar}>
            <Text style={styles.avatarInitial}>{user?.full_name.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            {editing ? (
              <>
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
              </>
            ) : (
              <>
                <Text style={styles.name}>{user?.full_name}</Text>
                <Text style={styles.phone}>{user?.phone}</Text>
              </>
            )}
          </View>
          {!editing && (
            <TouchableOpacity
              hitSlop={10}
              onPress={() => {
                setFullName(user?.full_name || "");
                setEmail(user?.email || "");
                setEditing(true);
              }}
            >
              <Pencil size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <SettingsSection title="Mon compte">
          <SettingsRow
            Icon={Ruler}
            label={t("profile.myMeasurements")}
            value={measurementCount > 0 ? `v${measurementCount}` : undefined}
            onPress={() => router.push("/client/my-measurements")}
          />
          <SettingsRow Icon={Heart} label="Modèles enregistrés" onPress={() => router.push("/client/liked-models")} />
          <SettingsRow Icon={History} label={t("profile.history")} onPress={() => router.push("/client/(tabs)/orders")} />
        </SettingsSection>

        <SettingsSection title={t("profile.language")}>
          <SettingsRow Icon={Globe} label="Français" value={lang === "fr" ? "Actif" : undefined} onPress={() => setLang("fr")} />
          <SettingsRow Icon={Globe} label="English" value={lang === "en" ? "Actif" : undefined} onPress={() => setLang("en")} />
        </SettingsSection>

        <SettingsSection title="Confidentialité">
          <SettingsRow Icon={ShieldCheck} label="Effacer mes photos corporelles" onPress={purgePhotos} />
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 24 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.white, fontFamily: fonts.display, fontSize: 22 },
  name: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.indigoText, marginTop: 6 },
  phone: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontFamily: fonts.body },
});
