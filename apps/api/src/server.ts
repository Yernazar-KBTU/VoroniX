import { config } from "./config.js";
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { logger } from "./lib/logger.js";
import { bootIntegrations, stopIntegrations } from "./integrations/manager.js";
import { getEngine, idle } from "./ai/runner.js";
import { startReminders } from "./services/reminder.service.js";
import { checkVoronix } from "./ai/voronix-ai.js";
import { aiData, startAiData } from "./ai-data/index.js";

async function main() {
  const applied = await migrate(pool);
  if (applied.length) logger.info({ applied }, "database migrated");

  await startAiData();
  await bootIntegrations();
  const reminders = startReminders();
  // VoroniX AI is watched all the time, so a fall shows in the CRM before a client writes.
  void checkVoronix();
  const watchAi = setInterval(() => void checkVoronix(), 30_000);
  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`CRM API on http://localhost:${config.PORT} (AI engine: ${getEngine().name})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal}: shutting down`);
    server.close();
    reminders.stop();
    clearInterval(watchAi);
    await stopIntegrations();
    await aiData.stop();
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
