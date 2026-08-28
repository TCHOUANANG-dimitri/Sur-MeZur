import { ChevronDown } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { userMessage, ApiError } from "../src/api/client";
import { AuthApi } from "../src/api/endpoints";
import { BottomSheet } from "../src/components/BottomSheet";
import { Button } from "../src/components/Button";
import { ErrorBanner, Field, Input, PasswordInput } from "../src/components/Misc";
import { PhoneField } from "../src/components/PhoneField";
import { Screen } from "../src/components/Screen";
import { COUNTRIES, splitPhone } from "../src/constants/countries";
import { CITIES_DATA, CITY_NAMES } from "../src/data/citiesData";
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

  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [city, setCity] = useState("");
  const [quartier, setQuartier] = useState("");
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [quartierPickerOpen, setQuartierPickerOpen] = useState(false);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requestOtp = async () => {
    setError("");
    if (!splitPhone(phone).local || !fullName || !isValidPassword(password)) {
      setError(t("auth.err.fillAllFields"));
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
      await register({ role, phone, full_name: fullName, password, language: lang, photo_consent: consent, city: city || undefined, quartier: quartier || undefined });
      router.replace(role === "tailor" ? "/tailor/verification" : "/client/(tabs)/home");
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
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
          <PhoneField label={t("auth.phone")} value={phone} onChangeText={setPhone} />
          <Field label={t("auth.password")}>
            <PasswordInput value={password} onChangeText={setPassword} maxLength={6} placeholder={t("auth.password.placeholder")} />
          </Field>
          {role === "tailor" && (
            <>
              <Field label="Ville">
                <TouchableOpacity style={styles.selectField} activeOpacity={0.7} onPress={() => setCityPickerOpen(true)}>
                  <Text style={[styles.selectText, !city && styles.selectPlaceholder]}>
                    {city || "Choisir une ville"}
                  </Text>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </Field>
              {city && CITIES_DATA[city] && (
                <Field label="Quartier">
                  <TouchableOpacity style={styles.selectField} activeOpacity={0.7} onPress={() => setQuartierPickerOpen(true)}>
                    <Text style={[styles.selectText, !quartier && styles.selectPlaceholder]}>
                      {quartier || "Choisir un quartier"}
                    </Text>
                    <ChevronDown size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </Field>
              )}

              <BottomSheet visible={cityPickerOpen} onClose={() => setCityPickerOpen(false)} title="Ville">
                {CITY_NAMES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={styles.optionRow}
                    activeOpacity={0.7}
                    onPress={() => { setCity(c); setQuartier(""); setCityPickerOpen(false); }}
                  >
                    <Text style={[styles.optionText, city === c && styles.optionTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </BottomSheet>

              <BottomSheet visible={quartierPickerOpen} onClose={() => setQuartierPickerOpen(false)} title="Quartier">
                {(CITIES_DATA[city] ?? []).map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.optionRow}
                    activeOpacity={0.7}
                    onPress={() => { setQuartier(q); setQuartierPickerOpen(false); }}
                  >
                    <Text style={[styles.optionText, quartier === q && styles.optionTextActive]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </BottomSheet>
            </>
          )}
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
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  logo: { width: "100%", height: 100, alignSelf: "center", marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.indigoText, marginBottom: 18 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  consentText: { flex: 1, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  selectField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  selectText: { fontSize: 14, fontFamily: fonts.body, color: colors.indigoText },
  selectPlaceholder: { color: colors.textSecondary },
  optionRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: { fontSize: 14, fontFamily: fonts.body, color: colors.indigoText },
  optionTextActive: { fontFamily: fonts.bodySemiBold, color: colors.violetPrimary },
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
