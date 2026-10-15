/**
 * Client de l'API d'enquete. Aucun compte : le jeton personnel du tailleur
 * fait partie de chaque chemin (`/public/enquete/{token}/...`), et Vercel
 * relaie `/api` vers le serveur (next.config.ts).
 */

import type { FicheData } from "./questionnaire";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { ...(isForm || !init.body ? {} : { "Content-Type": "application/json" }), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Pas de connexion. Vérifiez votre réseau puis réessayez.");
  }
  if (!res.ok) {
    let message = "Une erreur est survenue. Réessayez.";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) {
        const msgs = data.detail.map((e: { msg?: string }) => e?.msg).filter(Boolean);
        if (msgs.length) message = msgs.join(". ");
      }
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Profil {
  nom: string;
  telephone?: string | null;
  atelier?: string | null;
  ville?: string | null;
  quartier?: string | null;
  experience_annees?: number | null;
  specialites: string[];
  consentement: boolean;
}

export interface ModeleGalerie {
  id: string;
  nom: string;
  photo_url: string | null;
  categorie?: string | null;
}

export interface Photo {
  id: string;
  kind: "vetement" | "patron" | "autre";
  legende: string | null;
  url: string;
  created_at: string | null;
}

export interface FicheResume {
  id: string;
  source: "cousu" | "galerie";
  status: "brouillon" | "envoye";
  nom: string | null;
  categorie: string | null;
  modele_galerie: ModeleGalerie | null;
  nb_photos: number;
  submitted_at: string | null;
  updated_at: string | null;
  a_completer: boolean;
  review_note: string | null;
}

export interface Fiche extends FicheResume {
  schema_version: number;
  data: Partial<FicheData>;
  photos: Photo[];
}

export interface Accueil {
  label: string;
  profil: Partial<Profil>;
  consentement: boolean;
  schema_version: number;
  modeles: FicheResume[];
}

export interface GroupeGalerie {
  categorie: string;
  genre: string;
  modeles: ModeleGalerie[];
}

export function enquete(token: string) {
  const base = `/public/enquete/${encodeURIComponent(token)}`;
  return {
    accueil: () => request<Accueil>(base),
    profil: (p: Profil) => request<{ profil: Profil; consentement: boolean }>(`${base}/profil`, {
      method: "PUT", body: JSON.stringify(p),
    }),
    galerie: () => request<GroupeGalerie[]>(`${base}/galerie`),
    creer: (source: "cousu" | "galerie", garment_model_id?: string) =>
      request<Fiche>(`${base}/modeles`, { method: "POST", body: JSON.stringify({ source, garment_model_id }) }),
    lire: (id: string) => request<Fiche>(`${base}/modeles/${id}`),
    sauver: (id: string, data: FicheData) =>
      request<{ ok: boolean; updated_at: string }>(`${base}/modeles/${id}`, { method: "PUT", body: JSON.stringify({ data }) }),
    envoyer: (id: string) => request<Fiche>(`${base}/modeles/${id}/envoyer`, { method: "POST" }),
    supprimer: (id: string) => request<void>(`${base}/modeles/${id}`, { method: "DELETE" }),
    ajouterPhoto: (id: string, photo: File, kind: Photo["kind"], legende?: string) => {
      const f = new FormData();
      f.append("photo", photo);
      f.append("kind", kind);
      if (legende) f.append("legende", legende);
      return request<Photo>(`${base}/modeles/${id}/photos`, { method: "POST", body: f });
    },
    supprimerPhoto: (id: string, photoId: string) =>
      request<void>(`${base}/modeles/${id}/photos/${photoId}`, { method: "DELETE" }),
  };
}

/** URL d'affichage d'une photo (renvoyee par l'API sans le prefixe /api). */
export const photoSrc = (url: string) => `/api${url}`;
