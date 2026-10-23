"use client";

/**
 * Langue de l'application : celle du telephone (ou du navigateur).
 *
 * Anglais si la langue preferee de l'appareil est l'anglais, francais sinon
 * (francais par defaut : c'est la langue de la majorite des utilisateurs).
 * Aucun reglage dans l'app : on change la langue du telephone.
 *
 * Chaque texte est ecrit sur place dans les deux langues, `t("Bonjour",
 * "Hello")` : pas de fichier de cles a tenir a jour, et un texte ne peut pas
 * manquer dans une langue.
 *
 * Rendu serveur en francais, puis bascule apres l'hydratation : si l'appareil
 * est en anglais, l'arbre est remonte une fois (cle = langue), si bien que
 * `tr()` — utilisable partout, y compris hors composant (libelles des
 * mesures, messages de validation) — et `useT()` donnent tous deux le bon
 * texte. Un appareil en francais ne remonte rien.
 */

import { Fragment, createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "fr" | "en";

let courante: Lang = "fr";

/** Langue courante, hors composant. */
export function langue(): Lang {
  return courante;
}

/** Texte dans la langue courante, hors composant (validation, messages). */
export function tr(fr: string, en: string): string {
  return courante === "en" ? en : fr;
}

/** Locale pour les dates et les nombres. */
export function locale(): string {
  return courante === "en" ? "en-GB" : "fr-FR";
}

function detecter(): Lang {
  if (typeof navigator === "undefined") return "fr";
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  const premiere = (prefs[0] || "fr").toLowerCase();
  return premiere.startsWith("en") ? "en" : "fr";
}

const Ctx = createContext<Lang>("fr");

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("fr");

  useEffect(() => {
    const appliquer = () => {
      const l = detecter();
      courante = l;
      document.documentElement.lang = l;
      setLang(l);
    };
    appliquer();
    window.addEventListener("languagechange", appliquer);
    return () => window.removeEventListener("languagechange", appliquer);
  }, []);

  return (
    <Ctx.Provider value={lang}>
      <Fragment key={lang}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useLang(): Lang {
  return useContext(Ctx);
}

/** `const t = useT();` puis `t("Accueil", "Home")`. */
export function useT(): (fr: string, en: string) => string {
  const lang = useLang();
  return useCallback((fr: string, en: string) => (lang === "en" ? en : fr), [lang]);
}
