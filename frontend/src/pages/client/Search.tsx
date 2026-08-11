import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CatalogApi, TailorsApi } from "../../api/endpoints";
import type { GarmentModel, TailorProfile } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Header, Spinner, inputStyle } from "../../components/Misc";
import { Stars } from "../../components/Stars";
import { VerifiedBadge } from "../../components/Badges";
import { colors, gradient, radii } from "../../theme/tokens";

export default function Search() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"tailors" | "models">("tailors");
  const [sort, setSort] = useState<"rating" | "proximity">("rating");
  const [q, setQ] = useState("");
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);

  useEffect(() => {
    if (tab === "tailors") TailorsApi.search({ sort, q: q || undefined }).then(setTailors);
    else CatalogApi.models({ q: q || undefined }).then(setModels);
  }, [tab, sort, q]);

  return (
    <div>
      <Header title={t("search.title")} />
      <div style={{ padding: 16 }}>
        <input
          style={inputStyle}
          placeholder="🔍…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
          <Chip label={t("search.tailors")} active={tab === "tailors"} onClick={() => setTab("tailors")} />
          <Chip label={t("search.models")} active={tab === "models"} onClick={() => setTab("models")} />
        </div>
        {tab === "tailors" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Chip label={t("search.sortProximity")} active={sort === "proximity"} onClick={() => setSort("proximity")} />
            <Chip label={t("search.sortRating")} active={sort === "rating"} onClick={() => setSort("rating")} />
          </div>
        )}

        {tab === "tailors" ? (
          !tailors ? (
            <Spinner />
          ) : (
            tailors.map((tl) => (
              <Card key={tl.id} onClick={() => navigate(`/client/tailors/${tl.id}`)} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: gradient, flexShrink: 0 }} />
                  <div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <strong style={{ fontSize: 13 }}>{tl.shop_name}</strong>
                      {tl.verification_status === "approved" ? (
                        <VerifiedBadge />
                      ) : (
                        <span style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic" }}>
                          {t("tailor.unverified")}
                        </span>
                      )}
                    </div>
                    <Stars value={tl.rating_avg} />
                  </div>
                </div>
              </Card>
            ))
          )
        ) : !models ? (
          <Spinner />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {models.map((m) => (
              <div key={m.id} onClick={() => navigate(`/client/models/${m.id}`)} style={{ cursor: "pointer" }}>
                <div style={{ height: 120, borderRadius: radii.card, background: `linear-gradient(160deg, ${m.thumbnail_color}, ${colors.indigoText})` }} />
                <p style={{ fontSize: 12, fontWeight: 600, margin: "6px 0 0" }}>{m.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
