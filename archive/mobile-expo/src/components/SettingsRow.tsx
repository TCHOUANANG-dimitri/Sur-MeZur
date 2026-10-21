import { ChevronRight } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider";
import { fonts, type ThemeColors } from "../theme/tokens";

export function SettingsRow({
  Icon,
  label,
  value,
  onPress,
  danger,
  right,
  last,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  /** Replaces the chevron — for rows carrying a control (toggle, segmented). */
  right?: React.ReactNode;
  /** Drops the separator on the final row of a section. */
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Icon size={18} color={danger ? colors.error : colors.violetPrimary} />
      </View>
      <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {right ?? (onPress && !danger ? <ChevronRight size={16} color={colors.textSecondary} /> : null)}
    </TouchableOpacity>
  );
}

export function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 11,
      fontFamily: fonts.bodyBold,
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionBody: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.violetTint,
      alignItems: "center",
      justifyContent: "center",
    },
    iconWrapDanger: { backgroundColor: colors.errorBg },
    label: { flex: 1, fontSize: 14, color: colors.indigoText, fontFamily: fonts.body },
    labelDanger: { color: colors.error, fontFamily: fonts.bodySemiBold },
    value: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body, marginRight: 4 },
  });
