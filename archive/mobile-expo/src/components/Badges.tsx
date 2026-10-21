import { BadgeCheck, Bell, Heart, ShieldAlert } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { VerificationStatus } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../theme/tokens";

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const verified = status === "approved";
  return (
    <View style={[styles.verifWrap, verified ? styles.verifVerified : styles.verifUnverified]}>
      {verified ? (
        <BadgeCheck size={13} color={colors.violetPrimary} />
      ) : (
        <ShieldAlert size={13} color={colors.pending} />
      )}
      <Text style={[styles.verifText, verified ? styles.verifTextVerified : styles.verifTextUnverified]}>
        {verified ? t("verified.badge") : t("verified.unverifiedBadge")}
      </Text>
    </View>
  );
}

export function NotifBell({ count, onPress }: { count: number; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity onPress={onPress} style={styles.bellWrap}>
      <Bell size={18} color={colors.indigoText} />
      {count > 0 && (
        <View style={styles.countWrap}>
          <Text style={styles.countText}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function LikeButton({
  liked,
  count,
  onPress,
  size = 16,
}: {
  liked: boolean;
  count?: number;
  onPress: () => void;
  size?: number;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity onPress={onPress} style={styles.likeWrap} hitSlop={8}>
      <Heart size={size} color={liked ? colors.error : colors.textSecondary} fill={liked ? colors.error : "transparent"} />
      {count !== undefined && <Text style={styles.likeCount}>{count}</Text>}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    verifWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: radii.chip,
      paddingVertical: 3,
      paddingHorizontal: 9,
    },
    verifVerified: {
      backgroundColor: colors.violetTint,
    },
    verifUnverified: {
      backgroundColor: colors.pendingBg,
    },
    verifText: {
      fontSize: 11,
      fontFamily: fonts.bodyBold,
    },
    verifTextVerified: {
      color: colors.violetPrimary,
    },
    verifTextUnverified: {
      color: colors.pending,
    },
    bellWrap: {
      backgroundColor: colors.backgroundAlt,
      borderRadius: 19,
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
    },
    countWrap: {
      position: "absolute",
      top: -2,
      right: -2,
      backgroundColor: colors.error,
      borderRadius: 999,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      alignItems: "center",
      justifyContent: "center",
    },
    countText: {
      color: colors.white,
      fontSize: 9,
      fontFamily: fonts.bodyBold,
    },
    likeWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      // Sits on top of imagery in both themes, so it keeps its own scrim.
      backgroundColor: colors.surface,
      opacity: 0.94,
      borderRadius: radii.chip,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    likeCount: {
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
      color: colors.indigoText,
    },
  });