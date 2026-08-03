import { Bell, BadgeCheck, Heart } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useI18n } from "../i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../theme/tokens";

export function VerifiedBadge() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.verifiedBadge}>
      <BadgeCheck size={13} color={colors.violetPrimary} />
      <Text style={styles.verifiedText}>{t("verified.badge")}</Text>
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
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
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
    verifiedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.violetTint,
      borderRadius: radii.chip,
      paddingVertical: 3,
      paddingHorizontal: 9,
    },
    verifiedText: {
      color: colors.violetPrimary,
      fontSize: 11,
      fontFamily: fonts.bodyBold,
    },
    bellWrap: {
      backgroundColor: colors.backgroundAlt,
      borderRadius: 19,
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
    },
    badge: {
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
    badgeText: {
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
