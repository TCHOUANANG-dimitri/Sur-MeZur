/**
 * Thème de l'application : Automatique (suit le téléphone), Clair ou Sombre.
 *
 * Le choix est mémorisé sur l'appareil (localStorage `smz_theme`) et posé sur
 * <html data-theme="light|dark"> ; « Automatique » retire l'attribut et les
 * couleurs suivent `prefers-color-scheme` (styles/globals.css). Un petit
 * script dans <head> (app/layout.tsx, THEME_BOOT) l'applique avant
 * l'affichage, pour éviter un éclair de la mauvaise couleur.
 */

export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_KEY = "smz_theme";

/** Couleur de la barre d'état du téléphone, selon le thème. */
const BARRE = { light: "#5b21b6", dark: "#17141f" } as const;

export function themeChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Applique un choix (sans le mémoriser). */
export function applyTheme(choice: ThemeChoice = themeChoice()): void {
  const root = document.documentElement;
  if (choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = choice;
  // Les deux balises theme-color (claire et sombre) prennent la couleur choisie.
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    if (!m.dataset.origine) m.dataset.origine = m.content;
    m.content = choice === "auto" ? m.dataset.origine : BARRE[choice];
  });
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* stockage indisponible : le choix vaut pour cette visite */
  }
  applyTheme(choice);
}

/** Script inline de <head> : applique le choix mémorisé avant l'affichage. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
