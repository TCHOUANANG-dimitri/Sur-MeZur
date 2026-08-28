import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemedStyles } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme/tokens";

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
  const styles = useThemedStyles(makeStyles);

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
        // "undefined" sur Android comptait uniquement sur
        // windowSoftInputMode="adjustResize" (AndroidManifest.xml) pour
        // laisser de la place au clavier -- correct en théorie, mais peu
        // fiable en pratique sur les versions Android récentes avec
        // affichage bord-à-bord (edge-to-edge), où le redimensionnement de
        // fenêtre attendu par adjustResize ne se produit plus toujours.
        // "height" est le repli standard recommandé côté Android : il agit
        // au niveau du composant plutôt que de compter sur la fenêtre.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    padded: {
      padding: 18,
    },
  });
