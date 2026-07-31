// Design tokens from doc 1 (§1 Fondations de marque), ported 1:1 from the
// web app's theme/tokens.ts (values unchanged, px strings become numbers).
export const colors = {
  violetPrimary: "#5B21B6",
  violetVivid: "#7C3AED",
  violetDeep: "#4C1D95",
  indigoText: "#1F2A44",
  background: "#FFFFFF",
  backgroundAlt: "#F4F2F8",
  border: "#E5E1EE",
  textSecondary: "#6B7280",
  success: "#16A34A",
  successBg: "#DCFCE7",
  error: "#DC2626",
  errorBg: "#FEE2E2",
  pending: "#D97706",
  pendingBg: "#FEF3C7",
  white: "#FFFFFF",
};

export const gradientColors: [string, string] = [colors.violetVivid, colors.violetDeep];

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
