import { ChevronRight } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts } from "../theme/tokens";

export function SettingsRow({
  Icon,
  label,
  value,
  onPress,
  danger,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.6 : 1} disabled={!onPress}>
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Icon size={18} color={danger ? colors.error : colors.violetPrimary} />
      </View>
      <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onPress && !danger && <ChevronRight size={16} color={colors.textSecondary} />}
    </TouchableOpacity>
  );
}

export function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.white,
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
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapDanger: { backgroundColor: colors.errorBg },
  label: { flex: 1, fontSize: 14, color: colors.indigoText, fontFamily: fonts.body },
  labelDanger: { color: colors.error, fontFamily: fonts.bodySemiBold },
  value: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body, marginRight: 4 },
});
