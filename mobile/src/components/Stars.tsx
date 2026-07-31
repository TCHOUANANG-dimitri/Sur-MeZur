import { Star } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";
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
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const icon = (
          <Star
            key={i}
            size={size}
            color={filled ? colors.pending : colors.border}
            fill={filled ? colors.pending : "transparent"}
          />
        );
        if (!interactive) return icon;
        return (
          <TouchableOpacity key={i} onPress={() => onChange?.(i)}>
            {icon}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
