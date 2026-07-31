import React from "react";
import { colors, gradient, radii } from "../theme/tokens";

type Variant = "primary" | "secondary" | "text" | "danger";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const base: React.CSSProperties = {
  border: "none",
  borderRadius: radii.button,
  fontWeight: 600,
  fontSize: 14,
  padding: "13px 20px",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "opacity 0.15s ease, transform 0.05s ease",
};

export function Button({ variant = "primary", fullWidth, style, disabled, ...rest }: Props) {
  const variantStyle: React.CSSProperties =
    variant === "primary"
      ? { background: gradient, color: colors.white, boxShadow: "0 4px 12px rgba(124,58,237,0.35)" }
      : variant === "secondary"
      ? { background: colors.white, color: colors.violetPrimary, border: `1.5px solid ${colors.violetPrimary}` }
      : variant === "danger"
      ? { background: colors.error, color: colors.white }
      : { background: "transparent", color: colors.violetPrimary, padding: "8px 4px" };

  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...base,
        ...variantStyle,
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    />
  );
}
