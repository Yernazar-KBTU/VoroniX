import { z } from "zod";
import { tx } from "../db/pool.js";
import { bus, type Resource } from "../realtime/bus.js";
import * as catalog from "../repositories/catalog.repo.js";
import { createClient, listClients, normalizePhone } from "../repositories/clients.repo.js";
import { createKnowledge, listKnowledge } from "../repositories/knowledge.repo.js";
import { getSettings, saveSettings } from "../repositories/settings.repo.js";
import { KnowledgeBody, SettingsBody } from "../routes/schemas.js";
import { requireTenant } from "../tenancy/context.js";
import { renameBusiness } from "../tenancy/tenants.js";

/**
 * Import: the owner uploads a price list, a staff table, a client list or any
 * document, checks the draft the web app made from it, and this saves the
 * chosen rows in one transaction. Rows are matched by name (services, staff)
 * or phone (clients), so importing the same file twice does not duplicate
 * anything.
 */

const hhmm = z.string().regex(/^\d\d:\d\d$/, "use HH:MM");
const text = (max: number) => z.string().trim().max(max);

const ImportSettings = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: text(60),
    city: text(60),
    address: text(160),
    hours: text(120),
    phone: text(40),
    tone: text(2000),
    catchphrase: text(200),
    languages: text(120),
    prepay_percent: z.coerce.number().int().min(0).max(100),
    prepay_min_price: z.coerce.number().int().min(0),
  })
  .partial()
  .strict();

export const ImportBody = z.object({
  settings: ImportSettings.default({}),
  services: z
    .array(
      z.object({
        code: z.string().regex(/^[A-Z]{2}-\d{2}$/).optional(),
        name: z.string().trim().min(1).max(50),
        category: text(30).default(""),
        duration_min: z.coerce.number().int().min(15).max(240),
        price_kzt: z.coerce.number().int().positive(),
      }),
    )
    .max(500)
    .default([]),
  staff: z
    .array(
      z.object({
        full_name: z.string().trim().min(1).max(60),
        specialization: text(40).default(""),
        work_start: hhmm.optional(),
        work_end: hhmm.optional(),
        days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        /** Names or codes of the services this person does: new ones from this import or existing ones. */
        services: z.array(z.string().trim().max(60)).max(500).default([]),
      }),
    )
    .max(300)
    .default([]),
  clients: z
    .array(z.object({ display_name: z.string().trim().min(1).max(50), phone: text(40).optional(), notes: text(2000).optional() }))
    .max(10000)
    .default([]),
  knowledge: z.array(KnowledgeBody).max(500).default([]),
});
export type ImportInput = z.infer<typeof ImportBody>;

export interface ImportSummary {
  settings: number;
  services: { created: number; updated: number };
  staff: { created: number; updated: number };
  clients: { created: number; skipped: number };
  knowledge: { created: number; skipped: number };
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ы: "y", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** Two Latin letters for a service code: "Men's haircut" → "MH", "Стрижка" → "ST". */
export function codePrefix(name: string): string {
  const latin = [...name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f'’`]/g, "")]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z]+/g, " ")
    .trim();
  const words = latin.split(" ").filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return (letters + "XX").slice(0, 2).toUpperCase();
}

/** The first free code with this prefix, or any free code once all 99 are taken. */
export function nextCode(prefix: string, used: Set<string>): string {
  const free = (p: string) => {
    for (let n = 1; n <= 99; n++) {
      const code = `${p}-${String(n).padStart(2, "0")}`;
      if (!used.has(code)) return code;
    }
    return null;
  };
  const own = free(prefix);
  if (own) return own;
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const any = free(String.fromCharCode(a, b));
      if (any) return any;
    }
  throw new Error("No free service codes left");
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function applyImport(input: ImportInput): Promise<ImportSummary> {
  const touched = new Set<Resource>();
  const summary: ImportSummary = {
    settings: 0,
    services: { created: 0, updated: 0 },
    staff: { created: 0, updated: 0 },
    clients: { created: 0, skipped: 0 },
    knowledge: { created: 0, skipped: 0 },
  };

  await tx(async (c) => {
    // Business setup: only the fields the file had and that differ; everything else stays.
    const current = (await getSettings(c)) as unknown as Record<string, unknown>;
    const changes = Object.entries(input.settings).filter(([k, v]) => v !== undefined && v !== "" && String(current[k] ?? "") !== String(v));
    if (changes.length) {
      const saved = await saveSettings(c, SettingsBody.parse({ ...current, ...Object.fromEntries(changes) }));
      await renameBusiness(requireTenant(), saved.name, c);
      summary.settings = changes.length;
      touched.add("settings");
    }

    // Services: same name means the same service, so prices and durations are updated.
    const services = await catalog.listServices(c);
    const byName = new Map(services.map((s) => [key(s.name), s]));
    const used = new Set(services.map((s) => s.id));
    for (const s of input.services) {
      const found = (s.code ? services.find((x) => x.id === s.code) : undefined) ?? byName.get(key(s.name));
      const id = found?.id ?? (s.code && !used.has(s.code) ? s.code : nextCode(codePrefix(s.name), used));
      used.add(id);
      const saved = await catalog.upsertService(c, { id, name: s.name, category: s.category || found?.category || "", duration_min: s.duration_min, price_kzt: s.price_kzt, is_active: true });
      byName.set(key(saved.name), saved);
      summary.services[found ? "updated" : "created"]++;
      touched.add("services");
    }

    // Staff: matched by full name. Missing hours keep the current ones, or the usual 09:00-20:00, Monday to Saturday.
    const masters = await catalog.listMasters(c);
    const links = await catalog.listMasterServices(c);
    for (const m of input.staff) {
      const found = masters.find((x) => key(x.full_name) === key(m.full_name));
      const row = await catalog.saveMaster(c, {
        id: found?.id,
        full_name: m.full_name,
        specialization: m.specialization || found?.specialization || "",
        work_start: m.work_start ?? found?.work_start ?? "09:00",
        work_end: m.work_end ?? found?.work_end ?? "20:00",
        days: m.days ?? found?.days ?? [1, 2, 3, 4, 5, 6],
        is_active: true,
      });
      const codes = m.services.map((n) => byName.get(key(n))?.id ?? (used.has(n.toUpperCase()) ? n.toUpperCase() : null)).filter((x): x is string => Boolean(x));
      if (codes.length) {
        const current = found ? links.filter((l) => l.master_id === found.id).map((l) => l.service_code) : [];
        await catalog.setMasterServices(c, row.id, [...new Set([...current, ...codes])]);
        touched.add("master_services");
      }
      if (!found) masters.push(row); // the same person twice in one file is one person
      summary.staff[found ? "updated" : "created"]++;
      touched.add("masters");
    }

    // Clients: a known phone number, or the same name without a phone, is skipped.
    const clients = await listClients(c);
    const phones = new Set(clients.map((x) => x.phone).filter(Boolean));
    const namesNoPhone = new Set(clients.filter((x) => !x.phone).map((x) => key(x.display_name)));
    for (const cl of input.clients) {
      let phone = normalizePhone(cl.phone);
      let notes = cl.notes ?? "";
      if (phone && phone.length > 20) {
        notes = [notes, `Phone: ${cl.phone}`].filter(Boolean).join("\n");
        phone = null;
      }
      if (phone ? phones.has(phone) : namesNoPhone.has(key(cl.display_name))) {
        summary.clients.skipped++;
        continue;
      }
      await createClient(c, { display_name: cl.display_name, phone: phone ?? undefined, notes });
      if (phone) phones.add(phone);
      else namesNoPhone.add(key(cl.display_name));
      summary.clients.created++;
      touched.add("clients");
    }

    // Knowledge: an entry with the same title and text is already there.
    const known = new Set((await listKnowledge(c)).map((k) => `${key(k.title)}\n${k.content.trim()}`));
    for (const k of input.knowledge) {
      const id = `${key(k.title)}\n${k.content.trim()}`;
      if (known.has(id)) {
        summary.knowledge.skipped++;
        continue;
      }
      await createKnowledge(c, k);
      known.add(id);
      summary.knowledge.created++;
      touched.add("knowledge");
    }
  });

  if (touched.size) bus.changed(...touched);
  return summary;
}
