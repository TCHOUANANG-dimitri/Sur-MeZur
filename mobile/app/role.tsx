import { useRouter } from "expo-router";
import { Scissors, User } from "lucide-react-native";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useI18n } from "../src/i18n/I18nProvider";
import { colors, fonts, radii, shadow } from "../src/theme/tokens";

const ROLES = [
  { role: "client" as const, Icon: User },
  { role: "tailor" as const, Icon: Scissors },
];

export default function RoleChoice() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Image source={require("../assets/logo-full.jpeg")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t("role.choose")}</Text>
      {ROLES.map(({ role, Icon }) => (
        <TouchableOpacity
          key={role}
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: "/register", params: { role } })}
        >
          <Icon size={22} color={colors.violetPrimary} />
          <Text style={styles.cardLabel}>{t(`role.${role}`)}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => router.push("/login")} style={{ marginTop: 8 }}>
        <Text style={styles.link}>{t("auth.login")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: colors.white },
  logo: { width: "100%", height: 130, alignSelf: "center", marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 20, textAlign: "center", color: colors.indigoText, marginBottom: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: 20,
    ...shadow,
  },
  cardLabel: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.indigoText },
  link: { textAlign: "center", fontSize: 13, color: colors.violetPrimary, fontFamily: fonts.bodySemiBold },
});
