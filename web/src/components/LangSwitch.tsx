"use client";

/**
 * Choix de la langue de l'application.
 *
 * - complet (profil) : Automatique (langue du téléphone) · Français · English ;
 * - `compact` (écrans de connexion, colonne de navigation) : FR · EN.
 *
 * Changer de langue remonte l'arbre (lib/i18n) : les textes, les noms des
 * modèles et les dates passent tous dans la nouvelle langue.
 */

import { useLangChoice, useLang, type LangChoice } from "@/lib/i18n";

export function LangSwitch({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { choice, setChoice } = useLangChoice();
  const lang = useLang();
  const options: { value: LangChoice; label: string; title: string }[] = compact
    ? [
        { value: "fr", label: "FR", title: "Français" },
        { value: "en", label: "EN", title: "English" },
      ]
    : [
        { value: "auto", label: lang === "en" ? "Automatic" : "Automatique", title: lang === "en" ? "Phone language" : "Langue du téléphone" },
        { value: "fr", label: "Français", title: "Français" },
        { value: "en", label: "English", title: "English" },
      ];
  const actif = compact ? lang : choice;

  return (
    <div
      role="group"
      aria-label={lang === "en" ? "Language" : "Langue"}
      className={`langSwitch ${compact ? "langSwitchCompact" : ""} ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.value === "auto" ? undefined : o.value}
          title={o.title}
          aria-pressed={actif === o.value}
          className={`langOption ${actif === o.value ? "langOptionActive" : ""}`}
          onClick={() => setChoice(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
