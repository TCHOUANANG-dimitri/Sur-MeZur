import React from "react";
import { colors, radii } from "../theme/tokens";

export function Chip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? "none" : `1px solid ${colors.border}`,
        background: active ? color || colors.violetPrimary : colors.white,
        color: active ? colors.white : colors.indigoText,
        borderRadius: radii.chip,
        padding: "7px 14px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export function StatusChip({ status, label }: { status: "success" | "error" | "pending" | "neutral"; label: string }) {
  const map = {
    success: { bg: "#DCFCE7", fg: colors.success },
    error: { bg: "#FEE2E2", fg: colors.error },
    pending: { bg: "#FEF3C7", fg: colors.pending },
    neutral: { bg: colors.backgroundAlt, fg: colors.textSecondary },
  } as const;
  const c = map[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        borderRadius: radii.chip,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {label}
    </span>
  );
}
