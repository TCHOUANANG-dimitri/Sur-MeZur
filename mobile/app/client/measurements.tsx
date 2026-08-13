import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Camera, CheckCircle2, ImageUp, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ApiError, userMessage } from "../../src/api/client";
import { MeasurementsApi } from "../../src/api/endpoints";
import type { PickedFile } from "../../src/api/endpoints";
import { BottomSheet } from "../../src/components/BottomSheet";
import { Button } from "../../src/components/Button";
import { MeasurementRow } from "../../src/components/DomainCards";
import { GuidedCapture } from "../../src/components/GuidedCapture";
import { ErrorBanner, Field, Header, Input, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { useI18n } from "../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../src/theme/tokens";

type Step = "intro" | "form" | "capture" | "processing" | "review";

// Ordre d'affichage fixe : `Object.entries(data)` suit l'ordre du JSON reçu,
// qui dépend de l'ordre d'insertion côté serveur — deux appels pouvaient donc
// réordonner la liste sans raison visible pour l'utilisateur. Toute clé
// inconnue de cet ordre (nouvelle mesure ajoutée côté serveur) atterrit à la
// fin plutôt que de disparaître.
const DATA_ORDER = [
  "height_total", "chest", "waist", "hips", "shoulder",
  "biceps", "thigh", "neck", "wrist", "ankle",
  "sleeve_length", "inseam", "back_length",
];
const FEATURE_ORDER = [
  "stature_m", "weight_kg",
  "biacromialbreadth", "bideltoidbreadth", "hipbreadth",
  "sittingheight", "crotchheight",
  "chestbreadth", "waistbreadth", "chestdepth", "waistdepth", "buttockdepth",
  "chestbreadth_body", "chestdepth_body", "waistbreadth_body", "waistdepth_body",
  "hipbreadth_body", "buttockdepth_body",
];

function sortedEntries<T>(record: Record<string, T>, order: string[]): [string, T][] {
  return Object.entries(record).sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

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
  const [features, setFeatures] = useState<Record<string, number> | null>(null);
  const [confidence, setConfidence] = useState<Record<string, number> | null>(null);
  const [measurementId, setMeasurementId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Le polling attend jusqu'à ~90s : sans ce garde, un client qui quitte
  // l'écran pendant l'attente déclenchait des setState sur un composant
  // démonté.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  // Which slot the source-picker sheet is currently choosing for.
  const [pickingTarget, setPickingTarget] = useState<"front" | "side" | null>(null);
  const [captureTarget, setCaptureTarget] = useState<"front" | "side" | null>(null);
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

  /** Capture guidée : silhouette à l'écran + décompte, plutôt que l'appareil
   *  photo du système. Le cadrage et la pose conditionnent directement la
   *  qualité de la mesure — une photo mal cadrée fait échouer l'analyse. */
  const pickFromCamera = () => {
    const target = pickingTarget;
    setPickingTarget(null);
    if (!target) return;
    setError("");
    setCaptureTarget(target);
  };

  /** The explicit "upload" path: pick an existing photo instead of shooting a
   *  new one — some clients have a portrait already taken by someone else. */
  const pickFromLibrary = async () => {
    const target = pickingTarget;
    setPickingTarget(null);
    if (!target) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t("measurement.err.libraryPerm"));
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

  /** Blocks the step rather than the upload, so the user is told immediately.
   *  Mémoïsé : appelé à la fois dans `disabled={...}` (donc à chaque rendu du
   *  formulaire) et dans les handlers ci-dessous — sans useMemo, ce même
   *  calcul (6 comparaisons + accès i18n) tournait deux fois par frappe. */
  const formError = useMemo((): string | null => {
    if (!height.trim() || Number.isNaN(heightNum)) return t("measurement.err.height");
    if (heightNum <= 50 || heightNum >= 260) return t("measurement.err.heightRange");
    if (!weight.trim() || Number.isNaN(weightNum)) return t("measurement.err.weight");
    if (weightNum <= 20 || weightNum >= 400) return t("measurement.err.weightRange");
    if (!gender) return t("measurement.err.gender");
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, weight, gender, heightNum, weightNum]);

  const goToCapture = () => {
    if (formError) {
      setError(formError);
      return;
    }
    setError("");
    setStep("capture");
  };

  const submitPhotos = async () => {
    if (!front || !side) {
      setError(t("measurement.err.photos"));
      return;
    }
    if (formError) {
      setError(formError);
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
        if (!mountedRef.current) return;
        if (i === SLOW_AFTER_ATTEMPTS) setProcessingSlow(true);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (!mountedRef.current) return;
        current = await MeasurementsApi.getSession(session.id);
      }
      if (!mountedRef.current) return;
      if (current.status !== "ready" || !current.measurement_id) {
        throw new ApiError(0, current.error_message || t("measurement.err.failed"));
      }
      const list = await MeasurementsApi.list();
      if (!mountedRef.current) return;
      const measurement = list.find((m) => m.id === current.measurement_id) || list[0];
      setData(measurement.data);
      setFeatures(measurement.features);
      setConfidence(measurement.confidence);
      setMeasurementId(measurement.id);
      setStep("review");
    } catch (e) {
      if (!mountedRef.current) return;
      setError(userMessage(e));
      setStep("capture");
    }
  };

  const confirm = async () => {
    if (!measurementId) return;
    setConfirmError("");
    setConfirming(true);
    try {
      await MeasurementsApi.patch(measurementId, { data });
      router.push({ pathname: "/client/avatar", params: { measurementId } });
    } catch (e) {
      // Les corrections tapées en review ne doivent pas se perdre en silence :
      // on reste sur l'écran, avec l'erreur affichée, plutôt que de continuer
      // comme si l'enregistrement avait réussi.
      setConfirmError(userMessage(e));
    } finally {
      setConfirming(false);
    }
  };

  const handleBack = () => {
    if (step === "form") return setStep("intro");
    if (step === "capture") return setStep("form");
    if (step === "review") return setStep("capture");
    router.back();
  };

  const HEADER_TITLE: Record<Step, string> = {
    intro: t("measurement.intro.title"),
    form: t("measurement.intro.title"),
    capture: t("measurement.headerCapture"),
    processing: t("measurement.headerProcessing"),
    review: t("measurement.review.title"),
  };

  return (
    <Screen scroll={step !== "processing"}>
      <Header title={HEADER_TITLE[step]} showBack onBack={handleBack} />
      <View style={{ padding: 20 }}>
        {step === "intro" && (
          <>
            <Text style={styles.body}>{t("measurement.intro.body")}</Text>
            <View style={{ marginVertical: 12, gap: 4 }}>
              <Text style={styles.bullet}>• {t("capture.fit")}</Text>
              <Text style={styles.bullet}>• {t("capture.distance")}</Text>
            </View>
            <Text style={styles.poseTitle}>{t("capture.front.title")}</Text>
            <Text style={styles.bullet}>• {t("capture.front.arms")}</Text>
            <Text style={styles.poseTitle}>{t("capture.side.title")}</Text>
            <Text style={styles.bullet}>
              • {t("capture.side.hands")}
            </Text>
            <Button fullWidth onPress={() => setStep("form")} style={{ marginTop: 12 }}>
              {t("common.next")}
            </Button>
          </>
        )}

        {step === "form" && (
          <>
            {error ? <ErrorBanner message={error} /> : null}
            <Text style={styles.required}>{t("measurement.form.required")}</Text>

            <Field label={`${t("measurement.height")} *`}>
              <Input
                keyboardType="numeric"
                value={height}
                onChangeText={setHeight}
                placeholder={t("measurement.heightPlaceholder")}
              />
            </Field>
            <Field label={`${t("measurement.weight")} *`}>
              <Input
                keyboardType="numeric"
                value={weight}
                onChangeText={setWeight}
                placeholder={t("measurement.weightPlaceholder")}
              />
            </Field>
            <Field label={`${t("measurement.gender")} *`}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button variant={gender === "female" ? "primary" : "secondary"} onPress={() => setGender("female")} style={{ flex: 1 }}>
                  {t("measurement.gender.female")}
                </Button>
                <Button variant={gender === "male" ? "primary" : "secondary"} onPress={() => setGender("male")} style={{ flex: 1 }}>
                  {t("measurement.gender.male")}
                </Button>
              </View>
            </Field>
            <Button fullWidth disabled={formError !== null} onPress={goToCapture}>
              {t("common.next")}
            </Button>
          </>
        )}

        {step === "capture" && (
          <>
            {error ? <ErrorBanner message={error} /> : null}
            <Text style={styles.captureHint}>
              {t("measurement.takePhoto")}
            </Text>
            <CapturePicker
              label={t("measurement.capture.front")}
              file={front}
              onPick={() => openPicker("front")}
              onClear={() => setFront(null)}
            />
            <Text style={styles.poseReminder}>{t("measurement.armsHint")}</Text>
            <CapturePicker
              label={t("measurement.capture.side")}
              file={side}
              onPick={() => openPicker("side")}
              onClear={() => setSide(null)}
            />
            <Text style={styles.poseReminder}>{t("measurement.handsHint")}</Text>
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
                  ? t("measurement.firstRun")
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
                {t("measurement.continueWithoutWaiting")}
              </Button>
            )}
          </>
        )}

        {step === "review" && (
          <>
            <Text style={styles.reviewTitle}>{t("measurement.review.title")}</Text>
            <Text style={styles.reviewNote}>{t("measurement.review.note")}</Text>
            {/* Toutes les mesures sont affichées, hauteur totale comprise : le
                tailleur travaille sur l'ensemble, et masquer une valeur qu'il
                utilise l'obligerait à la redemander. */}
            {sortedEntries(data, DATA_ORDER)
              .map(([key, value]) => (
                <MeasurementRow
                  key={key}
                  measureKey={key}
                  value={value}
                  editable
                  confidence={confidence?.[key]}
                  onChange={(v) => setData((d) => ({ ...d, [key]: v }))}
                />
              ))}

            {features && Object.keys(features).length > 0 && (
              <>
                <Text style={styles.reviewTitle}>{t("measurement.review.inputsTitle")}</Text>
                <Text style={styles.reviewNote}>{t("measurement.review.inputsNote")}</Text>
                {/* Lecture seule : ce sont les entrées du modèle (squelette +
                    silhouette), pas les mesures finales — les corriger n'aurait
                    aucun effet, elles ne sont pas renvoyées au serveur. */}
                {sortedEntries(features, FEATURE_ORDER).map(([key, value]) => (
                  <MeasurementRow
                    key={key}
                    measureKey={key}
                    value={value}
                    unit={key === "weight_kg" ? "kg" : "cm"}
                    labelPrefix="feature"
                  />
                ))}
              </>
            )}

            {confirmError ? <ErrorBanner message={confirmError} /> : null}
            <View style={{ height: 16 }} />
            <Button fullWidth loading={confirming} onPress={confirm}>
              {t("common.confirm")}
            </Button>
          </>
        )}
      </View>

      <BottomSheet
        visible={pickingTarget !== null}
        onClose={() => setPickingTarget(null)}
        title={t("measurement.pickPhoto")}
      >
        <TouchableOpacity style={styles.sourceRow} onPress={pickFromCamera}>
          <View style={styles.sourceIcon}>
            <Camera size={18} color={colors.violetPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sourceLabel}>{t("measurement.guidedCapture")}</Text>
            <Text style={styles.sourceHint}>{t("measurement.guidedCaptureHint")}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sourceRow} onPress={pickFromLibrary}>
          <View style={styles.sourceIcon}>
            <ImageUp size={18} color={colors.violetPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sourceLabel}>{t("measurement.importFromGallery")}</Text>
            <Text style={styles.sourceHint}>{t("measurement.importFromGalleryHint")}</Text>
          </View>
        </TouchableOpacity>
      </BottomSheet>

      <GuidedCapture
        visible={captureTarget !== null}
        target={captureTarget ?? "front"}
        onCancel={() => setCaptureTarget(null)}
        onCaptured={(file) => {
          if (captureTarget) setForTarget(captureTarget, file);
          setCaptureTarget(null);
        }}
      />
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
  const { t } = useI18n();

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
            <Text style={styles.captureChange}>{t("measurement.changePhoto")}</Text>
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
