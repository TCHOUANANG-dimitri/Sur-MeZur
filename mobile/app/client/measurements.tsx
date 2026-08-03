import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Camera, CheckCircle2 } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MeasurementsApi } from "../../src/api/endpoints";
import type { PickedFile } from "../../src/api/endpoints";
import { Button } from "../../src/components/Button";
import { MeasurementRow } from "../../src/components/DomainCards";
import { ErrorBanner, Field, Header, Input, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { useI18n } from "../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../src/theme/tokens";

type Step = "intro" | "form" | "capture" | "processing" | "review";

export default function MeasurementFlow() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  // No pre-filled height and no pre-selected sex: a default here would be
  // submitted unchanged and read as a real answer.
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState<"female" | "male" | null>(null);
  const [front, setFront] = useState<PickedFile | null>(null);
  const [side, setSide] = useState<PickedFile | null>(null);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, number>>({});
  const [measurementId, setMeasurementId] = useState<string | null>(null);

  const pick = async (onPicked: (f: PickedFile) => void) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const result = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    onPicked({
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
    });
  };

  const heightNum = parseFloat(height.replace(",", "."));
  const weightNum = parseFloat(weight.replace(",", "."));

  /** Blocks the step rather than the upload, so the user is told immediately. */
  const validateForm = (): string | null => {
    if (!height.trim() || Number.isNaN(heightNum)) return "Indiquez votre taille en centimètres.";
    if (heightNum <= 50 || heightNum >= 260) return "La taille doit être comprise entre 50 et 260 cm.";
    if (!weight.trim() || Number.isNaN(weightNum)) return "Indiquez votre poids en kilogrammes.";
    if (weightNum <= 20 || weightNum >= 400) return "Le poids doit être compris entre 20 et 400 kg.";
    if (!gender) return "Sélectionnez votre sexe.";
    return null;
  };

  const goToCapture = () => {
    const problem = validateForm();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setStep("capture");
  };

  const submitPhotos = async () => {
    if (!front || !side) {
      setError("Ajoutez les deux photos (face et profil).");
      return;
    }
    const problem = validateForm();
    if (problem) {
      setError(problem);
      setStep("form");
      return;
    }
    setError("");
    setStep("processing");
    try {
      const session = await MeasurementsApi.createSession({
        height_cm: heightNum,
        weight_kg: weightNum,
        gender: gender as "female" | "male",
      });
      let current = await MeasurementsApi.uploadPhotos(session.id, front, side);
      for (let i = 0; i < 12 && current.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        current = await MeasurementsApi.getSession(session.id);
      }
      if (current.status !== "ready" || !current.measurement_id) {
        throw new Error(current.error_message || "Échec de l'analyse");
      }
      const list = await MeasurementsApi.list();
      const measurement = list.find((m) => m.id === current.measurement_id) || list[0];
      setData(measurement.data);
      setMeasurementId(measurement.id);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("capture");
    }
  };

  const confirm = async () => {
    if (!measurementId) return;
    try {
      await MeasurementsApi.patch(measurementId, { data });
    } catch {
      /* best effort */
    }
    router.push({ pathname: "/client/avatar", params: { measurementId } });
  };

  return (
    <Screen scroll={step !== "processing"}>
      <Header title={t("measurement.intro.title")} showBack />
      <View style={{ padding: 20 }}>
        {step === "intro" && (
          <>
            <Text style={styles.body}>{t("measurement.intro.body")}</Text>
            <View style={{ marginVertical: 12, gap: 4 }}>
              <Text style={styles.bullet}>• Tenue ajustée</Text>
              <Text style={styles.bullet}>• Fond dégagé</Text>
              <Text style={styles.bullet}>• Bras écartés à ~45°</Text>
            </View>
            <Button fullWidth onPress={() => setStep("form")}>
              {t("common.next")}
            </Button>
          </>
        )}

        {step === "form" && (
          <>
            {error ? <ErrorBanner message={error} /> : null}
            <Text style={styles.required}>Ces trois informations sont obligatoires.</Text>

            <Field label={`${t("measurement.height")} *`}>
              <Input
                keyboardType="numeric"
                value={height}
                onChangeText={setHeight}
                placeholder="Ex. 170"
              />
            </Field>
            <Field label={`${t("measurement.weight")} *`}>
              <Input
                keyboardType="numeric"
                value={weight}
                onChangeText={setWeight}
                placeholder="Ex. 65"
              />
            </Field>
            <Field label={`${t("measurement.gender")} *`}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button variant={gender === "female" ? "primary" : "secondary"} onPress={() => setGender("female")} style={{ flex: 1 }}>
                  Femme
                </Button>
                <Button variant={gender === "male" ? "primary" : "secondary"} onPress={() => setGender("male")} style={{ flex: 1 }}>
                  Homme
                </Button>
              </View>
            </Field>
            <Button fullWidth disabled={validateForm() !== null} onPress={goToCapture}>
              {t("common.next")}
            </Button>
          </>
        )}

        {step === "capture" && (
          <>
            {error ? <ErrorBanner message={error} /> : null}
            <CapturePicker label={t("measurement.capture.front")} file={front} onPick={() => pick(setFront)} />
            <CapturePicker label={t("measurement.capture.side")} file={side} onPick={() => pick(setSide)} />
            <Button fullWidth onPress={submitPhotos} disabled={!front || !side}>
              {t("common.confirm")}
            </Button>
          </>
        )}

        {step === "processing" && <Spinner label={t("measurement.processing")} />}

        {step === "review" && (
          <>
            <Text style={styles.reviewTitle}>{t("measurement.review.title")}</Text>
            <Text style={styles.reviewNote}>{t("measurement.review.note")}</Text>
            {Object.entries(data)
              .filter(([k]) => k !== "height_total")
              .map(([key, value]) => (
                <MeasurementRow
                  key={key}
                  measureKey={key}
                  value={value}
                  editable
                  onChange={(v) => setData((d) => ({ ...d, [key]: v }))}
                />
              ))}
            <View style={{ height: 16 }} />
            <Button fullWidth onPress={confirm}>
              {t("common.confirm")}
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

function CapturePicker({ label, file, onPick }: { label: string; file: PickedFile | null; onPick: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={[styles.capture, file && styles.captureFilled]} onPress={onPick}>
      {file ? <CheckCircle2 size={24} color={colors.success} /> : <Camera size={24} color={colors.textSecondary} />}
      <Text style={styles.captureLabel}>{file ? file.name : label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  body: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
  bullet: { fontSize: 13, color: colors.indigoText, fontFamily: fonts.body },
  required: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 14 },
  capture: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radii.card,
    padding: 18,
    alignItems: "center",
    marginBottom: 12,
  },
  captureFilled: { backgroundColor: colors.backgroundAlt, borderStyle: "solid" },
  captureLabel: { fontSize: 12, marginTop: 6, color: colors.indigoText, fontFamily: fonts.body },
  reviewTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
  reviewNote: { fontSize: 11, color: colors.textSecondary, marginTop: 2, marginBottom: 8, fontFamily: fonts.body },
});
