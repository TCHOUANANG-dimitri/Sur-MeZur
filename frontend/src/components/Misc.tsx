import React from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { colors, radii } from "../theme/tokens";

export function Header({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: boolean;
  right?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px",
        borderBottom: `1px solid ${colors.border}`,
        background: colors.white,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && (
          <button
            onClick={() => navigate(-1)}
            style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: colors.indigoText }}
          >
            ←
          </button>
        )}
        <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 18, color: colors.indigoText }}>
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginBottom: 6 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: radii.button,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  outline: "none",
  background: colors.white,
  color: colors.indigoText,
};

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "#FEE2E2",
        color: colors.error,
        padding: "10px 14px",
        borderRadius: radii.button,
        fontSize: 13,
        marginBottom: 12,
      }}
    >
      {message}
    </div>
  );
}

export function EmptyState({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px", color: colors.textSecondary }}>
      <div
        style={{
          width: 64,
          height: 64,
          margin: "0 auto 14px",
          borderRadius: "50%",
          background: colors.backgroundAlt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
        }}
      >
        ○
      </div>
      <p style={{ fontSize: 13, margin: "0 0 14px" }}>{text}</p>
      {cta}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div style={{ textAlign: "center", padding: 32, color: colors.textSecondary, fontSize: 13 }}>
      <div
        style={{
          width: 30,
          height: 30,
          margin: "0 auto 10px",
          borderRadius: "50%",
          border: `3px solid ${colors.border}`,
          borderTopColor: colors.violetPrimary,
          animation: "sm-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes sm-spin { to { transform: rotate(360deg); } }`}</style>
      {label || t("common.loading")}
    </div>
  );
}
