/**
 * Contrat de l'API de collecte (backend/app/api/v1/collecte.py).
 */

import { api, fetchBlob } from "./client";
import type { Clothing, Gender, MeasureKey, ViewKey } from "../protocol";

export type Role = "collector" | "admin" | "client" | "tailor";
export type ReviewStatus = "pending" | "validated" | "rejected";

export interface User {
  id: string;
  role: Role;
  phone: string;
  full_name: string;
  is_active: boolean;
}

export interface TokenOut {
  access_token: string;
  refresh_token: string;
  user_id: string;
  role: Role;
}

export interface SubjectFields {
  gender: Gender;
  age: number | null;
  height_cm: number;
  weight_kg: number;
  measurements: Partial<Record<MeasureKey, number>>;
  clothing: Clothing | null;
  city: string | null;
  place: string | null;
  measured_by: string | null;
  measured_at: string | null;
  notes: string | null;
  consent_name: string | null;
}

export interface SubjectCreate extends SubjectFields {
  client_uuid: string;
  consent: boolean;
}

export interface Photo {
  view: ViewKey;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  updated_at: string;
}

export interface Subject extends SubjectFields {
  id: string;
  code: string;
  number: number;
  client_uuid: string;
  collector_id: string;
  collector_name: string | null;
  consent: boolean;
  review_status: ReviewStatus;
  review_note: string | null;
  photos: Photo[];
  complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface Stats {
  total: number;
  complete: number;
  validated: number;
  rejected: number;
  pending: number;
  male: number;
  female: number;
  photos: number;
  today: number;
}

export interface Collector {
  id: string;
  full_name: string;
  phone: string;
  role: Role;
  is_active: boolean;
  subjects: number;
  created_at: string;
}

export const AuthApi = {
  login: (phone: string, password: string) =>
    api.post<TokenOut>("/auth/login", { phone, password }, { auth: false }),
  me: () => api.get<User>("/me"),
};

export const CollecteApi = {
  stats: () => api.get<Stats>("/collecte/stats"),
  list: (params: { statut?: string; sexe?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][]
    ).toString();
    return api.get<Subject[]>(`/collecte/subjects${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => api.get<Subject>(`/collecte/subjects/${id}`),
  create: (body: SubjectCreate) => api.post<Subject>("/collecte/subjects", body),
  update: (id: string, body: Partial<SubjectFields>) => api.patch<Subject>(`/collecte/subjects/${id}`, body),
  remove: (id: string) => api.delete<void>(`/collecte/subjects/${id}`),
  review: (id: string, status: ReviewStatus, note?: string) =>
    api.post<Subject>(`/collecte/subjects/${id}/review`, { status, note: note || null }),
  uploadPhoto: (id: string, view: ViewKey, file: Blob) => {
    const form = new FormData();
    form.append("file", file, `${view}.jpg`);
    return api.putForm<Subject>(`/collecte/subjects/${id}/photos/${view}`, form);
  },
  deletePhoto: (id: string, view: ViewKey) => api.delete<Subject>(`/collecte/subjects/${id}/photos/${view}`),
  photo: (id: string, view: ViewKey) => fetchBlob(`/collecte/subjects/${id}/photos/${view}`),
  exportFile: (query: string) => fetchBlob(`/collecte/export?${query}`),
  collectors: () => api.get<Collector[]>("/collecte/collectors"),
  createCollector: (body: { full_name: string; phone: string; password: string }) =>
    api.post<Collector>("/collecte/collectors", body),
  setCollectorActive: (id: string, is_active: boolean) =>
    api.patch<Collector>(`/collecte/collectors/${id}`, { is_active }),
};
