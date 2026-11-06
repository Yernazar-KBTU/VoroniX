// The AI's memory (clients, bookings, lessons, model versions) in the CRM's own
// database, served by the CRM at /ai-data: VoroniX AI and its live page read and
// write here, and see every change at once (/ai-data/v1/watch).
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { createApp } from "./app.js";
import { migrateCore } from "./db.js";

export const AI_DATA_PATH = "/ai-data";

export const aiData = createApp({
  pool,
  config: {
    databaseUrl: config.DATABASE_URL,
    port: config.PORT,
    corsOrigins: ["*"],
    crmSync: "loose",
    crmDaysBack: 60,
    allowNoAuth: false,
    defaultBusinessId: null,
  },
  live: config.NODE_ENV !== "test",
});

/** Creates the AI's shared tables and starts the live change stream. */
export async function startAiData(): Promise<void> {
  await migrateCore(pool);
  await aiData.start();
}
