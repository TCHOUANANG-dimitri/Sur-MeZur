/**
 * API de l'administration web (cahier des charges, modules M0 a M14).
 *
 * Les routes historiques partagees avec l'application mobile restent dans
 * `endpoints.ts` (AdminApi) ; celles-ci sont propres a l'interface web.
 * Toutes les listes renvoient une page (`Page<T>`) : pagination, tri et
 * filtres sont faits par le serveur, et le meme appel avec `format=csv`
 * produit l'export (voir `downloadFile`).
 */

import { api, downloadFile } from "./client";

export type Params = Record<string, string | number | boolean | null | undefined>;

export function qs(params: Params = {}): string {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  });
  const out = s.toString();
  return out ? `?${out}` : "";
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  [extra: string]: unknown;
}

export const table = <T>(path: string, params: Params) => api.get<Page<T>>(`${path}${qs(params)}`);
export const exportTable = (path: string, params: Params, name: string) =>
  downloadFile(`${path}${qs({ ...params, format: "csv", page: undefined, page_size: undefined })}`, `${name}.csv`);

// --- Socle ------------------------------------------------------------------

export interface AdminMe {
  id: string;
  full_name: string;
  phone: string;
  admin_role: string;
  admin_role_label: string;
  permissions: string[];
  totp_enabled: boolean;
  idle_minutes: number;
}

export interface QueueItem {
  type: string;
  label: string;
  title: string;
  since: string | null;
  href: string;
}

export interface SearchResult {
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface Note {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface Kpi {
  value: number;
  previous: number;
  change_pct: number | null;
}

export interface Goal {
  id: string;
  label: string;
  metric: string;
  metric_label: string;
  period: string;
  period_start?: string;
  target: number;
  comparator: string;
  value?: number | null;
  progress_pct?: number | null;
  reached?: boolean;
  active: boolean;
}

export interface Dashboard {
  start: string;
  end: string;
  previous_start: string;
  previous_end: string;
  kpis: Record<string, Kpi>;
  goals: Goal[];
}

export interface SeriesPoint {
  period: string;
  value: number;
}

export const Core = {
  me: () => api.get<AdminMe>("/admin/me"),
  counters: () => api.get<Record<string, number>>("/admin/counters", { background: true }),
  queue: () => api.get<{ items: QueueItem[]; total: number }>("/admin/queue"),
  search: (q: string) => api.get<{ results: SearchResult[] }>(`/admin/search${qs({ q })}`),
  notes: (entity_type: string, entity_id: string) => api.get<Note[]>(`/admin/notes${qs({ entity_type, entity_id })}`),
  addNote: (entity_type: string, entity_id: string, body: string) =>
    api.post<Note>("/admin/notes", { entity_type, entity_id, body }),
  deleteNote: (id: string) => api.delete<void>(`/admin/notes/${id}`),
  dashboard: (params: Params) => api.get<Dashboard>(`/admin/dashboard${qs(params)}`),
  timeseries: (params: Params) =>
    api.get<{ metric: string; granularity: string; series: SeriesPoint[] }>(`/admin/timeseries${qs(params)}`),
  funnel: (params: Params) =>
    api.get<{ start: string; end: string; steps: { key: string; label: string; value: number }[] }>(`/admin/funnel${qs(params)}`),
  byCity: () =>
    api.get<{
      cities: {
        city: string;
        clients: number;
        tailors: number;
        tailors_verified: number;
        orders: number;
        quartiers: { name: string; tailors: number }[];
      }[];
    }>("/admin/by-city"),
  measureHealth: (days = 7) => api.get<MeasureHealth>(`/admin/measure/health${qs({ days })}`),
  logout: (refresh_token: string) => api.post<void>("/auth/logout", { refresh_token }, { auth: false }),
};

// --- M2 Utilisateurs -------------------------------------------------------------

export interface UserRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: string;
  admin_role: string | null;
  status: "active" | "suspended" | "guest";
  is_active: boolean;
  is_guest: boolean;
  city: string | null;
  platform: string;
  channel: string | null;
  verification_status: string | null;
  tailor_id: string | null;
  created_at: string;
  last_login_at: string | null;
  last_seen_at: string | null;
}

export interface OrderRow {
  id: string;
  ref: string;
  status: string;
  type: string;
  client_id: string;
  client_user_id: string | null;
  client_name: string | null;
  tailor_id: string;
  tailor_user_id: string | null;
  tailor_name: string | null;
  city: string | null;
  agreed_price: number | null;
  desired_date: string | null;
  dispute_status: string | null;
  dispute_category: string | null;
  dispute_opened_at: string | null;
  created_at: string;
  updated_at: string;
  age_days?: number;
  overdue?: boolean;
  alert?: string;
}

export interface MeasurementItem {
  id: string;
  source: string;
  version: number;
  height_cm: number;
  weight_kg: number | null;
  gender: string | null;
  data: Record<string, number>;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewItem {
  id: string;
  order_id: string;
  stars: number;
  comment: string | null;
  moderation_status: string;
  created_at: string;
}

export interface UserDossier {
  user: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    role: string;
    admin_role: string | null;
    status: string;
    is_active: boolean;
    is_guest: boolean;
    city: string | null;
    language: string;
    photo_consent: boolean;
    platform: string;
    must_change_password: boolean;
    totp_enabled: boolean;
    created_at: string;
    last_login_at: string | null;
    last_seen_at: string | null;
    guest_converted_at: string | null;
  };
  client_profile: { id: string; default_measurement_id: string | null } | null;
  tailor_profile: {
    id: string;
    shop_name: string;
    tailor_type: string;
    city: string | null;
    quartier: string | null;
    bio: string | null;
    verification_status: string;
    rating_avg: number;
    completed_orders_count: number;
    avg_response_minutes: number;
    is_featured: boolean;
  } | null;
  measurements: MeasurementItem[];
  measurement_sessions: { id: string; status: string; error_message: string | null; platform: string | null; created_at: string }[];
  orders: OrderRow[];
  disputes: OrderRow[];
  reviews_given: ReviewItem[];
  reviews_received: ReviewItem[];
  logins: { id: string; success: boolean; method: string; platform: string | null; ip: string | null; user_agent: string | null; created_at: string }[];
  tickets: { id: string; number: number; subject: string; status: string; created_at: string }[];
  acquisition: {
    channel_id: string | null;
    channel: string | null;
    campaign_id: string | null;
    campaign: string | null;
    referrer: string | null;
    self_reported: string | null;
    self_reported_code: string | null;
    self_reported_other: string | null;
    utm: Record<string, string>;
    referral_code: string | null;
    landing_path: string | null;
    platform: string | null;
    qualified: boolean;
    qualified_at: string | null;
  } | null;
  acquisition_comments: AcquisitionComment[];
  notes_count: number;
  can: { write: boolean; delete: boolean; acquisition: boolean };
}

export interface DuplicatePair {
  score: number;
  reasons: string[];
  users: { id: string; full_name: string; phone: string; role: string; created_at: string; is_active: boolean }[];
}

export const Users = {
  table: (p: Params) => table<UserRow>("/admin/tables/users", p),
  dossier: (id: string) => api.get<UserDossier>(`/admin/users/${id}`),
  patch: (id: string, body: { full_name?: string; email?: string | null; city?: string | null }) =>
    api.patch<{ ok: boolean }>(`/admin/users/${id}`, body),
  setActive: (id: string, is_active: boolean, reason?: string) =>
    api.post<unknown>(`/admin/users/${id}/active`, { is_active, reason }),
  remove: (id: string) => api.delete<void>(`/admin/users/${id}`),
  resetPassword: (id: string) => api.post<{ temporary_password: string }>(`/admin/users/${id}/reset-password`),
  bulk: (ids: string[], action: "suspend" | "reactivate" | "delete", reason?: string) =>
    api.post<{ done: number; skipped: number }>("/admin/users/bulk", { ids, action, reason }),
  exportData: (id: string) => downloadFile(`/admin/users/${id}/export`, "donnees.json"),
  correctMeasurement: (id: string, data: Record<string, number>, reason: string, height_cm?: number) =>
    api.patch<{ changed: number }>(`/admin/measurements/${id}`, { data, reason, height_cm }),
  measurementHistory: (id: string) =>
    api.get<{ id: string; actor_name: string; reason: string; details: { modifications?: Record<string, { avant: number; après: number }> }; created_at: string }[]>(
      `/admin/measurements/${id}/history`
    ),
  guestsPreview: () => api.get<{ retention_days: number; guests_total: number; to_delete: number }>("/admin/guests/cleanup"),
  guestsCleanup: () => api.post<{ deleted: number }>("/admin/guests/cleanup"),
  duplicates: () => api.get<{ pairs: DuplicatePair[] }>("/admin/users-duplicates"),
  merge: (primary_id: string, secondary_id: string) =>
    api.post<{ merged: boolean }>("/admin/users-merge", { primary_id, secondary_id }),
};

// --- M3 Tailleurs ------------------------------------------------------------------

export interface VerificationRow {
  id: string;
  user_id: string;
  shop_name: string;
  full_name: string;
  phone: string;
  city: string | null;
  quartier: string | null;
  verification_status: string;
  updated_at: string;
}

export interface VerificationDossier {
  tailor: {
    id: string;
    user_id: string;
    shop_name: string;
    tailor_type: string;
    bio: string | null;
    city: string | null;
    quartier: string | null;
    lat: number | null;
    lng: number | null;
    verification_status: string;
    updated_at: string;
  };
  user: { id: string; full_name: string; phone: string; created_at: string } | null;
  documents: { id: string; type: string; label: string; file_url: string; status: string; created_at: string }[];
  history: { id: string; action: string; reason: string | null; missing_documents: string[]; actor_name: string | null; created_at: string }[];
}

export interface TailorRow {
  id: string;
  user_id: string;
  shop_name: string;
  full_name: string;
  phone: string;
  city: string | null;
  quartier: string | null;
  verification_status: string;
  rating_avg: number;
  orders: number;
  delivered: number;
  dispute_rate: number;
  late_rate: number;
  avg_response_minutes: number;
  is_active: boolean;
  alerts: string;
  is_featured: boolean;
  featured_rank: number | null;
}

export const Tailors = {
  verifications: (status?: string) => api.get<VerificationRow[]>(`/admin/verifications-table${qs({ status })}`),
  dossier: (id: string) => api.get<VerificationDossier>(`/admin/verifications/${id}/dossier`),
  decide: (id: string, status: "approved" | "rejected", reason?: string) =>
    api.post<unknown>(`/admin/verifications/${id}/decide`, { status, reason }),
  requestInfo: (id: string, missing_documents: string[], message: string) =>
    api.post<unknown>(`/admin/verifications/${id}/request-info`, { missing_documents, message }),
  table: (p: Params) => table<TailorRow>("/admin/tables/tailors", p),
  featured: (id: string, is_featured: boolean, rank?: number | null) =>
    api.post<unknown>(`/admin/tailors/${id}/featured`, { is_featured, rank }),
  map: () =>
    api.get<{
      cities: { city: string; total: number; verified: number; quartiers: { name: string; verified: number }[] }[];
      points: { id: string; shop_name: string; lat: number; lng: number; verified: boolean; city: string | null }[];
    }>("/admin/tailors/map"),
};

// --- M4 Catalogue ---------------------------------------------------------------------

export interface ModelRow {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  category: string | null;
  gender: string | null;
  status: string;
  rejection_reason: string | null;
  created_by: string | null;
  author: string;
  highlight: string | null;
  sort_order: number;
  photo_url: string | null;
  photos: string[];
  style_tags: string[];
  base_price: number | null;
  thumbnail_color: string;
  views: number;
  likes: number;
  selections: number;
  orders: number;
  created_at: string;
}

export interface FabricItem {
  id: string;
  name: string;
  type: string;
  color_hex: string;
  texture_url: string | null;
  is_local: boolean;
  owner_tailor_id: string | null;
}

export interface AccessoryItem {
  id: string;
  name: string;
  price: number;
  asset_url: string | null;
  compatible_categories: string[];
}

export interface RtwRow {
  id: string;
  name: string;
  description: string | null;
  tailor: string;
  tailor_user_id: string;
  price: number;
  in_stock: boolean;
  photo_url: string | null;
  photos: string[];
  moderation_status: string;
  rejection_reason: string | null;
  created_at: string;
}

export const Catalog = {
  models: (p: Params) => table<ModelRow>("/admin/tables/models", p),
  moderate: (id: string, status: string, reason?: string) =>
    api.post<unknown>(`/admin/models/${id}/moderate`, { status, reason }),
  bulk: (ids: string[], action: "publish" | "hide" | "reject" | "delete", reason?: string) =>
    api.post<{ done: number; skipped: number }>("/admin/models/bulk", { ids, action, reason }),
  reorderPhotos: (id: string, photos: string[]) =>
    api.put<{ photos: string[]; photo_url: string | null }>(`/admin/models/${id}/photos`, { photos }),
  importModels: (files: File[], category_id: string, status: string, tableFile?: File | null) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("category_id", category_id);
    fd.append("status", status);
    if (tableFile) fd.append("table", tableFile);
    return api.postForm<{ created: number; errors: string[] }>("/admin/models/import", fd);
  },
  fabrics: () => api.get<FabricItem[]>("/admin/fabrics"),
  createFabric: (body: Omit<FabricItem, "id" | "texture_url" | "owner_tailor_id">) => api.post<FabricItem>("/admin/fabrics", body),
  updateFabric: (id: string, body: Omit<FabricItem, "id" | "texture_url" | "owner_tailor_id">) =>
    api.patch<FabricItem>(`/admin/fabrics/${id}`, body),
  fabricTexture: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<FabricItem>(`/admin/fabrics/${id}/texture`, fd);
  },
  deleteFabric: (id: string) => api.delete<void>(`/admin/fabrics/${id}`),
  accessories: () => api.get<AccessoryItem[]>("/admin/accessories"),
  createAccessory: (body: Omit<AccessoryItem, "id" | "asset_url">) => api.post<AccessoryItem>("/admin/accessories", body),
  updateAccessory: (id: string, body: Omit<AccessoryItem, "id" | "asset_url">) =>
    api.patch<AccessoryItem>(`/admin/accessories/${id}`, body),
  deleteAccessory: (id: string) => api.delete<void>(`/admin/accessories/${id}`),
  rtw: (p: Params) => table<RtwRow>("/admin/tables/ready-to-wear", p),
  moderateRtw: (id: string, status: string, reason?: string) =>
    api.post<unknown>(`/admin/ready-to-wear/${id}/moderate`, { status, reason }),
};

// --- M5 / M7 Commandes et litiges -------------------------------------------------------

export interface OrderDossier {
  order: OrderRow & {
    client_notes: string | null;
    reception_mode: string;
    priority: string;
    delivery_fee: number | null;
    current_offer_round: number;
    dispute_note: string | null;
    dispute_opened_by: string | null;
    dispute_resolved_at: string | null;
    dispute_refund_amount: number | null;
    cancel_reason: string | null;
    accessories: unknown[];
  };
  client: { id: string; full_name: string; phone: string | null; role: string; is_active: boolean } | null;
  tailor: { id: string; full_name: string; phone: string | null; tailor_id: string; shop_name: string; city: string | null } | null;
  model: { id: string; name: string; photo_url: string | null } | null;
  ready_to_wear: { id: string; name: string; photo_url: string | null } | null;
  fabric: { id: string; name: string; color_hex: string } | null;
  measurement: { id: string; height_cm: number; gender: string | null; source: string; version: number; data: Record<string, number>; created_at: string } | null;
  offers: { id: string; actor: string; round: number; amount: number; delay_days: number | null; status: string; created_at: string }[];
  quotes: { id: string; line_items: { label: string; amount: number }[]; total: number; delay_days: number; commission_rate: number; commission_amount: number; net_to_tailor: number; accepted: boolean; created_at: string }[];
  payments: { id: string; phase: string; provider: string; amount: number; status: string; provider_txn_ref: string; created_at: string }[];
  split: { total: number; deposit: number; tailor_immediate: number; escrow: number; balance: number; escrow_status: string; released_at: string | null } | null;
  refunds: { id: string; amount: number; reason: string; status: string; origin: string; created_at: string; completed_at: string | null }[];
  delivery: { mode: string; fee: number; confirmed_by_client: boolean; confirmed_at: string | null } | null;
  pattern: { svg_url: string | null; pdf_url: string | null; sent_at: string | null } | null;
  review: { id: string; stars: number; comment: string | null } | null;
  fit_feedbacks: { id: string; result: string; adjustments: { measure: string; delta_cm: number; note?: string }[]; comment: string | null; source: string; created_at: string }[];
  dispute_messages: { id: string; author_name: string; author_role: string; audience: string; body: string; attachment_url: string | null; requests_photo: boolean; created_at: string }[];
  timeline: { at: string | null; kind: string; title: string; detail: string | null }[];
}

export interface DisputeStats {
  open: number;
  overdue: number;
  alert_days: number;
  avg_open_age_days: number | null;
  avg_resolution_days: number | null;
  by_category: Record<string, number>;
  by_outcome: Record<string, number>;
  opened_by: Record<string, number>;
}

export const Orders = {
  table: (p: Params) => table<OrderRow>("/admin/tables/orders", p),
  dossier: (id: string) => api.get<OrderDossier>(`/admin/orders/${id}/dossier`),
  cancel: (id: string, reason: string, refund_amount?: number | null) =>
    api.post<unknown>(`/admin/orders/${id}/cancel`, { reason, refund_amount }),
  forceStatus: (id: string, status: string, reason: string) =>
    api.post<unknown>(`/admin/orders/${id}/force-status`, { status, reason }),
  resetNegotiation: (id: string, reason: string) => api.post<unknown>(`/admin/orders/${id}/reset-negotiation`, { reason }),
  alerts: () => api.get<{ items: OrderRow[]; no_response_days: number }>("/admin/orders-alerts"),
  fitFeedback: (id: string, body: { result: string; adjustments: { measure: string; delta_cm: number; note?: string }[]; comment?: string }) =>
    api.post<unknown>(`/admin/orders/${id}/fit-feedback`, body),
  disputes: (p: Params) => table<OrderRow>("/admin/tables/disputes", p),
  disputeMessage: (id: string, audience: string, body: string, requests_photo: boolean) =>
    api.post<unknown>(`/admin/disputes/${id}/messages`, { audience, body, requests_photo }),
  decide: (id: string, decision: string, reason: string, amount?: number | null) =>
    api.post<{ dispute_status: string; refund_amount: number | null }>(`/admin/disputes/${id}/decide`, { decision, reason, amount }),
  disputeStats: () => api.get<DisputeStats>("/admin/disputes-stats"),
};

// --- M6 Paiements -------------------------------------------------------------------------

export interface PaymentRow {
  id: string;
  order_id: string;
  order_ref: string;
  client_name: string | null;
  client_user_id: string | null;
  tailor_name: string | null;
  phase: string;
  phase_label: string;
  provider: string;
  provider_label: string;
  amount: number;
  status: string;
  provider_txn_ref: string;
  psp_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutSummaryRow {
  tailor_id: string;
  shop_name: string;
  user_id: string | null;
  orders: number;
  due_total: number;
  paid: number;
  balance: number;
  held_in_escrow: number;
  commission: number;
  refunded: number;
}

export interface RefundRow {
  id: string;
  order_id: string;
  order_ref: string;
  amount: number;
  origin: string;
  reason: string;
  status: string;
  provider_ref: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ReconciliationReport {
  lines: number;
  matched: number;
  mismatched: { reference: string; platform_amount: number; operator_amount: number; payment_id: string; order_id: string }[];
  unknown: { reference: string; amount: number | null; date: string | null; status: string }[];
  missing_in_statement: { reference: string; amount: number; payment_id: string; order_id: string; date: string }[];
  period: [string, string] | null;
}

export interface Receipt {
  number: string;
  date: string;
  status: string;
  amount: number;
  phase: string;
  provider: string;
  provider_txn_ref: string;
  order_ref: string;
  order_total: number | null;
  client: { name: string; phone: string } | null;
  tailor: { name: string; city: string | null } | null;
}

export interface Statement {
  summary: { month: string; cash_in: number; commission: number; operator_fees: number; payouts: number; refunds: number; net: number };
  lines: { date: string; type: string; reference: string; order_ref: string; amount: number; operator_fee: number }[];
}

export const Payments = {
  table: (p: Params) => table<PaymentRow>("/admin/tables/payments", p),
  remind: (id: string) => api.post<unknown>(`/admin/payments/${id}/remind`),
  setStatus: (id: string, status: "paid" | "failed", reason: string) =>
    api.post<unknown>(`/admin/payments/${id}/status`, { status, reason }),
  payoutSummary: () =>
    api.get<{ tailors: PayoutSummaryRow[]; totals: Record<string, number> }>("/admin/payouts/summary"),
  recordPayout: (body: { tailor_id: string; amount: number; reference?: string; note?: string; order_id?: string; kind?: string }) =>
    api.post<{ id: string }>("/admin/payouts", body),
  payouts: (p: Params) =>
    table<{ id: string; tailor_id: string; shop_name: string; amount: number; kind: string; reference: string | null; order_ref: string | null; note: string | null; paid_at: string }>(
      "/admin/tables/payouts",
      p
    ),
  refunds: (p: Params) => table<RefundRow>("/admin/tables/refunds", p),
  createRefund: (order_id: string, amount: number, reason: string) =>
    api.post<{ id: string }>("/admin/refunds", { order_id, amount, reason }),
  refundStatus: (id: string, status: "completed" | "failed" | "cancelled", provider_ref?: string) =>
    api.post<unknown>(`/admin/refunds/${id}/status`, { status, provider_ref }),
  reconcile: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<ReconciliationReport>("/admin/reconciliation", fd);
  },
  receipt: (id: string) => api.get<Receipt>(`/admin/payments/${id}/receipt`),
  statement: (month: string, operator_fee_rate: number) =>
    api.get<Statement>(`/admin/statements/monthly${qs({ month, operator_fee_rate })}`),
  statementCsv: (month: string, operator_fee_rate: number) =>
    downloadFile(`/admin/statements/monthly${qs({ month, operator_fee_rate, format: "csv" })}`, `releve-${month}.csv`),
  tiers: () => api.get<{ id: string; min_price: number; max_price: number | null; rate: number }[]>("/admin/commission-tiers"),
  createTier: (body: { min_price: number; max_price: number | null; rate: number }) => api.post<unknown>("/admin/commission-tiers", body),
  updateTier: (id: string, body: { min_price: number; max_price: number | null; rate: number }) =>
    api.patch<unknown>(`/admin/commission-tiers/${id}`, body),
  deleteTier: (id: string) => api.delete<void>(`/admin/commission-tiers/${id}`),
};

// --- M8 Avis --------------------------------------------------------------------------------

export interface ReviewRow {
  id: string;
  order_id: string;
  stars: number;
  comment: string | null;
  client_name: string | null;
  tailor_id: string;
  tailor_name: string | null;
  moderation_status: string;
  reports: number;
  tailor_reply: string | null;
  tailor_reply_at: string | null;
  reply_status: string | null;
  created_at: string;
}

export const Reviews = {
  table: (p: Params) => table<ReviewRow>("/admin/tables/reviews", p),
  moderate: (id: string, status: string) => api.post<unknown>(`/admin/reviews/${id}/moderate?status_=${status}`),
  reports: (id: string) => api.get<{ id: string; reporter: string | null; reason: string; status: string; created_at: string }[]>(`/admin/reviews/${id}/reports`),
  decideReports: (id: string, decision: "hide" | "keep", reason?: string) =>
    api.post<unknown>(`/admin/reviews/${id}/reports/decide`, { decision, reason }),
  replyStatus: (id: string, status: "visible" | "hidden") => api.post<unknown>(`/admin/reviews/${id}/reply-status`, { status }),
  bulk: (ids: string[], status: string) => api.post<unknown>("/admin/reviews/bulk", { ids, status }),
};

// --- M9 / M10 Mesure et collecte ----------------------------------------------------------------

export interface MeasureHealth {
  days: number;
  total: number;
  success: number;
  failed: number;
  success_rate_pct: number | null;
  avg_duration_s: number | null;
  median_duration_s: number | null;
  top_errors: { cause: string; count: number }[];
  by_platform: Record<string, number>;
  per_day: { day: string; ready: number; failed: number }[];
  processing_now: number;
}

export interface SessionRow {
  id: string;
  created_at: string;
  status: string;
  platform: string;
  duration_s: number | null;
  error_message: string | null;
  error_family: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  gender: string | null;
  user_id: string;
  is_guest: boolean;
  account: string;
  has_photos: boolean;
  measurement_id: string | null;
}

export interface SessionDiagnostic {
  id: string;
  status: string;
  platform: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_s: number | null;
  error_message: string | null;
  error_family: string;
  height_cm: number | null;
  weight_kg: number | null;
  gender: string | null;
  photo_consent: boolean;
  front_photo_url: string | null;
  side_photo_url: string | null;
  user: { id: string; full_name: string; is_guest: boolean } | null;
  measurement: { id: string; data: Record<string, number>; confidence: Record<string, number> | null } | null;
}

export interface Precision {
  measures: { measure: string; count: number; mean_error_cm: number; mean_abs_error_cm: number; within_2cm_pct: number }[];
  sources: Record<string, number>;
  fit_results: Record<string, number>;
  good_fit_pct: number | null;
  delivered_orders: number;
}

export interface CollecteObjectives {
  target: number;
  minimum: number;
  collected: number;
  validated: number;
  progress_pct: number | null;
  gender_targets: { female: number; male: number };
  by_gender: { name: string; count: number }[];
  by_corpulence: { name: string; count: number }[];
  by_clothing: { name: string; count: number }[];
  by_city: { name: string; count: number }[];
  by_week: { week: string; count: number }[];
}

export const Measure = {
  sessions: (p: Params) => table<SessionRow>("/admin/tables/measurement-sessions", p),
  session: (id: string) => api.get<SessionDiagnostic>(`/admin/measurement-sessions/${id}`),
  health: (days = 7) => api.get<MeasureHealth>(`/admin/measure/health${qs({ days })}`),
  chain: () => api.get<Record<string, unknown>>("/admin/measure/chain"),
  precision: () => api.get<Precision>("/admin/measure/precision"),
  collecteObjectives: () => api.get<CollecteObjectives>("/admin/collecte/objectives"),
};

// Campagne de collecte : routes existantes de l'application `collecte/`.
export interface CollecteSubject {
  id: string;
  code: string;
  number: number;
  collector_id: string;
  collector_name: string | null;
  gender: string;
  age: number | null;
  height_cm: number;
  weight_kg: number;
  measurements: Record<string, number>;
  clothing: string | null;
  city: string | null;
  place: string | null;
  measured_by: string | null;
  notes: string | null;
  review_status: string;
  review_note: string | null;
  photos: { view: string; size_bytes: number; width: number | null; height: number | null; updated_at: string }[];
  complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface Collector {
  id: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  subjects?: number;
  created_at?: string;
}

export const Collecte = {
  stats: () => api.get<Record<string, number>>("/collecte/stats"),
  subjects: (p: Params) => api.get<CollecteSubject[]>(`/collecte/subjects${qs(p)}`),
  review: (id: string, status: "validated" | "rejected" | "pending", note?: string) =>
    api.post<CollecteSubject>(`/collecte/subjects/${id}/review`, { status, note }),
  photoUrl: (id: string, view: string) => `/api/collecte/subjects/${id}/photos/${view}`,
  collectors: () => api.get<Collector[]>("/collecte/collectors"),
  createCollector: (body: { full_name: string; phone: string; password: string }) => api.post<Collector>("/collecte/collectors", body),
  setCollectorActive: (id: string, is_active: boolean) => api.patch<Collector>(`/collecte/collectors/${id}`, { is_active }),
  exportArchive: (format: string) => downloadFile(`/collecte/export${qs({ format })}`, "collecte.zip"),
};

// --- M11 Communication -------------------------------------------------------------------------

export interface Audience {
  role: "all" | "client" | "tailor";
  city?: string | null;
  active_days?: number | null;
  verified_only?: boolean;
}

export interface Template {
  id: string;
  category: string;
  category_label: string;
  title: string;
  body: string;
  updated_at: string;
}

export interface InfoPage {
  slug: string;
  title: string;
  body: string;
  published: boolean;
  updated_at: string;
}

export const Comms = {
  preview: (a: Audience) => api.post<{ recipients: number }>("/admin/announcements/preview", a),
  send: (title: string, body: string, audience: Audience) =>
    api.post<{ id: string; recipients: number }>("/admin/announcements", { title, body, audience }),
  announcements: () =>
    api.get<{ id: string; title: string; body: string; audience: Audience; recipients_count: number; author_name: string; created_at: string }[]>(
      "/admin/announcements"
    ),
  templates: (category?: string) =>
    api.get<{ categories: Record<string, string>; items: Template[] }>(`/admin/message-templates${qs({ category })}`),
  createTemplate: (body: { category: string; title: string; body: string }) => api.post<Template>("/admin/message-templates", body),
  updateTemplate: (id: string, body: { category: string; title: string; body: string }) =>
    api.patch<Template>(`/admin/message-templates/${id}`, body),
  deleteTemplate: (id: string) => api.delete<void>(`/admin/message-templates/${id}`),
  pages: () => api.get<InfoPage[]>("/admin/pages"),
  savePage: (slug: string, body: { title: string; body: string; published: boolean }) => api.put<InfoPage>(`/admin/pages/${slug}`, body),
};

// --- M12 Support ---------------------------------------------------------------------------------

export interface TicketRow {
  id: string;
  number: number;
  name: string;
  phone: string | null;
  email: string | null;
  category: string;
  category_label: string;
  subject: string;
  status: string;
  assigned_to: string | null;
  assignee: string | null;
  user_id: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketDetail extends Omit<TicketRow, "assignee" | "updated_at"> {
  body: string;
  order_ref: string | null;
  dispute_open: boolean;
  resolved_at: string | null;
  messages: { id: string; author_name: string; from_staff: boolean; body: string; created_at: string }[];
  staff: { id: string; full_name: string }[];
  categories: Record<string, string>;
}

export const Support = {
  table: (p: Params) => table<TicketRow>("/admin/tables/tickets", p),
  ticket: (id: string) => api.get<TicketDetail>(`/admin/tickets/${id}`),
  update: (id: string, body: { status?: string; assigned_to?: string | null; order_id?: string | null; user_id?: string | null; category?: string }) =>
    api.patch<unknown>(`/admin/tickets/${id}`, body),
  reply: (id: string, body: string) => api.post<{ ok: boolean; notified: boolean }>(`/admin/tickets/${id}/messages`, { body }),
};

// --- M13 Securite ----------------------------------------------------------------------------------

export interface TeamMember {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  admin_role: string;
  admin_role_label: string;
  is_active: boolean;
  totp_enabled: boolean;
  last_login_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  open_sessions: number;
}

export interface AuditRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  details: Record<string, unknown>;
  ip: string | null;
}

export interface SessionItem {
  id: string;
  user_id: string;
  full_name: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

export interface SystemState {
  app_version: string;
  server_time: string;
  database: { dialect: string; ok: boolean; size_bytes?: number | null; error?: string };
  disks: { label: string; path: string; total_bytes: number; free_bytes: number; used_pct: number }[];
  backup: { folder: string; last: string | null; file?: string; size_bytes?: number; age_hours?: number; count?: number } | null;
  measurement_chain: Record<string, unknown>;
  counts: Record<string, number>;
}

export const Security = {
  team: () => api.get<{ roles: Record<string, string>; members: TeamMember[] }>("/admin/team"),
  createMember: (body: { full_name: string; phone: string; email?: string; admin_role: string }) =>
    api.post<{ member: TeamMember; temporary_password: string }>("/admin/team", body),
  updateMember: (id: string, body: { admin_role?: string; is_active?: boolean }) => api.patch<TeamMember>(`/admin/team/${id}`, body),
  resetMember2fa: (id: string) => api.post<unknown>(`/admin/team/${id}/reset-2fa`),
  audit: (p: Params) => table<AuditRow>("/admin/tables/audit", p),
  auditActions: () => api.get<string[]>("/admin/audit/actions"),
  setup2fa: () => api.post<{ secret: string; otpauth_uri: string }>("/admin/me/2fa/setup"),
  enable2fa: (code: string) => api.post<unknown>("/admin/me/2fa/enable", { code }),
  disable2fa: (code: string) => api.post<unknown>("/admin/me/2fa/disable", { code }),
  sessions: (all = false) => api.get<{ sessions: SessionItem[]; idle_minutes: number }>(`/admin/sessions${qs({ all })}`),
  revokeSession: (id: string) => api.post<unknown>(`/admin/sessions/${id}/revoke`),
  revokeOthers: () => api.post<{ revoked: number }>("/admin/sessions/revoke-others"),
  settings: () =>
    api.get<{ values: Record<string, unknown>; defaults: Record<string, unknown>; labels: Record<string, string> }>("/admin/settings"),
  saveSetting: (key: string, value: unknown) => api.put<{ key: string; value: unknown }>(`/admin/settings/${key}`, { value }),
  system: () => api.get<SystemState>("/admin/system"),
};

// --- M14 Croissance -----------------------------------------------------------------------------------

export interface AcquisitionComment {
  id: string;
  author_name: string;
  channel: string | null;
  campaign: string | null;
  referrer: string | null;
  method: string | null;
  body: string | null;
  created_at: string;
}

export interface AcquisitionRow {
  user_id: string;
  full_name: string;
  phone: string;
  role: string;
  created_at: string;
  platform: string;
  self_reported: string | null;
  self_reported_other: string | null;
  utm: string;
  referral_code: string | null;
  channel_id: string | null;
  channel: string | null;
  campaign_id: string | null;
  campaign: string | null;
  referrer: string | null;
  qualified: boolean;
}

export interface Channel {
  id: string;
  code: string;
  name: string;
  self_reportable: boolean;
  active: boolean;
  sort_order: number;
  users: number;
}

export interface Campaign {
  id: string;
  name: string;
  code: string;
  channel_id: string | null;
  channel: string | null;
  starts_on: string | null;
  ends_on: string | null;
  budget: number | null;
  notes: string | null;
  active: boolean;
  users: number;
}

export interface ChannelStatsRow {
  signups: number;
  clients: number;
  tailors: number;
  activated_measure: number;
  activated_order: number;
  orders: number;
  gmv: number;
  churn_pct: number | null;
}

export interface Overview {
  as_of: string;
  total: number;
  by_role: Record<string, number>;
  active_accounts: number;
  suspended: number;
  guests: number;
  status_is_current: boolean;
}

export interface NewUsers {
  series: ({ period: string; total: number } & Record<string, number | string>)[];
  total: number;
  previous: number;
  change_pct: number | null;
}

export interface ActiveStats {
  series: { period: string; dau: number; wau: number; mau: number }[];
  dau: number;
  wau: number;
  mau: number;
  stickiness_pct: number | null;
  tracking_since: string;
}

export interface ChurnStats {
  threshold_days: number;
  series: { period: string; base: number; churned: number; rate_pct: number | null; client_rate_pct: number | null; tailor_rate_pct: number | null }[];
  tracking_since: string;
}

export interface Cohorts {
  rows: { cohort: string; size: number; retention_pct: (number | null)[] }[];
  tracking_since: string;
}

export interface Activation {
  clients: {
    signed_up: number;
    first_measure: number;
    first_measure_pct: number | null;
    first_measure_median_days: number | null;
    first_order: number;
    first_order_pct: number | null;
    first_order_median_days: number | null;
  };
  tailors: { signed_up: number; first_order: number; first_order_pct: number | null; first_order_median_days: number | null };
}

export interface Returns {
  threshold_days: number;
  count: number;
  by_cause: Record<string, number>;
  events: { user_id: string; day: string; inactive_days: number; cause: string }[];
}

export interface Report {
  period: string;
  start: string;
  end: string;
  summary: { label: string; value: number | null }[];
  channels: (ChannelStatsRow & { channel_id: string | null; name: string })[];
  campaigns: (ChannelStatsRow & { campaign_id: string; name: string; code: string; channel: string | null; budget: number | null; cost_per_user: number | null; cost_per_customer: number | null })[];
  new_users_series: NewUsers["series"];
  goals: Goal[];
}

export const Growth = {
  overview: (as_of?: string) => api.get<Overview>(`/admin/growth/overview${qs({ as_of })}`),
  newUsers: (p: Params) => api.get<NewUsers>(`/admin/growth/new-users${qs(p)}`),
  active: (p: Params) => api.get<ActiveStats>(`/admin/growth/active${qs(p)}`),
  churn: (p: Params) => api.get<ChurnStats>(`/admin/growth/churn${qs(p)}`),
  cohorts: (p: Params) => api.get<Cohorts>(`/admin/growth/cohorts${qs(p)}`),
  activation: (p: Params) => api.get<Activation>(`/admin/growth/activation${qs(p)}`),
  returns: (p: Params) => api.get<Returns>(`/admin/growth/returns${qs(p)}`),
  channelStats: (p: Params) =>
    api.get<{ channels: Report["channels"]; campaigns: Report["campaigns"]; threshold_days: number }>(`/admin/growth/channels-stats${qs(p)}`),
  segments: () => api.get<{ cities: string[]; channels: { id: string; name: string }[] }>("/admin/growth/segments"),
  acquisitions: (p: Params) => table<AcquisitionRow>("/admin/growth/acquisitions", p),
  qualify: (user_id: string, body: { channel_id?: string | null; campaign_id?: string | null; referrer?: string; method?: string; body?: string }) =>
    api.post<unknown>(`/admin/growth/acquisitions/${user_id}`, body),
  qualifyBulk: (user_ids: string[], body: { channel_id?: string | null; campaign_id?: string | null; referrer?: string; method?: string; body?: string }) =>
    api.post<{ done: number }>("/admin/growth/acquisitions-bulk", { user_ids, ...body }),
  history: (user_id: string) => api.get<AcquisitionComment[]>(`/admin/growth/acquisitions/${user_id}/history`),
  channels: () => api.get<Channel[]>("/admin/growth/channels"),
  createChannel: (body: Omit<Channel, "id" | "users">) => api.post<Channel>("/admin/growth/channels", body),
  updateChannel: (id: string, body: Omit<Channel, "id" | "users">) => api.patch<Channel>(`/admin/growth/channels/${id}`, body),
  deleteChannel: (id: string) => api.delete<void>(`/admin/growth/channels/${id}`),
  campaigns: () => api.get<Campaign[]>("/admin/growth/campaigns"),
  createCampaign: (body: Omit<Campaign, "id" | "users" | "channel">) => api.post<Campaign>("/admin/growth/campaigns", body),
  updateCampaign: (id: string, body: Omit<Campaign, "id" | "users" | "channel">) => api.patch<Campaign>(`/admin/growth/campaigns/${id}`, body),
  deleteCampaign: (id: string) => api.delete<void>(`/admin/growth/campaigns/${id}`),
  goals: () => api.get<{ metrics: Record<string, string>; goals: Goal[] }>("/admin/growth/goals"),
  createGoal: (body: { label: string; metric: string; period: string; target: number; comparator: string; active: boolean }) =>
    api.post<{ id: string }>("/admin/growth/goals", body),
  updateGoal: (id: string, body: { label: string; metric: string; period: string; target: number; comparator: string; active: boolean }) =>
    api.patch<unknown>(`/admin/growth/goals/${id}`, body),
  deleteGoal: (id: string) => api.delete<void>(`/admin/growth/goals/${id}`),
  report: (p: Params) => api.get<Report>(`/admin/growth/report${qs(p)}`),
  reportCsv: (p: Params) => downloadFile(`/admin/growth/report${qs({ ...p, format: "csv" })}`, "rapport.csv"),
};
