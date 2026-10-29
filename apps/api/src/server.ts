import { config } from "./config.js";
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { logger } from "./lib/logger.js";
import { bootIntegrations, stopIntegrations } from "./integrations/manager.js";
import { getEngine, idle } from "./ai/runner.js";

async function main() {
  const applied = await migrate(pool);
  if (applied.length) logger.info({ applied }, "database migrated");

  await bootIntegrations();
  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`CRM API on http://localhost:${config.PORT} (AI engine: ${getEngine().name})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal}: shutting down`);
    server.close();
    await stopIntegrations();
    await idle(10_000);
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start");
  process.exit(1);
});
