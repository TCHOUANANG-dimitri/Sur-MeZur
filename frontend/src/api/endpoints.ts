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

// --- Auth --------------------------------------------------------------
export const AuthApi = {
  register: (body: {
    role: "client" | "tailor";
    phone: string;
    full_name: string;
    password: string;
    language: "fr" | "en";
    photo_consent: boolean;
  }) => api.post<TokenResponse>("/auth/register", body, { auth: false }),
  login: (phone: string, password: string) =>
    api.post<TokenResponse>("/auth/login", { phone, password }, { auth: false }),
  otpRequest: (phone: string) =>
    api.post<{ sent: boolean; dev_code: string }>("/auth/otp/request", { phone }, { auth: false }),
  otpVerify: (phone: string, code: string) =>
    api.post<{ verified: boolean }>("/auth/otp/verify", { phone, code }, { auth: false }),
};

// --- Users / tailors -----------------------------------------------------
export const UsersApi = {
  me: () => api.get<User>("/me"),
  patchMe: (body: Partial<Pick<User, "full_name" | "email" | "language" | "photo_consent">>) =>
    api.patch<User>("/me", body),
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
  submitVerification: (form: FormData) => api.postForm<TailorProfile>("/tailors/verification", form),
};

// --- Measurements / avatars ------------------------------------------
export const MeasurementsApi = {
  createSession: (body: { height_cm: number; weight_kg?: number; gender?: string }) =>
    api.post<MeasurementSession>("/measurements/session", body),
  uploadPhotos: (sessionId: string, front: File, side: File) => {
    const form = new FormData();
    form.append("front", front);
    form.append("side", side);
    return api.postForm<MeasurementSession>(`/measurements/session/${sessionId}/photos`, form);
  },
  getSession: (sessionId: string) => api.get<MeasurementSession>(`/measurements/session/${sessionId}`),
  list: () => api.get<Measurement[]>("/measurements"),
  patch: (id: string, body: { data: Record<string, number>; height_cm?: number }) =>
    api.patch<Measurement>(`/measurements/${id}`, body),
};

export const AvatarsApi = {
  create: (body: { measurement_id: string; skin_tone_hex: string }) =>
    api.post<Avatar>("/avatars", body),
  get: (id: string) => api.get<Avatar>(`/avatars/${id}`),
};

// --- Catalog -----------------------------------------------------------
export const CatalogApi = {
  models: (params: { category_id?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && qs.set(k, v));
    return api.get<GarmentModel[]>(`/models?${qs.toString()}`);
  },
  model: (id: string) => api.get<GarmentModel>(`/models/${id}`),
  categories: () => api.get<Category[]>("/categories"),
  fabrics: () => api.get<Fabric[]>("/fabrics"),
  accessories: () => api.get<Accessory[]>("/accessories"),
  readyToWear: (tailorId?: string) =>
    api.get<ReadyToWear[]>(`/ready-to-wear${tailorId ? `?tailor_id=${tailorId}` : ""}`),
  readyToWearItem: (id: string) => api.get<ReadyToWear>(`/ready-to-wear/${id}`),
  createReadyToWear: (body: Partial<ReadyToWear>) => api.post<ReadyToWear>("/ready-to-wear", body),
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
export const AdminApi = {
  pendingVerifications: () => api.get<TailorProfile[]>("/admin/verifications"),
  getVerificationDocuments: (tailorId: string) =>
    api.get<VerificationDocument[]>(`/admin/verifications/${tailorId}/documents`),
  decideVerification: (tailorId: string, status: "approved" | "rejected") =>
    api.post<TailorProfile>(`/admin/verifications/${tailorId}/decide`, { status }),
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
  categories: () => api.get<Category[]>("/categories"),
  createCategory: (body: { name: string; gender: string }) =>
    api.post<Category>("/admin/categories", body),
  updateCategory: (catId: string, body: { name?: string; gender?: string }) =>
    api.patch<Category>(`/admin/categories/${catId}`, body),
  deleteCategory: (catId: string) =>
    api.delete(`/admin/categories/${catId}`),
  models: (params: { category_id?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.category_id) qs.set("category_id", params.category_id);
    return api.get<GarmentModel[]>(`/models?${qs.toString()}`);
  },
  createModel: (body: Partial<GarmentModel>) =>
    api.post<GarmentModel>("/admin/models", body),
  updateModel: (modelId: string, body: Partial<GarmentModel>) =>
    api.patch<GarmentModel>(`/admin/models/${modelId}`, body),
  deleteModel: (modelId: string) =>
    api.delete(`/admin/models/${modelId}`),
};
