import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Shirt } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AvatarsApi, CatalogApi, MeasurementsApi, TryonApi } from "../../../src/api/endpoints";
import type { Accessory, Avatar, Fabric, GarmentModel, Measurement } from "../../../src/api/types";
import { fileUrl } from "../../../src/api/client";
import { BottomSheet } from "../../../src/components/BottomSheet";
import { Button } from "../../../src/components/Button";
import { Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Viewer3D } from "../../../src/components/Viewer3D";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { colors, fonts, radii } from "../../../src/theme/tokens";

export default function TryOn() {
  const params = useLocalSearchParams<{ avatarId?: string; modelId?: string; tailorId?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [models, setModels] = useState<GarmentModel[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [modelId, setModelId] = useState(params.modelId || "");
  const [fabricId, setFabricId] = useState("");
  const [selectedAcc, setSelectedAcc] = useState<string[]>([]);
  const [previewAcc, setPreviewAcc] = useState<Accessory | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    CatalogApi.models().then(setModels);
    CatalogApi.fabrics().then((list) => {
      setFabrics(list);
      if (list[0]) setFabricId(list[0].id);
    });
    CatalogApi.accessories().then(setAccessories);
  }, []);

  useEffect(() => {
    if (params.avatarId) {
      AvatarsApi.get(params.avatarId).then(async (av) => {
        setAvatar(av);
        const list = await MeasurementsApi.list();
        setMeasurement(list.find((m) => m.id === av.measurement_id) || null);
      });
    }
  }, [params.avatarId]);

  useEffect(() => {
    if (params.modelId) setModelId(params.modelId);
  }, [params.modelId]);

  const selectedFabric = fabrics.find((f) => f.id === fabricId);

  const finalize = async () => {
    if (!avatar || !modelId) return;
    setFinalizing(true);
    try {
      let session = await TryonApi.create({
        avatar_id: avatar.id,
        garment_model_id: modelId,
        fabric_id: fabricId || undefined,
        accessory_ids: selectedAcc,
      });
      for (let i = 0; i < 10 && session.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, 800));
        session = await TryonApi.get(session.id);
      }
      router.push("/client/tryon-history");
    } finally {
      setFinalizing(false);
    }
  };

  const openSheet = () => {
    setPreviewAcc(null);
    setSheetOpen(true);
  };

  if (!params.avatarId) {
    return (
      <Screen>
        <Header title={t("tryon.title")} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Prenez d'abord vos mesures pour générer votre avatar.</Text>
          <Button onPress={() => router.push("/client/measurements")}>{t("measurement.intro.title")}</Button>
        </View>
      </Screen>
    );
  }

  if (!avatar) return <Spinner />;

  return (
    <Screen scroll={false}>
      <Header title={t("tryon.title")} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 }}>
        <Viewer3D
          skinToneHex={avatar.skin_tone_hex}
          garmentColorHex={selectedFabric?.color_hex}
          measurements={measurement?.data}
          height={320}
        />

        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>{t("tryon.selectModel")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {models.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => setModelId(m.id)}
                style={[
                  styles.swatch,
                  { backgroundColor: m.thumbnail_color },
                  modelId === m.id && styles.swatchActive,
                ]}
              />
            ))}
          </ScrollView>
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>{t("tryon.selectFabric")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {fabrics.map((f) => (
              <TouchableOpacity
                key={f.id}
                onPress={() => setFabricId(f.id)}
                style={[
                  styles.circleSwatch,
                  { backgroundColor: f.color_hex },
                  fabricId === f.id && styles.circleSwatchActive,
                ]}
              />
            ))}
          </ScrollView>
        </View>

        <Button variant="secondary" fullWidth onPress={openSheet} style={{ marginTop: 16 }}>
          {t("tryon.addAccessory")} {selectedAcc.length > 0 ? `(${selectedAcc.length})` : ""}
        </Button>

        <Button fullWidth loading={finalizing} disabled={!modelId} onPress={finalize} style={{ marginTop: 10 }}>
          {t("tryon.finalize")}
        </Button>
      </ScrollView>

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={t("tryon.addAccessory")}>
        {previewAcc ? (
          <View>
            <View style={styles.previewImageWrap}>
              {fileUrl(previewAcc.asset_url) ? (
                <Image source={{ uri: fileUrl(previewAcc.asset_url) }} style={styles.previewImage} resizeMode="contain" />
              ) : (
                <Shirt size={48} color={colors.textSecondary} strokeWidth={1.2} />
              )}
            </View>
            <Text style={styles.previewName}>{previewAcc.name}</Text>
            <Button
              fullWidth
              variant={selectedAcc.includes(previewAcc.id) ? "danger" : "primary"}
              onPress={() =>
                setSelectedAcc((prev) =>
                  prev.includes(previewAcc.id) ? prev.filter((id) => id !== previewAcc.id) : [...prev, previewAcc.id]
                )
              }
              style={{ marginTop: 12 }}
            >
              {selectedAcc.includes(previewAcc.id) ? "Retirer" : t("tryon.addAccessory")}
            </Button>
            <Button variant="text" fullWidth onPress={() => setPreviewAcc(null)} style={{ marginTop: 4 }}>
              ← Retour à la liste
            </Button>
          </View>
        ) : (
          accessories.map((a) => {
            const selected = selectedAcc.includes(a.id);
            return (
              <TouchableOpacity key={a.id} style={styles.accRow} onPress={() => setPreviewAcc(a)}>
                <View style={styles.accThumb}>
                  {fileUrl(a.asset_url) ? (
                    <Image source={{ uri: fileUrl(a.asset_url) }} style={styles.accThumbImage} resizeMode="contain" />
                  ) : (
                    <Shirt size={18} color={colors.textSecondary} strokeWidth={1.2} />
                  )}
                </View>
                <Text style={styles.accName}>{a.name}</Text>
                {selected && <CheckCircle2 size={18} color={colors.success} />}
              </TouchableOpacity>
            );
          })
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { padding: 24, alignItems: "center", gap: 14 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", fontFamily: fonts.body },
  label: { fontSize: 12, fontFamily: fonts.bodyBold, marginBottom: 8, color: colors.indigoText },
  swatch: { width: 64, height: 64, borderRadius: radii.button, borderWidth: 3, borderColor: "transparent" },
  swatchActive: { borderColor: colors.violetPrimary },
  circleSwatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  circleSwatchActive: { borderWidth: 3, borderColor: colors.violetPrimary },
  accRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accThumb: {
    width: 40,
    height: 40,
    borderRadius: radii.button,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  accThumbImage: { width: 32, height: 32 },
  accName: { flex: 1, fontSize: 13, color: colors.indigoText, fontFamily: fonts.body },
  previewImageWrap: {
    height: 180,
    borderRadius: radii.card,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: { width: "100%", height: "100%" },
  previewName: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.indigoText, marginTop: 12, textAlign: "center" },
});
