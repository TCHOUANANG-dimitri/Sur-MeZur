import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, ShieldAlert, XCircle } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { TailorsApi } from "../api/endpoints";
import { useI18n } from "../i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../theme/tokens";

/**
 * Rappel affiché sur CHAQUE onglet tailleur tant que le compte n'est pas
 * vérifié — pas seulement à l'inscription. Se charge de son propre état pour
 * pouvoir être déposé sans props dans n'importe quel écran.
 */
export function VerificationNudge() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const [profile, setProfile] = useState<{ verification_status: string; atelier_photo_url: string | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      TailorsApi.me()
        .then(setProfile)
        .catch(() => setProfile(null));
    }, [])
  );

  if (!profile || profile.verification_status === "approved") return null;

  const rejected = profile.verification_status === "rejected";
  const submitted = !!profile.atelier_photo_url;

  const label = rejected
    ? t("tailor.verification.nudgeRejected")
    : submitted
      ? t("tailor.verification.nudgeReviewing")
      : t("tailor.verification.nudgeTodo");

  return (
    <TouchableOpacity
      style={[styles.wrap, rejected && styles.wrapRejected]}
      onPress={() => router.push("/tailor/verification")}
      activeOpacity={0.75}
    >
      {rejected ? (
        <XCircle size={16} color={colors.error} />
      ) : (
        <ShieldAlert size={16} color={colors.pending} />
      )}
      <Text style={[styles.text, rejected && styles.textRejected]}>{label}</Text>
      <ChevronRight size={15} color={rejected ? colors.error : colors.pending} />
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.pendingBg,
      borderRadius: radii.button,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 14,
    },
    wrapRejected: { backgroundColor: colors.errorBg },
    text: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.indigoText },
    textRejected: { color: colors.error },
  });
