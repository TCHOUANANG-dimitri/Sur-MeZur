import React from "react";
import { StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import { colors, radii, shadow } from "../theme/tokens";

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[styles.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: 16,
    ...shadow,
  },
});
