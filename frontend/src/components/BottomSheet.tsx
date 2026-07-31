import React from "react";
import { colors, radii } from "../theme/tokens";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(31,42,68,0.45)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.white,
          width: "100%",
          maxHeight: "80%",
          overflowY: "auto",
          borderTopLeftRadius: radii.card,
          borderTopRightRadius: radii.card,
          padding: 20,
          boxShadow: "0 -8px 24px rgba(31,42,68,0.18)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            background: colors.border,
            borderRadius: 999,
            margin: "0 auto 16px",
          }}
        />
        {title && <h3 style={{ margin: "0 0 12px", fontFamily: "inherit" }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
