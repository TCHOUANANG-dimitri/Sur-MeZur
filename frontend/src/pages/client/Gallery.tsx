import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CatalogApi } from "../../api/endpoints";
import type { Category, GarmentModel } from "../../api/types";
import { Chip } from "../../components/Chip";
import { Header, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

export default function Gallery() {
  const [params] = useSearchParams();
  const tailorId = params.get("tailorId") || "";
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);

  useEffect(() => {
    CatalogApi.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    CatalogApi.models({ category_id: categoryId || undefined }).then(setModels);
  }, [categoryId]);

  return (
    <div>
      <Header title="Galerie de modèles" onBack />
      <div style={{ display: "flex", gap: 8, padding: 16, overflowX: "auto" }}>
        {categories.map((cat) => (
          <Chip key={cat.id} label={cat.name} active={categoryId === cat.id} onClick={() => setCategoryId(categoryId === cat.id ? null : cat.id)} />
        ))}
      </div>
      <div style={{ padding: "0 16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {!models ? (
          <Spinner />
        ) : (
          models.map((m) => (
            <div
              key={m.id}
              onClick={() => navigate(`/client/models/${m.id}${tailorId ? `?tailorId=${tailorId}` : ""}`)}
              style={{ cursor: "pointer" }}
            >
              <div style={{ height: 150, borderRadius: radii.card, background: m.photo_url ? `url(${m.photo_url}) center/cover` : `linear-gradient(160deg, ${m.thumbnail_color}, ${colors.indigoText})` }} />
              <p style={{ fontSize: 12, fontWeight: 600, margin: "8px 0 0" }}>{m.name}</p>
              <p style={{ fontSize: 11, color: colors.textSecondary, margin: 0 }}>{m.category.name}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
