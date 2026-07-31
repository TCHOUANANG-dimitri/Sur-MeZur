import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { colors, gradient } from "../../theme/tokens";

const SLIDES = [
  { icon: "📸", key: "onboarding.slide1" },
  { icon: "🧍", key: "onboarding.slide2" },
  { icon: "✂️", key: "onboarding.slide3" },
];

export default function Onboarding() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];

  const next = () => {
    if (step < SLIDES.length - 1) setStep(step + 1);
    else navigate("/role");
  };

  return (
    <div className="app-shell" style={{ padding: 24, justifyContent: "space-between", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
        {SLIDES.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === step ? 22 : 8,
              height: 8,
              borderRadius: 999,
              background: i === step ? gradient : colors.border,
              transition: "width 0.2s",
            }}
          />
        ))}
      </div>
      <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
        <div style={{ fontSize: 64 }}>{slide.icon}</div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", margin: 0, color: colors.indigoText }}>
          {t(`${slide.key}.title`)}
        </h2>
        <p style={{ color: colors.textSecondary, fontSize: 14, padding: "0 12px" }}>{t(`${slide.key}.body`)}</p>
      </div>
      <Button onClick={next}>{t("common.next")}</Button>
    </div>
  );
}
