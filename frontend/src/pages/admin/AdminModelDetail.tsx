import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminApi } from "../../api/endpoints";
import type { Category, GarmentModel } from "../../api/types";
import { Button } from "../../components/Button";
import { Header, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

export default function AdminModelDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", description: "", base_price: "", category_id: "", thumbnail_color: "#7C3AED", style_tags: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    AdminApi.models({}).then((list) => {
      const found = list.find((m) => m.id === id);
      if (found) {
        setModel(found);
        setForm({
          name: found.name,
          description: found.description || "",
          base_price: found.base_price?.toString() || "",
          category_id: found.category.id,
          thumbnail_color: found.thumbnail_color,
          style_tags: found.style_tags.join(", "),
        });
      } else {
        setError("Modèle introuvable.");
      }
    }).catch(() => setError("Erreur de chargement."));
    AdminApi.categories().then(setCategories).catch(() => {});
  }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await AdminApi.updateModel(id, {
        name: form.name,
        description: form.description || undefined,
        base_price: form.base_price ? parseFloat(form.base_price) : undefined,
        category_id: form.category_id || undefined,
        thumbnail_color: form.thumbnail_color,
        style_tags: form.style_tags.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setModel(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const updated = await AdminApi.uploadModelPhotos(id, [file]);
      setModel(updated);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer ce modèle ?")) return;
    await AdminApi.deleteModel(id);
    navigate("/admin/catalog");
  };

  if (error) return <div style={{ padding: 40, textAlign: "center", color: colors.textSecondary }}>{error}</div>;
  if (!model) return <Spinner />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Header title={model.name} onBack />

      {/* Image — pleine largeur, jamais tronquée */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {model.photo_url ? (
          <img src={model.photo_url} alt={model.name} style={{ width: "100%", display: "block" }} />
        ) : (
          <div style={{ width: "100%", minHeight: 200, background: `linear-gradient(160deg, ${model.thumbnail_color}, ${colors.indigoText})` }} />
        )}

        <div style={{ padding: 18 }}>
          {/* Upload photo */}
          <label style={{ display: "inline-block", cursor: "pointer", fontSize: 12, color: colors.violetPrimary, fontWeight: 600, marginBottom: 14 }}>
            {uploading ? "Upload en cours..." : "Changer la photo"}
            <input type="file" accept="image/*" onChange={uploadPhoto} style={{ display: "none" }} />
          </label>

          {editing ? (
            /* Formulaire d'édition */
            <div>
              <Input label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Input label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
              <Input label="Prix de base (FCFA)" value={form.base_price} onChange={(v) => setForm({ ...form, base_price: v })} type="number" />
              <Input label="Tags (séparés par virgules)" value={form.style_tags} onChange={(v) => setForm({ ...form, style_tags: v })} />

              <label style={{ display: "block", margin: "10px 0 4px", fontSize: 12, fontWeight: 700 }}>Catégorie</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                style={{ width: "100%", padding: 8, border: `1px solid ${colors.border}`, borderRadius: radii.card, fontSize: 13, marginBottom: 10 }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.gender})</option>
                ))}
              </select>

              <label style={{ display: "block", margin: "10px 0 4px", fontSize: 12, fontWeight: 700 }}>Couleur miniature</label>
              <input type="color" value={form.thumbnail_color} onChange={(e) => setForm({ ...form, thumbnail_color: e.target.value })} style={{ width: 40, height: 32, border: "none", cursor: "pointer", marginBottom: 14 }} />

              <div style={{ display: "flex", gap: 8 }}>
                <Button fullWidth disabled={saving} onClick={save}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
                <Button fullWidth variant="secondary" onClick={() => setEditing(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            /* Vue détaillée */
            <div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", margin: "0 0 4px", color: colors.indigoText }}>{model.name}</h2>
              <p style={{ margin: "0 0 2px", fontSize: 12, color: colors.textSecondary }}>{model.category.name}</p>
              {model.base_price && (
                <p style={{ fontWeight: 700, color: colors.violetPrimary, margin: "4px 0" }}>~{model.base_price.toLocaleString("fr-FR")} FCFA</p>
              )}
              {model.description && (
                <p style={{ fontSize: 13, color: colors.textSecondary, margin: "6px 0 10px" }}>{model.description}</p>
              )}
              {model.style_tags.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {model.style_tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 11, background: colors.backgroundAlt, borderRadius: radii.chip, padding: "4px 10px" }}>{tag}</span>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 12, color: colors.textSecondary, margin: "0 0 14px" }}>{model.like_count} like(s)</p>

              <Button fullWidth onClick={() => setEditing(true)} style={{ marginBottom: 8 }}>
                Modifier
              </Button>
              <Button fullWidth variant="secondary" onClick={handleDelete} style={{ borderColor: "#EF4444", color: "#EF4444" }}>
                Supprimer
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
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
