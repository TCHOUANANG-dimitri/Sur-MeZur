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
  const [portfolio, setPortfolio] = useState<PickedFile | null>(null);
  const [idCard, setIdCard] = useState<PickedFile | null>(null);
  const [atelierPhoto, setAtelierPhoto] = useState<PickedFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    TailorsApi.me()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  const pick = async (onPicked: (f: PickedFile) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    onPicked({ uri: asset.uri, name: asset.fileName || `file-${Date.now()}.jpg`, type: asset.mimeType || "image/jpeg" });
  };

  const submit = async () => {
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
        { portfolio: portfolio || undefined, id_card: idCard || undefined, atelier_photo: atelierPhoto || undefined }
      );
      setProfile(result);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (profile === undefined) return null;

  if (profile && profile.verification_status !== "rejected" && profile.shop_name) {
    return (
      <Screen>
        <Header title={t("tailor.verification.title")} />
        <View style={styles.statusWrap}>
          <StatusChip
            status={profile.verification_status === "approved" ? "success" : "pending"}
            label={profile.verification_status === "approved" ? "Vérifié" : t("tailor.verification.pending")}
          />
          <Text style={styles.statusText}>
            {profile.verification_status === "approved" ? "Votre profil est vérifié." : "Un administrateur va examiner votre dossier."}
          </Text>
          {profile.verification_status === "approved" && (
            <Button onPress={() => router.replace("/tailor/(tabs)/dashboard")}>{t("nav.dashboard")}</Button>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={t("tailor.verification.title")} />
      <View style={{ padding: 18 }}>
        {error ? <ErrorBanner message={error} /> : null}
        <Field label="Type">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button variant={tailorType === "individual" ? "primary" : "secondary"} onPress={() => setTailorType("individual")} style={{ flex: 1 }}>
              Individu
            </Button>
            <Button variant={tailorType === "atelier" ? "primary" : "secondary"} onPress={() => setTailorType("atelier")} style={{ flex: 1 }}>
              Atelier
            </Button>
          </View>
        </Field>
        <Field label="Nom de l'atelier / boutique">
          <Input value={shopName} onChangeText={setShopName} />
        </Field>
        <Field label="Bio">
          <Input value={bio} onChangeText={setBio} multiline style={{ minHeight: 70, textAlignVertical: "top" }} />
        </Field>
        <Field label="Ville">
          <Input value={city} onChangeText={setCity} />
        </Field>
        <FilePickerField label="Portfolio" file={portfolio} onPick={() => pick(setPortfolio)} />
        <FilePickerField label="Pièce d'identité" file={idCard} onPick={() => pick(setIdCard)} />
        <FilePickerField label="Photo de l'atelier" file={atelierPhoto} onPick={() => pick(setAtelierPhoto)} />
        <Button fullWidth loading={busy} disabled={!shopName} onPress={submit} style={{ marginTop: 8 }}>
          {t("common.send")}
        </Button>
      </View>
    </Screen>
  );
}

function FilePickerField({ label, file, onPick }: { label: string; file: PickedFile | null; onPick: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Field label={label}>
      <TouchableOpacity style={styles.fileRow} onPress={onPick}>
        {file ? <CheckCircle2 size={18} color={colors.success} /> : <Paperclip size={18} color={colors.textSecondary} />}
        <Text style={styles.fileLabel}>{file ? file.name : "Choisir un fichier"}</Text>
      </TouchableOpacity>
    </Field>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  statusWrap: { padding: 24, alignItems: "center", gap: 14 },
  statusText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", fontFamily: fonts.body },
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
