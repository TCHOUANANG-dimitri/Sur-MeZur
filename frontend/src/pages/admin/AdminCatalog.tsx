import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminApi } from "../../api/endpoints";
import type { Category, GarmentModel } from "../../api/types";
import { Button } from "../../components/Button";
import { Header, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

export default function AdminCatalog() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [models, setModels] = useState<GarmentModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", base_price: "", category_id: "", thumbnail_color: "#7C3AED", style_tags: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AdminApi.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingModels(true);
    AdminApi.models({ category_id: selectedCat || undefined })
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [selectedCat]);

  const createModel = async () => {
    if (!form.name || !form.category_id) return;
    setSaving(true);
    try {
      const m = await AdminApi.createModel({
        name: form.name,
        description: form.description || undefined,
        base_price: form.base_price ? parseFloat(form.base_price) : undefined,
        category_id: form.category_id,
        thumbnail_color: form.thumbnail_color,
        style_tags: form.style_tags.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setModels((prev) => [m, ...prev]);
      setShowForm(false);
      setForm({ name: "", description: "", base_price: "", category_id: "", thumbnail_color: "#7C3AED", style_tags: "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title="Catalogue" />
      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {/* Catégories */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: colors.indigoText, margin: 0 }}>Catégories</p>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              border: `1px solid ${colors.violetPrimary}`,
              borderRadius: radii.chip,
              background: showForm ? colors.violetPrimary : "transparent",
              color: showForm ? "#fff" : colors.violetPrimary,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {showForm ? "Annuler" : "+ Ajouter"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <button
            onClick={() => setSelectedCat(null)}
            style={{
              padding: "6px 14px",
              borderRadius: radii.chip,
              border: `1px solid ${!selectedCat ? colors.violetPrimary : colors.border}`,
              background: !selectedCat ? colors.violetPrimary : colors.white,
                color: !selectedCat ? "#fff" : colors.textSecondary,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tous
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
              style={{
                padding: "6px 14px",
                borderRadius: radii.chip,
                border: `1px solid ${selectedCat === cat.id ? colors.violetPrimary : colors.border}`,
                background: selectedCat === cat.id ? colors.violetPrimary : colors.white,
                color: selectedCat === cat.id ? "#fff" : colors.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Formulaire de création */}
        {showForm && (
          <div style={{ background: colors.backgroundAlt, borderRadius: radii.card, padding: 16, marginBottom: 18 }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>Nouveau modèle</p>
            <FormInput label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <FormInput label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
            <FormInput label="Prix de base (FCFA)" value={form.base_price} onChange={(v) => setForm({ ...form, base_price: v })} type="number" />
            <FormInput label="Tags (séparés par virgules)" value={form.style_tags} onChange={(v) => setForm({ ...form, style_tags: v })} />
            <label style={{ display: "block", margin: "8px 0 4px", fontSize: 12, fontWeight: 700 }}>Catégorie</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              style={{ width: "100%", padding: 8, border: `1px solid ${colors.border}`, borderRadius: radii.card, fontSize: 13, marginBottom: 10 }}
            >
              <option value="">— Sélectionner —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.gender})</option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700 }}>Couleur miniature</label>
              <input type="color" value={form.thumbnail_color} onChange={(e) => setForm({ ...form, thumbnail_color: e.target.value })} style={{ width: 32, height: 28, border: "none", cursor: "pointer" }} />
            </div>
            <Button fullWidth disabled={saving || !form.name || !form.category_id} onClick={createModel}>
              {saving ? "Création..." : "Créer le modèle"}
            </Button>
          </div>
        )}

        {/* Grille de modèles */}
        {loadingModels ? (
          <Spinner />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {models.map((m) => (
              <div
                key={m.id}
                onClick={() => navigate(`/admin/models/${m.id}`)}
                style={{ cursor: "pointer", borderRadius: radii.card, border: `1px solid ${colors.border}`, overflow: "hidden", background: colors.white }}
              >
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.name} style={{ width: "100%", height: 130, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: 130, background: `linear-gradient(160deg, ${m.thumbnail_color}, ${colors.indigoText})` }} />
                )}
                <div style={{ padding: "8px 10px" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: colors.textSecondary }}>{m.category.name}</p>
                </div>
              </div>
            ))}
            {models.length === 0 && (
              <p style={{ gridColumn: "1 / -1", textAlign: "center", color: colors.textSecondary, fontSize: 13, padding: 20 }}>
                Aucun modèle dans cette catégorie.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: 8, border: `1px solid ${colors.border}`, borderRadius: radii.card, fontSize: 13, boxSizing: "border-box" }}
      />
    </label>
  );
}
