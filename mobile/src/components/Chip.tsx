import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { colors, fonts, radii } from "../theme/tokens";

export function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        active ? { backgroundColor: color || colors.violetPrimary, borderWidth: 0 } : styles.inactive,
      ]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const VARIANT_COLORS = {
  success: { bg: colors.successBg, fg: colors.success },
  error: { bg: colors.errorBg, fg: colors.error },
  pending: { bg: colors.pendingBg, fg: colors.pending },
  neutral: { bg: colors.backgroundAlt, fg: colors.textSecondary },
} as const;

export function StatusChip({ status, label }: { status: keyof typeof VARIANT_COLORS; label: string }) {
  const c = VARIANT_COLORS[status];
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

const styles = StyleSheet.create({
  chip: {
    borderRadius: radii.chip,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  inactive: {
    backgroundColor: colors.white,
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
