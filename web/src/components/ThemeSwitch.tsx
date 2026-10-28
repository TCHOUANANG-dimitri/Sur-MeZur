"use client";

/**
 * Choix du thème : Automatique (comme le téléphone) · Clair · Sombre.
 * Même présentation que le choix de la langue (components/LangSwitch).
 */

import { useEffect, useState } from "react";

import { useT } from "@/lib/i18n";
import { setThemeChoice, themeChoice, type ThemeChoice } from "@/lib/theme";

export function ThemeSwitch() {
  const t = useT();
  const [choice, setChoice] = useState<ThemeChoice>("auto");
  useEffect(() => setChoice(themeChoice()), []);

  const options: { value: ThemeChoice; label: string }[] = [
    { value: "auto", label: t("Automatique", "Automatic") },
    { value: "light", label: t("Clair", "Light") },
    { value: "dark", label: t("Sombre", "Dark") },
  ];

  return (
    <div role="group" aria-label={t("Thème", "Theme")} className="langSwitch">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={choice === o.value}
          className={`langOption ${choice === o.value ? "langOptionActive" : ""}`}
          onClick={() => {
            setThemeChoice(o.value);
            setChoice(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
