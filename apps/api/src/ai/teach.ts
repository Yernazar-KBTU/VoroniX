import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { loadSnapshot, type CrmSnapshot } from "./context.js";
import { parsePhone } from "./offline-nlu.js";
import { getEngine } from "./runner.js";

/**
 * "Teach the AI": the owner pastes free-form notes (a promotion, rules, a
 * slogan, new opening hours) and gets back a draft of knowledge entries and
 * settings changes. Nothing is saved here: the owner reviews the draft and the
 * web app saves the chosen parts through the normal knowledge and settings API.
 */
export const SETTING_KEYS = ["name", "address", "hours", "phone", "tone", "catchphrase", "languages"] as const;

const Draft = z.object({
  entries: z
    .array(z.object({ title: z.string().trim().min(1).max(120), category: z.string().trim().max(40).default("General"), content: z.string().trim().min(1).max(60000) }))
    .max(50)
    .default([]),
  settings: z.record(z.string(), z.string()).default({}),
});
export type TeachDraft = z.infer<typeof Draft> & { engine: string };

export async function organiseNotes(text: string): Promise<TeachDraft> {
  const snap = await loadSnapshot(pool);
  const draft = getEngine().name.startsWith("claude") ? await withClaude(text, snap) : offlineOrganise(text);
  // Keep only known settings that actually change something.
  const settings: Record<string, string> = {};
  for (const k of SETTING_KEYS) {
    const v = draft.settings[k]?.trim();
    if (v && v !== (snap.biz as unknown as Record<string, unknown>)[k]) settings[k] = v.slice(0, k === "tone" ? 2000 : 200);
  }
  return { entries: draft.entries, settings, engine: getEngine().name };
}

async function withClaude(text: string, snap: CrmSnapshot): Promise<z.infer<typeof Draft>> {
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const cats = [...new Set(["Promotions", "Rules", "Prices", "FAQ", "Brand", "Contacts", ...snap.knowledge.map((k) => k.category)])];
  const res = await client.beta.messages.create({
    model: config.AI_MODEL,
    max_tokens: 8000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `You turn a business owner's free-form notes into structured CRM data for ${snap.biz.name} (${snap.biz.type}).
Return ONLY a JSON object: {"entries":[{"title","category","content"}],"settings":{${SETTING_KEYS.map((k) => `"${k}":""`).join(",")}}}.
One entry per separate fact (a promotion, a rule, an FAQ answer). Categories: ${cats.join(", ")} or a new short one.
Keep the owner's language and every number, date and condition exactly. A slogan goes ONLY in settings.catchphrase; changed hours, address, phone, name, tone or languages go ONLY in settings. Leave unused settings "". Invent nothing.
Existing knowledge titles: ${snap.knowledge.map((k) => k.title).join("; ") || "none"}`,
    messages: [{ role: "user", content: text }],
  });
  const raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  return Draft.parse(JSON.parse(json));
}

const RULES: [RegExp, string][] = [
  [/(акци|скидк|промо|бонус|подар|бесплатн|кэшбэк|promo|discount|sale|offer|%)/i, "Promotions"],
  [/(правил|нельзя|обязательн|опоздан|отмен|перенос|штраф|запрещ|must|rule|policy|late|cancel)/i, "Rules"],
  [/(₸|тенге|\bтг\b|цен|стоит|прайс|price|kzt)/i, "Prices"],
  [/\?/, "FAQ"],
];

/** Offline mode: the same draft from simple patterns, one entry per sentence. */
export function offlineOrganise(text: string): z.infer<typeof Draft> {
  const settings: Record<string, string> = {};
  const entries: { title: string; category: string; content: string }[] = [];
  const sentences = text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+(?=[\p{Lu}\d«"])/u)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of sentences) {
    const slogan = /(?:слоган|девиз|кэтч[- ]?фраз\w*|фраз\w* бренда|наша фраза|slogan|catchphrase|tagline)\s*(?:[:—–-]|это|is)?\s*[«"“]?([^»"”\n]+?)[»"”]?\s*\.?$/iu.exec(s);
    if (slogan) {
      settings.catchphrase = slogan[1].trim();
      continue;
    }
    const hours = /(?:часы работы|график работы|режим работы|работаем|opening hours|we are open)\s*[:—–-]?\s*(.+)/iu.exec(s);
    if (hours && /\d/.test(hours[1])) {
      settings.hours = hours[1].replace(/\.$/, "").trim();
      continue;
    }
    const address = /(?:новый адрес|наш адрес|адрес|мы переехали на|address)\s*[:—–-]?\s*(.+)/iu.exec(s);
    if (address) {
      settings.address = address[1].replace(/\.$/, "").trim();
      continue;
    }
    if (/(телефон|номер|phone)/i.test(s) && parsePhone(s)) {
      settings.phone = parsePhone(s)!;
      continue;
    }
    const category = RULES.find(([re]) => re.test(s))?.[1] ?? "General";
    const words = s.replace(/[«»"“”]/g, "").split(/\s+/);
    entries.push({ title: words.slice(0, 6).join(" ").replace(/[,.:;!?]+$/, "") + (words.length > 6 ? "…" : ""), category, content: s });
  }
  return { entries, settings };
}
