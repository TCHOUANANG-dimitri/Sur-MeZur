import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { colors, fonts, gradientColors, radii } from "../theme/tokens";

type Variant = "primary" | "secondary" | "text" | "danger";

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: Variant;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ children, onPress, variant = "primary", fullWidth, disabled, loading, style }: Props) {
  const isDisabled = disabled || loading;
  const content = (
    <View style={styles.contentRow}>
      {loading && <ActivityIndicator size="small" color={variant === "primary" || variant === "danger" ? colors.white : colors.violetPrimary} style={{ marginRight: 8 }} />}
      <Text
        style={[
          styles.label,
          variant === "primary" || variant === "danger" ? styles.labelOnColor : styles.labelOnLight,
          variant === "text" && styles.labelText,
        ]}
      >
        {children}
      </Text>
    </View>
  );

  if (variant === "primary") {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={isDisabled}
        style={[fullWidth && styles.fullWidth, isDisabled && styles.disabled, style]}
      >
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.base}>
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        variant === "text" && styles.text,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.button,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.violetPrimary,
  },
  danger: {
    backgroundColor: colors.error,
  },
  text: {
    backgroundColor: "transparent",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
  labelOnColor: {
    color: colors.white,
  },
  labelOnLight: {
    color: colors.violetPrimary,
  },
  labelText: {
    color: colors.violetPrimary,
  },
});
