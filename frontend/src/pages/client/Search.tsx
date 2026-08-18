import React, { useEffect, useRef, useState } from "react";
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

const DEBOUNCE_MS = 300;

export default function Search() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"tailors" | "models">("tailors");
  const [sort, setSort] = useState<"rating" | "proximity">("rating");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");

    const params = { sort, q: debouncedQ || undefined };
    const promise = tab === "tailors"
      ? TailorsApi.search(params)
      : CatalogApi.models({ q: debouncedQ || undefined });

    promise
      .then((data) => {
        if (!controller.signal.aborted) {
          if (tab === "tailors") setTailors(data as TailorProfile[]);
          else setModels(data as GarmentModel[]);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => controller.abort();
  }, [tab, sort, debouncedQ]);

  const isEmpty = (tab === "tailors" && tailors?.length === 0) || (tab === "models" && models?.length === 0);

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

        {error && (
          <p style={{ fontSize: 13, color: "#DC2626", textAlign: "center", margin: "12px 0" }}>{error}</p>
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

        {!error && isEmpty && (
          <p style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center", margin: "24px 0" }}>
            Aucun résultat pour « {debouncedQ || q} »
          </p>
        )}
      </div>
    </div>
  );
}
