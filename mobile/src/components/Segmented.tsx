import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useThemedStyles } from "../theme/ThemeProvider";
import { fonts, type ThemeColors } from "../theme/tokens";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  Icon?: React.ComponentType<{ size?: number; color?: string }>;
}

/**
 * Compact inline switch used for binary/ternary settings (language, theme)
 * instead of a list of rows — it shows the alternatives and the current choice
 * at a glance, which is what the settings screens of well-made apps do.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      flexDirection: "row",
      backgroundColor: colors.backgroundAlt,
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    segment: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 46,
    },
    segmentActive: {
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 3,
      elevation: 2,
    },
    label: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.textSecondary,
    },
    labelActive: {
      color: colors.indigoText,
    },
  });
