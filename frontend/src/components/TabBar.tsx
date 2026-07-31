import React from "react";
import { NavLink } from "react-router-dom";
import { colors } from "../theme/tokens";

export interface TabItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

export function TabBar({ items }: { items: TabItem[] }) {
  return (
    <nav
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        background: colors.white,
        borderTop: `1px solid ${colors.border}`,
        padding: "8px 4px calc(8px + env(safe-area-inset-bottom))",
        zIndex: 20,
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => ({
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            fontSize: 10,
            fontWeight: 600,
            color: isActive ? colors.violetPrimary : colors.textSecondary,
            padding: "4px 0",
          })}
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
