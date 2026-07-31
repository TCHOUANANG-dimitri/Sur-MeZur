// Design tokens lifted from doc 1 (§1 Fondations de marque) and cross-checked
// against the Sur-MeZur.dc.html Claude Design prototype.
export const colors = {
  violetPrimary: "#5B21B6",
  violetVivid: "#7C3AED",
  indigoText: "#1F2A44",
  background: "#FFFFFF",
  backgroundAlt: "#F4F2F8",
  border: "#E5E1EE",
  textSecondary: "#6B7280",
  success: "#16A34A",
  error: "#DC2626",
  pending: "#D97706",
  white: "#FFFFFF",
};

export const gradient = `linear-gradient(135deg, ${colors.violetVivid}, #4C1D95)`;

export const radii = {
  card: "16px",
  button: "12px",
  chip: "999px",
};

export const shadow = "0 4px 16px rgba(31,42,68,0.08)";

export const fonts = {
  display: `'Playfair Display', serif`,
  body: `'Inter', sans-serif`,
};

export const spacing = (n: number) => `${n * 4}px`;

export const maxWidth = "420px";
