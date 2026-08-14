export type UserRole = "client" | "tailor" | "admin";
export type Language = "fr" | "en";
export type JobStatus = "processing" | "ready" | "failed";
export type VerificationStatus = "pending" | "approved" | "rejected";
export type OrderStatus =
  | "new"
  | "in_progress"
  | "ready_for_pickup"
  | "finished_delivered"
  | "finished_not_delivered";
export type OfferActor = "client" | "tailor";
export type OfferStatus = "pending" | "accepted" | "refused" | "expired";
export type ModificationStatus = "proposed" | "accepted" | "refused";
export type ChatMessageType = "text" | "modification" | "system";
export type MobileMoneyProvider = "mtn_momo" | "orange_money";
export type PaymentStatus = "pending" | "paid" | "released" | "refunded" | "failed";
export type EscrowStatus = "held" | "released" | "refunded";
export type GarmentCategory = "top" | "bottom" | "dress" | "traditional" | "other";
export type Gender = "male" | "female" | "unisex";
export type ReceptionMode = "pickup" | "delivery";
export type MeasurementSource = "ai" | "manual" | "mixed" | "tailor_confirmed";

export interface User {
  id: string;
  role: UserRole;
  phone: string;
  email: string | null;
  full_name: string;
  language: Language;
  photo_consent: boolean;
  is_active: boolean;
  created_at: string;
  /** role === "tailor" only; null for client/admin. */
  verification_status: VerificationStatus | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
  role: UserRole;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  default_measurement_id: string | null;
  skin_tone_hex: string | null;
}

export interface TailorProfile {
  id: string;
  user_id: string;
  tailor_type: "individual" | "atelier";
  shop_name: string;
  bio: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  verification_status: VerificationStatus;
  rating_avg: number;
  completed_orders_count: number;
  avg_response_minutes: number;
  atelier_photo_url: string | null;
  distance_km?: number | null;
}

export interface VerificationDocument {
  id: string;
  user_id: string;
  type: "id_card" | "self_photo" | "atelier_photo";
  file_url: string;
  status: VerificationStatus;
  reviewed_by: string | null;
}

export interface MeasurementSession {
  id: string;
  status: JobStatus;
  measurement_id: string | null;
  height_cm: number | null;
  error_message: string | null;
}

export interface Measurement {
  id: string;
  client_id: string;
  source: MeasurementSource;
  version: number;
  height_cm: number;
  weight_kg: number | null;
  gender: string | null;
  data: Record<string, number>;
  /** Entrées brutes (squelette MediaPipe + silhouette SAM) données au modèle
   *  pour prédire `data` — mesures intermédiaires, pas les 12 mesures finales. */
  features: Record<string, number> | null;
  confidence: Record<string, number> | null;
  is_active: boolean;
}

export interface Avatar {
  id: string;
  client_id: string;
  measurement_id: string;
  gltf_url: string | null;
  /** {gender, height_cm, base_height_cm, weights: {morphTargetName: 0..1}} —
   *  voir Viewer3D.tsx, qui applique `weights` sur le maillage de base
   *  embarqué dans l'app plutôt que de charger un GLB par client. */
  morph_weights: {
    gender: "male" | "female";
    height_cm: number;
    /** Hauteur ESTIMÉE du maillage une fois `weights` appliqué (pas la
     *  hauteur du maillage neutre) — diviseur correct pour la mise à
     *  l'échelle, voir Viewer3D.tsx. */
    reference_height_cm: number;
    weights: Record<string, number>;
  } | null;
  skin_tone_hex: string;
  status: JobStatus;
}

export interface TryonSession {
  id: string;
  avatar_id: string;
  garment_model_id: string | null;
  ready_to_wear_id: string | null;
  fabric_id: string | null;
  accessory_ids: string[];
  status: JobStatus;
  gltf_url: string | null;
}

export interface GarmentModel {
  id: string;
  category: Category;
  name: string;
  description: string | null;
  base_price: number | null;
  style_tags: string[];
  thumbnail_color: string;
  photo_url: string | null;
  photos: string[];
  like_count: number;
  liked_by_me: boolean;
}

export interface Category {
  id: string;
  name: string;
  gender: Gender;
}

export interface Fabric {
  id: string;
  name: string;
  type: string;
  color_hex: string;
  texture_url: string | null;
  is_local: boolean;
}

export interface Accessory {
  id: string;
  name: string;
  price: number;
  asset_url: string | null;
  compatible_categories: string[];
}

export interface ReadyToWear {
  id: string;
  tailor_id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  photos: string[];
  price: number;
  item_measurements: Record<string, number>;
  measurement_method: string;
  in_stock: boolean;
}

export interface Order {
  id: string;
  client_id: string;
  tailor_id: string;
  type: "custom" | "ready_to_wear";
  garment_model_id: string | null;
  ready_to_wear_id: string | null;
  fabric_id: string | null;
  measurement_id: string;
  accessories: { accessory_id: string; price: number }[];
  client_notes: string | null;
  status: OrderStatus;
  priority: string;
  reception_mode: ReceptionMode;
  desired_date: string | null;
  agreed_price: number | null;
  delivery_fee: number | null;
  current_offer_round: number;
  dispute_status: string | null;
  dispute_note: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  order_id: string;
  actor: OfferActor;
  round: number;
  amount: number;
  delay_days: number | null;
  status: OfferStatus;
  expires_at: string;
}

export interface Quote {
  id: string;
  order_id: string;
  line_items: { label: string; amount: number }[];
  fabric_metrage: string | null;
  total: number;
  delay_days: number;
  commission_rate: number;
  commission_amount: number;
  net_to_tailor: number;
  accepted: boolean;
}

export interface Modification {
  id: string;
  order_id: string;
  proposed_by: OfferActor;
  modified_model_asset_url: string | null;
  accessory_price_delta: number;
  new_garment_price: number;
  justification: string;
  status: ModificationStatus;
}

export interface ChatMessage {
  id: string;
  order_id: string;
  sender_id: string;
  body: string | null;
  modification_id: string | null;
  type: ChatMessageType;
  read_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  phase: "deposit_70" | "balance_30";
  provider: MobileMoneyProvider;
  amount: number;
  status: PaymentStatus;
  provider_txn_ref: string;
}

export interface PaymentSplit {
  id: string;
  order_id: string;
  total: number;
  deposit_70: number;
  tailor_immediate_40: number;
  escrow_30: number;
  balance_30: number;
  escrow_status: EscrowStatus;
  released_at: string | null;
}

export interface Pattern {
  id: string;
  order_id: string;
  svg_url: string | null;
  pdf_url: string | null;
  tech_sheet: Record<string, unknown>;
  source: string;
  sent_at: string | null;
}

export interface Delivery {
  id: string;
  order_id: string;
  mode: string;
  fee: number;
  confirmed_by_client: boolean;
  confirmed_at: string | null;
}

export interface Review {
  id: string;
  order_id: string;
  client_id: string;
  tailor_id: string;
  stars: number;
  comment: string | null;
  moderation_status: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
