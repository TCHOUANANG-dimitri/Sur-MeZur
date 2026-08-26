import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CatalogApi } from "../../api/endpoints";
import type { GarmentModel } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Header, Spinner } from "../../components/Misc";
import { colors } from "../../theme/tokens";

export default function ModelDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const tailorId = params.get("tailorId") || "";
  const navigate = useNavigate();
  const { t } = useI18n();
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    CatalogApi.model(id)
      .then(setModel)
      .catch(() => setError("Impossible de charger ce modèle."));
  }, [id]);

  if (error) return <div style={{ padding: 40, textAlign: "center", color: colors.textSecondary }}>{error}</div>;
  if (!model) return <Spinner />;

  const tryonQs = `?modelId=${model.id}${tailorId ? `&tailorId=${tailorId}` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Header title={model.name} onBack />

      {/* Image — remplit tout l'espace disponible, jamais tronquée */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: colors.backgroundAlt }}>
        {model.photo_url ? (
          <img src={model.photo_url} alt={model.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(160deg, ${model.thumbnail_color}, ${colors.indigoText})` }} />
        )}
      </div>

      {/* Barre inférieure — toujours visible, pas de scroll requis */}
      <div style={{ padding: "12px 18px 18px", borderTop: `1px solid ${colors.border}`, background: colors.white }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", margin: "0 0 4px", color: colors.indigoText }}>{model.name}</h2>

        {/* Description — scrollable uniquement si elle déborde */}
        <div style={{ maxHeight: 56, overflowY: "auto", fontSize: 13, color: colors.textSecondary, margin: "0 0 10px" }}>
          {model.description}
        </div>

        <Button fullWidth onClick={() => navigate(`/client/tryon${tryonQs}`)}>
          Essayer sur mon avatar
        </Button>
      </div>
    </div>
  );
}
