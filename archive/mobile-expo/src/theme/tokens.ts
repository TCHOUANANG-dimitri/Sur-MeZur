// Design tokens from doc 1 (§1 Fondations de marque). The light palette keeps
// the original brand values 1:1; the dark palette re-derives them for a dark
// surface (violet lifted for contrast, greys inverted) rather than merely
// swapping black and white.

export const lightColors = {
  violetPrimary: "#5B21B6",
  violetVivid: "#7C3AED",
  violetDeep: "#4C1D95",
  /** Subtle violet wash behind small icon tiles. */
  violetTint: "#EDE9FE",
  indigoText: "#1F2A44",
  background: "#FFFFFF",
  backgroundAlt: "#F4F2F8",
  surface: "#FFFFFF",
  border: "#E5E1EE",
  textSecondary: "#6B7280",
  success: "#16A34A",
  successBg: "#DCFCE7",
  error: "#DC2626",
  errorBg: "#FEE2E2",
  pending: "#D97706",
  pendingBg: "#FEF3C7",
  white: "#FFFFFF",
  overlay: "rgba(31,42,68,0.45)",
};

export type ThemeColors = typeof lightColors;

export const darkColors: ThemeColors = {
  // Lifted from #5B21B6 — the brand violet is too dark to read on a dark surface.
  violetPrimary: "#A78BFA",
  violetVivid: "#8B5CF6",
  violetDeep: "#6D28D9",
  violetTint: "#2A2338",
  // `indigoText` is the primary text token throughout the app, so on dark it
  // has to become the *light* ink rather than stay a navy.
  indigoText: "#ECEAF3",
  background: "#14121A",
  backgroundAlt: "#1E1B26",
  surface: "#1A1822",
  border: "#302B3D",
  textSecondary: "#9CA0AC",
  success: "#4ADE80",
  successBg: "#14351F",
  error: "#F87171",
  errorBg: "#3B1618",
  pending: "#FBBF24",
  pendingBg: "#3A2A0C",
  white: "#FFFFFF",
  overlay: "rgba(0,0,0,0.6)",
};

/**
 * Static fallback so modules that read colours at import time (and anything not
 * yet migrated to `useTheme()`) still compile. Prefer `useTheme()` in screens —
 * only that reacts to the theme being switched at runtime.
 */
export const colors = lightColors;

export const gradientColors: [string, string] = [lightColors.violetVivid, lightColors.violetDeep];

export function gradientFor(c: ThemeColors): [string, string] {
  return [c.violetVivid, c.violetDeep];
}

export const radii = {
  card: 16,
  button: 12,
  chip: 999,
};

export const shadow = {
  shadowColor: "#1F2A44",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 3,
};

export const fonts = {
  display: "PlayfairDisplay_700Bold",
  displaySemi: "PlayfairDisplay_600SemiBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
};
