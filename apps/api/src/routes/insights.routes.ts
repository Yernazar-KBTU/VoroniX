import { Router } from "express";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { seedDemo } from "../db/seed.js";
import { HttpError } from "../lib/errors.js";
import { bus } from "../realtime/bus.js";
import { listAppointments } from "../repositories/appointments.repo.js";
import { listMasterServices, listMasters, listServices } from "../repositories/catalog.repo.js";
import { listChannels, listClients } from "../repositories/clients.repo.js";
import { listConversations } from "../repositories/conversations.repo.js";
import { listKnowledge } from "../repositories/knowledge.repo.js";
import { listPayments } from "../repositories/payments.repo.js";
import { getSettings } from "../repositories/settings.repo.js";
import { getEngine, idle } from "../ai/runner.js";
import { SqlBody } from "./schemas.js";
import { askKnowledge } from "../ai/ask.js";
import { organiseNotes } from "../ai/teach.js";

export const insightsRouter = Router();

/** Everything the web client needs on first load, in one round trip. */
insightsRouter.get("/bootstrap", async (_req, res) => {
  const [settings, services, masters, master_services, clients, client_channels, appointments, payments, conversations, knowledge] = await Promise.all([
    getSettings(pool),
    listServices(pool),
    listMasters(pool),
    listMasterServices(pool),
    listClients(pool),
    listChannels(pool),
    listAppointments(pool),
    listPayments(pool),
    listConversations(pool),
    listKnowledge(pool),
  ]);
  res.json({ settings, services, masters, master_services, clients, client_channels, appointments, payments, conversations, knowledge, ai_engine: getEngine().name });
});

/** Task 9 query: no-show rate by service for a month. */
insightsRouter.get("/analytics/no-shows", async (req, res) => {
  const month = typeof req.query.month === "string" && /^\d{4}-\d\d$/.test(req.query.month) ? req.query.month : null;
  const { rows } = await pool.query(
    `SELECT service_code, service, finished_visits, no_shows, no_show_pct, lost_revenue_kzt
     FROM v_no_show_by_service
     WHERE month = COALESCE(to_date($1, 'YYYY-MM'), date_trunc('month', now())::date)
     ORDER BY no_show_pct DESC, service`,
    [month],
  );
  res.json(rows);
});

/** NFR-01: how fast the AI answered, from the ai_runs log. */
insightsRouter.get("/analytics/ai", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT engine, COUNT(*) AS runs,
            ROUND(AVG(latency_ms)) AS avg_ms,
            percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
            percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
            MAX(latency_ms) AS max_ms,
            ROUND(100.0 * COUNT(*) FILTER (WHERE latency_ms <= 5000) / COUNT(*), 1) AS within_5s_pct,
            COUNT(*) FILTER (WHERE outcome = 'handoff') AS handoffs,
            COUNT(*) FILTER (WHERE outcome = 'error') AS errors
     FROM ai_runs GROUP BY engine ORDER BY runs DESC`,
  );
  res.json(rows);
});

/**
 * SQL console. The query runs in a READ ONLY transaction under the
 * crm_readonly role with a 3 s timeout, so it can read but never change data.
 */
insightsRouter.post("/sql", async (req, res) => {
  const { query } = SqlBody.parse(req.body);
  const client = await pool.connect();
  const started = performance.now();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE crm_readonly");
    await client.query("SET LOCAL statement_timeout = 3000");
    const result = await client.query({ text: query, rowMode: "array" });
    const last = Array.isArray(result) ? result[result.length - 1] : result;
    res.json({
      columns: (last.fields ?? []).map((f: { name: string }) => f.name),
      rows: (last.rows ?? []).slice(0, 500),
      row_count: last.rowCount ?? last.rows?.length ?? 0,
      truncated: (last.rows?.length ?? 0) > 500,
      ms: Math.round(performance.now() - started),
    });
  } catch (err) {
    throw new HttpError(400, (err as Error).message, "sql_error");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});

/** "Teach the AI": free-form notes in, a draft of knowledge entries and settings out. */
insightsRouter.post("/ai/teach", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 20000) : "";
  if (!text) throw new HttpError(400, "text is required", "bad_request");
  res.json(await organiseNotes(text));
});

insightsRouter.post("/ai/ask", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim().slice(0, 2000) : "";
  if (!question) throw new HttpError(400, "question is required", "bad_request");
  res.json(await askKnowledge(question));
});

/** Replaces all data with the demo salon. Disabled in production. */
insightsRouter.post("/admin/reset-demo", async (_req, res) => {
  if (!config.ALLOW_DEMO_RESET) throw new HttpError(403, "Demo reset is disabled", "forbidden");
  await idle();
  const counts = await seedDemo(pool);
  bus.changed("settings", "services", "masters", "master_services", "clients", "client_channels", "appointments", "payments", "conversations", "knowledge");
  res.json(counts);
});
