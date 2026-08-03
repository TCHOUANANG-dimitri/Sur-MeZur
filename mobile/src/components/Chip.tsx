import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../theme/tokens";

export function Chip({
  label,
  active,
  color,
  icon,
  onPress,
}: {
  label: string;
  active?: boolean;
  color?: string;
  /** Optional leading glyph — callers pass a Lucide icon element. */
  icon?: React.ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        active ? { backgroundColor: color || colors.violetPrimary, borderWidth: 0 } : styles.inactive,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export type StatusVariant = "success" | "error" | "pending" | "neutral";

function variantColors(colors: ThemeColors) {
  return {
    success: { bg: colors.successBg, fg: colors.success },
    error: { bg: colors.errorBg, fg: colors.error },
    pending: { bg: colors.pendingBg, fg: colors.pending },
    neutral: { bg: colors.backgroundAlt, fg: colors.textSecondary },
  } as const;
}

export function StatusChip({ status, label }: { status: StatusVariant; label: string }) {
  const { colors } = useTheme();
  const c = variantColors(colors)[status];
  return (
    <Text
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        borderRadius: radii.chip,
        paddingVertical: 4,
        paddingHorizontal: 10,
        fontSize: 11,
        fontFamily: fonts.bodyBold,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: radii.chip,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    icon: { marginRight: -1 },
    inactive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.indigoText,
    },
    labelActive: {
      color: colors.white,
    },
  });
