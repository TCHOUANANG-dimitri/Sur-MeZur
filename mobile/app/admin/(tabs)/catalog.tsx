import { useFocusEffect } from "expo-router";
import { Camera, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { userMessage } from "../../../src/api/client";
import { AdminCatalogApi, CatalogApi } from "../../../src/api/endpoints";
import type { Category, GarmentModel } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import {
  EmptyState,
  ErrorBanner,
  Header,
  Input,
  Spinner,
} from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";
import { useI18n } from "../../../src/i18n/I18nProvider";

type Tab = "categories" | "models";

export default function AdminCatalog() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [tab, setTab] = useState<Tab>("categories");
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Category form
  const [catName, setCatName] = useState("");
  const [catGender, setCatGender] = useState<"male" | "female" | "unisex">("male");
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Model form
  const [modelName, setModelName] = useState("");
  const [modelDesc, setModelDesc] = useState("");
  const [modelCategoryId, setModelCategoryId] = useState("");
  const [modelPrice, setModelPrice] = useState("");
  const [editingModel, setEditingModel] = useState<GarmentModel | null>(null);

  const loadCategories = useCallback(() => {
    CatalogApi.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const loadModels = useCallback(() => {
    CatalogApi.models({}).then(setModels).catch(() => setModels([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
      loadModels();
    }, [loadCategories, loadModels])
  );

  // --- Category CRUD -------------------------------------------------------

  const resetCatForm = () => {
    setCatName("");
    setCatGender("male");
    setEditingCat(null);
  };

  const saveCategory = async () => {
    if (!catName.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (editingCat) {
        await AdminCatalogApi.updateCategory(editingCat.id, { name: catName.trim(), gender: catGender });
      } else {
        await AdminCatalogApi.createCategory({ name: catName.trim(), gender: catGender });
      }
      resetCatForm();
      loadCategories();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteCategory = (cat: Category) => {
    Alert.alert(
      "Supprimer la catégorie",
      `Supprimer « ${cat.name} » ?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await AdminCatalogApi.deleteCategory(cat.id);
              loadCategories();
              loadModels();
            } catch (e) {
              setError(userMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  // --- Model CRUD ----------------------------------------------------------

  const resetModelForm = () => {
    setModelName("");
    setModelDesc("");
    setModelCategoryId("");
    setModelPrice("");
    setEditingModel(null);
  };

  const saveModel = async () => {
    if (!modelName.trim() || !modelCategoryId) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        name: modelName.trim(),
        description: modelDesc || undefined,
        category_id: modelCategoryId,
        base_price: modelPrice ? parseFloat(modelPrice) : undefined,
      };
      if (editingModel) {
        await AdminCatalogApi.updateModel(editingModel.id, body);
      } else {
        await AdminCatalogApi.createModel(body);
      }
      resetModelForm();
      loadModels();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteModel = (m: GarmentModel) => {
    Alert.alert(
      "Supprimer le modèle",
      `Supprimer « ${m.name} » ?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await AdminCatalogApi.deleteModel(m.id);
              loadModels();
            } catch (e) {
              setError(userMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const pickAndUploadPhotos = async (modelId: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    setBusy(true);
    setError("");
    try {
      const files = result.assets.map((a) => ({
        uri: a.uri,
        name: a.uri.split("/").pop() || "photo.jpg",
        type: a.mimeType || "image/jpeg",
      }));
      await AdminCatalogApi.uploadModelPhotos(modelId, files);
      loadModels();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const genders: { value: "male" | "female" | "unisex"; label: string }[] = [
    { value: "male", label: "Homme" },
    { value: "female", label: "Femme" },
    { value: "unisex", label: "Unisexe" },
  ];

  return (
    <Screen scroll={false}>
      <Header title="Catalogue" />

      <View style={styles.controls}>
        <View style={styles.filterRow}>
          <Chip
            label="Catégories"
            active={tab === "categories"}
            onPress={() => setTab("categories")}
          />
          <Chip
            label="Modèles"
            active={tab === "models"}
            onPress={() => setTab("models")}
          />
        </View>
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 8 }}>
        {!categories || !models ? (
          <Spinner />
        ) : tab === "categories" ? (
          <>
            {/* Category form */}
            <Card style={{ marginBottom: 14 }}>
              <Text style={styles.formTitle}>
                {editingCat ? "Modifier la catégorie" : "Nouvelle catégorie"}
              </Text>
              <Input
                value={catName}
                onChangeText={setCatName}
                placeholder="Nom (ex: Chemises)"
                style={styles.input}
              />
              <View style={styles.genderRow}>
                {genders.map((g) => (
                  <Chip
                    key={g.value}
                    label={g.label}
                    active={catGender === g.value}
                    onPress={() => setCatGender(g.value)}
                  />
                ))}
              </View>
              <View style={styles.formActions}>
                {editingCat && (
                  <Button variant="secondary" onPress={resetCatForm}>
                    Annuler
                  </Button>
                )}
                <Button onPress={saveCategory} disabled={busy || !catName.trim()}>
                  {busy ? "…" : editingCat ? "Mettre à jour" : "Créer"}
                </Button>
              </View>
            </Card>

            {/* Category list */}
            {categories.length === 0 ? (
              <EmptyState text="Aucune catégorie" />
            ) : (
              categories.map((cat) => (
                <Card key={cat.id} style={{ marginBottom: 8 }}>
                  <View style={styles.row}>
                    <View style={styles.catIcon}>
                      <FolderOpen size={16} color={colors.violetPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.catName}>{cat.name}</Text>
                      <Text style={styles.catMeta}>
                        {cat.gender === "male" ? "Homme" : cat.gender === "female" ? "Femme" : "Unisexe"}{" "}
                        ·{" "}
                        {models.filter((m) => m.category.id === cat.id).length} modèle(s)
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => {
                        setEditingCat(cat);
                        setCatName(cat.name);
                        setCatGender(cat.gender);
                      }}
                    >
                      <Pencil size={14} color={colors.violetPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => confirmDeleteCategory(cat)}
                    >
                      <Trash2 size={14} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </Card>
              ))
            )}
          </>
        ) : (
          <>
            {/* Model form */}
            <Card style={{ marginBottom: 14 }}>
              <Text style={styles.formTitle}>
                {editingModel ? "Modifier le modèle" : "Nouveau modèle"}
              </Text>
              <Input
                value={modelName}
                onChangeText={setModelName}
                placeholder="Nom (ex: Chemise classique)"
                style={styles.input}
              />
              <Input
                value={modelDesc}
                onChangeText={setModelDesc}
                placeholder="Description (optionnel)"
                style={styles.input}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, marginBottom: 10 }}
              >
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    active={modelCategoryId === c.id}
                    onPress={() => setModelCategoryId(c.id)}
                  />
                ))}
              </ScrollView>
              <Input
                value={modelPrice}
                onChangeText={setModelPrice}
                placeholder="Prix de base (optionnel)"
                keyboardType="numeric"
                style={styles.input}
              />
              <View style={styles.formActions}>
                {editingModel && (
                  <Button variant="secondary" onPress={resetModelForm}>
                    Annuler
                  </Button>
                )}
                <Button
                  onPress={saveModel}
                  disabled={busy || !modelName.trim() || !modelCategoryId}
                >
                  {busy ? "…" : editingModel ? "Mettre à jour" : "Créer"}
                </Button>
              </View>
            </Card>

            {/* Model list */}
            {models.length === 0 ? (
              <EmptyState text="Aucun modèle" />
            ) : (
              models.map((m) => (
                <Card key={m.id} style={{ marginBottom: 8 }}>
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.modelThumb,
                        { backgroundColor: m.thumbnail_color },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelName}>{m.name}</Text>
                      <Text style={styles.modelMeta}>
                        {m.category.name}
                        {m.base_price ? ` · ${m.base_price} FCFA` : ""}
                        {m.photos.length > 0
                          ? ` · ${m.photos.length} photo(s)`
                          : ""}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => pickAndUploadPhotos(m.id)}
                    >
                      <Camera size={14} color={colors.violetPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => {
                        setEditingModel(m);
                        setModelName(m.name);
                        setModelDesc(m.description || "");
                        setModelCategoryId(m.category.id);
                        setModelPrice(m.base_price?.toString() || "");
                      }}
                    >
                      <Pencil size={14} color={colors.violetPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => confirmDeleteModel(m)}
                    >
                      <Trash2 size={14} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    controls: { paddingHorizontal: 18, paddingTop: 14, gap: 10 },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    formTitle: {
      fontSize: 13,
      fontFamily: fonts.bodyBold,
      color: colors.indigoText,
      marginBottom: 10,
    },
    input: { marginBottom: 10 },
    genderRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
    formActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    catIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.violetTint,
      alignItems: "center",
      justifyContent: "center",
    },
    catName: {
      fontSize: 13,
      fontFamily: fonts.bodyBold,
      color: colors.indigoText,
    },
    catMeta: {
      fontSize: 11,
      color: colors.textSecondary,
      fontFamily: fonts.body,
      marginTop: 1,
    },
    modelThumb: {
      width: 40,
      height: 40,
      borderRadius: 8,
    },
    modelName: {
      fontSize: 13,
      fontFamily: fonts.bodyBold,
      color: colors.indigoText,
    },
    modelMeta: {
      fontSize: 11,
      color: colors.textSecondary,
      fontFamily: fonts.body,
      marginTop: 1,
    },
    iconBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: colors.backgroundAlt,
      alignItems: "center",
      justifyContent: "center",
    },
  });
