import AsyncStorage from "@react-native-async-storage/async-storage";
import { setErrorTranslator } from "../api/client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "./en.json";
import fr from "./fr.json";

type Dict = Record<string, string>;
const dictionaries: Record<"fr" | "en", Dict> = { fr, en };
const STORAGE_KEY = "sm_lang";

// `formatFcfa` est appelé depuis ~20 écrans en dehors de tout composant
// React parfois (utilitaires de tri, etc.) : plutôt que de faire passer
// `lang` en paramètre partout, on le tient à jour ici — même schéma que
// `setErrorTranslator` juste en dessous, qui a le même problème pour les
// messages d'erreur de l'API.
let currentLang: "fr" | "en" = "fr";

type TranslateParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match
  );
}

interface I18nContextValue {
  lang: "fr" | "en";
  setLang: (lang: "fr" | "en") => void;
  t: (key: string, params?: TranslateParams) => string;
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
      t: (key: string, params?: TranslateParams) => interpolate(dictionaries[lang][key] ?? key, params),
    }),
    [lang]
  );

  // Le client d'API produit des messages d'erreur mais n'est pas un composant :
  // il ne peut pas lire la langue par un hook. On lui fournit le traducteur ici,
  // à chaque changement de langue, pour que ses messages suivent l'interface.
  useEffect(() => {
    setErrorTranslator((key) => dictionaries[lang][key] ?? key);
    currentLang = lang;
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function formatFcfa(amount: number): string {
  return `${Math.round(amount).toLocaleString(currentLang === "fr" ? "fr-FR" : "en-US")} FCFA`;
}
