import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CatalogApi } from "../../api/endpoints";
import type { GarmentModel } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Header, Spinner } from "../../components/Misc";
import { StatusChip } from "../../components/Chip";
import { colors, radii } from "../../theme/tokens";
import { saveForLater } from "./savedModels";

export default function ModelDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const tailorId = params.get("tailorId") || "";
  const navigate = useNavigate();
  const { t } = useI18n();
  const [model, setModel] = useState<GarmentModel | null>(null);

  useEffect(() => {
    CatalogApi.model(id).then(setModel);
  }, [id]);

  if (!model) return <Spinner />;

  const tryonQs = `?modelId=${model.id}${tailorId ? `&tailorId=${tailorId}` : ""}`;

  return (
    <div>
      <Header title={model.name} onBack />
      <div style={{ height: 260, background: `linear-gradient(160deg, ${model.thumbnail_color}, ${colors.indigoText})` }} />
      <div style={{ padding: 18 }}>
        <StatusChip status="neutral" label={model.category} />
        <h2 style={{ fontFamily: "'Playfair Display', serif", margin: "10px 0 6px", color: colors.indigoText }}>{model.name}</h2>
        <p style={{ fontSize: 13, color: colors.textSecondary }}>{model.description}</p>
        {model.base_price && (
          <p style={{ fontWeight: 700, color: colors.violetPrimary }}>{t("order.priceOffer").split(" (")[0]}: ~{formatFcfa(model.base_price)}</p>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {model.style_tags.map((tag) => (
            <span key={tag} style={{ fontSize: 11, background: colors.backgroundAlt, borderRadius: radii.chip, padding: "4px 10px" }}>
              {tag}
            </span>
          ))}
        </div>

        <Button fullWidth onClick={() => navigate(`/client/tryon${tryonQs}`)} style={{ marginBottom: 10 }}>
          Essayer sur mon avatar
        </Button>
        <Button fullWidth variant="secondary" onClick={() => saveForLater(model.id)}>
          {t("order.saveForLater")}
        </Button>
      </div>
    </div>
  );
}
