import React from "react";
import { useI18n } from "../i18n/I18nProvider";
import { colors, radii } from "../theme/tokens";

export function VerifiedBadge() {
  const { t } = useI18n();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "#EDE9FE",
        color: colors.violetPrimary,
        borderRadius: radii.chip,
        padding: "3px 9px",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      ✓ {t("verified.badge")}
    </span>
  );
}

export function NotifBell({ count, onClick }: { count: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        background: colors.backgroundAlt,
        border: "none",
        borderRadius: "50%",
        width: 38,
        height: 38,
        cursor: "pointer",
        fontSize: 16,
      }}
      aria-label="notifications"
    >
      🔔
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            background: colors.error,
            color: colors.white,
            borderRadius: "50%",
            fontSize: 9,
            width: 16,
            height: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
