import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity } from "react-native";
import { ApiError } from "../src/api/client";
import { Button } from "../src/components/Button";
import { ErrorBanner, Field, Input } from "../src/components/Misc";
import { Screen } from "../src/components/Screen";
import { useI18n } from "../src/i18n/I18nProvider";
import { useAuth } from "../src/state/AuthContext";
import { useThemedStyles } from "../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../src/theme/tokens";

export default function Login() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("+237600000001");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const user = await login(phone, password);
      const dest =
        user.role === "client" ? "/client/(tabs)/home" : user.role === "tailor" ? "/tailor/(tabs)/dashboard" : "/admin/(tabs)/overview";
      router.replace(dest as never);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded style={{ flex: 1, justifyContent: "center" }} scroll={false}>
      <Image source={require("../assets/logo-full.jpeg")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t("auth.login")}</Text>
      {error ? <ErrorBanner message={error} /> : null}
      <Field label={t("auth.phone")}>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      </Field>
      <Field label={t("auth.password")}>
        <Input value={password} onChangeText={setPassword} secureTextEntry />
      </Field>
      <Button fullWidth loading={busy} onPress={submit}>
        {t("auth.login")}
      </Button>
      <TouchableOpacity onPress={() => router.push("/forgot-password")} style={{ marginTop: 14 }}>
        <Text style={styles.link}>Mot de passe oublié ?</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        Comptes de démo — client: +237600000001, tailleur: +237600000002, admin: +237600000000 (mot de passe: password123)
      </Text>
      <TouchableOpacity onPress={() => router.push("/role")} style={{ marginTop: 8 }}>
        <Text style={styles.link}>{t("auth.register")}</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  logo: { width: "100%", height: 110, alignSelf: "center", marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.indigoText, marginBottom: 18 },
  hint: { textAlign: "center", fontSize: 11, color: colors.textSecondary, marginTop: 16, fontFamily: fonts.body },
  link: { textAlign: "center", fontSize: 13, color: colors.violetPrimary, fontFamily: fonts.bodySemiBold },
});
