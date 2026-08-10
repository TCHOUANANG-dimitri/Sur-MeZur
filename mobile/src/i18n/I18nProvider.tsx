import AsyncStorage from "@react-native-async-storage/async-storage";
import { setErrorTranslator } from "../api/client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "./en.json";
import fr from "./fr.json";

type Dict = Record<string, string>;
const dictionaries: Record<"fr" | "en", Dict> = { fr, en };
const STORAGE_KEY = "sm_lang";

interface I18nContextValue {
  lang: "fr" | "en";
  setLang: (lang: "fr" | "en") => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<"fr" | "en">("fr");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "fr" || stored === "en") setLangState(stored);
    });
  }, []);

  const setLang = (l: "fr" | "en") => {
    AsyncStorage.setItem(STORAGE_KEY, l);
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

  // Le client d'API produit des messages d'erreur mais n'est pas un composant :
  // il ne peut pas lire la langue par un hook. On lui fournit le traducteur ici,
  // à chaque changement de langue, pour que ses messages suivent l'interface.
  useEffect(() => {
    setErrorTranslator((key) => dictionaries[lang][key] ?? key);
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function formatFcfa(amount: number): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} FCFA`;
}
