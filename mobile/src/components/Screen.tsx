import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/tokens";

/** Root wrapper for every screen: safe-area + background, optional scroll. */
export function Screen({
  children,
  scroll = true,
  padded = false,
  style,
  edges,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.padded, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.padded, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={edges ?? ["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.white,
  },
  padded: {
    padding: 18,
  },
});
