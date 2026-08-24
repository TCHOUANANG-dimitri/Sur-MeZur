import React, { useEffect, useState } from "react";
import { AdminApi } from "../../api/endpoints";
import type { Category, GarmentModel } from "../../api/types";
import { Button } from "../../components/Button";
import { Header, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

export default function AdminCatalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    AdminApi.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCat) {
      setModels(null);
      return;
    }
    setLoadingModels(true);
    AdminApi.models({ category_id: selectedCat })
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [selectedCat]);

  const handleDeleteModel = async (id: string) => {
    if (!confirm("Supprimer ce modèle ?")) return;
    await AdminApi.deleteModel(id);
    setModels((prev) => prev?.filter((m) => m.id !== id) ?? null);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title="Catalogue" />
      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: colors.indigoText, margin: "0 0 10px" }}>
          Catégories
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
              style={{
                padding: "8px 14px",
                borderRadius: radii.chip,
                border: selectedCat === cat.id ? "none" : `1px solid ${colors.border}`,
                background: selectedCat === cat.id ? colors.violetPrimary : colors.white,
                color: selectedCat === cat.id ? colors.white : colors.indigoText,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {selectedCat && (
          <>
            <p style={{ fontSize: 12, fontWeight: 700, color: colors.indigoText, margin: "0 0 10px" }}>
              Modèles ({models?.length ?? 0})
            </p>
            {loadingModels ? (
              <Spinner />
            ) : models && models.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {models.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      background: colors.white,
                      borderRadius: radii.card,
                      border: `1px solid ${colors.border}`,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: 120,
                        background: m.photo_url
                          ? `url(${m.photo_url}) center/cover`
                          : `linear-gradient(160deg, ${m.thumbnail_color}, ${colors.indigoText})`,
                      }}
                    />
                    <div style={{ padding: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: colors.indigoText }}>
                        {m.name}
                      </p>
                      {m.base_price && (
                        <p style={{ fontSize: 11, color: colors.textSecondary, margin: "2px 0 0" }}>
                          {Math.round(m.base_price).toLocaleString("fr-FR")} FCFA
                        </p>
                      )}
                      <button
                        onClick={() => handleDeleteModel(m.id)}
                        style={{
                          marginTop: 6,
                          padding: "4px 0",
                          width: "100%",
                          background: "none",
                          border: `1px solid ${colors.error}`,
                          borderRadius: radii.button,
                          fontSize: 11,
                          color: colors.error,
                          cursor: "pointer",
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: colors.textSecondary, textAlign: "center", padding: 20 }}>
                Aucun modèle dans cette catégorie.
              </p>
            )}
          </>
        )}

        {!selectedCat && (
          <p style={{ fontSize: 12, color: colors.textSecondary, textAlign: "center", padding: 20 }}>
            Sélectionnez une catégorie pour voir ses modèles.
          </p>
        )}
      </div>
    </div>
  );
}
