// Import: a reviewed draft in, rows in PostgreSQL out, all in one transaction.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/db/pool.js";
import { idle } from "../../src/ai/runner.js";
import { codePrefix, nextCode } from "../../src/services/import.service.js";
import { freshDb } from "./helpers.js";

const app = createApp();
const api = request(app);

beforeAll(async () => {
  await freshDb();
});
afterAll(async () => {
  await idle();
  await pool.end();
});

const draft = {
  settings: { address: "245 Park Avenue, New York", prepay_percent: 30, prepay_min_price: 100 },
  services: [
    { name: "Women's haircut", category: "Hair", duration_min: 60, price_kzt: 65 },
    { name: "Стрижка детская", duration_min: 40, price_kzt: 4000 },
  ],
  staff: [{ full_name: "Emma Clark", specialization: "Senior stylist", work_start: "10:00", work_end: "18:00", days: [1, 2, 3, 4, 5], services: ["women's haircut", "Стрижка детская", "Unknown service"] }],
  clients: [
    { display_name: "Aruzhan", phone: "8 701 123 45 67", notes: "Email: a@x.kz" },
    { display_name: "Timur" },
  ],
  knowledge: [{ title: "Parking", category: "FAQ", content: "Free parking behind the building." }],
};

describe("service codes for new services", () => {
  it("takes two letters from the name, in Latin letters", () => {
    expect(codePrefix("Men's haircut")).toBe("MH");
    expect(codePrefix("Стрижка")).toBe("ST");
    expect(codePrefix("Қас бояу")).toBe("KB");
    expect(codePrefix("7")).toBe("XX");
  });
  it("uses the first free number, then any free code", () => {
    expect(nextCode("MH", new Set(["MH-01", "MH-02"]))).toBe("MH-03");
    const full = new Set(Array.from({ length: 99 }, (_, i) => `MH-${String(i + 1).padStart(2, "0")}`));
    expect(nextCode("MH", full)).toBe("AA-01");
  });
});

describe("POST /api/import", () => {
  it("creates services, staff with their services, clients, knowledge and settings at once", async () => {
    const r = await api.post("/api/import").send(draft).expect(200);
    expect(r.body).toEqual({
      settings: 2, // prepay_percent 30 is already the demo value, so it is not a change
      services: { created: 2, updated: 0 },
      staff: { created: 1, updated: 0 },
      clients: { created: 2, skipped: 0 },
      knowledge: { created: 1, skipped: 0 },
    });
    const b = (await api.get("/api/bootstrap").expect(200)).body;
    const wh = b.services.find((s: { name: string }) => s.name === "Women's haircut");
    const kids = b.services.find((s: { name: string }) => s.name === "Стрижка детская");
    expect(wh).toMatchObject({ id: "WH-01", category: "Hair", duration_min: 60, price_kzt: 65 });
    expect(kids.id).toMatch(/^SD-\d\d$/);
    const emma = b.masters.find((m: { full_name: string }) => m.full_name === "Emma Clark");
    expect(emma).toMatchObject({ work_start: "10:00", work_end: "18:00", days: [1, 2, 3, 4, 5] });
    expect(b.master_services.filter((x: { master_id: string }) => x.master_id === emma.id).map((x: { service_code: string }) => x.service_code).sort()).toEqual([kids.id, "WH-01"].sort());
    expect(b.clients.find((c: { display_name: string }) => c.display_name === "Aruzhan").phone).toBe("+7 701 123 4567");
    expect(b.knowledge.some((k: { title: string }) => k.title === "Parking")).toBe(true);
    expect(b.settings).toMatchObject({ address: "245 Park Avenue, New York", prepay_percent: 30, prepay_min_price: 100, name: "Barberista" });
  });

  it("updates instead of duplicating when the same file is imported again", async () => {
    const again = { ...draft, services: [{ ...draft.services[0], price_kzt: 70 }], staff: [{ ...draft.staff[0], work_end: "19:00", services: [] }] };
    const r = await api.post("/api/import").send(again).expect(200);
    expect(r.body).toMatchObject({ services: { created: 0, updated: 1 }, staff: { created: 0, updated: 1 }, clients: { created: 0, skipped: 2 }, knowledge: { created: 0, skipped: 1 } });
    const b = (await api.get("/api/bootstrap").expect(200)).body;
    expect(b.services.filter((s: { name: string }) => s.name === "Women's haircut")).toEqual([expect.objectContaining({ id: "WH-01", price_kzt: 70 })]);
    const emma = b.masters.filter((m: { full_name: string }) => m.full_name === "Emma Clark");
    expect(emma).toHaveLength(1);
    expect(emma[0].work_end).toBe("19:00");
    expect(b.master_services.filter((x: { master_id: string }) => x.master_id === emma[0].id)).toHaveLength(2); // links are kept
  });

  it("keeps an existing person's hours when the file has none", async () => {
    const before = (await api.get("/api/masters").expect(200)).body.find((m: { full_name: string }) => m.full_name === "Emma Clark");
    await api.post("/api/import").send({ staff: [{ full_name: "emma clark", specialization: "Stylist" }] }).expect(200);
    const after = (await api.get("/api/masters").expect(200)).body.find((m: { id: string }) => m.id === before.id);
    expect(after).toMatchObject({ specialization: "Stylist", work_start: before.work_start, work_end: before.work_end, days: before.days });
  });

  it("saves nothing when one row breaks a database rule", async () => {
    const r = await api
      .post("/api/import")
      .send({ services: [{ name: "Should not stay", duration_min: 30, price_kzt: 10 }], staff: [{ full_name: "Night Shift", work_start: "22:00", work_end: "06:00", days: [1] }] })
      .expect(400);
    expect(r.body.message).toMatch(/not allowed/i);
    const services = (await api.get("/api/services").expect(200)).body;
    expect(services.some((s: { name: string }) => s.name === "Should not stay")).toBe(false);
  });

  it("rejects rows the database could never take, with the field named", async () => {
    const r = await api.post("/api/import").send({ services: [{ name: "Free", duration_min: 30, price_kzt: 0 }] }).expect(400);
    expect(r.body.message).toContain("services.0.price_kzt");
  });

  it("accepts big client lists (bodies over the usual 1 MB limit)", async () => {
    const clients = Array.from({ length: 1500 }, (_, i) => ({ display_name: `Client ${i}`, phone: `+1 555 ${String(1000000 + i)}`, notes: "x".repeat(800) }));
    const r = await api.post("/api/import").send({ clients }).expect(200);
    expect(r.body.clients).toEqual({ created: 1500, skipped: 0 });
  });
});

describe("POST /api/import/ai", () => {
  it("explains that PDF files and photos need Claude when it is off", async () => {
    const r = await api.post("/api/import/ai").send({ files: [{ name: "prices.pdf", media_type: "application/pdf", data: "JVBERi0=" }] }).expect(400);
    expect(r.body).toMatchObject({ error: "ai_off", message: expect.stringContaining("Claude") });
  });
  it("accepts only PDF files and common image types", async () => {
    await api.post("/api/import/ai").send({ files: [{ name: "x.exe", media_type: "application/octet-stream", data: "AA==" }] }).expect(400);
  });
});
