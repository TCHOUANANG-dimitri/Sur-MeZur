import { MEASURES, isMeasureKey } from "@/lib/measurements";

// Formats et libelles partages par les ecrans admin (exigence Q7 : dates
// jj/mm/aaaa, montants en FCFA, interface en francais).

/** Formate une somme en francs CFA (ex: 12 500 FCFA). */
export function formatFcfa(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const n = Math.round(value);
  return `${n.toLocaleString("fr-FR").replace(/ /g, " ")} FCFA`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits }).replace(/ /g, " ");
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${formatNumber(value, 1)} %`;
}

/** Date au format camerounais : jj/mm/aaaa. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Douala" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDate(iso)} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" })}`;
}

/** « il y a 3 j » : anciennete lisible d'un element en attente. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 60) return `il y a ${d} j`;
  return `il y a ${Math.round(d / 30)} mois`;
}

/** Periode courte d'un graphique (jour, semaine ou mois). */
export function formatPeriod(iso: string, granularity: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (granularity === "month") return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export function bytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${formatNumber(v, 1)} ${units[i]}`;
}

/**
 * URL d'une image renvoyee par le backend : toujours un chemin relatif
 * `/uploads/...`, que le proxy Next retransmet au backend.
 */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path;
}

export const ROLE_LABEL: Record<string, string> = {
  client: "Client",
  tailor: "Tailleur",
  admin: "Admin",
  collector: "Agent de collecte",
  guest: "Invité",
};

export const USER_STATUS: Record<string, { label: string; tone: "success" | "error" | "neutral" | "pending" }> = {
  active: { label: "Actif", tone: "success" },
  suspended: { label: "Suspendu", tone: "error" },
  guest: { label: "Invité", tone: "neutral" },
};

export const ORDER_STATUS: Record<string, { label: string; tone: "success" | "error" | "neutral" | "pending" }> = {
  new: { label: "Nouvelle", tone: "pending" },
  in_progress: { label: "En cours", tone: "pending" },
  ready_for_pickup: { label: "Prête à retirer", tone: "neutral" },
  finished_delivered: { label: "Livrée", tone: "success" },
  finished_not_delivered: { label: "Terminée non livrée", tone: "error" },
  cancelled: { label: "Annulée", tone: "error" },
};

export const VERIFICATION_STATUS: Record<string, { label: string; tone: "success" | "error" | "neutral" | "pending" }> = {
  pending: { label: "En attente", tone: "pending" },
  approved: { label: "Vérifié", tone: "success" },
  rejected: { label: "Refusé", tone: "error" },
  info_requested: { label: "Complément demandé", tone: "neutral" },
};

export const DISPUTE_STATUS: Record<string, string> = {
  open: "Ouvert",
  resolved_client: "Tranché pour le client",
  resolved_tailor: "Tranché pour le tailleur",
  resolved_alteration: "Retouche demandée",
  dismissed: "Réclamation rejetée",
};

export const DISPUTE_CATEGORY: Record<string, string> = {
  retard: "Retard",
  mesures: "Mesures",
  qualite: "Qualité",
  non_livraison: "Non livré",
  paiement: "Paiement",
  communication: "Communication",
  autre: "Autre",
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: "success" | "error" | "neutral" | "pending" }> = {
  pending: { label: "En attente", tone: "pending" },
  paid: { label: "Payé", tone: "success" },
  released: { label: "Libéré", tone: "success" },
  refunded: { label: "Remboursé", tone: "neutral" },
  failed: { label: "Échec", tone: "error" },
};

export const MODEL_STATUS: Record<string, { label: string; tone: "success" | "error" | "neutral" | "pending" }> = {
  published: { label: "Publié", tone: "success" },
  pending: { label: "En attente", tone: "pending" },
  rejected: { label: "Refusé", tone: "error" },
  hidden: { label: "Masqué", tone: "neutral" },
};

export const REVIEW_STATUS: Record<string, { label: string; tone: "success" | "error" | "neutral" | "pending" }> = {
  visible: { label: "Visible", tone: "success" },
  flagged: { label: "Signalé", tone: "pending" },
  hidden: { label: "Masqué", tone: "neutral" },
};

export const TICKET_STATUS: Record<string, { label: string; tone: "success" | "error" | "neutral" | "pending" }> = {
  new: { label: "Nouvelle", tone: "pending" },
  in_progress: { label: "En cours", tone: "neutral" },
  resolved: { label: "Résolue", tone: "success" },
};

export const FIT_RESULT: Record<string, string> = {
  good: "Bien ajusté",
  alteration: "Retouche nécessaire",
  too_tight: "Trop serré",
  too_loose: "Trop large",
};

export const HIGHLIGHTS: Record<string, string> = {
  nouveaute: "Nouveauté",
  tendance: "Tendance",
  mariage: "Mariage",
  fete: "Fête",
  ceremonie: "Cérémonie",
  bureau: "Bureau",
};

/** Libelle d'une mensuration : celui du parcours client quand la cle fait
 *  partie des 12 mesures livrees, la cle brute sinon. */
export function measureLabel(key: string): string {
  return isMeasureKey(key) ? MEASURES[key].label : key;
}
