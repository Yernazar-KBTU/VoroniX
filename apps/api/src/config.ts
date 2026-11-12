import { config as loadDotEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { integrationEncryptionConfigFrom } from "./integrations/encryption.js";

// Resolve from this file so workspace scripts launched in apps/api still load
// the repository-root .env rather than looking for apps/api/.env.
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv({ path: path.resolve(here, "../../../.env") });

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default("postgresql://crm:crm@localhost:5432/crm"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  INTEGRATION_ENCRYPTION_KEY: z.string().refine((v) => /^[0-9a-fA-F]{64}$/.test(v) || v.trim().length >= 32, "must be 64 hexadecimal characters or a random string of at least 32 characters").optional(),
  INTEGRATION_ENCRYPTION_KEYS: z.string().optional(),
  INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),

  // AI. Without a key the deterministic offline agent answers instead of Claude.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_ENGINE: z.enum(["auto", "claude", "offline"]).default("auto"),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  AI_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(20).default(8),

  // VoroniX AI (apps/voronix-ai): our own intent model behind its own API.
  // The built-in agent asks it what each client message means; without it,
  // or when it does not answer in time, the built-in rules decide alone.
  VORONIX_AI_URL: z.string().url().optional(),
  VORONIX_AI_KEY: z.string().optional(),
  VORONIX_AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2500),
  // The VoroniX data server (github.com/kamilabalabatyr/voronix-data-server) on
  // the same database. With it and VORONIX_AI_URL, VoroniX AI itself answers the
  // chats (POST /v1/reply): one AI, its memory and lessons kept in this database.
  VORONIX_DATA_URL: z.string().url().optional(),
  // Address of the data server as a browser on this computer reaches it (for the AI site link).
  VORONIX_DATA_PUBLIC_URL: z.string().url().optional(),
  VORONIX_AI_PUBLIC_URL: z.string().url().optional(),

  // Channels. Each business connects its own Telegram bot on the Integrations
  // page. This optional secret is accepted by every business's inbound
  // webhook, for a gateway the platform runs itself.
  CHANNEL_WEBHOOK_SECRET: z.string().optional(),

  // Sign-in is required for the API. Only the test setup turns it off, so the
  // older API tests can call routes directly; test/integration/auth.test.ts turns it back on.
  AUTH_REQUIRED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Public address of the app, used in links inside emails and for the Google sign-in redirect.
  APP_URL: z.string().url().default("http://localhost:3000"),
  // Email (password reset links). Without a key, mails are only logged.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("VoroniX <no-reply@example.com>"),
  // Shown as "Help" on the sign-in page and in the app. Hidden when empty.
  SUPPORT_EMAIL: z.string().email().optional(),
  // "Continue with Google". The button appears only when both are set.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Read-only SQL console on the Insights page. It is a teaching tool: keep it
  // off on a server that hosts more than one business.
  SQL_CONSOLE: z.enum(["on", "off"]).optional(),

  // Allows POST /api/admin/reset-demo. Off in production by default.
  ALLOW_DEMO_RESET: z.enum(["true", "false"]).optional(),
});

// An empty line such as "SUPPORT_EMAIL=" in .env means "not set", not an empty value.
const env: Record<string, string | undefined> = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
// Render gives every web service its public onrender.com address, so APP_URL can stay unset there.
env.APP_URL ??= env.RENDER_EXTERNAL_URL;
const parsed = Env.safeParse(env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
try {
  integrationEncryptionConfigFrom(parsed.data);
} catch (err) {
  console.error("Invalid integration encryption configuration:", (err as Error).message);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  ALLOW_DEMO_RESET: parsed.data.ALLOW_DEMO_RESET ? parsed.data.ALLOW_DEMO_RESET === "true" : parsed.data.NODE_ENV !== "production",
  SQL_CONSOLE: (parsed.data.SQL_CONSOLE ?? (parsed.data.NODE_ENV === "production" ? "off" : "on")) === "on",
  APP_URL: parsed.data.APP_URL.replace(/\/+$/, ""),
  // VoroniX AI keeps its memory in this database, served by this app at /ai-data.
  VORONIX_DATA_URL: parsed.data.VORONIX_DATA_URL ?? `http://127.0.0.1:${parsed.data.PORT}/ai-data`,
  VORONIX_DATA_PUBLIC_URL: parsed.data.VORONIX_DATA_PUBLIC_URL ?? `${parsed.data.APP_URL.replace(/\/+$/, "")}/ai-data`,
};
// Every business has its own time zone (see lib/time.ts wallClock), so the
// process clock is neutral UTC.
process.env.TZ = "UTC";

export type Config = typeof config;
