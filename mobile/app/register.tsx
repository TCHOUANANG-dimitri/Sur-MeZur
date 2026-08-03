import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, StyleSheet, Switch, Text, View } from "react-native";
import { ApiError } from "../src/api/client";
import { AuthApi } from "../src/api/endpoints";
import { Button } from "../src/components/Button";
import { ErrorBanner, Field, Input } from "../src/components/Misc";
import { Screen } from "../src/components/Screen";
import { useI18n } from "../src/i18n/I18nProvider";
import { useAuth } from "../src/state/AuthContext";
import { useTheme, useThemedStyles } from "../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../src/theme/tokens";

export default function Register() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ role?: string }>();
  const role = (params.role as "client" | "tailor") || "client";
  const { t, lang } = useI18n();
  const { register } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState("+237");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requestOtp = async () => {
    setError("");
    if (!phone || !fullName || password.length < 4) {
      setError("Complétez tous les champs (mot de passe ≥ 4 caractères).");
      return;
    }
    setBusy(true);
    try {
      const res = await AuthApi.otpRequest(phone);
      setDevCode(res.dev_code);
      setStep("otp");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setError("");
    setBusy(true);
    try {
      await AuthApi.otpVerify(phone, code);
      await register({ role, phone, full_name: fullName, password, language: lang, photo_consent: consent });
      router.replace(role === "tailor" ? "/tailor/verification" : "/client/(tabs)/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded>
      <Image source={require("../assets/logo-full.jpeg")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>
        {t("auth.register")} — {t(`role.${role}`)}
      </Text>
      {error ? <ErrorBanner message={error} /> : null}

      {step === "form" ? (
        <>
          <Field label={t("auth.fullName")}>
            <Input value={fullName} onChangeText={setFullName} />
          </Field>
          <Field label={t("auth.phone")}>
            <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </Field>
          <Field label={t("auth.password")}>
            <Input value={password} onChangeText={setPassword} secureTextEntry />
          </Field>
          <View style={styles.consentRow}>
            <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.violetPrimary }} />
            <Text style={styles.consentText}>
              Je consens au traitement de mes photos corporelles pour la prise de mesures.
            </Text>
          </View>
          <Button fullWidth loading={busy} onPress={requestOtp}>
            {t("common.next")}
          </Button>
        </>
      ) : (
        <>
          <Text style={styles.otpSubtitle}>{t("auth.otp.subtitle")}</Text>
          <View style={styles.devCode}>
            <Text style={styles.devCodeText}>{devCode}</Text>
          </View>
          <Field label="Code OTP">
            <Input value={code} onChangeText={setCode} maxLength={6} keyboardType="number-pad" />
          </Field>
          <Button fullWidth loading={busy} onPress={finish}>
            {t("common.confirm")}
          </Button>
        </>
      )}
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  logo: { width: "100%", height: 100, alignSelf: "center", marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.indigoText, marginBottom: 18 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  consentText: { flex: 1, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  otpSubtitle: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 12 },
  devCode: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  devCodeText: {
    fontSize: 22,
    fontFamily: fonts.bodyBold,
    letterSpacing: 4,
    textAlign: "center",
    color: colors.violetPrimary,
  },
});
