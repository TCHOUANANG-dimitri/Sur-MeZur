/**
 * Appels tailleur (B3) — implementation reelle, suivant le contrat de la
 * section 5 de `MISSION_AGENT_B_PRODUIT_WEB.md`.
 *
 * Tant que l'Agent A n'a pas livre une route, l'implementation simulee
 * (`tailor.mock.ts`, activee par `NEXT_PUBLIC_TAILOR_MOCK=1`) repond a la
 * place, avec EXACTEMENT la meme signature : `TailorApi` ci-dessous choisit
 * l'une ou l'autre. Quand une vraie route existe, retirez-la du mock.
 *
 * Hypotheses documentees (a confirmer dans `CONTRAT_API_TAILLEUR.md`) :
 * - `GET /api/tailor/clients/{id}/measurements` : historique des mesures ;
 * - `PATCH /api/tailors/me` : mise a jour du profil d'atelier ;
 * - `GET /api/tailor/jobs` accepte `client_id` en filtre.
 */

import { api, getToken } from "./client";
import { MockTailorApi } from "./tailor.mock";
import type { Order, TailorProfile } from "./types";

export type TailorJobStatus = "todo" | "doing" | "ready" | "delivered";
export type PatternStatus = "pending" | "ready" | "failed";
export type PatternJobStatus = "processing" | "ready" | "failed";

export interface TailorDashboard {
  due_this_week: number;
  late: number;
  new_orders: number;
  clients_count: number;
  jobs_active: number;
  patterns_count: number;
}

export interface TailorClient {
  id: string;
  name: string;
  phone: string;
  gender: string;
  notes?: string | null;
  created_at: string;
  measurements_count?: number;
  jobs_count?: number;
}

export interface ClientMeasurement {
  id: string;
  data: Record<string, number>;
  height_cm: number;
  weight_kg?: number | null;
  gender?: string | null;
  source: string;
  created_at: string;
}

export interface TailorMeasureSession {
  id: string;
  status: PatternJobStatus;
  measurement_id: string | null;
  height_cm: number | null;
  error_message?: string | null;
}

export interface TailorJob {
  id: string;
  tailor_client_id?: string | null;
  client_name: string;
  description: string;
  model_photo_url?: string | null;
  due_date?: string | null;
  status: TailorJobStatus;
  /** Prix convenu et avance recue : simple note de calcul, AUCUNE transaction. */
  price?: number | null;
  deposit?: number | null;
  created_at: string;
}

export interface TailorPattern {
  id: string;
  garment_type: string;
  tailor_client_id?: string | null;
  status: PatternStatus;
  pieces?: string[];
  created_at: string;
  error_message?: string | null;
}

export interface ShareLink {
  url: string;
  expires_at: string;
}

export const GARMENT_TYPES = [
  { code: "chemise", name: "Chemise" },
  { code: "pantalon", name: "Pantalon" },
  { code: "robe", name: "Robe" },
  { code: "jupe", name: "Jupe" },
  { code: "boubou", name: "Boubou" },
  { code: "kaba", name: "Kaba" },
];

// --- Traduction entre l'interface et l'API reelle ---------------------------
//
// Les ecrans ont ete ecrits contre le contrat provisoire (et la simulation
// `tailor.mock.ts`), avant que le contrat definitif de l'API ne soit publie
// (`CONTRAT_API_TAILLEUR.md`). Les noms different sur plusieurs points
// (`full_name`, `agreed_price`, statut `in_progress`...) : la traduction se
// fait ICI, une seule fois, plutot que dans chaque ecran.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const JOB_STATUS_TO_API: Record<TailorJobStatus, string> = {
  todo: "todo",
  doing: "in_progress",
  ready: "ready",
  delivered: "delivered",
};
const JOB_STATUS_FROM_API: Record<string, TailorJobStatus> = {
  todo: "todo",
  in_progress: "doing",
  ready: "ready",
  delivered: "delivered",
};

function toClient(c: Raw): TailorClient {
  return {
    id: c.id,
    name: c.full_name ?? "",
    phone: c.phone ?? "",
    gender: c.gender ?? "",
    notes: c.notes ?? null,
    created_at: c.created_at,
    measurements_count: Array.isArray(c.measurements) ? c.measurements.length : c.last_measurement_at ? 1 : 0,
    jobs_count: Array.isArray(c.jobs) ? c.jobs.length : (c.open_jobs ?? 0),
  };
}

function clientBody(body: Partial<Pick<TailorClient, "name" | "phone" | "gender" | "notes">>): Raw {
  const out: Raw = {};
  if (body.name !== undefined) out.full_name = body.name;
  if (body.phone !== undefined) out.phone = body.phone || null;
  if (body.gender !== undefined) out.gender = body.gender || null;
  if (body.notes !== undefined) out.notes = body.notes;
  return out;
}

function toMeasurement(m: Raw): ClientMeasurement {
  return {
    id: m.id,
    data: m.data ?? {},
    height_cm: m.height_cm ?? 0,
    weight_kg: m.weight_kg ?? null,
    source: m.source ?? "manual",
    created_at: m.created_at,
  };
}

function toJob(j: Raw, names: Record<string, string>): TailorJob {
  return {
    id: j.id,
    tailor_client_id: j.tailor_client_id ?? null,
    client_name: (j.tailor_client_id && names[j.tailor_client_id]) || "",
    description: j.description ?? "",
    model_photo_url: j.reference_photo_url ?? null,
    due_date: j.delivery_date ?? null,
    status: JOB_STATUS_FROM_API[j.status] ?? "todo",
    price: j.agreed_price ?? null,
    deposit: j.advance_received ?? null,
    created_at: j.created_at,
  };
}

function jobBody(body: Partial<TailorJob>): Raw {
  const out: Raw = {};
  if (body.tailor_client_id !== undefined) out.tailor_client_id = body.tailor_client_id || null;
  if (body.description !== undefined) out.description = body.description;
  if (body.due_date !== undefined) out.delivery_date = body.due_date || null;
  if (body.status !== undefined) out.status = JOB_STATUS_TO_API[body.status];
  if (body.price !== undefined) out.agreed_price = body.price;
  if (body.deposit !== undefined) out.advance_received = body.deposit;
  return out;
}

function toPattern(r: Raw): TailorPattern {
  const pieces = Array.isArray(r.result?.pieces)
    ? r.result.pieces.map((p: Raw) => String(p.label ?? ""))
    : undefined;
  return {
    id: r.id,
    garment_type: r.garment_type,
    tailor_client_id: r.tailor_client_id ?? null,
    status: r.status === "processing" ? "pending" : r.status,
    pieces,
    created_at: r.created_at,
    error_message: r.error_message ?? null,
  };
}

async function clientNames(): Promise<Record<string, string>> {
  const rows = await api.get<Raw[]>("/tailor/clients");
  return Object.fromEntries(rows.map((c) => [c.id, c.full_name ?? ""]));
}

const RealTailorApi = {
  dashboard: async (): Promise<TailorDashboard> => {
    const [d, patterns] = await Promise.all([
      api.get<Raw>("/tailor/dashboard"),
      api.get<Raw[]>("/tailor/patterns").catch(() => [] as Raw[]),
    ]);
    const byStatus: Record<string, number> = d.orders_by_status ?? {};
    return {
      due_this_week: (d.jobs_due_week ?? []).length,
      late: (d.jobs_late ?? []).length,
      new_orders: byStatus.new ?? 0,
      clients_count: d.clients_count ?? 0,
      jobs_active: (d.jobs_due_week ?? []).length + (d.jobs_late ?? []).length,
      patterns_count: patterns.length,
    };
  },

  clients: async (q?: string) =>
    (await api.get<Raw[]>(`/tailor/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`)).map(toClient),
  createClient: async (body: { name: string; phone: string; gender: string }) =>
    toClient(await api.post<Raw>("/tailor/clients", clientBody(body))),
  client: async (id: string) => toClient(await api.get<Raw>(`/tailor/clients/${id}`)),
  patchClient: async (id: string, body: Partial<Pick<TailorClient, "name" | "phone" | "gender" | "notes">>) =>
    toClient(await api.patch<Raw>(`/tailor/clients/${id}`, clientBody(body))),
  deleteClient: (id: string) => api.delete<void>(`/tailor/clients/${id}`),

  /** L'historique est renvoye avec la fiche du client (50 dernieres). */
  clientMeasurements: async (clientId: string): Promise<ClientMeasurement[]> =>
    ((await api.get<Raw>(`/tailor/clients/${clientId}`)).measurements ?? []).map(toMeasurement),
  addManualMeasurements: async (clientId: string, body: { data: Record<string, number>; height_cm?: number }) =>
    toMeasurement(await api.post<Raw>(`/tailor/clients/${clientId}/measurements`, body)),

  createMeasureSession: (clientId: string, body: { height_cm: number; weight_kg?: number; gender?: string }) =>
    api.post<TailorMeasureSession>(`/tailor/clients/${clientId}/measure-session`, body),
  uploadMeasurePhotos: (sessionId: string, front: File, side: File) => {
    const form = new FormData();
    form.append("front", front);
    form.append("side", side);
    return api.postForm<TailorMeasureSession>(`/tailor/measure-session/${sessionId}/photos`, form);
  },
  getMeasureSession: (sessionId: string) =>
    api.get<TailorMeasureSession>(`/tailor/measure-session/${sessionId}`),

  /** L'API renvoie l'adresse de sa route JSON ; on partage la PAGE lisible. */
  shareClient: async (clientId: string): Promise<ShareLink> => {
    const link = await api.post<Raw>(`/tailor/clients/${clientId}/share`);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return { url: `${origin}/fiches/${link.token}`, expires_at: link.expires_at };
  },

  jobs: async (params: { status?: string; due?: "week" | "late"; client_id?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", JOB_STATUS_TO_API[params.status as TailorJobStatus] ?? params.status);
    if (params.due) qs.set("due", params.due);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const [rows, names] = await Promise.all([api.get<Raw[]>(`/tailor/jobs${suffix}`), clientNames()]);
    const jobs = rows.map((j) => toJob(j, names));
    return params.client_id ? jobs.filter((j) => j.tailor_client_id === params.client_id) : jobs;
  },
  /** Un travail est toujours rattache a un client du carnet : un nom saisi
   *  librement cree la fiche client au passage. */
  createJob: async (body: {
    tailor_client_id?: string;
    client_name: string;
    description: string;
    due_date?: string;
    price?: number;
    deposit?: number;
  }) => {
    let clientId = body.tailor_client_id;
    if (!clientId && body.client_name.trim().length >= 2) {
      clientId = (await api.post<Raw>("/tailor/clients", { full_name: body.client_name.trim() })).id as string;
    }
    const created = await api.post<Raw>("/tailor/jobs", jobBody({ ...body, tailor_client_id: clientId }));
    return toJob(created, clientId ? { [clientId]: body.client_name } : {});
  },
  patchJob: async (
    id: string,
    body: Partial<Pick<TailorJob, "description" | "due_date" | "status" | "price" | "deposit" | "client_name">>,
  ) => {
    const [row, names] = await Promise.all([api.patch<Raw>(`/tailor/jobs/${id}`, jobBody(body)), clientNames()]);
    return toJob(row, names);
  },
  deleteJob: (id: string) => api.delete<void>(`/tailor/jobs/${id}`),

  /** Commandes recues via Sur-MeZur. Ni offre, ni devis, ni paiement. */
  orders: () => api.get<Order[]>("/orders"),
  order: (id: string) => api.get<Order>(`/orders/${id}`),
  acceptOrder: (id: string) => api.post<Order>(`/orders/${id}/accept`),
  declineOrder: (id: string, reason: string) => api.post<Order>(`/orders/${id}/decline`, { reason }),
  setOrderStatus: (id: string, status: string) => api.post<Order>(`/orders/${id}/status`, { status }),
  orderChat: (id: string) =>
    api.get<{ id: string; body: string | null; created_at: string; sender_id: string }[]>(`/orders/${id}/chat`),
  sendOrderChat: (id: string, body: string) =>
    api.post<{ id: string; body: string | null; created_at: string; sender_id: string }>(`/orders/${id}/chat`, { body }),

  patterns: async () => (await api.get<Raw[]>("/tailor/patterns")).map(toPattern),
  createPattern: async (body: {
    image: File;
    garment_type: string;
    tailor_client_id?: string;
    measurements?: Record<string, number>;
  }) => {
    const form = new FormData();
    form.append("image", body.image);
    form.append("garment_type", body.garment_type);
    if (body.tailor_client_id) form.append("tailor_client_id", body.tailor_client_id);
    if (body.measurements) form.append("measurements", JSON.stringify(body.measurements));
    return toPattern(await api.postForm<Raw>("/tailor/patterns", form));
  },
  pattern: async (id: string) => toPattern(await api.get<Raw>(`/tailor/patterns/${id}`)),
  deletePattern: (id: string) => api.delete<void>(`/tailor/patterns/${id}`),

  /**
   * SVG du patron, servi par une route protegee : une balise <img> n'enverrait
   * pas le jeton, on le telecharge donc avec et on l'affiche via une URL objet.
   * L'appelant doit liberer l'URL (`URL.revokeObjectURL`) au demontage.
   */
  patternSvgUrl: async (id: string): Promise<string> => {
    const res = await fetch(`/api/tailor/patterns/${id}/svg`, {
      headers: {
        Authorization: `Bearer ${getToken() ?? ""}`,
        "X-SMZ-Platform": "web",
      },
    });
    if (!res.ok) throw new Error("Patron indisponible.");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  profile: () => api.get<TailorProfile | null>("/tailors/me"),
  updateProfile: (body: { shop_name?: string; city?: string; quartier?: string; bio?: string }) =>
    api.patch<TailorProfile>("/tailors/me", body),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type TailorApiShape = typeof RealTailorApi;

const USE_MOCK =
  typeof process.env.NEXT_PUBLIC_TAILOR_MOCK !== "undefined" &&
  process.env.NEXT_PUBLIC_TAILOR_MOCK === "1";

/** Meme signature dans les deux cas : le reste de l'application ne sait pas
 *  lequel repond. */
export const TailorApi: TailorApiShape = (USE_MOCK ? MockTailorApi : RealTailorApi) as TailorApiShape;
