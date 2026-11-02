import { Router } from "express";
import { pool } from "../db/pool.js";
import { notFound } from "../lib/errors.js";
import { bus } from "../realtime/bus.js";
import * as appts from "../repositories/appointments.repo.js";
import * as clients from "../repositories/clients.repo.js";
import * as knowledge from "../repositories/knowledge.repo.js";
import { listPayments } from "../repositories/payments.repo.js";
import * as booking from "../services/booking.service.js";
import { replyTo } from "../ai/runner.js";
import { AppointmentBody, ClientBody, KnowledgeBody, SlotsQuery, StatusBody } from "./schemas.js";

export const crmRouter = Router();

/* clients */
crmRouter.get("/clients", async (_req, res) => {
  res.json(await clients.listClients(pool));
});
crmRouter.get("/client-channels", async (_req, res) => {
  res.json(await clients.listChannels(pool));
});
crmRouter.post("/clients", async (req, res) => {
  const c = await clients.createClient(pool, ClientBody.parse(req.body));
  bus.changed("clients");
  res.status(201).json(c);
});
crmRouter.patch("/clients/:id", async (req, res) => {
  const c = await clients.updateClient(pool, req.params.id, ClientBody.partial().parse(req.body));
  if (!c) throw notFound("Client");
  bus.changed("clients");
  res.json(c);
});

/* appointments */
crmRouter.get("/appointments", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  res.json(await appts.listAppointments(pool, { from: q.from, to: q.to, client_id: q.client_id }));
});
crmRouter.get("/appointments/free-slots", async (req, res) => {
  const q = SlotsQuery.parse(req.query);
  res.json(await booking.findFreeSlots(pool, q.service_code, q.date, q.master_id));
});
crmRouter.post("/appointments", async (req, res) => {
  const body = AppointmentBody.parse(req.body);
  res.status(201).json(await booking.createBooking({ ...body, source: "Admin" }, { strict: false }));
});
crmRouter.put("/appointments/:id", async (req, res) => {
  res.json(await booking.updateBooking(req.params.id, AppointmentBody.parse(req.body)));
});
crmRouter.patch("/appointments/:id/status", async (req, res) => {
  res.json(await booking.changeStatus(req.params.id, StatusBody.parse(req.body).status));
});

/* payments */
crmRouter.get("/payments", async (_req, res) => {
  res.json(await listPayments(pool));
});
/** Client paid (demo payment button, or a payment provider webhook). */
crmRouter.post("/payments/:id/pay", async (req, res) => {
  const { payment, conversations } = await booking.markPaid(req.params.id, req.body?.method ?? booking.defaultPayMethod());
  res.json(payment);
  for (const id of conversations) {
    const { rows } = await pool.query<{ ai_enabled: boolean }>(`SELECT ai_enabled FROM conversations WHERE conversation_id = $1`, [id]);
    if (rows[0]?.ai_enabled) void replyTo(id);
  }
});
crmRouter.post("/payments/:id/refund", async (req, res) => {
  res.json(await booking.refund(req.params.id));
});
crmRouter.post("/appointments/:id/full-payment", async (req, res) => {
  res.status(201).json(await booking.takeFullPayment(req.params.id, req.body?.method ?? "Card"));
});

/* knowledge base */
crmRouter.get("/knowledge", async (_req, res) => {
  res.json(await knowledge.listKnowledge(pool));
});
crmRouter.post("/knowledge", async (req, res) => {
  const k = await knowledge.createKnowledge(pool, KnowledgeBody.parse(req.body));
  bus.changed("knowledge");
  res.status(201).json(k);
});
crmRouter.put("/knowledge/:id", async (req, res) => {
  const k = await knowledge.updateKnowledge(pool, req.params.id, KnowledgeBody.parse(req.body));
  if (!k) throw notFound("Knowledge entry");
  bus.changed("knowledge");
  res.json(k);
});
crmRouter.delete("/knowledge/:id", async (req, res) => {
  if (!(await knowledge.deleteKnowledge(pool, req.params.id))) throw notFound("Knowledge entry");
  bus.changed("knowledge");
  res.status(204).end();
});
