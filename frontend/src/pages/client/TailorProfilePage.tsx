import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CatalogApi, TailorsApi } from "../../api/endpoints";
import { api } from "../../api/client";
import type { ReadyToWear, Review, TailorProfile } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Header, Spinner } from "../../components/Misc";
import { Stars } from "../../components/Stars";
import { VerifiedBadge } from "../../components/Badges";
import { formatFcfa } from "../../i18n/I18nProvider";
import { colors, gradient, radii } from "../../theme/tokens";

export default function TailorProfilePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [tailor, setTailor] = useState<TailorProfile | null>(null);
  const [tab, setTab] = useState<"pap" | "reviews">("pap");
  const [items, setItems] = useState<ReadyToWear[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    TailorsApi.get(id).then(setTailor);
    CatalogApi.readyToWear(id).then(setItems);
    api.get<Review[]>(`/tailors/${id}/reviews`).then(setReviews).catch(() => {});
  }, [id]);

  if (!tailor) return <Spinner />;

  return (
    <div>
      <Header title={tailor.shop_name} onBack />
      <div style={{ padding: 18 }}>
        <div style={{ height: 100, borderRadius: radii.card, background: gradient, marginBottom: -34 }} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", background: colors.white, border: `3px solid ${colors.white}`, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }} />
        </div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, alignItems: "center" }}>
            <strong>{tailor.shop_name}</strong>
            {tailor.verification_status === "approved" && <VerifiedBadge />}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 4 }}>
            <Stars value={tailor.rating_avg} />
            <span style={{ fontSize: 12, color: colors.textSecondary }}>
              {tailor.completed_orders_count} commandes · ~{tailor.avg_response_minutes}min
            </span>
          </div>
          <p style={{ fontSize: 12, color: colors.textSecondary }}>{tailor.bio}</p>
        </div>

        <Button fullWidth onClick={() => navigate(`/client/models?tailorId=${tailor.id}`)} style={{ marginBottom: 16 }}>
          {t("order.placeOrder")}
        </Button>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Chip label={t("nav.readyToWear")} active={tab === "pap"} onClick={() => setTab("pap")} />
          <Chip label="Avis" active={tab === "reviews"} onClick={() => setTab("reviews")} />
        </div>

        {tab === "pap" ? (
          items.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.textSecondary }}>Aucun article pour le moment.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {items.map((it) => (
                <Card key={it.id} onClick={() => navigate(`/client/ready-to-wear/${it.id}`)}>
                  <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>{it.name}</p>
                  <p style={{ fontSize: 12, color: colors.violetPrimary, margin: 0, fontWeight: 700 }}>{formatFcfa(it.price)}</p>
                </Card>
              ))}
            </div>
          )
        ) : reviews.length === 0 ? (
          <p style={{ fontSize: 13, color: colors.textSecondary }}>Aucun avis pour le moment.</p>
        ) : (
          reviews.map((r) => (
            <Card key={r.id} style={{ marginBottom: 8 }}>
              <Stars value={r.stars} />
              <p style={{ fontSize: 13, margin: "6px 0 0" }}>{r.comment}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
