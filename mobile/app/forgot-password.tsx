import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { userMessage, ApiError } from "../src/api/client";
import { AuthApi } from "../src/api/endpoints";
import { Button } from "../src/components/Button";
import { ErrorBanner, Field, Header, Input, PasswordInput } from "../src/components/Misc";
import { Screen } from "../src/components/Screen";
import { useThemedStyles } from "../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../src/theme/tokens";
import { isValidPassword } from "../src/validate/password";

export default function ForgotPassword() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const [phone, setPhone] = useState("+237");
  const [step, setStep] = useState<"phone" | "reset" | "done">("phone");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setError("");
    if (!phone) {
      setError("Entrez votre numéro de téléphone.");
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
      setError("Le mot de passe doit contenir 6 caractères exactement (au moins un chiffre et une lettre).");
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
      <Header title="Mot de passe oublié" showBack />
      <View style={{ padding: 24 }}>
        {error ? <ErrorBanner message={error} /> : null}

        {step === "phone" && (
          <>
            <Text style={styles.body}>
              Entrez le numéro de téléphone associé à votre compte. Un code de vérification vous sera fourni.
            </Text>
            <Field label="Téléphone">
              <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </Field>
            <Button fullWidth loading={busy} onPress={requestCode}>
              Envoyer le code
            </Button>
          </>
        )}

        {step === "reset" && (
          <>
            <Text style={styles.body}>Votre code de vérification (affiché directement, pas d'envoi SMS) :</Text>
            <View style={styles.devCode}>
              <Text style={styles.devCodeText}>{devCode}</Text>
            </View>
            <Field label="Code reçu">
              <Input value={code} onChangeText={setCode} maxLength={6} keyboardType="number-pad" />
            </Field>
            <Field label="Nouveau mot de passe">
              <PasswordInput value={newPassword} onChangeText={setNewPassword} maxLength={6} />
            </Field>
            <Button fullWidth loading={busy} onPress={confirmReset}>
              Réinitialiser le mot de passe
            </Button>
          </>
        )}

        {step === "done" && (
          <>
            <Text style={styles.success}>Mot de passe réinitialisé avec succès.</Text>
            <Button fullWidth onPress={() => router.replace("/login")}>
              Se connecter
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
