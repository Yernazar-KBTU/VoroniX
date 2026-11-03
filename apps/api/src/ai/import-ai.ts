import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { HttpError } from "../lib/errors.js";
import { loadSnapshot } from "./context.js";
import { claudeKey, getEngine } from "./runner.js";
import { requireTenant } from "../tenancy/context.js";

/**
 * Import with Claude: reads what the browser cannot turn into rows by itself
 * (PDF files, photos of a price list, free text) and returns a draft in the
 * same shape as the browser's own parser. Nothing is saved here: the owner
 * checks the draft and the web app saves it through POST /api/import.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ReadBody = z.object({
  texts: z.array(z.object({ name: z.string().max(200), text: z.string().max(200_000) })).max(20).default([]),
  files: z
    .array(
      z.object({
        name: z.string().max(200),
        media_type: z.enum(["application/pdf", ...IMAGE_TYPES]),
        // base64: 4 characters for every 3 bytes
        data: z.string().max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4),
      }),
    )
    .max(10)
    .default([]),
});
export type ReadInput = z.infer<typeof ReadBody>;

const str = { type: "string" } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const SETTINGS = ["name", "type", "city", "address", "hours", "phone", "catchphrase", "languages", "prepay_percent", "prepay_min_price"] as const;

/** JSON schema for structured output, so the reply is always valid JSON in this shape. */
const SCHEMA = obj({
  settings: obj(Object.fromEntries(SETTINGS.map((k) => [k, str]))),
  services: { type: "array", items: obj({ name: str, category: str, duration_min: { type: "integer" }, price: { type: "number" } }) },
  staff: {
    type: "array",
    items: obj({ full_name: str, specialization: str, days: { type: "array", items: { type: "integer" } }, work_start: str, work_end: str, services: { type: "array", items: str } }),
  },
  clients: { type: "array", items: obj({ display_name: str, phone: str, notes: str }) },
  knowledge: { type: "array", items: obj({ title: str, category: str, content: str }) },
});

const Reply = z.object({
  settings: z.record(z.string(), z.string()).default({}),
  services: z.array(z.object({ name: z.string(), category: z.string().default(""), duration_min: z.number().default(0), price: z.number().default(0) })).default([]),
  staff: z
    .array(z.object({ full_name: z.string(), specialization: z.string().default(""), days: z.array(z.number()).default([]), work_start: z.string().default(""), work_end: z.string().default(""), services: z.array(z.string()).default([]) }))
    .default([]),
  clients: z.array(z.object({ display_name: z.string(), phone: z.string().default(""), notes: z.string().default("") })).default([]),
  knowledge: z.array(z.object({ title: z.string(), category: z.string().default("General"), content: z.string() })).default([]),
});
export type ReadDraft = z.infer<typeof Reply> & { engine: string };

export async function readWithClaude(input: ReadInput): Promise<ReadDraft> {
  const engine = getEngine().name;
  if (!engine.startsWith("claude"))
    throw new HttpError(400, "Reading PDF files and photos needs Claude. Add a Claude API key in Integrations, or save the file as Excel, Word or CSV.", "ai_off");
  if (!input.texts.length && !input.files.length) throw new HttpError(400, "Nothing to read", "bad_request");

  const snap = await loadSnapshot(pool);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of input.files) {
    content.push({ type: "text", text: `File: ${f.name}` });
    content.push(
      f.media_type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
        : { type: "image", source: { type: "base64", media_type: f.media_type, data: f.data } },
    );
  }
  for (const t of input.texts) content.push({ type: "text", text: `File: ${t.name}\n\n${t.text}` });
  content.push({ type: "text", text: "Turn everything above into CRM data as described." });

  const client = new Anthropic({ apiKey: claudeKey() });
  const stream = client.beta.messages.stream({
    model: config.AI_MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    system: `You read files that the owner of ${snap.biz.name} (${snap.biz.type || "a small business"}) uploads to their CRM and turn them into rows for its tables.
Prices are whole numbers in the business currency (${requireTenant().currency}); duration_min is minutes. Days are numbers: 0 Sunday, 1 Monday ... 6 Saturday. Times are HH:MM, 24-hour.
- services: what clients can book, with price and duration. Use 0 when the file does not say. Category is the section of the price list, or "".
- staff: people who serve clients, with their working days, hours and the services they do. Name services exactly as in the services list or the existing services: ${snap.services.map((s) => s.name).join("; ") || "none yet"}.
- clients: customer lists only (name, phone, notes).
- settings: only what the file states about the business itself; "" for everything else. prepay_percent and prepay_min_price are digits or "".
- knowledge: everything else a receptionist needs to answer clients (rules, promotions, FAQ, policies, descriptions), one entry per topic, in the file's language. Categories: Promotions, Rules, Prices, FAQ, Brand, Contacts, or a short new one. Do not repeat what already went into services, staff, clients or settings.
Copy names, numbers and conditions exactly. Invent nothing. Skip anything you cannot read.`,
    messages: [{ role: "user", content }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new HttpError(422, "Claude could not read this file.", "ai_refused");
  if (msg.stop_reason === "max_tokens") throw new HttpError(422, "The file is too long to read at once. Split it into smaller files.", "too_long");
  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { ...Reply.parse(JSON.parse(raw)), engine };
}
