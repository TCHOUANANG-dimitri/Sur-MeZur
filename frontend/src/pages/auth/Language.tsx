import React from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { colors } from "../../theme/tokens";

export default function LanguagePage() {
  const { setLang } = useI18n();
  const navigate = useNavigate();

  const choose = (lang: "fr" | "en") => {
    setLang(lang);
    navigate("/onboarding");
  };

  return (
    <div className="app-shell" style={{ padding: 24, justifyContent: "center", display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", textAlign: "center", color: colors.indigoText }}>
        Français / English
      </h2>
      <Button onClick={() => choose("fr")}>Français</Button>
      <Button variant="secondary" onClick={() => choose("en")}>
        English
      </Button>
    </div>
  );
}
