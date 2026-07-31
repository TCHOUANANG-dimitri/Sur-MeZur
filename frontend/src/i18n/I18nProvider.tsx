import React, { createContext, useContext, useMemo, useState } from "react";
import en from "./en.json";
import fr from "./fr.json";

type Dict = Record<string, string>;
const dictionaries: Record<"fr" | "en", Dict> = { fr, en };

interface I18nContextValue {
  lang: "fr" | "en";
  setLang: (lang: "fr" | "en") => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<"fr" | "en">(
    (localStorage.getItem("sm_lang") as "fr" | "en") || "fr"
  );

  const setLang = (l: "fr" | "en") => {
    localStorage.setItem("sm_lang", l);
    setLangState(l);
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key: string) => dictionaries[lang][key] ?? key,
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function formatFcfa(amount: number): string {
  return `${Math.round(amount).toLocaleString("fr-FR").replace(/ /g, " ")} FCFA`;
}
