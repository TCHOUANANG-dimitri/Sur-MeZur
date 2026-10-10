// Le français d'abord : c'est la langue du marché visé (Cameroun).
export const locales = ["fr", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fr";

/** Maps a locale to the `lang` / `hreflang` value used in markup. */
export const htmlLang: Record<Locale, string> = {
  en: "en",
  fr: "fr",
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Prefixes an app-relative path with the active locale. `/` → `/fr`. */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/** Prefixes a hash anchor with the active locale. `#how-it-works` → `/en#how-it-works`. */
export function localizePath(locale: Locale, hash: string): string {
  const clean = hash.startsWith("#") ? hash : `#${hash}`;
  return `/${locale}${clean}`;
}

/** Swaps the locale segment of a pathname, preserving the rest. */
export function switchLocalePath(pathname: string, next: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  if (isLocale(segments[0])) {
    segments[0] = next;
  } else {
    segments.unshift(next);
  }
  return `/${segments.join("/")}`;
}