import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
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
import { authRouter } from "./routes/auth.routes.js";
import { requireAuth } from "./auth/auth.service.js";
import { getEngine } from "./ai/runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST ?? path.resolve(here, "../../web/dist");

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
  app.set("trust proxy", 1);
  app.use(requireAuth);

  app.get("/api/health", async (_req, res) => {
    const started = performance.now();
    await pool.query("SELECT 1");
    res.json({ status: "ok", db_ms: Math.round(performance.now() - started), ai_engine: getEngine().name, time: new Date().toISOString() });
  });
  app.get("/api/events", sseHandler);
  app.use("/api", authRouter, catalogRouter, crmRouter, conversationsRouter, insightsRouter, integrationsRouter);
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
