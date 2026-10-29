import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { errorHandler } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { sseHandler } from "./realtime/bus.js";
import { catalogRouter } from "./routes/catalog.routes.js";
import { conversationsRouter } from "./routes/conversations.routes.js";
import { crmRouter } from "./routes/crm.routes.js";
import { insightsRouter } from "./routes/insights.routes.js";
import { integrationsRouter } from "./routes/integrations.routes.js";
import { getEngine } from "./ai/runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST ?? path.resolve(here, "../../web/dist");

/** HTTP basic auth for the admin UI when BASIC_AUTH_USER/PASSWORD are set. Webhooks use their own secret. */
const basicAuth: RequestHandler = (req, res, next) => {
  if (!config.BASIC_AUTH_USER || !config.BASIC_AUTH_PASSWORD) return next();
  if (req.path.startsWith("/api/channels/") || req.path === "/api/health" || req.path === "/api/integrations/calendar.ics") return next();
  const [type, value] = (req.headers.authorization ?? "").split(" ");
  const [user, pass] = type === "Basic" && value ? Buffer.from(value, "base64").toString().split(":") : [];
  if (user === config.BASIC_AUTH_USER && pass === config.BASIC_AUTH_PASSWORD) return next();
  res.set("WWW-Authenticate", 'Basic realm="CRM"').status(401).json({ error: "unauthorized", message: "Login required" });
};

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:"],
        },
      },
    }),
  );
  if (config.NODE_ENV !== "test") app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/events" || req.url === "/api/health" } }));
  app.use(express.json({ limit: "1mb" }));
  app.use(basicAuth);

  app.get("/api/health", async (_req, res) => {
    const started = performance.now();
    await pool.query("SELECT 1");
    res.json({ status: "ok", db_ms: Math.round(performance.now() - started), ai_engine: getEngine().name, time: new Date().toISOString() });
  });
  app.get("/api/events", sseHandler);
  app.use("/api", catalogRouter, crmRouter, conversationsRouter, insightsRouter, integrationsRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found", message: "No such API route" });
  });

  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { maxAge: "1h", index: "index.html" }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
  }
  app.use(errorHandler);
  return app;
}
