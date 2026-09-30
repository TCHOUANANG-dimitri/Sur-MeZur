/**
 * File d'envoi hors ligne et brouillon de saisie, dans IndexedDB.
 *
 * POURQUOI. La collecte se fait sur le terrain, souvent sur un reseau mobile
 * faible ou absent. Une fiche ne doit JAMAIS etre perdue parce que l'envoi a
 * echoue : elle est d'abord ecrite sur l'appareil (champs ET photos), puis
 * envoyee des que possible, et n'est retiree de l'appareil qu'une fois le
 * serveur ayant tout confirme.
 *
 * IDEMPOTENCE. Chaque fiche porte un `client_uuid` genere ici. Si la coupure
 * survient apres que le serveur a cree la fiche mais avant sa reponse, le
 * renvoi retrouve la meme fiche au lieu d'en creer une seconde (voir
 * create_subject cote backend). Les photos se renvoient sans risque : elles
 * remplacent la precedente de la meme vue.
 *
 * IndexedDB plutot que localStorage : les photos sont des Blob de plusieurs
 * centaines de Ko, que localStorage (chaines, ~5 Mo au total) ne tient pas.
 */

import { ApiError } from "./api/client";
import { CollecteApi, type SubjectCreate } from "./api/collecte";
import type { ViewKey } from "./protocol";

const DB_NAME = "smz-collecte";
const DB_VERSION = 1;
const OUTBOX = "outbox";
const DRAFTS = "drafts";

export interface OutboxItem {
  client_uuid: string;
  /** Agent qui a saisi la fiche : sur un appareil partage, chacun n'envoie
   *  que les siennes, avec son propre compte. */
  owner_id: string;
  created_at: string;
  payload: SubjectCreate;
  photos: Partial<Record<ViewKey, Blob>>;
  /** Renseignes des que le serveur a cree la fiche. */
  server_id?: string;
  code?: string;
  uploaded: ViewKey[];
  attempts: number;
  last_error?: string;
  /** Refus definitif du serveur (donnee invalide) : inutile de reessayer
   *  sans correction. */
  blocked?: boolean;
}

export interface Draft {
  id: string;
  owner_id: string;
  updated_at: string;
  step: number;
  form: Record<string, string>;
  photos: Partial<Record<ViewKey, Blob>>;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Stockage local indisponible sur ce navigateur"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "client_uuid" });
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = run(t.objectStore(store));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error("Transaction annulée"));
    });
  } finally {
    db.close();
  }
}

// --- File d'envoi ------------------------------------------------------------

export async function listOutbox(ownerId?: string): Promise<OutboxItem[]> {
  const all = ((await tx<OutboxItem[]>(OUTBOX, "readonly", (s) => s.getAll())) ?? []) as OutboxItem[];
  return all
    .filter((i) => !ownerId || i.owner_id === ownerId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function putOutbox(item: OutboxItem): Promise<void> {
  await tx(OUTBOX, "readwrite", (s) => s.put(item));
}

export async function removeOutbox(clientUuid: string): Promise<void> {
  await tx(OUTBOX, "readwrite", (s) => s.delete(clientUuid));
}

// --- Brouillon ---------------------------------------------------------------

export async function getDraft(id: string): Promise<Draft | undefined> {
  return (await tx<Draft>(DRAFTS, "readonly", (s) => s.get(id))) as Draft | undefined;
}

export async function putDraft(draft: Draft): Promise<void> {
  await tx(DRAFTS, "readwrite", (s) => s.put(draft));
}

export async function removeDraft(id: string): Promise<void> {
  await tx(DRAFTS, "readwrite", (s) => s.delete(id));
}

// --- Envoi -------------------------------------------------------------------

export function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Repli pour les navigateurs anciens (randomUUID exige aussi un contexte
  // securise) : v4 a partir de getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Erreur passagere (reseau, serveur surcharge) : on reessaiera plus tard. */
function isTransient(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof ApiError && (e.status === 429 || e.status >= 500 || e.status === 401));
}

function describe(e: unknown): string {
  if (e instanceof TypeError) return "Pas de connexion au serveur.";
  if (e instanceof ApiError) {
    if (e.status === 429) return "Serveur saturé, nouvel essai plus tard.";
    if (e.status >= 500) return "Serveur indisponible, nouvel essai plus tard.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Erreur inconnue";
}

/** Envoie une fiche : creation (idempotente), puis chaque photo manquante. */
async function sendOne(item: OutboxItem): Promise<"done" | "retry" | "blocked"> {
  try {
    if (!item.server_id) {
      const created = await CollecteApi.create(item.payload);
      item.server_id = created.id;
      item.code = created.code;
      // Reprise apres coupure : des photos ont pu partir avant.
      item.uploaded = Array.from(new Set([...item.uploaded, ...created.photos.map((p) => p.view)]));
      await putOutbox(item);
    }
    for (const [view, blob] of Object.entries(item.photos) as [ViewKey, Blob][]) {
      if (!blob || item.uploaded.includes(view)) continue;
      await CollecteApi.uploadPhoto(item.server_id, view, blob);
      item.uploaded.push(view);
      await putOutbox(item);
    }
    await removeOutbox(item.client_uuid);
    return "done";
  } catch (e) {
    item.attempts += 1;
    item.last_error = describe(e);
    item.blocked = !isTransient(e);
    await putOutbox(item);
    return item.blocked ? "blocked" : "retry";
  }
}

let running: Promise<SyncResult> | null = null;

export interface SyncResult {
  sent: number;
  remaining: number;
  offline: boolean;
}

/**
 * Vide la file de l'agent connecte. Un seul envoi a la fois : les
 * declencheurs (retour du reseau, minuterie, bouton) peuvent se chevaucher.
 * S'arrete au premier echec reseau plutot que d'essayer chaque fiche en vain.
 */
export function syncOutbox(ownerId: string, force = false): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    let sent = 0;
    let offline = false;
    try {
      const items = await listOutbox(ownerId);
      for (const item of items) {
        if (item.blocked && !force) continue;
        const r = await sendOne(item);
        if (r === "done") sent += 1;
        if (r === "retry") {
          offline = true;
          break;
        }
      }
      const remaining = (await listOutbox(ownerId)).length;
      return { sent, remaining, offline };
    } finally {
      running = null;
    }
  })();
  return running;
}
