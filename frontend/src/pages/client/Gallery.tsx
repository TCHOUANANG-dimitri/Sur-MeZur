import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CatalogApi } from "../../api/endpoints";
import type { GarmentCategory, GarmentModel } from "../../api/types";
import { Chip } from "../../components/Chip";
import { Header, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

const CATEGORIES: GarmentCategory[] = ["top", "bottom", "dress", "traditional", "other"];

export default function Gallery() {
  const [params] = useSearchParams();
  const tailorId = params.get("tailorId") || "";
  const navigate = useNavigate();
  const [category, setCategory] = useState<GarmentCategory | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);

  useEffect(() => {
    CatalogApi.models({ category: category || undefined }).then(setModels);
  }, [category]);

  return (
    <div>
      <Header title="Galerie de modèles" onBack />
      <div style={{ display: "flex", gap: 8, padding: 16, overflowX: "auto" }}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={category === c} onClick={() => setCategory(category === c ? null : c)} />
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
              <div style={{ height: 150, borderRadius: radii.card, background: `linear-gradient(160deg, ${m.thumbnail_color}, ${colors.indigoText})` }} />
              <p style={{ fontSize: 12, fontWeight: 600, margin: "8px 0 0" }}>{m.name}</p>
              <p style={{ fontSize: 11, color: colors.textSecondary, margin: 0 }}>{m.category}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
