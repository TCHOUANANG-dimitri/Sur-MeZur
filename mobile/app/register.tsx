import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import React, { useState } from "react";
import { Image, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { userMessage, ApiError } from "../src/api/client";
import { AuthApi } from "../src/api/endpoints";
import { Button } from "../src/components/Button";
import { BottomSheet } from "../src/components/BottomSheet";
import { ErrorBanner, Field, Input, PasswordInput } from "../src/components/Misc";
import { Screen } from "../src/components/Screen";
import { COUNTRIES, type Country } from "../src/constants/countries";
import { useI18n } from "../src/i18n/I18nProvider";
import { useAuth } from "../src/state/AuthContext";
import { useTheme, useThemedStyles } from "../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../src/theme/tokens";
import { isValidPassword } from "../src/validate/password";

export default function Register() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ role?: string }>();
  const role = (params.role as "client" | "tailor") || "client";
  const { t, lang } = useI18n();
  const { register } = useAuth();
  const router = useRouter();

  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [localNumber, setLocalNumber] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const phone = `${country.dial}${localNumber}`;

  const requestOtp = async () => {
    setError("");
    if (!localNumber || !fullName || !isValidPassword(password)) {
      setError("Complétez tous les champs. Le mot de passe doit contenir 6 caractères exactement (au moins un chiffre et une lettre).");
      return;
    }
    setBusy(true);
    try {
      const res = await AuthApi.otpRequest(phone);
      setDevCode(res.dev_code);
      setStep("otp");
    } catch (e) {
      setError(userMessage(e));
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
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen padded>
      <Image source={require("../assets/logo-transparent.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>
        {t("auth.register")}
      </Text>
      {error ? <ErrorBanner message={error} /> : null}

      {step === "form" ? (
        <>
          <Field label={t("auth.fullName")}>
            <Input value={fullName} onChangeText={setFullName} />
          </Field>
          <Field label={t("auth.phone")}>
            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.countryButton} onPress={() => setCountryPickerOpen(true)} activeOpacity={0.7}>
                <Text style={styles.countryFlag}>{country.flag}</Text>
                <Text style={styles.countryDial}>{country.dial}</Text>
                <ChevronDown size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <Input
                value={localNumber}
                onChangeText={(v) => setLocalNumber(v.replace(/[^0-9]/g, ""))}
                keyboardType="phone-pad"
                placeholder="6 00 00 00 00"
                style={styles.phoneInput}
                maxLength={12}
              />
            </View>
          </Field>
          <Field label={t("auth.password")}>
            <PasswordInput value={password} onChangeText={setPassword} maxLength={6} placeholder={t("auth.password.placeholder")} />
          </Field>
          <View style={styles.consentRow}>
            <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.violetPrimary }} />
            <Text style={styles.consentText}>
              {t("auth.consent")}
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

    <BottomSheet visible={countryPickerOpen} onClose={() => setCountryPickerOpen(false)} title="Pays / indicatif">
      {COUNTRIES.map((c) => (
        <TouchableOpacity
          key={c.code}
          style={styles.countryRow}
          activeOpacity={0.7}
          onPress={() => {
            setCountry(c);
            setCountryPickerOpen(false);
          }}
        >
          <Text style={styles.countryFlag}>{c.flag}</Text>
          <Text style={styles.countryName}>{c.name}</Text>
          <Text style={styles.countryRowDial}>{c.dial}</Text>
        </TouchableOpacity>
      ))}
    </BottomSheet>
    </>
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
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  countryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  countryFlag: { fontSize: 18 },
  countryDial: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.indigoText },
  phoneInput: { flex: 1 },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countryName: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.indigoText },
  countryRowDial: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
