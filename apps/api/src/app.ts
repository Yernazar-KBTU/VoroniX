import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { errorHandler } from "./lib/errors.js";
import { httpLogSerializers, logger } from "./lib/logger.js";
import { sseHandler } from "./realtime/bus.js";
import { catalogRouter } from "./routes/catalog.routes.js";
import { conversationsRouter } from "./routes/conversations.routes.js";
import { metaRouter } from "./routes/meta.routes.js";
import { crmRouter } from "./routes/crm.routes.js";
import { insightsRouter } from "./routes/insights.routes.js";
import { importRouter } from "./routes/import.routes.js";
import { integrationsRouter } from "./routes/integrations.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { requireAuth } from "./auth/auth.service.js";
import { getEngine } from "./ai/runner.js";
import { checkVoronix } from "./ai/voronix-ai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST ?? path.resolve(here, "../../web/dist");

/**
 * The web pages: the landing page at /, the CRM at /app (one page that routes
 * by #hash), /terms and /privacy. HTML is always revalidated so a new release
 * shows up at once; the hashed files in /assets are cached for a year.
 */
function serveWeb(app: express.Express) {
  const page = (name: string) => path.join(WEB_DIST, `${name}.html`);
  const fresh = (res: express.Response) => res.setHeader("Cache-Control", "no-cache");
  app.use(
    express.static(WEB_DIST, {
      index: "index.html",
      extensions: ["html"],
      setHeaders: (res, file) => {
        if (file.endsWith(".html")) fresh(res);
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }),
  );
  app.get(/^\/app(?:\/.*)?$/, (_req, res) => {
    fresh(res);
    res.sendFile(page("app"));
  });
  // Any other address: the landing page, with a 404 status for search engines.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    fresh(res);
    res.status(404).sendFile(page("index"));
  });
}

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
  if (config.NODE_ENV !== "test")
    app.use(pinoHttp({ logger, serializers: httpLogSerializers, autoLogging: { ignore: (req) => req.url === "/api/events" || req.url === "/api/health" } }));
  // Imports carry whole files, so their routes read their own, bigger bodies once sign-in is checked.
  const json = express.json({
    limit: "1mb",
    // Meta signs the exact bytes of the body, which are lost after JSON parsing, so keep a copy.
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  });
  app.use((req, res, next) => (req.path.startsWith("/api/import") ? next() : json(req, res, next)));
  app.set("trust proxy", 1);
  app.use(requireAuth);

  app.get("/api/health", async (_req, res) => {
    const started = performance.now();
    await pool.query("SELECT 1");
    const voronix = await checkVoronix();
    res.json({ status: voronix.state === "down" ? "degraded" : "ok", db_ms: Math.round(performance.now() - started), ai_engine: getEngine().name, voronix_ai: voronix, time: new Date().toISOString() });
  });
  app.get("/api/events", sseHandler);
  app.use("/api", authRouter, catalogRouter, crmRouter, conversationsRouter, metaRouter, insightsRouter, integrationsRouter, importRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found", message: "No such API route" });
  });

  if (existsSync(WEB_DIST)) serveWeb(app);
  app.use(errorHandler);
  return app;
}
