"use client";

// Catalogue admin : gestion des categories et des modeles (CRUD complet +
// upload des photos d'un modele). Deux onglets, comme sur le mobile.

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApi } from "@/lib/api/endpoints";
import type { Category, GarmentModel } from "@/lib/api/types";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from "@/components/ui";
import { assetUrl } from "@/components/admin/format";
import { IconCatalog, IconModels } from "@/components/icons";

type Tab = "categories" | "models";

const GENDERS: { value: "male" | "female" | "unisex"; label: string }[] = [
  { value: "male", label: "Homme" },
  { value: "female", label: "Femme" },
  { value: "unisex", label: "Unisexe" },
];

export default function AdminCatalog() {
  const [tab, setTab] = useState<Tab>("categories");
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Categorie
  const [catName, setCatName] = useState("");
  const [catGender, setCatGender] = useState<"male" | "female" | "unisex">("male");
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Modele
  const [modelName, setModelName] = useState("");
  const [modelDesc, setModelDesc] = useState("");
  const [modelCategoryId, setModelCategoryId] = useState("");
  const [modelPrice, setModelPrice] = useState("");
  const [editingModel, setEditingModel] = useState<GarmentModel | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const loadCategories = useCallback(() => {
    AdminApi.categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const loadModels = useCallback(() => {
    AdminApi.models({})
      .then(setModels)
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    loadCategories();
    loadModels();
  }, [loadCategories, loadModels]);

  const resetCatForm = () => {
    setCatName("");
    setCatGender("male");
    setEditingCat(null);
  };

  const saveCategory = async () => {
    if (!catName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      if (editingCat) {
        await AdminApi.updateCategory(editingCat.id, { name: catName.trim(), gender: catGender });
      } else {
        await AdminApi.createCategory({ name: catName.trim(), gender: catGender });
      }
      resetCatForm();
      loadCategories();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deleteCategory = async (cat: Category) => {
    if (busy) return;
    if (!window.confirm(`Supprimer la catégorie « ${cat.name} » ?`)) return;
    setBusy(true);
    setError("");
    try {
      await AdminApi.deleteCategory(cat.id);
      loadCategories();
      loadModels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resetModelForm = () => {
    setModelName("");
    setModelDesc("");
    setModelCategoryId("");
    setModelPrice("");
    setEditingModel(null);
  };

  const saveModel = async () => {
    if (!modelName.trim() || !modelCategoryId || busy) return;
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
        await AdminApi.updateModel(editingModel.id, body);
      } else {
        await AdminApi.createModel(body);
      }
      resetModelForm();
      loadModels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deleteModel = async (m: GarmentModel) => {
    if (busy) return;
    if (!window.confirm(`Supprimer le modèle « ${m.name} » ?`)) return;
    setBusy(true);
    setError("");
    try {
      await AdminApi.deleteModel(m.id);
      loadModels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onFilesSelected = async (files: FileList | null) => {
    const modelId = uploadTargetRef.current;
    const list = files ? Array.from(files) : [];
    if (!modelId || !list.length) return;
    setUploadingId(modelId);
    setError("");
    try {
      await AdminApi.uploadModelPhotos(modelId, list);
      loadModels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingId(null);
      uploadTargetRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const genderLabel = (g: string) =>
    g === "male" ? "Homme" : g === "female" ? "Femme" : "Unisexe";

  return (
    <div className="container">
      <PageHeader title="Catalogue" />
      <div className="section">
        <ErrorBanner message={error} />

        <div className="chipRow" style={{ marginBottom: 14 }}>
          <Chip active={tab === "categories"} onClick={() => setTab("categories")}>
            Catégories
          </Chip>
          <Chip active={tab === "models"} onClick={() => setTab("models")}>
            Modèles
          </Chip>
        </div>

        {!categories || !models ? (
          <Spinner label="Chargement…" />
        ) : tab === "categories" ? (
          <div className="adminStack">
            <Card>
              <div className="rowLabel" style={{ marginBottom: 10 }}>
                {editingCat ? "Modifier la catégorie" : "Nouvelle catégorie"}
              </div>
              <Field label="Nom">
                <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Nom (ex : Chemises)" />
              </Field>
              <div className="chipRow" style={{ marginBottom: 12 }}>
                {GENDERS.map((g) => (
                  <Chip key={g.value} active={catGender === g.value} onClick={() => setCatGender(g.value)}>
                    {g.label}
                  </Chip>
                ))}
              </div>
              <div className="adminActions">
                {editingCat && (
                  <Button variant="secondary" onClick={resetCatForm}>
                    Annuler
                  </Button>
                )}
                <Button disabled={busy || !catName.trim()} onClick={saveCategory}>
                  {busy ? "…" : editingCat ? "Mettre à jour" : "Créer"}
                </Button>
              </div>
            </Card>

            {categories.length === 0 ? (
              <EmptyState icon={<IconCatalog size={30} strokeWidth={1.6} />} title="Aucune catégorie" />
            ) : (
              categories.map((cat) => (
                <Card key={cat.id} variant="flat">
                  <div className="rowTop">
                    <div style={{ minWidth: 0 }}>
                      <div className="rowLabel">{cat.name}</div>
                      <div className="rowMeta">
                        {genderLabel(cat.gender)} · {models.filter((m) => m.category.id === cat.id).length} modèle(s)
                      </div>
                    </div>
                    <div className="adminActions" style={{ marginTop: 0 }}>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingCat(cat);
                          setCatName(cat.name);
                          setCatGender(cat.gender as never);
                        }}
                      >
                        Modifier
                      </Button>
                      <Button variant="danger" disabled={busy} onClick={() => deleteCategory(cat)}>
                        Supprimer
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : (
          <div className="adminStack">
            <Card>
              <div className="rowLabel" style={{ marginBottom: 10 }}>
                {editingModel ? "Modifier le modèle" : "Nouveau modèle"}
              </div>
              <Field label="Nom">
                <Input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="Nom (ex : Chemise classique)"
                />
              </Field>
              <Field label="Description (optionnel)">
                <Input value={modelDesc} onChange={(e) => setModelDesc(e.target.value)} placeholder="Description" />
              </Field>
              <Field label="Catégorie">
                <Select
                  value={modelCategoryId}
                  onChange={(e) => setModelCategoryId(e.target.value)}
                >
                  <option value="">Choisir…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prix de base (optionnel)">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={modelPrice}
                  onChange={(e) => setModelPrice(e.target.value)}
                  placeholder="Prix de base"
                />
              </Field>
              <div className="adminActions">
                {editingModel && (
                  <Button variant="secondary" onClick={resetModelForm}>
                    Annuler
                  </Button>
                )}
                <Button disabled={busy || !modelName.trim() || !modelCategoryId} onClick={saveModel}>
                  {busy ? "…" : editingModel ? "Mettre à jour" : "Créer"}
                </Button>
              </div>
            </Card>

            {models.length === 0 ? (
              <EmptyState icon={<IconModels size={30} strokeWidth={1.6} />} title="Aucun modèle" />
            ) : (
              models.map((m) => (
                <Card key={m.id}>
                  <div className="rowTop">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {assetUrl(m.photo_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="imgThumb"
                          src={assetUrl(m.photo_url)}
                          alt={m.name}
                          style={{ width: 44, height: 44 }}
                        />
                      ) : (
                        <span
                          className="imgThumb"
                          style={{ width: 44, height: 44, background: m.thumbnail_color }}
                          aria-hidden
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="rowLabel">{m.name}</div>
                        <div className="rowMeta">
                          {m.category.name}
                          {m.base_price ? ` · ${m.base_price} FCFA` : ""}
                          {m.photos.length > 0 ? ` · ${m.photos.length} photo(s)` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="adminActions" style={{ marginTop: 0 }}>
                      <Button
                        variant="ghost"
                        disabled={busy || uploadingId === m.id}
                        onClick={() => {
                          uploadTargetRef.current = m.id;
                          fileRef.current?.click();
                        }}
                      >
                        {uploadingId === m.id ? "…" : "Photos"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingModel(m);
                          setModelName(m.name);
                          setModelDesc(m.description || "");
                          setModelCategoryId(m.category.id);
                          setModelPrice(m.base_price?.toString() || "");
                        }}
                      >
                        Modifier
                      </Button>
                      <Button variant="danger" disabled={busy} onClick={() => deleteModel(m)}>
                        Supprimer
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Input fichier partage, declenche par les boutons « Photos ». */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFilesSelected(e.target.files)}
        />
      </div>
    </div>
  );
}