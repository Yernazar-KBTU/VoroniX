// The REST API end to end: HTTP request -> validation -> service -> PostgreSQL.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/db/pool.js";
import { idle } from "../../src/ai/runner.js";
import { freshDb, quietWednesday } from "./helpers.js";

const app = createApp();
const api = request(app);
const day = quietWednesday();
let seeded: Record<string, number>;

beforeAll(async () => {
  seeded = await freshDb();
});
afterAll(async () => {
  await idle();
  await pool.end();
});

describe("health and bootstrap", () => {
  it("reports the database and the AI engine", async () => {
    const r = await api.get("/api/health").expect(200);
    expect(r.body).toMatchObject({ status: "ok", ai_engine: "offline-rules" });
  });

  it("returns every collection the web app needs in one call", async () => {
    const r = await api.get("/api/bootstrap").expect(200);
    expect(r.body.services).toHaveLength(7);
    expect(r.body.masters).toHaveLength(4);
    expect(r.body.clients.length).toBe(seeded.clients);
    expect(r.body.appointments.length).toBe(seeded.appointments);
    expect(r.body.settings.name).toBe("Lumière Beauty Studio");
  });

  it("answers unknown API paths with JSON 404", async () => {
    const r = await api.get("/api/nope").expect(404);
    expect(r.body.error).toBe("not_found");
  });
});

describe("booking", () => {
  let id: string;

  it("lists free times per master who does the service", async () => {
    const r = await api.get(`/api/appointments/free-slots?service_code=MN-02&date=${day}`).expect(200);
    expect(r.body.slots.map((s: { master_id: string }) => s.master_id)).toEqual(["MS-02"]);
    expect(r.body.slots[0].times[0]).toBe("10:00");
  });

  it("books a free slot and computes the end time from the service", async () => {
    const r = await api
      .post("/api/appointments")
      .send({ client_id: "CL-0002", master_id: "MS-02", service_code: "MN-02", start_datetime: `${day} 10:00` })
      .expect(201);
    id = r.body.id;
    expect(id).toMatch(/^AP-\d+$/);
    expect(r.body.end_datetime).toBe(`${day} 11:30`);
  });

  it("removes the booked time from the free list", async () => {
    const r = await api.get(`/api/appointments/free-slots?service_code=MN-02&date=${day}`).expect(200);
    expect(r.body.slots[0].times).not.toContain("10:00");
    expect(r.body.slots[0].times).not.toContain("11:00");
    expect(r.body.slots[0].times).toContain("11:30");
  });

  it("answers 409 with a readable reason for a double booking", async () => {
    const r = await api
      .post("/api/appointments")
      .send({ client_id: "CL-0003", master_id: "MS-02", service_code: "PD-04", start_datetime: `${day} 11:00` })
      .expect(409);
    expect(r.body.error).toBe("slot_taken");
  });

  it("answers 400 when the master does not do the service", async () => {
    const r = await api
      .post("/api/appointments")
      .send({ client_id: "CL-0003", master_id: "MS-03", service_code: "MN-02", start_datetime: `${day} 15:00` })
      .expect(400);
    expect(r.body.message).toMatch(/does not do this service/);
  });

  it("answers 400 for a malformed body", async () => {
    const r = await api.post("/api/appointments").send({ client_id: "CL-0003", start_datetime: "tomorrow" }).expect(400);
    expect(r.body.error).toBe("validation_failed");
  });

  it("moves the visit through its statuses", async () => {
    const r = await api.patch(`/api/appointments/${id}/status`).send({ status: "Completed" }).expect(200);
    expect(r.body.status).toBe("Completed");
  });
});

describe("payment confirms the booking in one transaction", () => {
  let paymentId: string;
  let apptId: string;

  beforeAll(async () => {
    // A chat that booked colouring (25 000 ₸, needs 30% prepayment) and got a payment link.
    const appt = await api
      .post("/api/appointments")
      .send({ client_id: "CL-0004", master_id: "MS-01", service_code: "CO-03", start_datetime: `${day} 12:00` })
      .expect(201);
    apptId = appt.body.id;
    await pool.query(`UPDATE conversations SET client_id = 'CL-0004', appointment_id = $1, stage = 'Booked' WHERE conversation_id = 'CV-0002'`, [apptId]);
    const { createPaymentLink } = await import("../../src/services/booking.service.js");
    paymentId = (await createPaymentLink(apptId, "prepayment")).id;
  });

  it("creates the prepayment as Pending for 30% of the price", async () => {
    const p = (await api.get("/api/payments").expect(200)).body.find((x: { id: string }) => x.id === paymentId);
    expect(p).toMatchObject({ status: "Pending", amount_kzt: 7500, kind: "prepayment" });
  });

  it("marks the payment Paid, the visit Confirmed and the chat Paid", async () => {
    const r = await api.post(`/api/payments/${paymentId}/pay`).send({ method: "Kaspi QR" }).expect(200);
    expect(r.body.status).toBe("Paid");
    expect(r.body.paid_at).toBeTruthy();

    const conv = (await api.get("/api/conversations/CV-0002").expect(200)).body;
    expect(conv.stage).toBe("Paid");
    expect(conv.messages.filter((m: { from: string; text: string }) => m.from === "system" && /Payment received: 7 500 ₸/.test(m.text))).toHaveLength(1);
    const appt = (await api.get("/api/appointments").expect(200)).body.find((a: { id: string }) => a.id === apptId);
    expect(appt.status).toBe("Confirmed");
  });

  it("is idempotent: a repeated payment webhook changes nothing", async () => {
    await api.post(`/api/payments/${paymentId}/pay`).expect(200);
    await idle();
    const conv = (await api.get("/api/conversations/CV-0002").expect(200)).body;
    expect(conv.messages.filter((m: { text: string }) => /Payment received/.test(m.text))).toHaveLength(1);
  });

  it("refuses to pay a refunded payment", async () => {
    await api.post(`/api/payments/${paymentId}/refund`).expect(200);
    const r = await api.post(`/api/payments/${paymentId}/pay`).expect(409);
    expect(r.body.message).toMatch(/refunded/);
  });
});

describe("SQL console (read-only role)", () => {
  it("runs a SELECT", async () => {
    const r = await api.post("/api/sql").send({ query: "SELECT COUNT(*) AS n FROM services" }).expect(200);
    expect(r.body).toMatchObject({ columns: ["n"], rows: [[7]], row_count: 1 });
  });

  it.each([
    ["DELETE FROM payments", /read-only transaction/],
    ["UPDATE services SET price_kzt = 1", /read-only transaction/],
    ["DROP TABLE clients", /read-only transaction|must be owner/],
    ["SELECT * FROM master_accounts", /permission denied/],
    ["SELECT pg_sleep(5)", /statement timeout/],
  ])("refuses %s", async (query, msg) => {
    const r = await api.post("/api/sql").send({ query }).expect(400);
    expect(r.body.message).toMatch(msg);
  });

  it("left the data untouched", async () => {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM payments");
    expect(rows[0].n).toBeGreaterThan(100);
  });
});

describe("analytics", () => {
  it("returns the Task 9 no-show report sorted by rate", async () => {
    const r = await api.get("/api/analytics/no-shows").expect(200);
    const pct = r.body.map((x: { no_show_pct: string }) => +x.no_show_pct);
    expect(pct).toEqual([...pct].sort((a, b) => b - a));
    expect(r.body[0]).toHaveProperty("lost_revenue_kzt");
  });
});

describe("settings and catalogue", () => {
  it("validates and saves a service", async () => {
    await api.put("/api/services/NS-07").send({ name: "Ламинирование ресниц", category: "Brows", duration_min: 60, price_kzt: 12000 }).expect(201);
    await api.put("/api/services/NS-07").send({ name: "Ламинирование ресниц", category: "Brows", duration_min: 60, price_kzt: 13000 }).expect(200);
    await api.put("/api/services/NS-08").send({ name: "X", duration_min: 5, price_kzt: 12000 }).expect(400);
    await api.put("/api/services/bad").send({ name: "X", duration_min: 60, price_kzt: 12000 }).expect(400);
  });

  it("updates the bridge table when a master's services change", async () => {
    await api
      .put("/api/masters/MS-04")
      .send({ full_name: "Мадина А.", specialization: "Бровист", work_start: "10:00", work_end: "19:00", days: [1, 2, 3, 4, 5], service_codes: ["BR-05", "NS-07"] })
      .expect(200);
    const r = await api.get("/api/master-services").expect(200);
    expect(r.body.filter((x: { master_id: string }) => x.master_id === "MS-04").map((x: { service_code: string }) => x.service_code).sort()).toEqual(["BR-05", "NS-07"]);
  });
});
