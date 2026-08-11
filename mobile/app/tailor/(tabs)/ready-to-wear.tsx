import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ImagePlus, Plus, Trash2, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { userMessage, ApiError, fileUrl } from "../../../src/api/client";
import { CatalogApi, TailorsApi } from "../../../src/api/endpoints";
import type { PickedFile } from "../../../src/api/endpoints";
import type { ReadyToWear as RTW } from "../../../src/api/types";
import { BottomSheet } from "../../../src/components/BottomSheet";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { EmptyState, ErrorBanner, Field, Header, Input, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

export default function ReadyToWear() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [items, setItems] = useState<RTW[] | null>(null);
  const [tailorProfile, setTailorProfile] = useState<{ verification_status: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setItems(await CatalogApi.myReadyToWear());
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const profile = await TailorsApi.me();
      setTailorProfile(profile);
    } catch {}
  }, []);

  const isVerified = tailorProfile?.verification_status === "approved";

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setItems([]));
      loadProfile();
    }, [load, loadProfile])
  );

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsMultipleSelection: true,
    });
    if (result.canceled || !result.assets?.length) return;
    setPhotos((prev) => [
      ...prev,
      ...result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName || `rtw-${Date.now()}-${i}.jpg`,
        type: a.mimeType || "image/jpeg",
      })),
    ]);
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setPhotos([]);
    setError("");
  };

  const submit = async () => {
    setError("");
    const priceNum = parseFloat(price) || 0;
    if (!name || priceNum <= 0) {
      setError("Nom et prix requis.");
      return;
    }
    setBusy(true);
    try {
      const created = await CatalogApi.createReadyToWear({
        name,
        description,
        price: priceNum,
        item_measurements: {},
        measurement_method: "standard",
        in_stock: true,
      });
      // Photos are a second call: the item must exist before files can be
      // attached to it.
      if (photos.length > 0) {
        await CatalogApi.uploadReadyToWearPhotos(created.id, photos);
      }
      setSheetOpen(false);
      resetForm();
      load();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (item: RTW) => {
    Alert.alert("Supprimer l'article", `Retirer « ${item.name} » de votre boutique ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? null);
          try {
            await CatalogApi.deleteReadyToWear(item.id);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  if (!items) return <Spinner />;

  return (
    <Screen>
      <Header
        title={t("nav.readyToWear")}
        right={
          <TouchableOpacity style={styles.addBtn} onPress={() => setSheetOpen(true)} hitSlop={8}>
            <Plus size={18} color={colors.white} />
          </TouchableOpacity>
        }
      />
      <View style={{ padding: 18 }}>
        {!isVerified && tailorProfile !== null && (
          <Card style={{ marginBottom: 14, backgroundColor: colors.pendingBg }}>
            <Text style={{ fontSize: 13, color: colors.pending, fontWeight: "600" }}>
              {t("tailor.verification.pending")} — {t("tailor.rtw.verificationRequired")}
            </Text>
          </Card>
        )}
        {items.length === 0 ? (
          <EmptyState
            text="Aucun article publié. Ajoutez vos pièces en stock avec leurs photos."
            cta={<Button onPress={() => setSheetOpen(true)}>{t("tailor.readyToWear.add")}</Button>}
          />
        ) : (
          <View style={styles.grid}>
            {items.map((it) => {
              const cover = it.photos?.[0] || it.photo_url;
              return (
                <Card key={it.id} style={styles.gridItem}>
                  <View style={styles.thumbWrap}>
                    {cover ? (
                      <Image source={{ uri: fileUrl(cover) }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <ImagePlus size={22} color={colors.textSecondary} />
                    )}
                    {it.photos?.length > 1 && (
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{it.photos.length}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.name}
                  </Text>
                  <Text style={styles.itemPrice}>{formatFcfa(it.price)}</Text>
                  <View style={styles.itemFooter}>
                    <Text style={[styles.stock, !it.in_stock && styles.stockOut]}>
                      {it.in_stock ? "En stock" : "Épuisé"}
                    </Text>
                    <TouchableOpacity onPress={() => confirmDelete(it)} hitSlop={8}>
                      <Trash2 size={15} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          resetForm();
        }}
        title={t("tailor.readyToWear.add")}
      >
        {error ? <ErrorBanner message={error} /> : null}
        <Field label="Nom">
          <Input value={name} onChangeText={setName} placeholder="Chemise en pagne, taille M" />
        </Field>
        <Field label="Description">
          <Input
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Matière, coupe, finitions…"
            style={{ minHeight: 70, textAlignVertical: "top" }}
          />
        </Field>
        <Field label="Prix (FCFA)">
          <Input keyboardType="numeric" value={price} onChangeText={setPrice} placeholder="12000" />
        </Field>

        <Field label={`Photos${photos.length > 0 ? ` (${photos.length})` : ""}`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity style={styles.picker} onPress={pickImages}>
              <ImagePlus size={20} color={colors.violetPrimary} />
              <Text style={styles.pickerText}>Ajouter</Text>
            </TouchableOpacity>
            {photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.previewWrap}>
                <Image source={{ uri: p.uri }} style={styles.preview} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.removeBtn}
                  hitSlop={6}
                  onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X size={11} color={colors.white} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </Field>

        <Button fullWidth loading={busy} onPress={submit} style={{ marginTop: 4 }}>
          {t("common.save")}
        </Button>
      </BottomSheet>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    addBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.violetPrimary,
      alignItems: "center",
      justifyContent: "center",
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    gridItem: { width: "47%", padding: 10 },
    thumbWrap: {
      height: 110,
      borderRadius: radii.button,
      backgroundColor: colors.backgroundAlt,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginBottom: 8,
    },
    thumb: { width: "100%", height: "100%" },
    countBadge: {
      position: "absolute",
      bottom: 6,
      right: 6,
      backgroundColor: colors.overlay,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    countBadgeText: { color: colors.white, fontSize: 10, fontFamily: fonts.bodyBold },
    itemName: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.indigoText, marginBottom: 3 },
    itemPrice: { fontSize: 12, color: colors.violetPrimary, fontFamily: fonts.bodyBold },
    itemFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
    stock: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.success },
    stockOut: { color: colors.textSecondary },
    picker: {
      width: 74,
      height: 74,
      borderRadius: radii.button,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.violetPrimary,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
    },
    pickerText: { fontSize: 10, color: colors.violetPrimary, fontFamily: fonts.bodySemiBold },
    previewWrap: { width: 74, height: 74, borderRadius: radii.button, overflow: "hidden" },
    preview: { width: "100%", height: "100%" },
    removeBtn: {
      position: "absolute",
      top: 3,
      right: 3,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
  });
