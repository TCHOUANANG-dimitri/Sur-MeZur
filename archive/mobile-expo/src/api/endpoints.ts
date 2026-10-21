import { api } from "./client";
import type {
  Accessory,
  Avatar,
  Category,
  ChatMessage,
  ClientProfile,
  Delivery,
  Fabric,
  GarmentModel,
  Measurement,
  MeasurementSession,
  Modification,
  Notification,
  Offer,
  Order,
  Payment,
  PaymentSplit,
  Pattern,
  Quote,
  ReadyToWear,
  Review,
  TailorProfile,
  TokenResponse,
  TryonSession,
  User,
  VerificationDocument,
} from "./types";

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

function appendFile(form: FormData, field: string, file: PickedFile) {
  // React Native's FormData accepts this {uri,name,type} shape directly.
  form.append(field, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
}

// --- Auth --------------------------------------------------------------
export const AuthApi = {
  register: (body: {
    role: "client" | "tailor";
    phone: string;
    full_name: string;
    password: string;
    language: "fr" | "en";
    photo_consent: boolean;
    city?: string;
    quartier?: string;
  }) => api.post<TokenResponse>("/auth/register", body, { auth: false, retries: 2 }),
  // retries: 2 -- une connexion échouée sur simple micro-coupure réseau ne
  // doit pas obliger l'utilisateur à retaper son mot de passe ; rejouer un
  // login avec les mêmes identifiants ne duplique rien côté serveur.
  login: (phone: string, password: string) =>
    api.post<TokenResponse>("/auth/login", { phone, password }, { auth: false, retries: 2 }),
  otpRequest: (phone: string) =>
    api.post<{ sent: boolean; dev_code: string }>("/auth/otp/request", { phone }, { auth: false, retries: 2 }),
  otpVerify: (phone: string, code: string) =>
    api.post<{ verified: boolean }>("/auth/otp/verify", { phone, code }, { auth: false, retries: 2 }),
  passwordResetRequest: (phone: string) =>
    api.post<{ sent: boolean; dev_code: string }>(
      "/auth/password/reset/request",
      { phone },
      { auth: false, retries: 2 }
    ),
  passwordResetConfirm: (phone: string, code: string, new_password: string) =>
    api.post<TokenResponse>(
      "/auth/password/reset/confirm",
      { phone, code, new_password },
      { auth: false, retries: 2 }
    ),
};

// --- Users / tailors -----------------------------------------------------
export const UsersApi = {
  me: () => api.get<User>("/me"),
  patchMe: (body: Partial<Pick<User, "full_name" | "email" | "language" | "photo_consent">>) =>
    api.patch<User>("/me", body),
  purgePhotos: () => api.post<{ purged: boolean }>("/me/photos/purge"),
  myClientProfile: () => api.get<ClientProfile>("/client-profile/me"),
};

export const TailorsApi = {
  me: () => api.get<TailorProfile | null>("/tailors/me"),
  search: (params: { lat?: number; lng?: number; sort?: string; q?: string; city?: string; quartier?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
    return api.get<TailorProfile[]>(`/tailors?${qs.toString()}`);
  },
  get: (id: string) => api.get<TailorProfile>(`/tailors/${id}`),
  reviews: (tailorId: string) => api.get<Review[]>(`/tailors/${tailorId}/reviews`),
  submitVerification: (fields: {
    tailor_type: string;
    shop_name: string;
    bio?: string;
    city?: string;
    quartier?: string;
    lat?: number;
    lng?: number;
  }, files: { self_photo: PickedFile; id_card: PickedFile; atelier_photo: PickedFile }) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => v !== undefined && form.append(k, String(v)));
    appendFile(form, "self_photo", files.self_photo);
    appendFile(form, "id_card", files.id_card);
    appendFile(form, "atelier_photo", files.atelier_photo);
    return api.postForm<TailorProfile>("/tailors/verification", form);
  },
};

// --- Measurements / avatars ------------------------------------------
export const MeasurementsApi = {
  /** Height, weight and sex are all required — they drive the estimator. */
  createSession: (body: { height_cm: number; weight_kg: number; gender: "female" | "male" }) =>
    api.post<MeasurementSession>("/measurements/session", body),
  uploadPhotos: (sessionId: string, front: PickedFile, side: PickedFile) => {
    const form = new FormData();
    appendFile(form, "front", front);
    appendFile(form, "side", side);
    return api.postForm<MeasurementSession>(`/measurements/session/${sessionId}/photos`, form);
  },
  getSession: (sessionId: string) => api.get<MeasurementSession>(`/measurements/session/${sessionId}`),
  list: () => api.get<Measurement[]>("/measurements"),
  patch: (id: string, body: { data: Record<string, number>; height_cm?: number }) =>
    api.patch<Measurement>(`/measurements/${id}`, body),
};

export const AvatarsApi = {
  list: () => api.get<Avatar[]>("/avatars"),
  create: (body: { measurement_id: string; skin_tone_hex: string }) =>
    api.post<Avatar>("/avatars", body),
  get: (id: string) => api.get<Avatar>(`/avatars/${id}`),
  patch: (id: string, body: { name?: string }) =>
    api.patch<Avatar>(`/avatars/${id}`, body),
};

// --- Catalog -----------------------------------------------------------
export const CatalogApi = {
  categories: (gender?: string) => {
    const qs = gender ? `?gender=${gender}` : "";
    return api.get<Category[]>(`/categories${qs}`);
  },
  models: (
    params: { category_id?: string; gender?: string; q?: string; sort?: "recent" | "popular"; liked_only?: boolean; limit?: number } = {}
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    return api.get<GarmentModel[]>(`/models?${qs.toString()}`);
  },
  model: (id: string) => api.get<GarmentModel>(`/models/${id}`),
  like: (id: string) => api.post<GarmentModel>(`/models/${id}/like`),
  unlike: (id: string) => api.del<GarmentModel>(`/models/${id}/like`),
  fabrics: () => api.get<Fabric[]>("/fabrics"),
  accessories: () => api.get<Accessory[]>("/accessories"),
  readyToWear: (tailorId?: string) =>
    api.get<ReadyToWear[]>(`/ready-to-wear${tailorId ? `?tailor_id=${tailorId}` : ""}`),
  readyToWearItem: (id: string) => api.get<ReadyToWear>(`/ready-to-wear/${id}`),
  createReadyToWear: (body: Partial<ReadyToWear>) => api.post<ReadyToWear>("/ready-to-wear", body),
  /** Tailor's own stock, including out-of-stock items. */
  myReadyToWear: () => api.get<ReadyToWear[]>("/ready-to-wear/mine"),
  uploadReadyToWearPhotos: (id: string, files: PickedFile[]) => {
    const form = new FormData();
    files.forEach((f) => appendFile(form, "files", f));
    return api.postForm<ReadyToWear>(`/ready-to-wear/${id}/photos`, form);
  },
  deleteReadyToWear: (id: string) => api.del<void>(`/ready-to-wear/${id}`),
  compare: (measurement_id: string, ready_to_wear_id: string) =>
    api.post<{ match: boolean; deltas: Record<string, number>; message: string }>("/compare", {
      measurement_id,
      ready_to_wear_id,
    }),
};

export const TryonApi = {
  create: (body: {
    avatar_id: string;
    garment_model_id?: string;
    ready_to_wear_id?: string;
    fabric_id?: string;
    accessory_ids?: string[];
  }) => api.post<TryonSession>("/tryon", body),
  get: (id: string) => api.get<TryonSession>(`/tryon/${id}`),
  list: () => api.get<TryonSession[]>("/tryon"),
};

// --- Orders / negotiation / quotes -------------------------------------
export const OrdersApi = {
  create: (body: Record<string, unknown>) => api.post<Order>("/orders", body),
  list: (status_filter?: string) =>
    api.get<Order[]>(`/orders${status_filter ? `?status_filter=${status_filter}` : ""}`),
  get: (id: string) => api.get<Order>(`/orders/${id}`),
  setStatus: (id: string, status: string) => api.post<Order>(`/orders/${id}/status`, { status }),
  openDispute: (id: string, note: string) => api.post<Order>(`/orders/${id}/dispute`, { note }),

  offers: (orderId: string) => api.get<Offer[]>(`/orders/${orderId}/offers`),
  createOffer: (orderId: string, body: { actor: string; amount: number; delay_days?: number }) =>
    api.post<Offer>(`/orders/${orderId}/offers`, body),
  acceptOffer: (orderId: string, offerId: string) =>
    api.post<Offer>(`/orders/${orderId}/offers/${offerId}/accept`),

  getQuote: (orderId: string) => api.get<Quote>(`/orders/${orderId}/quote`),
  createQuote: (
    orderId: string,
    body: { line_items: { label: string; amount: number }[]; fabric_metrage?: string; delay_days: number }
  ) => api.post<Quote>(`/orders/${orderId}/quote`, body),
  acceptQuote: (orderId: string) => api.post<Quote>(`/orders/${orderId}/quote/accept`),

  modifications: (orderId: string) => api.get<Modification[]>(`/orders/${orderId}/modifications`),
  proposeModification: (
    orderId: string,
    body: { modified_model_asset_url?: string; accessory_price_delta?: number; new_garment_price: number; justification: string }
  ) => api.post<Modification>(`/orders/${orderId}/modifications`, body),
  acceptModification: (modificationId: string) =>
    api.post<Modification>(`/modifications/${modificationId}/accept`),
  refuseModification: (modificationId: string) =>
    api.post<Modification>(`/modifications/${modificationId}/refuse`),

  chat: (orderId: string) => api.get<ChatMessage[]>(`/orders/${orderId}/chat`),
  sendChat: (orderId: string, body: string) =>
    api.post<ChatMessage>(`/orders/${orderId}/chat`, { body }),

  pattern: (orderId: string) => api.get<Pattern>(`/orders/${orderId}/pattern`),
  review: (orderId: string, body: { stars: number; comment?: string }) =>
    api.post<Review>(`/orders/${orderId}/review`, body),
};

// --- Payments / deliveries ----------------------------------------------
export const PaymentsApi = {
  deposit: (body: { order_id: string; provider: string; phone: string }) =>
    api.post<Payment>("/payments/deposit", body),
  balance: (body: { order_id: string; provider: string; phone: string }) =>
    api.post<Payment>("/payments/balance", body),
  listForOrder: (orderId: string) => api.get<Payment[]>(`/payments/order/${orderId}`),
  split: (orderId: string) => api.get<PaymentSplit>(`/payments/order/${orderId}/split`),
};

export const DeliveriesApi = {
  confirm: (orderId: string, body: { provider?: string; phone?: string } = {}) =>
    api.post<Delivery>(`/deliveries/${orderId}/confirm`, body),
};

// --- Notifications -------------------------------------------------------
export const NotificationsApi = {
  list: () => api.get<Notification[]>("/notifications"),
  markAllRead: () => api.post<{ marked_read: boolean }>("/notifications/read"),
};

// --- Admin ---------------------------------------------------------------
export interface AdminStats {
  clients: number;
  tailors: number;
  tailors_pending: number;
  suspended: number;
  orders_total: number;
  orders_by_status: Record<string, number>;
  open_disputes: number;
  pending_reviews: number;
  gmv: number;
  commission_earned: number;
}

export const AdminApi = {
  stats: () => api.get<AdminStats>("/admin/stats"),
  users: (params: { role?: string; q?: string; active?: boolean } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    return api.get<User[]>(`/admin/users?${qs.toString()}`);
  },
  setUserActive: (userId: string, is_active: boolean) =>
    api.post<User>(`/admin/users/${userId}/active`, { is_active }),
  allOrders: (status_filter?: string) =>
    api.get<Order[]>(`/admin/orders${status_filter ? `?status_filter=${status_filter}` : ""}`),
  verifications: (status?: "pending" | "approved" | "rejected") =>
    api.get<TailorProfile[]>(`/admin/verifications${status ? `?status_filter=${status}` : ""}`),
  verificationDocuments: (tailorId: string) =>
    api.get<VerificationDocument[]>(`/admin/verifications/${tailorId}/documents`),
  decideVerification: (tailorId: string, status: "approved" | "rejected", reason?: string) =>
    api.post<TailorProfile>(`/admin/verifications/${tailorId}/decide`, { status, reason }),
  disputes: () => api.get<Order[]>("/admin/disputes"),
  resolveDispute: (orderId: string, resolution: string, note?: string) =>
    api.post<Order>(`/admin/disputes/${orderId}/resolve`, { resolution, note }),
  reviews: () => api.get<Review[]>("/admin/reviews"),
  moderateReview: (reviewId: string, status_: string) =>
    api.post<Review>(`/admin/reviews/${reviewId}/moderate?status_=${status_}`),
  commissionTiers: () =>
    api.get<{ id: string; min_price: number; max_price: number | null; rate: number }[]>(
      "/admin/commission-tiers"
    ),
};

// --- Admin catalog (categories + models) ----------------------------------
export const AdminCatalogApi = {
  // Categories
  createCategory: (body: { name: string; gender: string }) =>
    api.post<Category>("/admin/categories", body),
  updateCategory: (id: string, body: { name?: string; gender?: string }) =>
    api.patch<Category>(`/admin/categories/${id}`, body),
  deleteCategory: (id: string) => api.del<void>(`/admin/categories/${id}`),

  // Models
  createModel: (body: { name: string; description?: string; category_id: string; base_price?: number; style_tags?: string[]; thumbnail_color?: string }) =>
    api.post<GarmentModel>("/admin/models", body),
  updateModel: (id: string, body: { name?: string; description?: string; category_id?: string; base_price?: number; style_tags?: string[]; thumbnail_color?: string }) =>
    api.patch<GarmentModel>(`/admin/models/${id}`, body),
  deleteModel: (id: string) => api.del<void>(`/admin/models/${id}`),
  uploadModelPhotos: (id: string, files: PickedFile[]) => {
    const form = new FormData();
    files.forEach((f) => appendFile(form, "files", f));
    return api.postForm<GarmentModel>(`/admin/models/${id}/photos`, form);
  },
};
