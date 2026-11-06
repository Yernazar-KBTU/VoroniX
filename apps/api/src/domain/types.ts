// Shapes the API returns. Field names match the web client.

export const MESSENGERS = ["Telegram", "WhatsApp", "Instagram"] as const;
export type Messenger = (typeof MESSENGERS)[number];

export const APPT_STATUSES = ["Booked", "Confirmed", "Completed", "Cancelled", "No-show"] as const;
export type ApptStatus = (typeof APPT_STATUSES)[number];

export const STAGES = ["New", "In dialog", "Booked", "Paid", "Visited", "Lost"] as const;
export type Stage = (typeof STAGES)[number];

export interface BusinessSettings {
  name: string;
  type: string;
  city: string;
  address: string;
  hours: string;
  phone: string;
  tone: string;
  /** Brand phrase the AI uses in greetings and confirmations. */
  catchphrase: string;
  languages: string;
  staff_label: string;
  service_label: string;
  prepay_percent: number;
  prepay_min_price: number;
  autopilot: boolean;
  /** Who answers the chats: our own VoroniX AI or Claude. */
  ai_engine?: "voronix" | "claude";
}

export interface Service {
  id: string;
  name: string;
  category: string;
  duration_min: number;
  price_kzt: number;
  is_active: boolean;
}

export interface Master {
  id: string;
  full_name: string;
  specialization: string;
  work_start: string;
  work_end: string;
  days: number[];
  is_active: boolean;
}

export interface MasterService {
  id: string;
  master_id: string;
  service_code: string;
  skill_level: "Junior" | "Senior";
  since_date: string;
}

export interface Client {
  id: string;
  display_name: string;
  phone: string;
  notes: string;
  created_at: string;
}

export interface ClientChannel {
  id: string;
  client_id: string;
  messenger: Messenger;
  external_user_id: string;
}

export interface Appointment {
  id: string;
  client_id: string;
  master_id: string;
  service_code: string;
  start_datetime: string;
  end_datetime: string;
  status: ApptStatus;
  source: string;
  created_at: string;
}

export interface Payment {
  id: string;
  appointment_id: string;
  amount_kzt: number;
  kind: "prepayment" | "full";
  method: string;
  status: "Pending" | "Paid" | "Refunded";
  created_at: string;
  paid_at: string;
}

export interface ChatMessage {
  id: number;
  from: "client" | "ai" | "admin" | "system" | "pay";
  text: string;
  payment_id?: string | null;
  at: string;
}

export interface Conversation {
  id: string;
  messenger: Messenger;
  external_user_id: string;
  contact: string;
  client_id: string | null;
  appointment_id: string | null;
  stage: Stage;
  ai_enabled: boolean;
  needs_human: boolean;
  updated_at: string;
  messages: ChatMessage[];
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  updated_at: string;
}
