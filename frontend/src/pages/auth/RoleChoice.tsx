import React from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { colors, radii, shadow } from "../../theme/tokens";

export default function RoleChoice() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="app-shell" style={{ padding: 24, justifyContent: "center", display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", textAlign: "center", color: colors.indigoText }}>
        {t("role.choose")}
      </h2>
      {(["client", "tailor"] as const).map((role) => (
        <button
          key={role}
          onClick={() => navigate(`/register?role=${role}`)}
          style={{
            background: colors.white,
            border: `1.5px solid ${colors.border}`,
            borderRadius: radii.card,
            boxShadow: shadow,
            padding: 20,
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            color: colors.indigoText,
          }}
        >
          {role === "client" ? "🧍 " : "✂️ "}
          {t(`role.${role}`)}
        </button>
      ))}
      <p style={{ textAlign: "center", fontSize: 13 }}>
        <a onClick={() => navigate("/login")} style={{ cursor: "pointer" }}>
          {t("auth.login")}
        </a>
      </p>
    </div>
  );
}
