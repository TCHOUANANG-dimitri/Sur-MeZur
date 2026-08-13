import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { userMessage, ApiError } from "../src/api/client";
import { AuthApi } from "../src/api/endpoints";
import { Button } from "../src/components/Button";
import { ErrorBanner, Field, Header, Input, PasswordInput } from "../src/components/Misc";
import { PhoneField } from "../src/components/PhoneField";
import { Screen } from "../src/components/Screen";
import { COUNTRIES, splitPhone } from "../src/constants/countries";
import { useI18n } from "../src/i18n/I18nProvider";
import { useThemedStyles } from "../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../src/theme/tokens";
import { isValidPassword } from "../src/validate/password";

export default function ForgotPassword() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [step, setStep] = useState<"phone" | "reset" | "done">("phone");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setError("");
    if (!splitPhone(phone).local) {
      setError(t("auth.err.enterPhone"));
      return;
    }
    setBusy(true);
    try {
      const res = await AuthApi.passwordResetRequest(phone);
      setDevCode(res.dev_code);
      setStep("reset");
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    setError("");
    if (!isValidPassword(newPassword)) {
      setError(t("auth.err.passwordRules"));
      return;
    }
    setBusy(true);
    try {
      await AuthApi.passwordResetConfirm(phone, code, newPassword);
      setStep("done");
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={t("auth.forgotPassword")} showBack />
      <View style={{ padding: 24 }}>
        {error ? <ErrorBanner message={error} /> : null}

        {step === "phone" && (
          <>
            <Text style={styles.body}>
              {t("auth.forgotPassword.body")}
            </Text>
            <PhoneField label={t("auth.phone")} value={phone} onChangeText={setPhone} />
            <Button fullWidth loading={busy} onPress={requestCode}>
              {t("auth.forgotPassword.sendCode")}
            </Button>
          </>
        )}

        {step === "reset" && (
          <>
            <Text style={styles.body}>{t("auth.forgotPassword.devCode")}</Text>
            <View style={styles.devCode}>
              <Text style={styles.devCodeText}>{devCode}</Text>
            </View>
            <Field label={t("auth.forgotPassword.codeLabel")}>
              <Input value={code} onChangeText={setCode} maxLength={6} keyboardType="number-pad" />
            </Field>
            <Field label={t("auth.password")}>
              <PasswordInput value={newPassword} onChangeText={setNewPassword} maxLength={6} placeholder={t("auth.password.placeholder")} />
            </Field>
            <Button fullWidth loading={busy} onPress={confirmReset}>
              {t("auth.forgotPassword.reset")}
            </Button>
          </>
        )}

        {step === "done" && (
          <>
            <Text style={styles.success}>{t("auth.forgotPassword.success")}</Text>
            <Button fullWidth onPress={() => router.replace("/login")}>
              {t("auth.login")}
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  body: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 16 },
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
  success: {
    fontSize: 14,
    color: colors.success,
    fontFamily: fonts.bodySemiBold,
    textAlign: "center",
    marginBottom: 16,
  },
});
