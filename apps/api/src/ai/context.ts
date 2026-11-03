import type { Db } from "../db/pool.js";
import { prepaymentFor } from "../domain/pricing.js";
import type { BusinessSettings, Conversation, KnowledgeEntry, Master, MasterService, Service } from "../domain/types.js";
import { DOW, addDays, dt, parseDT, wallClock } from "../lib/time.js";
import { currentTenant } from "../tenancy/context.js";
import { listAppointments } from "../repositories/appointments.repo.js";
import { listMasterServices, listMasters, listServices } from "../repositories/catalog.repo.js";
import { getClient } from "../repositories/clients.repo.js";
import { listKnowledge } from "../repositories/knowledge.repo.js";
import { getSettings } from "../repositories/settings.repo.js";

export const KB_CHAR_LIMIT = 14_000;

/** Everything the AI is allowed to know, read fresh from the database for each reply. */
export interface CrmSnapshot {
  biz: BusinessSettings;
  services: Service[];
  masters: Master[];
  links: MasterService[];
  knowledge: KnowledgeEntry[];
}

export async function loadSnapshot(db: Db): Promise<CrmSnapshot> {
  const [biz, services, masters, links, knowledge] = await Promise.all([
    getSettings(db),
    listServices(db),
    listMasters(db),
    listMasterServices(db),
    listKnowledge(db),
  ]);
  return { biz, services, masters, links, knowledge };
}

export function catalogText(s: CrmSnapshot): string {
  return s.services
    .filter((x) => x.is_active)
    .map((svc) => {
      const who = s.links
        .filter((l) => l.service_code === svc.id)
        .map((l) => s.masters.find((m) => m.id === l.master_id))
        .filter((m): m is Master => !!m && m.is_active)
        .map((m) => `${m.id} ${m.full_name} (${m.specialization})`);
      const pp = prepaymentFor(svc, s.biz);
      const cur = currentTenant()?.currency ?? "KZT";
      return `- ${svc.id} | ${svc.name} | ${svc.duration_min} min | ${svc.price_kzt} ${cur} | masters: ${who.join(", ") || "none"}${pp ? ` | prepayment ${pp} ${cur} required` : ""}`;
    })
    .join("\n");
}

export function staffText(s: CrmSnapshot): string {
  return s.masters
    .filter((m) => m.is_active)
    .map((m) => `- ${m.id} ${m.full_name}, ${m.specialization}, works ${m.days.map((d) => DOW[d]).join("/")} ${m.work_start}-${m.work_end}`)
    .join("\n");
}

export function knowledgeText(s: CrmSnapshot, limit = KB_CHAR_LIMIT): string {
  let out = "";
  for (const k of s.knowledge) {
    const add = `### ${k.title} [${k.category || "General"}]\n${k.content}\n\n`;
    if (out.length + add.length > limit) break;
    out += add;
  }
  return out || "(empty)";
}

/** System prompt for the AI administrator. Data comes only from the CRM. */
export async function systemPrompt(db: Db, s: CrmSnapshot, conv: Conversation, now = wallClock()): Promise<string> {
  const { biz } = s;
  let clientBlock = `not linked to a client card yet (contact name in ${conv.messenger}: ${conv.contact}).`;
  if (conv.client_id) {
    const c = await getClient(db, conv.client_id);
    const visits = (await listAppointments(db, { client_id: conv.client_id }))
      .filter((a) => (parseDT(a.start_datetime) ?? now) >= addDays(now, -1))
      .map((a) => {
        const svc = s.services.find((x) => x.id === a.service_code);
        const m = s.masters.find((x) => x.id === a.master_id);
        return `- ${a.id} ${a.start_datetime} ${svc?.name} with ${m?.full_name} [${a.status}]`;
      });
    if (c) clientBlock = `linked card ${c.id}, name ${c.display_name}, phone ${c.phone || "unknown"}, notes: ${c.notes || "none"}. Recent and upcoming visits:\n${visits.join("\n") || "none"}`;
  }

  const where = `${biz.type ? `a ${biz.type}` : "a business"}${biz.city ? ` in ${biz.city}` : ""}`;
  const rules = [
    "Use ONLY facts from the CRM data below and from tool results. Never invent services, prices, discounts, masters or free times. If the data has no answer, say you will check with the administrator and call handoff_to_human.",
    'People write in any style: typos, no punctuation, vague requests like "after work tomorrow". Understand them kindly, guess the most likely meaning and ask at most ONE short clarifying question at a time.',
    "Before offering times ALWAYS call find_free_slots. Offer 2-4 concrete options.",
    "Before booking: call link_client with the client's name (ask for it if unknown; phone is optional). Confirm service, master and time, then call create_appointment.",
    'If create_appointment says prepayment is required, call create_payment_link with kind "prepayment" and tell the client the amount. The client pays with the button in the chat.',
    "Complaints, refunds, medical questions, angry clients, or requests you cannot do: apologise and call handoff_to_human.",
    `Reply in the language the client writes in${biz.languages ? ` (the business serves clients in ${biz.languages})` : ""}. Messenger style: 1-4 short sentences, no markdown, no lists of IDs. Never show internal codes like HC-01 or AP-1001.`,
    `Tone: ${biz.tone || "friendly, short and to the point"}`,
    ...(biz.catchphrase ? [`Brand phrase: "${biz.catchphrase}". Use it naturally in the first greeting or when you confirm a booking, not in every message.`] : []),
    "The knowledge base is the owner's word: follow its rules exactly, and when a client asks about prices or books, mention a promotion that applies to them. Never promise a discount that is not written there.",
  ];

  return `You are the AI administrator of "${biz.name}", ${where}. You chat with a client in ${conv.messenger}. You take the client all the way: greeting -> understand what they need -> offer services, prices and free times -> collect their name -> book -> send a payment link when prepayment is required or the client wants to pay -> confirm.

RULES
${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Now: ${DOW[now.getDay()]} ${dt(now)} (local time). Business hours: ${biz.hours || "not set, use the staff hours below"}. Address: ${biz.address || "not set"}.

SERVICES (from the CRM database):
${catalogText(s)}

STAFF:
${staffText(s)}

KNOWLEDGE BASE (written by the business owner):
${knowledgeText(s)}

THIS CLIENT: ${clientBlock}`;
}
