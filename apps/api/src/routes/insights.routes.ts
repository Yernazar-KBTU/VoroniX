import { Router } from "express";
import type pg from "pg";
import { requireTenant } from "../tenancy/context.js";
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
import { renameBusiness } from "../tenancy/tenants.js";
import { claudeAvailable, engineFor, getEngine, idle } from "../ai/runner.js";
import { voronixAiAvailable } from "../ai/voronixai-agent.js";
import { SqlBody } from "./schemas.js";
import { askKnowledge } from "../ai/ask.js";
import { organiseNotes } from "../ai/teach.js";
import { checkVoronix } from "../ai/voronix-ai.js";
import { dataKey } from "../ai/data-keys.js";

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
  const t = requireTenant();
  res.json({
    settings, services, masters, master_services, clients, client_channels, appointments, payments, conversations, knowledge,
    ai_engine: (await engineFor()).name,
    claude_available: claudeAvailable(),
    voronixai_available: voronixAiAvailable(),
    voronix_ai: await checkVoronix(),
    business: { id: t.id, name: t.name, timezone: t.timezone, currency: t.currency },
    features: { sql_console: config.SQL_CONSOLE, demo_reset: config.ALLOW_DEMO_RESET },
  });
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
 * SQL console. One statement (the extended protocol refuses more), in a READ
 * ONLY transaction under the crm_readonly role with a 3 s timeout, so it can
 * read but never change data. It is a teaching tool for a server with one
 * business: SQL_CONSOLE=off (the production default) turns it off.
 */
insightsRouter.post("/sql", async (req, res) => {
  if (!config.SQL_CONSOLE) throw new HttpError(404, "The SQL console is turned off on this server", "not_found");
  const { query } = SqlBody.parse(req.body);
  const client = await pool.connect();
  const started = performance.now();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE crm_readonly");
    await client.query("SET LOCAL statement_timeout = 3000");
    const result = await client.query({ text: query, rowMode: "array", queryMode: "extended" } as unknown as pg.QueryArrayConfig);
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
/** A link to the VoroniX AI site that shows this business's AI live (its own key, replaced each time). */
insightsRouter.get("/ai/live-link", async (_req, res) => {
  if (!config.VORONIX_AI_PUBLIC_URL || !config.VORONIX_DATA_PUBLIC_URL) throw new HttpError(404, "VoroniX AI is not running next to this CRM", "not_found");
  const key = await dataKey(requireTenant(), "VoroniX AI site", true);
  res.json({ url: `${config.VORONIX_AI_PUBLIC_URL.replace(/\/+$/, "")}/live#data=${encodeURIComponent(config.VORONIX_DATA_PUBLIC_URL)}&key=${encodeURIComponent(key)}` });
});

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

/** Replaces all data of the signed-in business with the demo barbershop. Disabled in production. */
insightsRouter.post("/admin/reset-demo", async (_req, res) => {
  if (!config.ALLOW_DEMO_RESET) throw new HttpError(403, "Demo reset is disabled", "forbidden");
  await idle();
  const counts = await seedDemo(pool);
  await renameBusiness(requireTenant(), (await getSettings(pool)).name); // the demo brings its own name
  bus.changed("settings", "services", "masters", "master_services", "clients", "client_channels", "appointments", "payments", "conversations", "knowledge");
  res.json(counts);
});
