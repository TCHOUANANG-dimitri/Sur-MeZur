"use client";

/**
 * Langue de l'application : celle du telephone (ou du navigateur).
 *
 * Par defaut (« Automatique ») : anglais si la langue preferee de l'appareil
 * est l'anglais, francais sinon (la langue de la majorite des utilisateurs).
 * Le choix « Français » ou « English » (components/LangSwitch, dans le
 * profil et sur les ecrans de connexion) passe avant, et reste memorise sur
 * l'appareil (localStorage `smz_lang`).
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

/** Choix de l'utilisateur : « auto » suit le telephone. */
export type LangChoice = "auto" | Lang;

const CLE = "smz_lang";

function choixMemorise(): LangChoice {
  try {
    const v = window.localStorage.getItem(CLE);
    return v === "fr" || v === "en" ? v : "auto";
  } catch {
    return "auto";
  }
}

const Ctx = createContext<Lang>("fr");
const ChoiceCtx = createContext<{ choice: LangChoice; setChoice: (c: LangChoice) => void }>({
  choice: "auto",
  setChoice: () => {},
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("fr");
  const [choice, setChoiceState] = useState<LangChoice>("auto");

  useEffect(() => {
    const appliquer = () => {
      const c = choixMemorise();
      const l = c === "auto" ? detecter() : c;
      courante = l;
      document.documentElement.lang = l;
      setChoiceState(c);
      setLang(l);
    };
    appliquer();
    window.addEventListener("languagechange", appliquer);
    // Un autre onglet a change la langue : on suit.
    const autreOnglet = (e: StorageEvent) => e.key === CLE && appliquer();
    window.addEventListener("storage", autreOnglet);
    return () => {
      window.removeEventListener("languagechange", appliquer);
      window.removeEventListener("storage", autreOnglet);
    };
  }, []);

  const setChoice = useCallback((c: LangChoice) => {
    try {
      if (c === "auto") window.localStorage.removeItem(CLE);
      else window.localStorage.setItem(CLE, c);
    } catch {
      /* stockage indisponible : le choix vaut pour cette visite */
    }
    const l = c === "auto" ? detecter() : c;
    courante = l;
    document.documentElement.lang = l;
    setChoiceState(c);
    setLang(l);
  }, []);

  return (
    <ChoiceCtx.Provider value={{ choice, setChoice }}>
      <Ctx.Provider value={lang}>
        <Fragment key={lang}>{children}</Fragment>
      </Ctx.Provider>
    </ChoiceCtx.Provider>
  );
}

/** Choix de langue de l'utilisateur et de quoi le changer. */
export function useLangChoice() {
  return useContext(ChoiceCtx);
}

export function useLang(): Lang {
  return useContext(Ctx);
}

/** `const t = useT();` puis `t("Accueil", "Home")`. */
export function useT(): (fr: string, en: string) => string {
  const lang = useLang();
  return useCallback((fr: string, en: string) => (lang === "en" ? en : fr), [lang]);
}
