import { z } from "zod";
import { APPT_STATUSES, MESSENGERS, STAGES } from "../domain/types.js";

const hhmm = z.string().regex(/^\d\d:\d\d$/, "use HH:MM");
const dateTime = z.string().regex(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/, "use YYYY-MM-DD HH:MM");

export const SettingsBody = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.string().max(60).default(""),
  city: z.string().max(60).default(""),
  address: z.string().max(160).default(""),
  hours: z.string().max(120).default(""),
  phone: z.string().max(40).default(""),
  tone: z.string().max(2000).default(""),
  languages: z.string().max(120).default(""),
  staff_label: z.string().max(30).default("Master"),
  service_label: z.string().max(30).default("Service"),
  prepay_percent: z.coerce.number().int().min(0).max(100),
  prepay_min_price: z.coerce.number().int().min(0),
  autopilot: z.boolean().default(true),
});

export const ServiceBody = z.object({
  name: z.string().trim().min(1).max(50),
  category: z.string().max(30).default(""),
  duration_min: z.coerce.number().int().min(15).max(240),
  price_kzt: z.coerce.number().int().positive(),
  is_active: z.boolean().default(true),
});
export const ServiceCode = z.string().regex(/^[A-Z]{2}-\d{2}$/, "code must look like NS-07");

export const MasterBody = z.object({
  full_name: z.string().trim().min(1).max(60),
  specialization: z.string().max(40).default(""),
  work_start: hhmm,
  work_end: hhmm,
  days: z.array(z.number().int().min(0).max(6)).max(7),
  is_active: z.boolean().default(true),
  service_codes: z.array(z.string()).optional(),
});

export const ClientBody = z.object({
  display_name: z.string().trim().min(1).max(50),
  phone: z.string().max(30).optional(),
  notes: z.string().max(2000).optional(),
});

export const AppointmentBody = z.object({
  client_id: z.string().min(1),
  master_id: z.string().min(1),
  service_code: z.string().min(1),
  start_datetime: dateTime,
  status: z.enum(APPT_STATUSES).default("Booked"),
});
export const StatusBody = z.object({ status: z.enum(APPT_STATUSES) });
export const SlotsQuery = z.object({
  service_code: z.string(),
  date: z.string().regex(/^\d{4}-\d\d-\d\d$/),
  master_id: z.string().optional(),
});

export const ConversationCreate = z.object({
  messenger: z.enum(MESSENGERS),
  contact: z.string().trim().max(60).optional(),
  text: z.string().max(4000).optional(),
});
export const ConversationPatchBody = z.object({
  stage: z.enum(STAGES).optional(),
  ai_enabled: z.boolean().optional(),
  needs_human: z.boolean().optional(),
});
export const MessageBody = z.object({
  from: z.enum(["client", "admin"]),
  text: z.string().trim().min(1).max(4000),
});

export const InboundBody = z.object({
  external_user_id: z.string().trim().min(1).max(64),
  name: z.string().trim().max(60).default(""),
  text: z.string().trim().min(1).max(4000),
});

export const KnowledgeBody = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().max(40).default("General"),
  content: z.string().min(1).max(60000),
});

export const SqlBody = z.object({ query: z.string().min(1).max(10000) });
