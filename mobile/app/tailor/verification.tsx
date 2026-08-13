import { userMessage } from "../../src/api/client";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { CheckCircle2, Paperclip } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TailorsApi } from "../../src/api/endpoints";
import type { PickedFile } from "../../src/api/endpoints";
import type { TailorProfile } from "../../src/api/types";
import { Button } from "../../src/components/Button";
import { ErrorBanner, Field, Header, Input } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { StatusChip } from "../../src/components/Chip";
import { useI18n } from "../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../src/theme/tokens";

export default function Verification() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<TailorProfile | null | undefined>(undefined);
  const [shopName, setShopName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("Douala");
  const [tailorType, setTailorType] = useState<"individual" | "atelier">("individual");
  const [selfPhoto, setSelfPhoto] = useState<PickedFile | null>(null);
  const [idCard, setIdCard] = useState<PickedFile | null>(null);
  const [atelierPhoto, setAtelierPhoto] = useState<PickedFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    TailorsApi.me()
      .then((p) => {
        setProfile(p);
        if (p?.shop_name) setShopName(p.shop_name);
        if (p?.bio) setBio(p.bio);
        if (p?.city) setCity(p.city);
        if (p?.tailor_type) setTailorType(p.tailor_type);
      })
      .catch(() => setProfile(null));
  }, []);

  const pick = async (onPicked: (f: PickedFile) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    onPicked({ uri: asset.uri, name: asset.fileName || `file-${Date.now()}.jpg`, type: asset.mimeType || "image/jpeg" });
  };

  const goToDashboard = () => router.replace("/tailor/(tabs)/dashboard");

  const submit = async () => {
    if (!selfPhoto || !idCard || !atelierPhoto) return;
    setError("");
    setBusy(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getCurrentPositionAsync({});
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch {
        /* geolocation optional */
      }
      const result = await TailorsApi.submitVerification(
        { tailor_type: tailorType, shop_name: shopName, bio, city, lat, lng },
        { self_photo: selfPhoto, id_card: idCard, atelier_photo: atelierPhoto }
      );
      setProfile(result);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (profile === undefined) return null;

  // Le statut vaut "pending" dès l'inscription, avant toute soumission : sans
  // ce signal (le seul document toujours présent après un premier envoi),
  // impossible de distinguer "vient de s'inscrire" de "dossier en cours
  // d'examen" — les deux affichaient le même écran d'attente sans issue.
  const hasSubmitted = !!profile?.atelier_photo_url;

  if (hasSubmitted && profile!.verification_status !== "rejected") {
    const approved = profile!.verification_status === "approved";
    return (
      <Screen>
        <Header title={t("tailor.verification.title")} />
        <View style={styles.statusWrap}>
          <StatusChip
            status={approved ? "success" : "pending"}
            label={approved ? t("common.verified") : t("tailor.verification.pending")}
          />
          <Text style={styles.statusText}>
            {approved ? t("tailor.verification.verified") : t("tailor.verification.reviewing")}
          </Text>
          <Button onPress={goToDashboard} style={{ marginTop: 4 }}>
            {t("nav.dashboard")}
          </Button>
        </View>
      </Screen>
    );
  }

  const rejected = hasSubmitted && profile!.verification_status === "rejected";
  const canSubmit = !!shopName && !!selfPhoto && !!idCard && !!atelierPhoto;

  return (
    <Screen>
      <Header title={t("tailor.verification.title")} />
      <View style={{ padding: 18 }}>
        {rejected && (
          <View style={styles.rejectedBanner}>
            <Text style={styles.rejectedText}>{t("tailor.verification.rejectedBanner")}</Text>
          </View>
        )}
        {!hasSubmitted && <Text style={styles.intro}>{t("tailor.verification.intro")}</Text>}
        {error ? <ErrorBanner message={error} /> : null}
        <Field label={t("tailor.verification.type")}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button variant={tailorType === "individual" ? "primary" : "secondary"} onPress={() => setTailorType("individual")} style={{ flex: 1 }}>
              {t("role.individual")}
            </Button>
            <Button variant={tailorType === "atelier" ? "primary" : "secondary"} onPress={() => setTailorType("atelier")} style={{ flex: 1 }}>
              {t("role.workshop")}
            </Button>
          </View>
        </Field>
        <Field label={t("tailor.verification.workshopName")}>
          <Input value={shopName} onChangeText={setShopName} />
        </Field>
        <Field label={t("tailor.verification.bio")}>
          <Input value={bio} onChangeText={setBio} multiline style={{ minHeight: 70, textAlignVertical: "top" }} />
        </Field>
        <Field label={t("tailor.verification.city")}>
          <Input value={city} onChangeText={setCity} />
        </Field>
        <FilePickerField label={t("tailor.verification.selfPhoto")} file={selfPhoto} onPick={() => pick(setSelfPhoto)} />
        <FilePickerField label={t("tailor.verification.identity")} file={idCard} onPick={() => pick(setIdCard)} />
        <FilePickerField label={t("tailor.verification.workshopPhoto")} file={atelierPhoto} onPick={() => pick(setAtelierPhoto)} />
        <Text style={styles.hint}>{t("tailor.verification.requiredHint")}</Text>
        <Button fullWidth loading={busy} disabled={!canSubmit} onPress={submit} style={{ marginTop: 8 }}>
          {t("common.send")}
        </Button>
        <Button variant="text" fullWidth onPress={goToDashboard} style={{ marginTop: 6 }}>
          {t("tailor.verification.later")}
        </Button>
      </View>
    </Screen>
  );
}

function FilePickerField({ label, file, onPick }: { label: string; file: PickedFile | null; onPick: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Field label={label}>
      <TouchableOpacity style={styles.fileRow} onPress={onPick}>
        {file ? <CheckCircle2 size={18} color={colors.success} /> : <Paperclip size={18} color={colors.textSecondary} />}
        <Text style={styles.fileLabel}>{file ? file.name : t("common.chooseFile")}</Text>
      </TouchableOpacity>
    </Field>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  statusWrap: { padding: 24, alignItems: "center", gap: 14 },
  statusText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", fontFamily: fonts.body },
  intro: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 14 },
  hint: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 4 },
  rejectedBanner: {
    backgroundColor: colors.errorBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  rejectedText: { fontSize: 12, color: colors.error, fontFamily: fonts.bodySemiBold },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  fileLabel: { fontSize: 12, color: colors.indigoText, fontFamily: fonts.body },
});
