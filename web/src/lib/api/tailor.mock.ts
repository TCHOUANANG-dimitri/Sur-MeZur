"use client";

/**
 * Simulation des routes tailleur (B3), en attendant l'Agent A.
 *
 * Activee par `NEXT_PUBLIC_TAILOR_MOCK=1` (voir `tailor.ts`). Meme signature
 * EXACTE que l'implementation reelle : quand une vraie route existe, on
 * retire la fonction correspondante ici et on laisse passer l'appel.
 *
 * Donnees conservees en localStorage (`smz_tailor_mock_v1`) : l'espace est
 * utilisable de bout en bout hors-ligne. Les mesures « par photo » et les
 * patrons sont generes localement apres quelques secondes, pour reproduire
 * l'attente puis le statut (interroge toutes les 2 s par les pages).
 */

import type {
  ClientMeasurement,
  ShareLink,
  TailorClient,
  TailorDashboard,
  TailorJob,
  TailorMeasureSession,
  TailorPattern,
} from "./tailor";

const STORE_KEY = "smz_tailor_mock_v1";
const SHARE_STORE_KEY = "smz_tailor_mock_shares_v1";

interface Store {
  seq: number;
  clients: TailorClient[];
  measurements: Record<string, ClientMeasurement[]>;
  jobs: TailorJob[];
  patterns: Array<TailorPattern & { svg?: string }>;
}

function seed(): Store {
  const now = new Date().toISOString();
  return {
    seq: 100,
    clients: [
      { id: "mock-cli-1", name: "Awa Diallo", phone: "+237612345678", gender: "female", notes: "Cliente fidèle.", created_at: now, measurements_count: 1, jobs_count: 1 },
      { id: "mock-cli-2", name: "Jean Mbarga", phone: "+237698765432", gender: "male", notes: null, created_at: now, measurements_count: 0, jobs_count: 1 },
    ],
    measurements: {
      "mock-cli-1": [
        {
          id: "mock-mes-1",
          data: { neck: 38, chest: 94, waist: 78, hips: 102, biceps: 30, thigh: 58, wrist: 17, ankle: 23, shoulder: 41, sleeve_length: 62, inseam: 80, back_length: 43 },
          height_cm: 168,
          weight_kg: 68,
          gender: "female",
          source: "ai",
          created_at: now,
        },
      ],
    },
    jobs: [
      {
        id: "mock-job-1",
        tailor_client_id: "mock-cli-1",
        client_name: "Awa Diallo",
        description: "Robe de soirée en wax",
        due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        status: "doing",
        price: 15000,
        deposit: 5000,
        created_at: now,
      },
      {
        id: "mock-job-2",
        tailor_client_id: "mock-cli-2",
        client_name: "Jean Mbarga",
        description: "Pantalon classique gris",
        due_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
        status: "todo",
        price: 8000,
        deposit: null,
        created_at: now,
      },
    ],
    patterns: [],
  };
}

function load(): Store {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* ignore */
  }
  const s = seed();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}

function save(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function nextId(store: Store, prefix: string): string {
  store.seq += 1;
  return `mock-${prefix}-${store.seq}`;
}

const wait = (ms = 300) => new Promise<void>((r) => setTimeout(r, ms));

/** Petite variation deterministe (stable entre deux chargements). */
function variation(seedStr: string, index: number, amplitude: number): number {
  let hash = 0;
  const s = `${seedStr}:${index}`;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 100) / 100 - 0.5) * 2 * amplitude;
}

const BASE_FEMALE: Record<string, number> = {
  neck: 36, chest: 92, waist: 76, hips: 100, biceps: 29, thigh: 57,
  wrist: 16, ankle: 22, shoulder: 40, sleeve_length: 60, inseam: 78, back_length: 42,
};
const BASE_MALE: Record<string, number> = {
  neck: 40, chest: 98, waist: 84, hips: 100, biceps: 32, thigh: 59,
  wrist: 18, ankle: 24, shoulder: 45, sleeve_length: 64, inseam: 82, back_length: 45,
};

function fakeMeasurements(clientId: string, gender?: string): Record<string, number> {
  const base = gender === "male" ? BASE_MALE : BASE_FEMALE;
  const out: Record<string, number> = {};
  Object.keys(base).forEach((key, i) => {
    out[key] = Math.round((base[key] + variation(clientId, i, 2.5)) * 10) / 10;
  });
  return out;
}

interface PendingSession {
  readyAt: number;
  clientId: string;
  measurement: Omit<ClientMeasurement, "id" | "created_at">;
}

const sessions = new Map<string, PendingSession>();

interface PendingPattern {
  readyAt: number;
  svg: string;
  pieces: string[];
}

const pendingPatterns = new Map<string, PendingPattern>();

const PIECES: Record<string, string[]> = {
  chemise: ["Devant", "Dos", "Manche gauche", "Manche droite", "Col", "Poignet × 2"],
  pantalon: ["Devant gauche", "Devant droit", "Dos gauche", "Dos droit", "Ceinture"],
  robe: ["Devant corsage", "Dos corsage", "Manche gauche", "Manche droite", "Jupe devant", "Jupe dos"],
  jupe: ["Devant", "Dos", "Ceinture"],
  boubou: ["Devant", "Dos", "Manche gauche", "Manche droite"],
  veste: ["Devant gauche", "Devant droit", "Dos", "Manche gauche", "Manche droite", "Col"],
  autre: ["Pièce 1", "Pièce 2"],
};

function patternSvg(garment: string, pieces: string[], clientName: string): string {
  const rects = pieces
    .map((piece, i) => {
      const x = 20 + (i % 3) * 100;
      const y = 60 + Math.floor(i / 3) * 130;
      return `<g><rect x="${x}" y="${y}" width="84" height="110" fill="none" stroke="#5b21b6" stroke-width="2"/><text x="${x + 42}" y="${y + 58}" text-anchor="middle" font-size="11" fill="#5b21b6" font-family="sans-serif">${piece}</text></g>`;
    })
    .join("");
  const height = 80 + Math.ceil(pieces.length / 3) * 130;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 ${height}" role="img"><text x="16" y="26" font-size="15" font-weight="bold" fill="#1f2a44" font-family="sans-serif">Patron — ${garment}</text><text x="16" y="44" font-size="11" fill="#6b7280" font-family="sans-serif">${clientName} · aperçu simulé</text>${rects}</svg>`;
}

function stripSvgMeta(p: TailorPattern & { svg?: string }): TailorPattern {
  const { svg: _svg, ...rest } = p;
  void _svg;
  return rest;
}

function refreshCounts(store: Store): void {
  for (const c of store.clients) {
    c.measurements_count = (store.measurements[c.id] ?? []).length;
    c.jobs_count = store.jobs.filter((j) => j.tailor_client_id === c.id).length;
  }
}

function dueInfo(dueDate?: string | null): { week: boolean; late: boolean } {
  if (!dueDate) return { week: false, late: false };
  const due = new Date(`${dueDate}T23:59:59`);
  const now = new Date();
  if (Number.isNaN(due.getTime())) return { week: false, late: false };
  const inWeek = due.getTime() - now.getTime() < 7 * 86400000;
  return { week: due >= now && inWeek, late: due < now };
}

export const MockTailorApi = {
  dashboard: async (): Promise<TailorDashboard> => {
    await wait();
    const store = load();
    const active = store.jobs.filter((j) => j.status === "todo" || j.status === "doing");
    return {
      due_this_week: active.filter((j) => dueInfo(j.due_date).week).length,
      late: active.filter((j) => dueInfo(j.due_date).late).length,
      new_orders: 0,
      clients_count: store.clients.length,
      jobs_active: active.length,
      patterns_count: store.patterns.length,
    };
  },

  clients: async (q?: string): Promise<TailorClient[]> => {
    await wait();
    const store = load();
    refreshCounts(store);
    const needle = (q ?? "").trim().toLowerCase();
    if (!needle) return store.clients;
    return store.clients.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.phone.replace(/[^0-9]/g, "").includes(needle.replace(/[^0-9]/g, ""))
    );
  },
  createClient: async (body: { name: string; phone: string; gender: string }): Promise<TailorClient> => {
    await wait();
    const store = load();
    const client: TailorClient = {
      id: nextId(store, "cli"),
      name: body.name,
      phone: body.phone,
      gender: body.gender,
      notes: null,
      created_at: new Date().toISOString(),
      measurements_count: 0,
      jobs_count: 0,
    };
    store.clients.unshift(client);
    save(store);
    return client;
  },
  client: async (id: string): Promise<TailorClient> => {
    await wait();
    const store = load();
    const found = store.clients.find((c) => c.id === id);
    if (!found) throw new Error("Client introuvable.");
    return found;
  },
  patchClient: async (id: string, body: Partial<Pick<TailorClient, "name" | "phone" | "gender" | "notes">>): Promise<TailorClient> => {
    await wait();
    const store = load();
    const found = store.clients.find((c) => c.id === id);
    if (!found) throw new Error("Client introuvable.");
    Object.assign(found, body);
    save(store);
    return found;
  },
  deleteClient: async (id: string): Promise<void> => {
    await wait();
    const store = load();
    store.clients = store.clients.filter((c) => c.id !== id);
    delete store.measurements[id];
    save(store);
  },

  clientMeasurements: async (clientId: string): Promise<ClientMeasurement[]> => {
    await wait();
    return load().measurements[clientId] ?? [];
  },
  addManualMeasurements: async (
    clientId: string,
    body: { data: Record<string, number>; height_cm?: number }
  ): Promise<ClientMeasurement> => {
    await wait();
    const store = load();
    const m: ClientMeasurement = {
      id: nextId(store, "mes"),
      data: body.data,
      height_cm: body.height_cm ?? 170,
      weight_kg: null,
      gender: store.clients.find((c) => c.id === clientId)?.gender ?? null,
      source: "manual",
      created_at: new Date().toISOString(),
    };
    (store.measurements[clientId] ??= []).unshift(m);
    refreshCounts(store);
    save(store);
    return m;
  },

  createMeasureSession: async (
    clientId: string,
    body: { height_cm: number; weight_kg?: number; gender?: string }
  ): Promise<TailorMeasureSession> => {
    await wait();
    const store = load();
    const sessionId = nextId(store, "ses");
    save(store);
    sessions.set(sessionId, {
      readyAt: 0,
      clientId,
      measurement: {
        data: {},
        height_cm: body.height_cm,
        weight_kg: body.weight_kg ?? null,
        gender: body.gender ?? null,
        source: "ai",
      },
    });
    return { id: sessionId, status: "processing", measurement_id: null, height_cm: body.height_cm };
  },
  uploadMeasurePhotos: async (sessionId: string): Promise<TailorMeasureSession> => {
    await wait(600);
    const pending = sessions.get(sessionId);
    if (!pending) throw new Error("Session introuvable.");
    // Analyse simulee : prete 5 s apres l'envoi des photos.
    pending.readyAt = Date.now() + 5000;
    return { id: sessionId, status: "processing", measurement_id: null, height_cm: pending.measurement.height_cm };
  },
  getMeasureSession: async (sessionId: string): Promise<TailorMeasureSession> => {
    await wait(200);
    const pending = sessions.get(sessionId);
    if (!pending) throw new Error("Session introuvable.");
    if (Date.now() < pending.readyAt) {
      return { id: sessionId, status: "processing", measurement_id: null, height_cm: pending.measurement.height_cm };
    }
    const store = load();
    const m: ClientMeasurement = {
      id: nextId(store, "mes"),
      ...pending.measurement,
      data: fakeMeasurements(pending.clientId, pending.measurement.gender ?? undefined),
      created_at: new Date().toISOString(),
    };
    (store.measurements[pending.clientId] ??= []).unshift(m);
    refreshCounts(store);
    save(store);
    sessions.delete(sessionId);
    return { id: sessionId, status: "ready", measurement_id: m.id, height_cm: m.height_cm };
  },

  shareClient: async (clientId: string): Promise<ShareLink> => {
    await wait();
    const store = load();
    const client = store.clients.find((c) => c.id === clientId);
    const latest = (store.measurements[clientId] ?? [])[0] ?? null;
    const token = `mock-${clientId}-${Date.now().toString(36)}`;
    const expires = new Date(Date.now() + 7 * 86400000).toISOString();
    try {
      const raw = localStorage.getItem(SHARE_STORE_KEY);
      const shares = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      shares[token] = { client, measurement: latest, expires_at: expires };
      localStorage.setItem(SHARE_STORE_KEY, JSON.stringify(shares));
    } catch {
      /* ignore */
    }
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return { url: `${base}/fiches/${token}`, expires_at: expires };
  },

  jobs: async (params: { status?: string; due?: "week" | "late"; client_id?: string } = {}): Promise<TailorJob[]> => {
    await wait();
    let list = load().jobs;
    if (params.client_id) list = list.filter((j) => j.tailor_client_id === params.client_id);
    if (params.status) list = list.filter((j) => j.status === params.status);
    if (params.due === "week") list = list.filter((j) => dueInfo(j.due_date).week);
    if (params.due === "late") list = list.filter((j) => dueInfo(j.due_date).late);
    return list;
  },
  createJob: async (body: {
    tailor_client_id?: string;
    client_name: string;
    description: string;
    due_date?: string;
    price?: number;
    deposit?: number;
  }): Promise<TailorJob> => {
    await wait();
    const store = load();
    const job: TailorJob = {
      id: nextId(store, "job"),
      tailor_client_id: body.tailor_client_id ?? null,
      client_name: body.client_name,
      description: body.description,
      due_date: body.due_date ?? null,
      status: "todo",
      price: body.price ?? null,
      deposit: body.deposit ?? null,
      created_at: new Date().toISOString(),
    };
    store.jobs.unshift(job);
    refreshCounts(store);
    save(store);
    return job;
  },
  patchJob: async (id: string, body: Partial<TailorJob>): Promise<TailorJob> => {
    await wait();
    const store = load();
    const found = store.jobs.find((j) => j.id === id);
    if (!found) throw new Error("Travail introuvable.");
    Object.assign(found, body);
    save(store);
    return found;
  },
  deleteJob: async (id: string): Promise<void> => {
    await wait();
    const store = load();
    store.jobs = store.jobs.filter((j) => j.id !== id);
    refreshCounts(store);
    save(store);
  },

  // Commandes via la plateforme : aucune en simulation locale (elles
  // arrivent du serveur). Les pages affichent un etat vide explicite.
  orders: async () => {
    await wait();
    return [];
  },
  order: async () => {
    await wait();
    throw new Error("Commande introuvable en simulation.");
  },
  acceptOrder: async () => {
    await wait();
    throw new Error("Indisponible en simulation.");
  },
  declineOrder: async () => {
    await wait();
    throw new Error("Indisponible en simulation.");
  },
  setOrderStatus: async () => {
    await wait();
    throw new Error("Indisponible en simulation.");
  },
  orderChat: async () => {
    await wait();
    return [];
  },
  sendOrderChat: async () => {
    await wait();
    throw new Error("Indisponible en simulation.");
  },

  patterns: async (): Promise<TailorPattern[]> => {
    await wait();
    const store = load();
    let changed = false;
    for (const p of store.patterns) {
      const pending = pendingPatterns.get(p.id);
      if (pending && Date.now() >= pending.readyAt && p.status === "pending") {
        p.status = "ready";
        p.pieces = pending.pieces;
        p.svg = pending.svg;
        changed = true;
      }
    }
    if (changed) save(store);
    return store.patterns.map(stripSvgMeta);
  },
  createPattern: async (body: {
    image: File;
    garment_type: string;
    tailor_client_id?: string;
    measurements?: Record<string, number>;
  }): Promise<TailorPattern> => {
    await wait(600);
    void body.image;
    void body.measurements;
    const store = load();
    const client = store.clients.find((c) => c.id === body.tailor_client_id);
    const pieces = PIECES[body.garment_type] ?? PIECES.autre;
    const id = nextId(store, "pat");
    const record: TailorPattern & { svg?: string } = {
      id,
      garment_type: body.garment_type,
      tailor_client_id: body.tailor_client_id ?? null,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    store.patterns.unshift(record);
    save(store);
    pendingPatterns.set(id, {
      readyAt: Date.now() + 6000,
      pieces,
      svg: patternSvg(body.garment_type, pieces, client?.name ?? "Mesures saisies"),
    });
    return stripSvgMeta(record);
  },
  pattern: async (id: string): Promise<TailorPattern> => {
    await wait(200);
    const store = load();
    const found = store.patterns.find((p) => p.id === id);
    if (!found) throw new Error("Patron introuvable.");
    const pending = pendingPatterns.get(id);
    if (pending && Date.now() >= pending.readyAt && found.status === "pending") {
      found.status = "ready";
      found.pieces = pending.pieces;
      found.svg = pending.svg;
      save(store);
    }
    return stripSvgMeta(found);
  },
  deletePattern: async (id: string): Promise<void> => {
    await wait();
    const store = load();
    store.patterns = store.patterns.filter((p) => p.id !== id);
    pendingPatterns.delete(id);
    save(store);
  },
  patternSvgUrl: async (id: string): Promise<string> => {
    await wait(200);
    const store = load();
    const found = store.patterns.find((p) => p.id === id);
    if (!found?.svg) throw new Error("Patron indisponible.");
    return URL.createObjectURL(new Blob([found.svg], { type: "image/svg+xml" }));
  },

  profile: async () => {
    await wait();
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("smz_tailor_mock_profile_v1");
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return null;
  },
  updateProfile: async (body: { shop_name?: string; city?: string; quartier?: string; bio?: string }) => {
    await wait();
    const profile = {
      id: "mock-tailor-profile",
      user_id: "mock-user",
      tailor_type: "atelier",
      shop_name: body.shop_name ?? "Mon atelier",
      bio: body.bio ?? null,
      lat: null,
      lng: null,
      city: body.city ?? null,
      quartier: body.quartier ?? null,
      verification_status: "approved",
      rating_avg: 0,
      completed_orders_count: 0,
      avg_response_minutes: 0,
      atelier_photo_url: null,
    };
    try {
      localStorage.setItem("smz_tailor_mock_profile_v1", JSON.stringify(profile));
    } catch {
      /* ignore */
    }
    return profile;
  },
};

