import React from "react";
import { colors, radii, shadow } from "../theme/tokens";

export function Card({
  children,
  style,
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.white,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.card,
        boxShadow: shadow,
        padding: 16,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
