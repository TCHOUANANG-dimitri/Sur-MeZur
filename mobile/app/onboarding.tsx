import { useRouter } from "expo-router";
import { Camera, Scissors, Shirt } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../src/components/Button";
import { useI18n } from "../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../src/theme/ThemeProvider";
import { fonts, gradientColors, type ThemeColors } from "../src/theme/tokens";

const SLIDES = [
  { Icon: Camera, key: "onboarding.slide1" },
  { Icon: Shirt, key: "onboarding.slide2" },
  { Icon: Scissors, key: "onboarding.slide3" },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const Icon = slide.Icon;

  const next = () => {
    if (step < SLIDES.length - 1) setStep(step + 1);
    else router.push("/role");
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Icon size={44} color={colors.violetPrimary} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>{t(`${slide.key}.title`)}</Text>
        <Text style={styles.body}>{t(`${slide.key}.body`)}</Text>
      </View>
      <Button onPress={next} fullWidth>
        {t("common.next")}
      </Button>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: "space-between", backgroundColor: colors.background, paddingTop: 48, paddingBottom: 32 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: gradientColors[0] },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.indigoText, textAlign: "center" },
  body: { color: colors.textSecondary, fontSize: 14, textAlign: "center", paddingHorizontal: 12, fontFamily: fonts.body },
});
