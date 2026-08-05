import { useRouter } from "expo-router";
import { ChevronLeft, Inbox } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from "react-native";
import { useI18n } from "../i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../theme/tokens";

export function Header({
  title,
  showBack,
  right,
  onBack,
}: {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
  /** Overrides the default `router.back()` — for screens whose "back" is an
   *  in-screen step change rather than a navigation. */
  onBack?: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {showBack && (
          <TouchableOpacity
            onPress={onBack ?? (() => router.back())}
            hitSlop={10}
            style={{ marginRight: 6 }}
          >
            <ChevronLeft size={22} color={colors.indigoText} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <TextInput placeholderTextColor={colors.textSecondary} {...props} style={[styles.input, props.style]} />;
}

export function ErrorBanner({ message }: { message: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function EmptyState({ text, cta }: { text: string; cta?: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Inbox size={26} color={colors.textSecondary} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
      {cta}
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.spinnerWrap}>
      <ActivityIndicator size="large" color={colors.violetPrimary} />
      <Text style={styles.spinnerLabel}>{label || t("common.loading")}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 1,
    },
    headerTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: 18,
      color: colors.indigoText,
      flexShrink: 1,
    },
    fieldLabel: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.textSecondary,
      marginBottom: 6,
    },
    input: {
      width: "100%",
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: radii.button,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.indigoText,
      backgroundColor: colors.surface,
    },
    errorBanner: {
      backgroundColor: colors.errorBg,
      borderRadius: radii.button,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    errorText: {
      color: colors.error,
      fontSize: 13,
      fontFamily: fonts.body,
      // Certains messages sont des consignes de reprise sur plusieurs lignes
      // (échec d'analyse des photos) : sans interligne, la liste est illisible.
      lineHeight: 19,
    },
    emptyWrap: {
      alignItems: "center",
      paddingVertical: 48,
      paddingHorizontal: 16,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.backgroundAlt,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontFamily: fonts.body,
      marginBottom: 14,
      textAlign: "center",
    },
    spinnerWrap: {
      alignItems: "center",
      paddingVertical: 32,
    },
    spinnerLabel: {
      marginTop: 10,
      fontSize: 13,
      color: colors.textSecondary,
      fontFamily: fonts.body,
    },
  });
