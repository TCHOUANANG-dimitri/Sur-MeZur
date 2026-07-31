import React from "react";
import { colors } from "../theme/tokens";

export function Stars({
  value,
  size = 14,
  interactive,
  onChange,
}: {
  value: number;
  size?: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          onClick={() => interactive && onChange?.(i)}
          style={{
            fontSize: size,
            color: i <= Math.round(value) ? colors.pending : colors.border,
            cursor: interactive ? "pointer" : "default",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}
