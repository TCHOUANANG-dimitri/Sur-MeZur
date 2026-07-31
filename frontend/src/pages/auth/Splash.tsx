import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../state/AuthContext";
import { useI18n } from "../../i18n/I18nProvider";
import { gradient } from "../../theme/tokens";

export default function Splash() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      if (user) {
        navigate(`/${user.role}/${user.role === "client" ? "home" : user.role === "tailor" ? "dashboard" : "verifications"}`, { replace: true });
      } else {
        navigate("/language", { replace: true });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [loading, user, navigate]);

  return (
    <div
      className="app-shell"
      style={{ alignItems: "center", justifyContent: "center", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontFamily: "'Playfair Display', serif",
          fontSize: 34,
          fontWeight: 700,
        }}
      >
        S
      </div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", margin: 0, color: "#1F2A44" }}>Sur-MeZur</h1>
      <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#6B7280", margin: 0 }}>
        {t("app.tagline")}
      </p>
    </div>
  );
}
