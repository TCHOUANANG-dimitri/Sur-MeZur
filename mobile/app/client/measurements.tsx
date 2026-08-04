import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Camera, CheckCircle2, ImageUp, X } from "lucide-react-native";
import React, { useState } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MeasurementsApi } from "../../src/api/endpoints";
import type { PickedFile } from "../../src/api/endpoints";
import { BottomSheet } from "../../src/components/BottomSheet";
import { Button } from "../../src/components/Button";
import { MeasurementRow } from "../../src/components/DomainCards";
import { ErrorBanner, Field, Header, Input, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { useI18n } from "../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../src/theme/tokens";

type Step = "intro" | "form" | "capture" | "processing" | "review";

export default function MeasurementFlow() {
  const { colors } = useTheme();
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
  // Which slot the source-picker sheet is currently choosing for.
  const [pickingTarget, setPickingTarget] = useState<"front" | "side" | null>(null);
  // Flips once the analysis outlasts the fast (warm) path — see submitPhotos.
  const [processingSlow, setProcessingSlow] = useState(false);

  const setForTarget = (target: "front" | "side", file: PickedFile) => {
    if (target === "front") setFront(file);
    else setSide(file);
  };

  const openPicker = (target: "front" | "side") => {
    setError("");
    setPickingTarget(target);
  };

  const pickFromCamera = async () => {
    const target = pickingTarget;
    setPickingTarget(null);
    if (!target) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Autorisez l'accès à l'appareil photo dans les réglages pour prendre une photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setForTarget(target, {
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
    });
  };

  /** The explicit "upload" path: pick an existing photo instead of shooting a
   *  new one — some clients have a portrait already taken by someone else. */
  const pickFromLibrary = async () => {
    const target = pickingTarget;
    setPickingTarget(null);
    if (!target) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Autorisez l'accès à vos photos dans les réglages pour en importer une.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setForTarget(target, {
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
    setProcessingSlow(false);
    setStep("processing");
    try {
      const session = await MeasurementsApi.createSession({
        height_cm: heightNum,
        weight_kg: weightNum,
        gender: gender as "female" | "male",
      });
      let current = await MeasurementsApi.uploadPhotos(session.id, front, side);
      // The vision pipeline (MediaPipe/SAM) pays a one-off warm-up cost on the
      // first request after a server restart — observed 10-90+s there vs ~2s
      // once warm. A short budget here would report "failed" while the backend
      // is still quietly finishing the job, so this stays generous; the label
      // below keeps the wait from reading as broken.
      const POLL_INTERVAL_MS = 1500;
      const MAX_ATTEMPTS = 60; // ~90s ceiling
      const SLOW_AFTER_ATTEMPTS = 6; // ~9s: switch to the "premiere fois" hint
      for (let i = 0; i < MAX_ATTEMPTS && current.status === "processing"; i++) {
        if (i === SLOW_AFTER_ATTEMPTS) setProcessingSlow(true);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
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
              <Text style={styles.bullet}>• Fond dégagé, bonne lumière</Text>
            </View>
            <Text style={styles.poseTitle}>Photo de face</Text>
            <Text style={styles.bullet}>• Bras légèrement écartés du corps, à ~45°</Text>
            <Text style={styles.poseTitle}>Photo de profil</Text>
            <Text style={styles.bullet}>
              • Mains derrière la tête, coudes vers l'arrière — pas les bras le long du
              corps : cela cache la silhouette et fausse la mesure de profondeur.
            </Text>
            <Button fullWidth onPress={() => setStep("form")} style={{ marginTop: 12 }}>
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
            <Text style={styles.captureHint}>
              Prenez une photo ou importez-en une déjà existante depuis votre galerie.
            </Text>
            <CapturePicker
              label={t("measurement.capture.front")}
              file={front}
              onPick={() => openPicker("front")}
              onClear={() => setFront(null)}
            />
            <Text style={styles.poseReminder}>Bras écartés à ~45°</Text>
            <CapturePicker
              label={t("measurement.capture.side")}
              file={side}
              onPick={() => openPicker("side")}
              onClear={() => setSide(null)}
            />
            <Text style={styles.poseReminder}>Mains derrière la tête, coudes vers l'arrière</Text>
            <Button fullWidth onPress={submitPhotos} disabled={!front || !side}>
              {t("common.confirm")}
            </Button>
          </>
        )}

        {step === "processing" && (
          <>
            <Spinner
              label={
                processingSlow
                  ? "Cette première analyse peut prendre jusqu'à une minute…"
                  : t("measurement.processing")
              }
            />
            {processingSlow && (
              // The upload already succeeded and the backend job runs
              // independently of this screen — leaving doesn't cancel
              // anything, it just stops watching. The `measurement_ready`
              // notification (wired server-side) picks up the wait once the
              // user's gone, so there's no need to hold them on a spinner.
              <Button
                variant="text"
                fullWidth
                onPress={() => router.replace("/client/(tabs)/home")}
                style={{ marginTop: 4 }}
              >
                Continuer sans attendre — je serai notifié·e
              </Button>
            )}
          </>
        )}

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

      <BottomSheet
        visible={pickingTarget !== null}
        onClose={() => setPickingTarget(null)}
        title="Choisir une photo"
      >
        <TouchableOpacity style={styles.sourceRow} onPress={pickFromCamera}>
          <View style={styles.sourceIcon}>
            <Camera size={18} color={colors.violetPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sourceLabel}>Prendre une photo</Text>
            <Text style={styles.sourceHint}>Utiliser l'appareil photo maintenant</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sourceRow} onPress={pickFromLibrary}>
          <View style={styles.sourceIcon}>
            <ImageUp size={18} color={colors.violetPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sourceLabel}>Importer depuis la galerie</Text>
            <Text style={styles.sourceHint}>Choisir une photo déjà existante</Text>
          </View>
        </TouchableOpacity>
      </BottomSheet>
    </Screen>
  );
}

function CapturePicker({
  label,
  file,
  onPick,
  onClear,
}: {
  label: string;
  file: PickedFile | null;
  onPick: () => void;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (file) {
    return (
      <View style={[styles.capture, styles.captureFilled]}>
        <Image source={{ uri: file.uri }} style={styles.capturePreview} resizeMode="cover" />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={16} color={colors.success} />
            <Text style={[styles.captureLabel, { marginTop: 0 }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
          <TouchableOpacity onPress={onPick} hitSlop={6}>
            <Text style={styles.captureChange}>Changer la photo</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onClear} hitSlop={8} style={styles.captureRemove}>
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.capture} onPress={onPick}>
      <Camera size={24} color={colors.textSecondary} />
      <Text style={styles.captureLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  body: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
  bullet: { fontSize: 13, color: colors.indigoText, fontFamily: fonts.body },
  poseTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.indigoText,
    fontFamily: fonts.body,
    marginTop: 10,
    marginBottom: 2,
  },
  required: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 14 },
  captureHint: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 14 },
  poseReminder: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fonts.body,
    marginTop: -8,
    marginBottom: 12,
  },
  capture: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radii.card,
    padding: 18,
    alignItems: "center",
    marginBottom: 12,
  },
  captureFilled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.backgroundAlt,
    borderStyle: "solid",
  },
  capturePreview: { width: 48, height: 48, borderRadius: radii.button },
  captureLabel: { fontSize: 12, marginTop: 6, color: colors.indigoText, fontFamily: fonts.bodySemiBold, flexShrink: 1 },
  captureChange: { fontSize: 11, color: colors.violetPrimary, fontFamily: fonts.bodySemiBold, marginTop: 4 },
  captureRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.violetTint,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.indigoText },
  sourceHint: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 1 },
  reviewTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.indigoText },
  reviewNote: { fontSize: 11, color: colors.textSecondary, marginTop: 2, marginBottom: 8, fontFamily: fonts.body },
});
