import React from "react";
import { Outlet } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { TabBar } from "./TabBar";

export function ClientLayout() {
  const { t } = useI18n();
  return (
    <div className="app-shell">
      <div className="scroll-area">
        <Outlet />
      </div>
      <TabBar
        items={[
          { to: "/client/home", label: t("nav.home"), icon: <span>🏠</span> },
          { to: "/client/search", label: t("nav.search"), icon: <span>🔍</span> },
          { to: "/client/tryon", label: t("nav.tryon"), icon: <span>👗</span> },
          { to: "/client/orders", label: t("nav.orders"), icon: <span>📦</span> },
          { to: "/client/profile", label: t("nav.profile"), icon: <span>👤</span> },
        ]}
      />
    </div>
  );
}

export function TailorLayout() {
  const { t } = useI18n();
  return (
    <div className="app-shell">
      <div className="scroll-area">
        <Outlet />
      </div>
      <TabBar
        items={[
          { to: "/tailor/dashboard", label: t("nav.dashboard"), icon: <span>📊</span> },
          { to: "/tailor/orders", label: t("nav.orders"), icon: <span>📦</span> },
          { to: "/tailor/ready-to-wear", label: t("nav.readyToWear"), icon: <span>🧵</span> },
          { to: "/tailor/finances", label: t("nav.finances"), icon: <span>💰</span> },
          { to: "/tailor/profile", label: t("nav.profile"), icon: <span>👤</span> },
        ]}
      />
    </div>
  );
}

export function AdminLayout() {
  const { t } = useI18n();
  return (
    <div className="app-shell">
      <div className="scroll-area">
        <Outlet />
      </div>
      <TabBar
        items={[
          { to: "/admin/verifications", label: t("admin.verifications"), icon: <span>✅</span> },
          { to: "/admin/disputes", label: t("admin.disputes"), icon: <span>⚖️</span> },
          { to: "/admin/reviews", label: t("admin.reviews"), icon: <span>⭐</span> },
          { to: "/admin/commission", label: t("admin.commission"), icon: <span>%</span> },
        ]}
      />
    </div>
  );
}
