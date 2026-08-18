import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CatalogApi, NotificationsApi, TailorsApi } from "../../api/endpoints";
import type { Category, GarmentModel, Notification, TailorProfile } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { useI18n } from "../../i18n/I18nProvider";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { NotifBell, VerifiedBadge } from "../../components/Badges";
import { Stars } from "../../components/Stars";
import { Spinner } from "../../components/Misc";
import { colors, gradient, radii } from "../../theme/tokens";

const CATEGORIES = ["top", "bottom", "dress", "traditional", "other"] as const;

export default function Home() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    CatalogApi.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    CatalogApi.models({ category_id: categoryId || undefined }).then(setModels);
  }, [categoryId]);

  useEffect(() => {
    TailorsApi.search({ sort: "rating" }).then(setTailors);
    NotificationsApi.list().then(setNotifs).catch(() => {});
  }, []);

  return (
    <div>
      <div style={{ padding: "18px 18px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>
            {t("home.greeting")}, {user?.full_name.split(" ")[0]}
          </p>
          <h2 style={{ margin: "2px 0 0", fontFamily: "'Playfair Display', serif", color: colors.indigoText }}>
            Sur-MeZur
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setLang(lang === "fr" ? "en" : "fr")}
            style={{ border: `1px solid ${colors.border}`, background: colors.white, borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            {lang.toUpperCase()}
          </button>
          <NotifBell count={notifs.filter((n) => !n.read_at).length} onClick={() => NotificationsApi.markAllRead().then(() => setNotifs([]))} />
        </div>
      </div>

      <div style={{ padding: "8px 18px" }}>
        <input
          placeholder="🔍 Rechercher un modèle, un tailleur…"
          onFocus={() => navigate("/client/search")}
          readOnly
          style={{
            width: "100%",
            padding: "13px 16px",
            borderRadius: radii.button,
            border: `1px solid ${colors.border}`,
            background: colors.backgroundAlt,
            fontSize: 13,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, padding: "10px 18px", overflowX: "auto" }}>
        {categories.map((cat) => (
          <Chip key={cat.id} label={cat.name} active={categoryId === cat.id} onClick={() => setCategoryId(categoryId === cat.id ? null : cat.id)} />
        ))}
      </div>

      <section style={{ padding: "12px 18px" }}>
        <h4 style={{ margin: "0 0 10px", color: colors.indigoText }}>{t("home.popularModels")}</h4>
        {!models ? (
          <Spinner />
        ) : (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {models.map((m) => (
              <div key={m.id} onClick={() => navigate(`/client/models/${m.id}`)} style={{ minWidth: 140, cursor: "pointer" }}>
                <div
                  style={{
                    height: 160,
                    borderRadius: radii.card,
                    background: `linear-gradient(160deg, ${m.thumbnail_color}, ${colors.indigoText})`,
                  }}
                />
                <p style={{ fontSize: 12, fontWeight: 600, margin: "8px 0 0", color: colors.indigoText }}>{m.name}</p>
                <p style={{ fontSize: 11, color: colors.textSecondary, margin: 0 }}>{m.category}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ padding: "4px 18px 24px" }}>
        <h4 style={{ margin: "8px 0 10px", color: colors.indigoText }}>{t("home.tailorsNearYou")}</h4>
        {!tailors ? (
          <Spinner />
        ) : (
          tailors.map((tl) => (
            <Card key={tl.id} onClick={() => navigate(`/client/tailors/${tl.id}`)} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: gradient, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: 13 }}>{tl.shop_name}</strong>
                    {tl.verification_status === "approved" && <VerifiedBadge />}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <Stars value={tl.rating_avg} />
                    <span style={{ fontSize: 11, color: colors.textSecondary }}>
                      ({tl.completed_orders_count}) · {tl.city}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
