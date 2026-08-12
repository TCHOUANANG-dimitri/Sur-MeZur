import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Plus, Shirt } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { BackHandler, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AvatarsApi, CatalogApi, MeasurementsApi, TryonApi } from "../../../src/api/endpoints";
import type { Accessory, Avatar, Fabric, GarmentModel, Measurement, TryonSession } from "../../../src/api/types";
import { avatarMeshUrl, fileUrl } from "../../../src/api/client";
import { BottomSheet } from "../../../src/components/BottomSheet";
import { Button } from "../../../src/components/Button";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Viewer3D } from "../../../src/components/Viewer3D";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

/**
 * Entering the try-on tab lands on the client's saved try-on sessions (their
 * avatar wearing the garment/fabric they picked). Tapping one opens its detail
 * — that's the only place a 3D context is mounted, so at most one GLView is
 * alive at a time. "Nouvel essayage" opens the configurator.
 */
type Mode = "list" | "detail" | "new";

export default function TryOn() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ avatarId?: string; modelId?: string; tailorId?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const deepLinked = Boolean(params.avatarId || params.modelId);
  const [mode, setMode] = useState<Mode>(deepLinked ? "new" : "list");

  const [sessions, setSessions] = useState<TryonSession[] | null>(null);
  const [models, setModels] = useState<GarmentModel[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);

  // Configurator ("new") state.
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [modelId, setModelId] = useState(params.modelId || "");
  const [fabricId, setFabricId] = useState("");
  const [selectedAcc, setSelectedAcc] = useState<string[]>([]);
  const [previewAcc, setPreviewAcc] = useState<Accessory | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Detail state.
  const [selected, setSelected] = useState<TryonSession | null>(null);
  const [detailAvatar, setDetailAvatar] = useState<Avatar | null>(null);
  const [detailMeasurement, setDetailMeasurement] = useState<Measurement | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    CatalogApi.models().then(setModels);
    CatalogApi.fabrics().then((list) => {
      setFabrics(list);
      if (list[0]) setFabricId((prev) => prev || list[0].id);
    });
    CatalogApi.accessories().then(setAccessories);
  }, []);

  const loadSessions = useCallback(() => {
    TryonApi.list()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  // Arriving from "try this model" / "avatar created" jumps straight to the
  // configurator rather than the list.
  useEffect(() => {
    if (params.modelId) setModelId(params.modelId);
    if (params.avatarId || params.modelId) setMode("new");
  }, [params.avatarId, params.modelId]);

  // The configurator needs an avatar: the one passed in, else the one behind
  // the most recent session (AvatarsApi has no list endpoint).
  const configAvatarId = params.avatarId || sessions?.[0]?.avatar_id;

  useEffect(() => {
    if (!configAvatarId) return;
    let cancelled = false;
    AvatarsApi.get(configAvatarId).then(async (av) => {
      if (cancelled) return;
      setAvatar(av);
      const list = await MeasurementsApi.list();
      if (cancelled) return;
      setMeasurement(list.find((m) => m.id === av.measurement_id) || null);
    });
    return () => {
      cancelled = true;
    };
  }, [configAvatarId]);

  const openDetail = async (session: TryonSession) => {
    setSelected(session);
    setMode("detail");
    setLoadingDetail(true);
    try {
      const av = await AvatarsApi.get(session.avatar_id);
      setDetailAvatar(av);
      const list = await MeasurementsApi.list();
      setDetailMeasurement(list.find((m) => m.id === av.measurement_id) || null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const backToList = () => {
    setMode("list");
    setSelected(null);
    setDetailAvatar(null);
    setDetailMeasurement(null);
  };

  /**
   * Detail and configurator are internal states, not routes, so Android's back
   * button finds nothing to pop in this screen and falls through to the tab
   * navigator — which lands the user on Home. Intercept it and step back to the
   * list instead; returning false outside the list keeps the default behaviour.
   */
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (mode !== "list") {
          backToList();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode])
  );

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
      loadSessions();
      backToList();
    } finally {
      setFinalizing(false);
    }
  };

  const goToOrder = () => {
    if (!selected || !detailAvatar) return;
    router.push({
      pathname: "/client/orders/new",
      params: {
        avatarId: selected.avatar_id,
        modelId: selected.garment_model_id || "",
        measurementId: detailAvatar.measurement_id,
        fabricId: selected.fabric_id || "",
        accessories: selected.accessory_ids.join(","),
      },
    });
  };

  // --- Detail -----------------------------------------------------------
  if (mode === "detail" && selected) {
    const model = models.find((m) => m.id === selected.garment_model_id);
    const fabric = fabrics.find((f) => f.id === selected.fabric_id);
    return (
      <Screen>
        <Header title={model?.name || t("tryon.title")} />
        <View style={{ padding: 18 }}>
          {loadingDetail || !detailAvatar ? (
            <Spinner />
          ) : (
            <>
              <Viewer3D
                glbUrl={avatarMeshUrl(detailAvatar)}
                skinToneHex={detailAvatar.skin_tone_hex}
                garmentColorHex={fabric?.color_hex}
                measurements={detailMeasurement?.data}
                height={340}
              />
              <Text style={styles.detailText}>
                {model?.name}
                {fabric ? ` · ${fabric.name}` : ""}
              </Text>
              {selected.accessory_ids.length > 0 && (
                <Text style={styles.detailSub}>
                  {selected.accessory_ids.length} accessoire
                  {selected.accessory_ids.length > 1 ? "s" : ""}
                </Text>
              )}
              <Button fullWidth onPress={goToOrder} style={{ marginTop: 16 }}>
                Passer commande
              </Button>
              <Button variant="secondary" fullWidth onPress={backToList} style={{ marginTop: 8 }}>
                Retour à mes essayages
              </Button>
            </>
          )}
        </View>
      </Screen>
    );
  }

  // --- Configurator -----------------------------------------------------
  if (mode === "new") {
    if (!configAvatarId) {
      return (
        <Screen>
          <Header title={t("tryon.title")} showBack={sessions !== null && sessions.length > 0} onBack={backToList} />
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
        <Header title={t("tryon.title")} showBack onBack={backToList} />
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 }}>
          <Viewer3D
            glbUrl={avatarMeshUrl(avatar)}
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
                  style={[styles.swatch, { backgroundColor: m.thumbnail_color }, modelId === m.id && styles.swatchActive]}
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

          <Button variant="secondary" fullWidth onPress={() => { setPreviewAcc(null); setSheetOpen(true); }} style={{ marginTop: 16 }}>
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
              const isSelected = selectedAcc.includes(a.id);
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
                  {isSelected && <CheckCircle2 size={18} color={colors.success} />}
                </TouchableOpacity>
              );
            })
          )}
        </BottomSheet>
      </Screen>
    );
  }

  // --- List (default) ---------------------------------------------------
  if (!sessions) return <Spinner />;

  return (
    <Screen>
      <Header title={t("tryon.title")} />
      <View style={{ padding: 18 }}>
        {sessions.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState text="Vous n'avez pas encore d'essayage. Créez-en un pour voir votre avatar habillé." />
            <Button onPress={() => setMode("new")}>Nouvel essayage</Button>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.newRow} onPress={() => setMode("new")} activeOpacity={0.7}>
              <Plus size={18} color={colors.violetPrimary} />
              <Text style={styles.newRowLabel}>Nouvel essayage</Text>
            </TouchableOpacity>

            <View style={styles.grid}>
              {sessions.map((s) => {
                const model = models.find((m) => m.id === s.garment_model_id);
                const fabric = fabrics.find((f) => f.id === s.fabric_id);
                return (
                  <TouchableOpacity key={s.id} style={styles.item} onPress={() => openDetail(s)} activeOpacity={0.8}>
                    <LinearGradient
                      colors={[fabric?.color_hex || model?.thumbnail_color || colors.violetPrimary, colors.indigoText]}
                      style={styles.thumb}
                    />
                    <Text style={styles.name}>{model?.name || "Modèle"}</Text>
                    {fabric && <Text style={styles.sub}>{fabric.name}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  emptyWrap: { padding: 24, alignItems: "center", gap: 14 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", fontFamily: fonts.body },
  label: { fontSize: 12, fontFamily: fonts.bodyBold, marginBottom: 8, color: colors.indigoText },
  swatch: { width: 64, height: 64, borderRadius: radii.button, borderWidth: 3, borderColor: "transparent" },
  swatchActive: { borderColor: colors.violetPrimary },
  circleSwatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  circleSwatchActive: { borderWidth: 3, borderColor: colors.violetPrimary },
  newRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.violetPrimary,
    marginBottom: 16,
  },
  newRowLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.violetPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  item: { width: "47%" },
  thumb: { height: 140, borderRadius: radii.card },
  name: { fontSize: 12, fontFamily: fonts.bodySemiBold, marginTop: 8, color: colors.indigoText },
  sub: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
  detailText: { marginTop: 14, fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.indigoText, textAlign: "center" },
  detailSub: { marginTop: 4, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, textAlign: "center" },
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
